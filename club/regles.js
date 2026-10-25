/*
 * NOCELLI PRIVATE CLUB — les règles du club.
 *
 * Ce fichier ne dépend de rien : il décrit qui a droit à quoi, comment les
 * 50 places fondateurs sont attribuées, comment marchent les abonnements,
 * l'accès anticipé et les événements. Il est utilisé :
 *   - par le serveur de test du site (club/donnees.js), dans le navigateur ;
 *   - par les tests automatiques (tests/regles.test.mjs) ;
 *   - comme référence pour le vrai serveur (backend/supabase/schema.sql),
 *     qui applique exactement les mêmes règles en SQL.
 *
 * Toutes les fonctions reçoivent l'état et l'heure (now, en millisecondes),
 * pour que les règles soient testables sans horloge réelle.
 */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.NocelliRegles = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var HEURE = 36e5, JOUR = 24 * HEURE;

  var MAX_FONDATEURS = 50;
  var PRODUIT_FONDATEUR = 'NC-01';
  var ATTENTE_PAIEMENT = 30 * 60 * 1000;   // un paiement non confirmé en 30 min est abandonné
  var GRACE_IMPAYE = 7 * JOUR;              // délai après un échec de renouvellement
  var HEURES_ANTICIPEES = 48;

  var CATEGORIES = {
    founders: {
      code: 'founders', nom: 'Founders Club', prix: 0, annuel: false,
      accesAnticipe: true, evenements: true, experiences: true, votes: true,
      contenus: true, statutAVie: true, carte: true
    },
    early: {
      code: 'early', nom: 'Early Access', prix: 29, annuel: true,
      accesAnticipe: true, evenements: false, experiences: false, votes: false,
      contenus: false, statutAVie: false, carte: true
    },
    signature: {
      code: 'signature', nom: 'Signature Club', prix: 59, annuel: true,
      accesAnticipe: true, evenements: true, experiences: true, votes: true,
      contenus: true, statutAVie: false, carte: true
    }
  };
  // Seules ces deux formules peuvent être achetées. Founders ne se vend jamais.
  var FORMULES_PAYANTES = ['early', 'signature'];
  var RANG = { early: 1, signature: 2, founders: 3 };

  function Refus(code, message) {
    var e = new Error(message);
    e.code = code;
    e.refus = true;
    return e;
  }

  function etatVide() {
    return {
      comptes: {},          // id -> { id, email, nom, role, creeLe, numeroMembre, carteJeton, suspendu }
      commandes: {},        // id -> { id, compteId, produit, quantite, taille, statut, creeLe, payeeLe }
      fondateurs: {},       // numero -> { numero, compteId, commandeId, statut, attribueLe, retireLe, motif }
      abonnements: {},      // id -> { id, compteId, plan, statut, debut, fin, renouvellementAuto, creeLe, ... }
      paiements: [],        // { id, compteId, abonnementId, montant, type, le }
      lancements: {},       // id -> { id, nom, produit, publicLe, heuresAnticipees, stock, publie }
      evenements: {},       // id -> { id, titre, description, date, lieu, capacite, prix, conditions, publie, annule }
      inscriptions: {},     // id -> { id, evenementId, compteId, statut, creeLe }
      notifications: [],
      journal: [],
      traites: {},          // identifiants d'événements de paiement déjà traités (idempotence)
      compteurs: { fondateur: 1, membre: 1, id: 1 }
    };
  }

  function nouvelId(etat, prefixe) {
    return prefixe + '_' + (etat.compteurs.id++).toString(36);
  }

  function normaliserEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function emailValide(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  }

  /* ---------- Comptes ---------- */

  // Un seul compte par adresse e-mail : on retrouve le compte existant au lieu d'en créer un second.
  function trouverOuCreerCompte(etat, email, nom, now) {
    var e = normaliserEmail(email);
    if (!emailValide(e)) throw Refus('email', "Cette adresse e-mail n'est pas valide.");
    for (var id in etat.comptes) if (etat.comptes[id].email === e) {
      if (nom && !etat.comptes[id].nom) etat.comptes[id].nom = nom;
      return etat.comptes[id];
    }
    var c = { id: nouvelId(etat, 'cpt'), email: e, nom: nom || '', role: 'client', creeLe: now, numeroMembre: null, carteJeton: null, suspendu: false };
    etat.comptes[c.id] = c;
    return c;
  }

  /* ---------- Founders Club ---------- */

  function placeFondateur(etat, compteId) {
    for (var n in etat.fondateurs) {
      var f = etat.fondateurs[n];
      if (f.compteId === compteId && f.statut === 'confirme') return f;
    }
    return null;
  }

  function nombreFondateurs(etat) {
    var k = 0;
    for (var n in etat.fondateurs) if (etat.fondateurs[n].statut === 'confirme') k++;
    return k;
  }

  function commandeEligible(c) {
    return c && c.produit === PRODUIT_FONDATEUR && c.statut === 'payee';
  }

  /*
   * Appelée UNE fois quand le paiement d'une commande est confirmé (jamais à la
   * création de la commande). Règles :
   *  - seule une commande payée du cardigan NC-01 compte ;
   *  - un client n'a qu'une place, même s'il achète plusieurs cardigans ;
   *  - les numéros vont de 1 à 50, chacun n'est donné qu'une fois, dans l'ordre
   *    des paiements confirmés ;
   *  - un numéro retiré (remboursement) n'est jamais redonné automatiquement.
   * Sur le vrai serveur, cette étape tourne dans une transaction verrouillée
   * (voir attribuer_place_fondateur dans schema.sql) : deux paiements simultanés
   * ne peuvent pas recevoir le même numéro.
   */
  function attribuerPlaceFondateur(etat, commandeId, now) {
    var c = etat.commandes[commandeId];
    if (!commandeEligible(c)) return { attribue: false, raison: 'commande_non_eligible' };
    var deja = placeFondateur(etat, c.compteId);
    if (deja) return { attribue: false, raison: 'deja_fondateur', place: deja };
    if (etat.compteurs.fondateur > MAX_FONDATEURS) return { attribue: false, raison: 'complet' };
    var numero = etat.compteurs.fondateur++;
    var place = { numero: numero, compteId: c.compteId, commandeId: c.id, statut: 'confirme', attribueLe: now, retireLe: null, motif: null };
    etat.fondateurs[numero] = place;
    // Un fondateur ne paie jamais : un abonnement payant en cours n'est pas renouvelé.
    var ab = abonnementCourant(etat, c.compteId, now);
    if (ab && ab.renouvellementAuto) {
      ab.renouvellementAuto = false;
      ab.note = 'Renouvellement arrêté : membre fondateur';
    }
    return { attribue: true, place: place };
  }

  function confirmerPaiementCommande(etat, commandeId, now) {
    var c = etat.commandes[commandeId];
    if (!c) throw Refus('introuvable', 'Commande introuvable.');
    if (c.statut === 'payee') return { dejaPayee: true, fondateur: placeFondateur(etat, c.compteId) };
    if (c.statut !== 'en_attente') throw Refus('statut', 'Cette commande ne peut plus être payée.');
    c.statut = 'payee';
    c.payeeLe = now;
    return { dejaPayee: false, fondateur: attribuerPlaceFondateur(etat, commandeId, now) };
  }

  /*
   * Annulation ou remboursement d'une commande payée.
   * Règle explicite : si cette commande avait donné la place fondateur,
   *  - et que le client a une autre commande NC-01 payée, sa place passe sur
   *    cette autre commande (il garde son numéro) ;
   *  - sinon le numéro est RETIRÉ. Il n'est jamais redonné automatiquement ;
   *    seule l'administration peut décider de l'attribuer à un autre acheteur
   *    payé (action tracée dans le journal).
   */
  function rembourserCommande(etat, commandeId, statut, now) {
    var c = etat.commandes[commandeId];
    if (!c) throw Refus('introuvable', 'Commande introuvable.');
    if (statut !== 'remboursee' && statut !== 'annulee') throw Refus('statut', 'Statut inconnu.');
    var etaitPayee = c.statut === 'payee';
    c.statut = statut;
    c.fermeeLe = now;
    if (!etaitPayee) return { place: null };
    for (var n in etat.fondateurs) {
      var f = etat.fondateurs[n];
      if (f.commandeId !== c.id || f.statut !== 'confirme') continue;
      for (var id in etat.commandes) {
        var autre = etat.commandes[id];
        if (autre.id !== c.id && autre.compteId === c.compteId && commandeEligible(autre)) {
          f.commandeId = autre.id;
          return { place: f, transferee: true };
        }
      }
      f.statut = 'retire';
      f.retireLe = now;
      f.motif = statut === 'remboursee' ? 'Commande remboursée' : 'Commande annulée';
      return { place: f, retiree: true };
    }
    return { place: null };
  }

  // Décision manuelle de l'administration : redonner un numéro retiré à un acheteur payé sans place.
  function reattribuerNumeroRetire(etat, numero, compteId, now) {
    var f = etat.fondateurs[numero];
    if (!f || f.statut !== 'retire') throw Refus('numero', "Ce numéro n'est pas retiré.");
    if (placeFondateur(etat, compteId)) throw Refus('deja_fondateur', 'Ce client est déjà fondateur.');
    var cmd = null;
    for (var id in etat.commandes) {
      var c = etat.commandes[id];
      if (c.compteId === compteId && commandeEligible(c)) { cmd = c; break; }
    }
    if (!cmd) throw Refus('non_eligible', "Ce client n'a pas de commande NC-01 payée.");
    var ancien = { compteId: f.compteId, commandeId: f.commandeId };
    f.compteId = compteId; f.commandeId = cmd.id; f.statut = 'confirme';
    f.attribueLe = now; f.retireLe = null; f.motif = null;
    f.historique = (f.historique || []).concat([ancien]);
    return f;
  }

  /* ---------- Abonnements ---------- */

  function finPeriode(debut) {
    var d = new Date(debut);
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    return d.getTime();
  }

  // L'abonnement payant « vivant » du compte (en attente, actif, ou impayé en délai de grâce).
  function abonnementCourant(etat, compteId, now) {
    var meilleur = null;
    for (var id in etat.abonnements) {
      var a = etat.abonnements[id];
      if (a.compteId !== compteId) continue;
      mettreAJourAbonnement(a, now);
      if (a.statut === 'actif' || a.statut === 'impaye' || a.statut === 'en_attente') {
        if (!meilleur || a.creeLe > meilleur.creeLe) meilleur = a;
      }
    }
    return meilleur;
  }

  // Fait avancer un abonnement dans le temps : renouvellements, expirations, attentes abandonnées.
  function mettreAJourAbonnement(a, now) {
    if (a.statut === 'en_attente' && now - a.creeLe > ATTENTE_PAIEMENT) a.statut = 'abandonne';
    if (a.statut === 'actif' && now >= a.fin) {
      if (a.renouvellementAuto) { a.statut = 'impaye'; a.impayeDepuis = a.fin; }
      else a.statut = 'expire';
    }
    if (a.statut === 'impaye' && now >= (a.impayeDepuis || a.fin) + GRACE_IMPAYE) a.statut = 'expire';
    // Un changement de formule vers le bas prend effet au renouvellement.
    return a;
  }

  /*
   * Étape 1 de l'abonnement : on crée un abonnement « en attente » et on
   * renvoie ce qu'il faut afficher avant paiement. Rien n'est actif tant que le
   * prestataire de paiement n'a pas confirmé (confirmerPaiementAbonnement).
   */
  function demarrerAbonnement(etat, compteId, plan, now) {
    if (FORMULES_PAYANTES.indexOf(plan) < 0) {
      throw Refus('formule', plan === 'founders'
        ? 'Le Founders Club ne se vend pas : il est réservé aux 50 premiers acheteurs du cardigan NC-01.'
        : 'Formule inconnue.');
    }
    var cpt = etat.comptes[compteId];
    if (!cpt) throw Refus('compte', 'Compte introuvable.');
    if (placeFondateur(etat, compteId)) throw Refus('fondateur', 'Vous êtes membre fondateur : tous les avantages sont déjà inclus, à vie.');
    var cour = abonnementCourant(etat, compteId, now);
    if (cour && cour.statut !== 'en_attente') {
      throw Refus('deja_abonne', 'Vous avez déjà un abonnement actif. Utilisez « Changer de formule ».');
    }
    if (cour && cour.statut === 'en_attente') {
      if (cour.plan === plan) return cour; // même paiement repris, pas de doublon
      cour.statut = 'abandonne';
    }
    var a = { id: nouvelId(etat, 'abo'), compteId: compteId, plan: plan, statut: 'en_attente', debut: null, fin: null, renouvellementAuto: true, creeLe: now, prix: CATEGORIES[plan].prix };
    etat.abonnements[a.id] = a;
    return a;
  }

  // Webhook du prestataire de paiement. evenementId rend l'appel idempotent : rejoué, il ne fait rien.
  function confirmerPaiementAbonnement(etat, abonnementId, evenementId, now) {
    if (etat.traites[evenementId]) return { doublon: true, abonnement: etat.abonnements[abonnementId] };
    var a = etat.abonnements[abonnementId];
    if (!a) throw Refus('introuvable', 'Abonnement introuvable.');
    etat.traites[evenementId] = true;
    mettreAJourAbonnement(a, now);
    var type;
    if (a.statut === 'en_attente' || a.statut === 'abandonne') {
      // Un autre abonnement a pu être activé entre-temps : on n'en active jamais deux.
      var autre = abonnementCourant(etat, a.compteId, now);
      if (autre && autre.id !== a.id && autre.statut !== 'en_attente') {
        a.statut = 'a_rembourser';
        return { doublon: false, abonnement: a, aRembourser: true };
      }
      a.statut = 'actif'; a.debut = now; a.debutInitial = now; a.fin = finPeriode(now);
      type = 'adhesion';
    } else if (a.renouvellementAuto && (a.statut === 'impaye' || (a.statut === 'actif' && now >= a.fin - 30 * JOUR))) {
      // Renouvellement : la nouvelle année part de la fin de la précédente.
      var base = a.fin;
      if (a.planAuRenouvellement) { a.plan = a.planAuRenouvellement; a.prix = CATEGORIES[a.plan].prix; a.planAuRenouvellement = null; }
      a.statut = 'actif'; a.debut = base; a.fin = finPeriode(base); a.impayeDepuis = null;
      type = 'renouvellement';
    } else {
      return { doublon: true, abonnement: a };
    }
    var cpt = etat.comptes[a.compteId];
    if (cpt && !cpt.numeroMembre) cpt.numeroMembre = etat.compteurs.membre++;
    etat.paiements.push({ id: evenementId, compteId: a.compteId, abonnementId: a.id, montant: a.prix, type: type, le: now });
    return { doublon: false, abonnement: a };
  }

  function echecPaiementAbonnement(etat, abonnementId, evenementId, now) {
    if (etat.traites[evenementId]) return { doublon: true };
    etat.traites[evenementId] = true;
    var a = etat.abonnements[abonnementId];
    if (!a) throw Refus('introuvable', 'Abonnement introuvable.');
    mettreAJourAbonnement(a, now);
    if (a.statut === 'en_attente') { a.statut = 'echoue'; return { abonnement: a }; }
    if (a.statut === 'actif' && now >= a.fin - 30 * JOUR) { a.statut = 'impaye'; a.impayeDepuis = Math.max(now, a.fin); }
    return { abonnement: a };
  }

  // Montant à payer pour passer d'Early Access à Signature : la différence, au prorata du temps restant.
  function montantPassageSignature(a, now) {
    var total = a.fin - a.debut;
    var reste = Math.max(0, a.fin - now);
    var m = (CATEGORIES.signature.prix - CATEGORIES.early.prix) * reste / total;
    return Math.round(m * 20) / 20; // arrondi aux 5 centimes
  }

  /*
   * Changer de formule.
   *  - Early Access -> Signature : immédiat après paiement de la différence au
   *    prorata ; la date de renouvellement ne change pas.
   *  - Signature -> Early Access : prend effet au prochain renouvellement,
   *    les avantages Signature restent jusque-là.
   */
  function changerFormule(etat, compteId, plan, now) {
    if (FORMULES_PAYANTES.indexOf(plan) < 0) throw Refus('formule', 'Formule non disponible.');
    var a = abonnementCourant(etat, compteId, now);
    if (!a || a.statut !== 'actif') throw Refus('pas_abonne', "Aucun abonnement actif à modifier.");
    if (a.plan === plan) {
      if (a.planAuRenouvellement) { a.planAuRenouvellement = null; return { abonnement: a, effet: 'annule_changement' }; }
      throw Refus('meme_formule', 'Vous avez déjà cette formule.');
    }
    if (RANG[plan] > RANG[a.plan]) {
      return { abonnement: a, effet: 'paiement_requis', montant: montantPassageSignature(a, now) };
    }
    a.planAuRenouvellement = plan;
    return { abonnement: a, effet: 'au_renouvellement', le: a.fin };
  }

  function confirmerPassageSignature(etat, abonnementId, evenementId, now) {
    if (etat.traites[evenementId]) return { doublon: true };
    var a = etat.abonnements[abonnementId];
    if (a) mettreAJourAbonnement(a, now);
    if (!a || a.statut !== 'actif' || a.plan !== 'early') throw Refus('statut', 'Passage impossible.');
    etat.traites[evenementId] = true;
    var montant = montantPassageSignature(a, now);
    a.plan = 'signature'; a.prix = CATEGORIES.signature.prix; a.planAuRenouvellement = null;
    etat.paiements.push({ id: evenementId, compteId: a.compteId, abonnementId: a.id, montant: montant, type: 'passage_signature', le: now });
    return { abonnement: a, montant: montant };
  }

  // Annuler = arrêter le renouvellement. L'accès reste jusqu'à la fin de la période payée.
  function annulerRenouvellement(etat, compteId, now) {
    var a = abonnementCourant(etat, compteId, now);
    if (!a || (a.statut !== 'actif' && a.statut !== 'impaye')) throw Refus('pas_abonne', 'Aucun abonnement à annuler.');
    if (a.statut === 'impaye') { a.statut = 'expire'; a.renouvellementAuto = false; return a; }
    a.renouvellementAuto = false;
    a.annuleLe = now;
    return a;
  }

  function reprendreRenouvellement(etat, compteId, now) {
    var a = abonnementCourant(etat, compteId, now);
    if (!a || a.statut !== 'actif') throw Refus('pas_abonne', 'Aucun abonnement actif.');
    if (placeFondateur(etat, compteId)) throw Refus('fondateur', 'Un membre fondateur ne paie pas de renouvellement.');
    a.renouvellementAuto = true;
    a.annuleLe = null;
    return a;
  }

  /* ---------- Droits ---------- */

  /*
   * La seule source de vérité sur ce qu'un compte peut faire.
   * Founders prime sur tout ; sinon l'abonnement payant actif (ou impayé dans le
   * délai de grâce). Un compte suspendu par l'administration n'a aucun droit.
   */
  function droits(etat, compteId, now) {
    var aucun = { membre: false, categorie: null, accesAnticipe: false, evenements: false, experiences: false, votes: false, contenus: false };
    var cpt = etat.comptes[compteId];
    if (!cpt || cpt.suspendu) return aucun;
    var f = placeFondateur(etat, compteId);
    var cat = null, ab = null;
    if (f) cat = 'founders';
    else {
      ab = abonnementCourant(etat, compteId, now);
      if (ab && (ab.statut === 'actif' || ab.statut === 'impaye')) cat = ab.plan;
    }
    if (!cat) return aucun;
    var d = CATEGORIES[cat];
    return {
      membre: true, categorie: cat, fondateur: f, abonnement: ab,
      accesAnticipe: d.accesAnticipe, evenements: d.evenements, experiences: d.experiences,
      votes: d.votes, contenus: d.contenus
    };
  }

  /* ---------- Accès anticipé aux collections ---------- */

  function phaseLancement(l, now) {
    var debutMembres = l.publicLe - l.heuresAnticipees * HEURE;
    if (now >= l.publicLe) return 'public';
    if (now >= debutMembres) return 'membres';
    return 'annonce';
  }

  function stockTotal(l) {
    var t = 0;
    for (var k in l.stock) t += l.stock[k];
    return t;
  }

  // Vérification faite par le serveur avant toute vente, pas seulement en cachant le bouton.
  function peutAcheter(etat, compteId, lancementId, taille, now) {
    var l = etat.lancements[lancementId];
    if (!l || !l.publie) return { ok: false, raison: 'introuvable', message: "Cette collection n'est pas encore annoncée." };
    var phase = phaseLancement(l, now);
    if (phase === 'annonce') return { ok: false, raison: 'pas_ouvert', message: 'La vente n’est pas encore ouverte.' };
    if (phase === 'membres') {
      var d = compteId ? droits(etat, compteId, now) : { accesAnticipe: false };
      if (!d.accesAnticipe) return { ok: false, raison: 'reserve_membres', message: 'Réservé aux membres du Private Club jusqu’à l’ouverture publique.' };
    }
    if (!compteId) return { ok: false, raison: 'connexion', message: 'Connectez-vous pour acheter.' };
    if (!(taille in l.stock)) return { ok: false, raison: 'taille', message: 'Taille indisponible.' };
    if (l.stock[taille] <= 0) return { ok: false, raison: 'epuise', message: 'Cette taille est épuisée.' };
    return { ok: true, phase: phase };
  }

  // Réserve une pièce et crée la commande en attente de paiement (le stock est pris tout de suite).
  function reserverPiece(etat, compteId, lancementId, taille, now) {
    var v = peutAcheter(etat, compteId, lancementId, taille, now);
    if (!v.ok) throw Refus(v.raison, v.message);
    var l = etat.lancements[lancementId];
    l.stock[taille] -= 1;
    var c = { id: nouvelId(etat, 'cmd'), compteId: compteId, produit: l.produit, lancementId: l.id, quantite: 1, taille: taille, statut: 'en_attente', creeLe: now, payeeLe: null, phase: v.phase };
    etat.commandes[c.id] = c;
    return c;
  }

  // Une commande jamais payée rend sa pièce au stock.
  function libererCommandesExpirees(etat, now) {
    var k = 0;
    for (var id in etat.commandes) {
      var c = etat.commandes[id];
      if (c.statut === 'en_attente' && now - c.creeLe > ATTENTE_PAIEMENT) {
        c.statut = 'expiree';
        var l = c.lancementId && etat.lancements[c.lancementId];
        if (l && c.taille in l.stock) l.stock[c.taille] += 1;
        k++;
      }
    }
    return k;
  }

  /* ---------- Événements privés ---------- */

  function placesRestantes(etat, evenementId) {
    var e = etat.evenements[evenementId];
    var pris = 0;
    for (var id in etat.inscriptions) {
      var i = etat.inscriptions[id];
      if (i.evenementId === evenementId && i.statut === 'confirme') pris++;
    }
    return Math.max(0, e.capacite - pris);
  }

  function inscriptionDe(etat, evenementId, compteId) {
    for (var id in etat.inscriptions) {
      var i = etat.inscriptions[id];
      if (i.evenementId === evenementId && i.compteId === compteId && i.statut !== 'annule') return i;
    }
    return null;
  }

  // Seuls Founders et Signature s'inscrivent. Complet : liste d'attente.
  function inscrireEvenement(etat, compteId, evenementId, now) {
    var e = etat.evenements[evenementId];
    if (!e || !e.publie || e.annule) throw Refus('introuvable', 'Événement introuvable.');
    if (e.date <= now) throw Refus('passe', 'Cet événement est passé.');
    var d = droits(etat, compteId, now);
    if (!d.evenements) {
      throw Refus('reserve', d.categorie === 'early'
        ? 'Les événements privés sont réservés aux membres Signature Club et Founders Club.'
        : 'Réservé aux membres Signature Club et Founders Club.');
    }
    var deja = inscriptionDe(etat, evenementId, compteId);
    if (deja) return deja;
    var i = { id: nouvelId(etat, 'ins'), evenementId: evenementId, compteId: compteId, statut: placesRestantes(etat, evenementId) > 0 ? 'confirme' : 'attente', creeLe: now, categorie: d.categorie };
    etat.inscriptions[i.id] = i;
    return i;
  }

  // Une place libérée va à la première personne de la liste d'attente encore membre.
  function annulerInscription(etat, compteId, evenementId, now) {
    var i = inscriptionDe(etat, evenementId, compteId);
    if (!i) throw Refus('introuvable', 'Aucune inscription.');
    var liberait = i.statut === 'confirme';
    i.statut = 'annule';
    i.annuleLe = now;
    var promu = null;
    if (liberait) promu = promouvoirListeAttente(etat, evenementId, now);
    return { inscription: i, promu: promu };
  }

  function promouvoirListeAttente(etat, evenementId, now) {
    var attente = [];
    for (var id in etat.inscriptions) {
      var x = etat.inscriptions[id];
      if (x.evenementId === evenementId && x.statut === 'attente') attente.push(x);
    }
    attente.sort(function (a, b) { return a.creeLe - b.creeLe; });
    for (var k = 0; k < attente.length && placesRestantes(etat, evenementId) > 0; k++) {
      if (droits(etat, attente[k].compteId, now).evenements) {
        attente[k].statut = 'confirme';
        attente[k].promuLe = now;
        return attente[k];
      }
    }
    return null;
  }

  /* ---------- Tableau de bord ---------- */

  function statistiques(etat, now) {
    var s = { founders: 0, early: 0, signature: 0, actifs: 0, expires: 0, impayes: 0, revenuAnnuel: 0, encaisse: 0, fondateursRestants: 0 };
    s.founders = nombreFondateurs(etat);
    s.fondateursRestants = Math.max(0, MAX_FONDATEURS - (etat.compteurs.fondateur - 1));
    for (var id in etat.abonnements) {
      var a = mettreAJourAbonnement(etat.abonnements[id], now);
      if (a.statut === 'actif' || a.statut === 'impaye') {
        if (placeFondateur(etat, a.compteId)) continue;
        s[a.plan]++;
        s.actifs++;
        if (a.statut === 'impaye') s.impayes++;
        if (a.renouvellementAuto) s.revenuAnnuel += CATEGORIES[a.planAuRenouvellement || a.plan].prix;
      } else if (a.statut === 'expire') s.expires++;
    }
    etat.paiements.forEach(function (p) { s.encaisse += p.montant; });
    s.encaisse = Math.round(s.encaisse * 100) / 100;
    return s;
  }

  return {
    HEURE: HEURE, JOUR: JOUR, MAX_FONDATEURS: MAX_FONDATEURS, PRODUIT_FONDATEUR: PRODUIT_FONDATEUR,
    ATTENTE_PAIEMENT: ATTENTE_PAIEMENT, GRACE_IMPAYE: GRACE_IMPAYE, HEURES_ANTICIPEES: HEURES_ANTICIPEES,
    CATEGORIES: CATEGORIES, FORMULES_PAYANTES: FORMULES_PAYANTES, Refus: Refus,
    etatVide: etatVide, nouvelId: nouvelId, normaliserEmail: normaliserEmail, emailValide: emailValide,
    trouverOuCreerCompte: trouverOuCreerCompte,
    placeFondateur: placeFondateur, nombreFondateurs: nombreFondateurs,
    attribuerPlaceFondateur: attribuerPlaceFondateur, confirmerPaiementCommande: confirmerPaiementCommande,
    rembourserCommande: rembourserCommande, reattribuerNumeroRetire: reattribuerNumeroRetire,
    abonnementCourant: abonnementCourant, mettreAJourAbonnement: mettreAJourAbonnement,
    demarrerAbonnement: demarrerAbonnement, confirmerPaiementAbonnement: confirmerPaiementAbonnement,
    echecPaiementAbonnement: echecPaiementAbonnement, montantPassageSignature: montantPassageSignature,
    changerFormule: changerFormule, confirmerPassageSignature: confirmerPassageSignature,
    annulerRenouvellement: annulerRenouvellement, reprendreRenouvellement: reprendreRenouvellement,
    droits: droits, phaseLancement: phaseLancement, stockTotal: stockTotal,
    peutAcheter: peutAcheter, reserverPiece: reserverPiece, libererCommandesExpirees: libererCommandesExpirees,
    placesRestantes: placesRestantes, inscriptionDe: inscriptionDe, inscrireEvenement: inscrireEvenement,
    annulerInscription: annulerInscription, promouvoirListeAttente: promouvoirListeAttente,
    statistiques: statistiques
  };
});
