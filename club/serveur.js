/*
 * NOCELLI PRIVATE CLUB — branchement au vrai serveur (Supabase + Stripe).
 *
 * Si club/config.js donne l'adresse du projet Supabase et sa clé publique, ce
 * fichier remplace le serveur de test (club/donnees.js) par le vrai : comptes
 * par lien e-mail, paiements chez Stripe, règles appliquées par la base
 * (backend/supabase/schema.sql). Les pages n'y voient aucune différence : elles
 * appellent les mêmes fonctions Club et ClubAdmin.
 *
 * Sans config.js, rien ne change : le club reste en mode test.
 * La clé publique peut être lue par tout le monde ; la sécurité vient des
 * règles de la base (RLS) et des fonctions serveur. Aucun secret ici.
 */
(function () {
  'use strict';
  var CFG = window.NOCELLI_SERVEUR;
  var R = window.NocelliRegles;
  if (!CFG || !CFG.url || !CFG.cle) { window.Club.pret = Promise.resolve(); return; }
  if (!window.supabase || !window.supabase.createClient) {
    console.error('Bibliothèque Supabase absente : le club reste en mode test.');
    window.Club.pret = Promise.resolve();
    return;
  }

  var db = window.supabase.createClient(CFG.url, CFG.cle, { auth: { persistSession: true, detectSessionInUrl: true } });
  var profil = null;   // compte connecté (lecture synchrone par les pages)

  function ms(t) { return t ? new Date(t).getTime() : null; }
  function Refus(code, message) { var e = new Error(message); e.code = code; return e; }

  // Messages lisibles pour les refus de la base et des fonctions de paiement.
  var MESSAGES = {
    connexion: 'Connectez-vous pour continuer.',
    connexion_requise: 'Connectez-vous pour continuer.',
    pas_ouvert: 'La vente n’est pas encore ouverte.',
    reserve_membres: 'Réservé aux membres du Private Club jusqu’à l’ouverture publique.',
    epuise: 'Cette taille est épuisée.',
    introuvable: 'Introuvable ou plus disponible.',
    passe: 'Cet événement est passé.',
    reserve_signature: 'Les événements privés sont réservés aux membres Signature Club.',
    aucune_inscription: 'Aucune inscription à annuler.',
    deja_abonne: 'Vous êtes déjà membre Signature.',
    formule_non_vendue: 'Formule inconnue.',
    pas_abonne: 'Aucun abonnement Signature en cours.',
    commande_invalide: 'Cette commande n’est plus en attente de paiement. Choisissez à nouveau votre taille.',
    reserve_admin: 'Réservé à l’administration.',
    interdit: 'Accès refusé.',
    motif_obligatoire: 'Indiquez un motif : il est inscrit au journal.',
    non_membre: 'Ce compte n’est pas membre.',
    aucune_carte_envoyee: 'Aucune carte n’a encore été envoyée à ce membre.',
    numero_non_retire: 'Ce numéro n’est pas retiré.',
    deja_fondateur: 'Ce client est déjà fondateur.',
    non_eligible: 'Ce client n’a pas de commande NC-01 payée.',
    envoi_pas_pret: 'Cette carte n’est pas prête à partir (adresse manquante ou déjà envoyée).',
    envoi_introuvable: 'Envoi introuvable.'
  };
  function traduire(err) {
    if (!err) return Refus('erreur', 'Une erreur est survenue. Réessayez.');
    var brut = String(err.message || err.erreur || err);
    for (var k in MESSAGES) if (brut.indexOf(k) === 0 || brut === k) return Refus(k, MESSAGES[k]);
    if (/adresses_.*check|violates check constraint/.test(brut)) return Refus('adresse', 'Adresse incomplète : rue, NPA à 4 chiffres et localité sont obligatoires.');
    if (/JWT|session/i.test(brut)) return Refus('connexion', MESSAGES.connexion);
    if (/Failed to fetch|NetworkError|Load failed/i.test(brut)) return Refus('reseau', 'Le serveur ne répond pas. Vérifiez votre connexion internet et réessayez.');
    console.error(err);
    return Refus('erreur', 'Une erreur est survenue. Réessayez dans un instant.');
  }
  function ok(r) { if (r.error) throw traduire(r.error); return r.data; }
  function rpc(nom, args) { return db.rpc(nom, args || {}).then(ok); }
  function exigerSession() { if (!profil) throw Refus('connexion', MESSAGES.connexion); }

  // Appel d'une fonction serveur (Stripe). Elle répond { url } pour aller payer.
  function fonction(nom, corps) {
    return db.functions.invoke(nom, { body: corps }).then(function (r) {
      if (r.error) {
        var ctx = r.error.context;
        if (ctx && ctx.json) return ctx.json().then(function (j) { throw traduire({ message: j.erreur || r.error.message }); });
        throw traduire(r.error);
      }
      if (r.data && r.data.erreur) throw traduire({ message: r.data.erreur });
      return r.data;
    });
  }
  function allerPayer(r) {
    if (!r || !r.url) throw Refus('erreur', 'Le paiement n’a pas pu s’ouvrir. Réessayez.');
    location.href = r.url;
    return { redirection: r.url };
  }

  function chargerProfil(user) {
    if (!user) { profil = null; return Promise.resolve(null); }
    return db.from('profils').select('*').eq('id', user.id).maybeSingle().then(ok).then(function (p) {
      if (!p) { profil = null; return null; }
      var nom = user.user_metadata && user.user_metadata.nom;
      var suite = Promise.resolve();
      if (!p.nom && nom) { p.nom = String(nom).slice(0, 80); suite = db.from('profils').update({ nom: p.nom }).eq('id', p.id); }
      profil = { id: p.id, email: p.email, nom: p.nom, role: p.role, suspendu: p.suspendu, numeroMembre: p.numero_membre, carteJeton: p.carte_jeton, creeLe: ms(p.cree_le) };
      return suite.then(function () { return profil; });
    });
  }

  var pret = db.auth.getSession().then(function (r) {
    return chargerProfil(r.data && r.data.session && r.data.session.user);
  }).catch(function (e) { console.error(e); profil = null; });

  function adresseDe(a) {
    return a ? { nom: a.nom, rue: a.rue, complement: a.complement, npa: a.npa, localite: a.localite, pays: a.pays } : null;
  }
  function abonnementDe(a) {
    return a ? { id: a.id, plan: a.plan, statut: a.statut, debut: ms(a.debut), fin: ms(a.fin), renouvellementAuto: a.renouvellement_auto, creeLe: ms(a.maj_le) } : null;
  }
  function envoiDe(x) {
    return { id: x.id, compteId: x.compte_id, categorie: x.categorie, numero: x.numero, mode: x.mode, statut: x.statut, motif: x.motif, adresse: x.adresse, creeLe: ms(x.cree_le), envoyeeLe: ms(x.envoyee_le), annuleeLe: ms(x.annulee_le) };
  }
  function lancementDe(l, stocks, droitsMoi, connecte, now) {
    var v = { id: l.id, nom: l.nom, produit: l.produit, description: l.description, prix: Number(l.prix), publicLe: ms(l.public_le), heuresAnticipees: l.heures_anticipees, publie: l.publie, stock: {} };
    stocks.filter(function (s) { return s.lancement_id === l.id; }).forEach(function (s) { v.stock[s.taille] = s.quantite; });
    v.ouvertureMembres = v.publicLe - v.heuresAnticipees * R.HEURE;
    v.phase = now >= v.publicLe ? 'public' : now >= v.ouvertureMembres ? 'membres' : 'annonce';
    v.restant = Object.keys(v.stock).reduce(function (n, t) { return n + v.stock[t]; }, 0);
    v.tailles = ['XS', 'S', 'M', 'L', 'XL'].filter(function (t) { return t in v.stock; }).concat(Object.keys(v.stock).filter(function (t) { return ['XS', 'S', 'M', 'L', 'XL'].indexOf(t) < 0; })).map(function (t) {
      var r = { taille: t, stock: v.stock[t], ok: true };
      if (!v.publie) { r.ok = false; r.raison = 'introuvable'; r.message = "Cette collection n'est pas encore annoncée."; }
      else if (v.phase === 'annonce') { r.ok = false; r.raison = 'pas_ouvert'; r.message = MESSAGES.pas_ouvert; }
      else if (v.phase === 'membres' && !(droitsMoi && droitsMoi.accesAnticipe)) { r.ok = false; r.raison = 'reserve_membres'; r.message = MESSAGES.reserve_membres; }
      else if (!connecte) { r.ok = false; r.raison = 'connexion'; r.message = 'Connectez-vous pour acheter.'; }
      else if (v.stock[t] <= 0) { r.ok = false; r.raison = 'epuise'; r.message = MESSAGES.epuise; }
      return r;
    });
    return v;
  }
  function evenementDe(e) {
    return { id: e.id, titre: e.titre, description: e.description, date: ms(e.date), lieu: e.lieu, capacite: e.capacite, prix: Number(e.prix), conditions: e.conditions, publie: e.publie, annule: e.annule };
  }
  function droitsDe(ligne, fondateur, ab, compte) {
    var d = ligne || {};
    var membre = !!d.categorie && !(compte && compte.suspendu);
    var sig = !!(ab && (ab.statut === 'actif' || ab.statut === 'impaye'));
    return { membre: membre, categorie: membre ? d.categorie : null, signature: membre && sig, fondateur: fondateur,
      accesAnticipe: !!d.acces_anticipe, evenements: !!d.evenements, experiences: !!d.evenements, votes: !!d.votes, contenus: !!d.contenus };
  }

  var Club = {
    modeTest: false,
    pret: pret,
    maintenant: function () { return Date.now(); },
    CATEGORIES: R.CATEGORIES,

    session: function () { return profil ? JSON.parse(JSON.stringify(profil)) : null; },
    // Envoie un lien de connexion par e-mail. La personne revient sur cette page, connectée.
    connexion: function (email, nom, suite) {
      email = String(email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return Promise.reject(Refus('email', 'Cette adresse e-mail ne semble pas complète.'));
      // Retour sur la même page. Le lien ajoute ses propres données après « # » : une demande
      // d'adhésion en cours (#rejoindre-signature) passe donc dans « ?rejoindre= ».
      var m = location.hash.match(/^#rejoindre-(\w+)$/);
      var plan = (suite && suite.rejoindre) || (m && m[1]);
      var retour = location.href.split('#')[0].split('?')[0] + (plan ? '?rejoindre=' + plan : '');
      return db.auth.signInWithOtp({ email: email, options: { emailRedirectTo: retour, data: nom ? { nom: String(nom).slice(0, 80) } : undefined } })
        .then(function (r) {
          if (r.error) {
            if (/rate|seconds/i.test(r.error.message)) throw Refus('attente', 'Un lien vient d’être envoyé. Attendez une minute avant d’en demander un autre.');
            throw traduire(r.error);
          }
          return { lienEnvoye: true, email: email };
        });
    },
    deconnexion: function () { return db.auth.signOut().then(function () { profil = null; }); },
    modifierNom: function (nom) {
      exigerSession();
      var n = String(nom || '').slice(0, 80);
      return db.from('profils').update({ nom: n }).eq('id', profil.id).then(ok).then(function () { profil.nom = n; });
    },
    enregistrerAdresse: function (a) {
      exigerSession();
      var v = R.adresseValide ? R.adresseValide(a) : null;
      if (v && v.ok === false) return Promise.reject(Refus('adresse', v.message));
      return rpc('enregistrer_adresse', { p_nom: a.nom, p_rue: a.rue, p_complement: a.complement || '', p_npa: String(a.npa || '').trim(), p_localite: a.localite, p_pays: a.pays || 'CH' });
    },

    placesFondateurs: function () {
      return rpc('places_fondateurs_restantes').then(function (n) { return { restantes: n, total: R.MAX_FONDATEURS }; },
        function () { return { restantes: R.MAX_FONDATEURS, total: R.MAX_FONDATEURS }; });
    },

    monEspace: function () {
      if (!profil) return Promise.reject(Refus('connexion', MESSAGES.connexion));
      var id = profil.id, now = Date.now();
      return Promise.all([
        db.from('profils').select('*').eq('id', id).single().then(ok),
        rpc('droits', { p_compte: id }),
        db.from('places_fondateurs').select('*').eq('compte_id', id).eq('statut', 'confirme').maybeSingle().then(ok),
        db.from('abonnements').select('*').eq('compte_id', id).order('maj_le', { ascending: false }).then(ok),
        db.from('lancements').select('*').eq('publie', true).order('public_le').then(ok),
        db.from('stock_lancement').select('*').then(ok),
        db.from('evenements').select('*').eq('publie', true).eq('annule', false).gt('date', new Date().toISOString()).order('date').then(ok),
        db.from('evenements_places').select('*').then(ok),
        db.from('inscriptions').select('*').eq('compte_id', id).neq('statut', 'annule').then(ok),
        db.from('commandes').select('*').eq('compte_id', id).then(ok),
        db.from('paiements').select('*').eq('compte_id', id).then(ok),
        db.from('envois_cartes').select('*').eq('compte_id', id).neq('statut', 'annulee').order('cree_le').then(ok),
        db.from('adresses').select('*').eq('compte_id', id).maybeSingle().then(ok)
      ]).then(function (r) {
        var p = r[0], ligne = (r[1] || [])[0], place = r[2], abs = r[3];
        var compte = { id: p.id, email: p.email, nom: p.nom, role: p.role, suspendu: p.suspendu, numeroMembre: p.numero_membre, carteJeton: p.carte_jeton, creeLe: ms(p.cree_le), adresse: adresseDe(r[12]) };
        profil.nom = p.nom; profil.numeroMembre = p.numero_membre; profil.role = p.role;
        var vivant = abs.filter(function (a) { return a.statut === 'actif' || a.statut === 'impaye'; })[0];
        var ab = abonnementDe(vivant);
        var fondateur = place ? { numero: place.numero, attribueLe: ms(place.attribue_le), statut: place.statut } : null;
        var d = droitsDe(ligne, fondateur, ab, compte);
        var places = {}; r[7].forEach(function (x) { places[x.id] = x; });
        var mesInscr = {}; r[8].forEach(function (i) { mesInscr[i.evenement_id] = i; });
        var evenements = d.membre ? r[6].map(function (e) {
          var v = evenementDe(e);
          v.restantes = places[e.id] ? places[e.id].restantes : e.capacite;
          var i = mesInscr[e.id];
          v.monInscription = i ? i.statut : null;
          if (i && i.statut === 'attente') v.rangAttente = (places[e.id] ? places[e.id].en_attente : 1);
          return v;
        }) : [];
        var carte = d.membre ? { categorie: d.categorie, numero: d.categorie === 'founders' ? fondateur.numero : p.numero_membre, nom: p.nom || p.email, jeton: p.carte_jeton } : null;
        return {
          compte: compte,
          droits: d,
          fondateur: fondateur,
          abonnement: ab,
          dernierAbonnement: abonnementDe(abs[0]),
          carte: carte,
          lancements: r[4].map(function (l) { return lancementDe(l, r[5], d, true, now); }),
          evenements: evenements,
          commandes: r[9].map(function (c) { return { id: c.id, produit: c.produit, taille: c.taille, statut: c.statut, creeLe: ms(c.cree_le), payeeLe: ms(c.payee_le) }; }),
          paiements: r[10].map(function (x) { return { id: x.id, montant: Number(x.montant), type: x.type, le: ms(x.le) }; }),
          envois: r[11].map(envoiDe),
          maintenant: now
        };
      });
    },

    // Signature : ouvre la page de paiement Stripe. L'adhésion s'active quand Stripe confirme.
    demarrerAbonnement: function (plan) {
      exigerSession();
      return fonction('paiement', { action: 'souscrire', plan: plan }).then(allerPayer);
    },
    annulerRenouvellement: function () { return fonction('paiement', { action: 'annuler_renouvellement' }); },
    reprendreRenouvellement: function () { return fonction('paiement', { action: 'reprendre_renouvellement' }); },

    // Achat : la base réserve la pièce 30 minutes, puis Stripe encaisse.
    reserverPiece: function (lancementId, taille) {
      exigerSession();
      return rpc('reserver_piece', { p_lancement: lancementId, p_taille: taille }).then(function (cmd) {
        return fonction('paiement', { action: 'acheter', commande_id: cmd });
      }).then(allerPayer);
    },

    inscrire: function (evenementId) { return rpc('inscrire_evenement', { p_evenement: evenementId }); },
    annulerInscription: function (evenementId) { return rpc('annuler_inscription', { p_evenement: evenementId }); }
  };

  /* ===================== Administration ===================== */
  function exigerAdmin() { if (!profil || profil.role !== 'admin') throw Refus('admin', MESSAGES.reserve_admin); }
  function tout(table, req) { return (req || db.from(table).select('*')).then(ok); }

  function registre() {
    exigerAdmin();
    return Promise.all([
      tout('profils'), tout('places_fondateurs'), tout('abonnements'), tout('commandes'), tout('paiements'), tout('envois_cartes'), tout('adresses')
    ]).then(function (r) {
      return { profils: r[0], places: r[1], abonnements: r[2], commandes: r[3], paiements: r[4], envois: r[5], adresses: r[6] };
    });
  }
  function vivant(a, now) { return a && (a.statut === 'actif' && ms(a.fin) > now || a.statut === 'impaye' && ms(a.fin) + 7 * R.JOUR > now); }

  var Admin = {
    entrer: function () { return Promise.reject(Refus('admin', 'Connectez-vous avec le compte administrateur.')); },
    tableau: function () {
      return registre().then(function (g) {
        var now = Date.now(), s = { founders: 0, signature: 0, fondateursSignature: 0, expires: 0, impayes: 0, revenuAnnuel: 0, encaisse: 0, fondateursRestants: 0 };
        var fond = {};
        g.places.forEach(function (p) { if (p.statut === 'confirme') { s.founders++; fond[p.compte_id] = true; } });
        var maxNum = g.places.reduce(function (m, p) { return Math.max(m, p.numero); }, 0);
        s.fondateursRestants = R.MAX_FONDATEURS - maxNum;
        var vu = {};
        g.abonnements.forEach(function (a) {
          if (vivant(a, now)) {
            s.signature++; if (fond[a.compte_id]) s.fondateursSignature++;
            if (a.statut === 'impaye') s.impayes++;
            if (a.renouvellement_auto) s.revenuAnnuel += R.CATEGORIES.signature.prix;
            vu[a.compte_id] = true;
          }
        });
        g.abonnements.forEach(function (a) { if (!vu[a.compte_id] && (a.statut === 'expire' || a.statut === 'annule')) { s.expires++; vu[a.compte_id] = true; } });
        g.paiements.forEach(function (p) { s.encaisse += Number(p.montant); });
        return { stats: s, maintenant: now, decalage: 0 };
      });
    },
    notifications: function () { return Promise.resolve([]); },
    membres: function () {
      return registre().then(function (g) {
        var now = Date.now();
        return g.profils.filter(function (p) { return p.role !== 'admin'; }).map(function (p) {
          var place = g.places.filter(function (x) { return x.compte_id === p.id && x.statut === 'confirme'; })[0];
          var abs = g.abonnements.filter(function (a) { return a.compte_id === p.id; }).sort(function (a, b) { return ms(b.maj_le) - ms(a.maj_le); });
          var der = abs[0];
          var cat = p.suspendu ? null : place ? 'founders' : der && vivant(der, now) ? 'signature' : null;
          var env = g.envois.filter(function (e) { return e.compte_id === p.id && e.statut !== 'annulee'; }).sort(function (a, b) { return ms(a.cree_le) - ms(b.cree_le); });
          return {
            id: p.id, email: p.email, nom: p.nom, creeLe: ms(p.cree_le), suspendu: p.suspendu,
            categorie: cat, numero: place ? place.numero : p.numero_membre,
            carte: env.length ? env[env.length - 1].statut : null,
            abonnement: der ? { plan: der.plan, statut: der.statut, fin: ms(der.fin), renouvellementAuto: der.renouvellement_auto, debut: ms(der.debut) } : null,
            commandesNC01: g.commandes.filter(function (c) { return c.compte_id === p.id && c.produit === R.PRODUIT_FONDATEUR && c.statut === 'payee'; }).length
          };
        }).sort(function (a, b) { return b.creeLe - a.creeLe; });
      });
    },
    fondateurs: function () {
      return registre().then(function (g) {
        var parId = {}; g.profils.forEach(function (p) { parId[p.id] = p; });
        var places = [];
        for (var n = 1; n <= R.MAX_FONDATEURS; n++) {
          var f = g.places.filter(function (x) { return x.numero === n; })[0];
          var c = f && parId[f.compte_id];
          places.push(f ? { numero: n, statut: f.statut, email: c && c.email, nom: c && c.nom, attribueLe: ms(f.attribue_le), retireLe: ms(f.retire_le), motif: f.motif, commandeId: f.commande_id } : { numero: n, statut: 'libre' });
        }
        var avecPlace = {}; g.places.forEach(function (x) { if (x.statut === 'confirme') avecPlace[x.compte_id] = true; });
        var candidats = [], vus = {};
        g.commandes.filter(function (x) { return x.produit === R.PRODUIT_FONDATEUR && x.statut === 'payee' && !avecPlace[x.compte_id]; })
          .sort(function (a, b) { return ms(a.payee_le) - ms(b.payee_le); })
          .forEach(function (x) { if (vus[x.compte_id]) return; vus[x.compte_id] = true; var c = parId[x.compte_id]; candidats.push({ id: c.id, email: c.email, nom: c.nom, payeeLe: ms(x.payee_le) }); });
        return { places: places, candidats: candidats };
      });
    },
    suspendre: function (compteId, suspendu, motif) {
      if (!motif) return Promise.reject(Refus('motif', MESSAGES.motif_obligatoire));
      return rpc('admin_suspendre', { p_compte: compteId, p_suspendu: !!suspendu, p_motif: motif });
    },
    reattribuer: function (numero, compteId, motif) {
      if (!motif) return Promise.reject(Refus('motif', MESSAGES.motif_obligatoire));
      return rpc('admin_reattribuer_numero', { p_numero: numero, p_compte: compteId, p_motif: motif });
    },
    lancements: function () {
      exigerAdmin();
      return Promise.all([tout('lancements', db.from('lancements').select('*').order('public_le')), tout('stock_lancement')]).then(function (r) {
        var now = Date.now();
        return r[0].map(function (l) { return lancementDe(l, r[1], { accesAnticipe: true }, true, now); });
      });
    },
    enregistrerLancement: function (d) {
      if (!d.nom || !d.publicLe || isNaN(d.publicLe)) return Promise.reject(Refus('champs', 'Indiquez au moins le nom et la date de lancement public.'));
      var h = Number(d.heuresAnticipees);
      if (!(h >= 0 && h <= 336)) return Promise.reject(Refus('heures', 'L’accès anticipé doit être entre 0 et 336 heures.'));
      return rpc('admin_enregistrer_lancement', {
        p_id: d.id || null, p_nom: d.nom, p_produit: d.produit || d.nom, p_description: d.description || '', p_prix: Number(d.prix) || 0,
        p_public_le: new Date(d.publicLe).toISOString(), p_heures: h, p_publie: !!d.publie, p_stock: d.stock || {}
      });
    },
    evenements: function () {
      exigerAdmin();
      return Promise.all([
        tout('evenements', db.from('evenements').select('*').order('date')), tout('evenements_places'), tout('inscriptions'), tout('profils')
      ]).then(function (r) {
        var parId = {}; r[3].forEach(function (p) { parId[p.id] = p; });
        var places = {}; r[1].forEach(function (x) { places[x.id] = x; });
        return r[0].map(function (e) {
          var v = evenementDe(e);
          v.restantes = places[e.id] ? places[e.id].restantes : e.capacite;
          v.inscrits = r[2].filter(function (i) { return i.evenement_id === e.id; }).sort(function (a, b) { return ms(a.cree_le) - ms(b.cree_le); }).map(function (i) {
            var c = parId[i.compte_id] || {};
            return { email: c.email, nom: c.nom, statut: i.statut, creeLe: ms(i.cree_le) };
          });
          return v;
        });
      });
    },
    enregistrerEvenement: function (d) {
      if (!d.titre || !d.lieu || !d.date || isNaN(d.date)) return Promise.reject(Refus('champs', 'Indiquez le nom, la date et le lieu.'));
      var cap = parseInt(d.capacite, 10);
      if (!(cap > 0)) return Promise.reject(Refus('capacite', 'La capacité doit être d’au moins une place.'));
      return rpc('admin_enregistrer_evenement', {
        p_id: d.id || null, p_titre: d.titre, p_description: d.description || '', p_date: new Date(d.date).toISOString(), p_lieu: d.lieu,
        p_capacite: cap, p_prix: Math.max(0, Number(d.prix) || 0), p_conditions: d.conditions || '', p_publie: !!d.publie, p_annule: !!d.annule
      });
    },
    envois: function () {
      return registre().then(function (g) {
        var parId = {}; g.profils.forEach(function (p) { parId[p.id] = p; });
        var adr = {}; g.adresses.forEach(function (a) { adr[a.compte_id] = a; });
        var l = g.envois.map(function (x) {
          var e = envoiDe(x), c = parId[x.compte_id] || {};
          e.email = c.email; e.nomCompte = c.nom;
          if (e.statut !== 'envoyee') e.adresse = adresseDe(adr[x.compte_id]);
          e.cout = R.coutEnvoi(e);
          return e;
        }).sort(function (a, b) { return a.creeLe - b.creeLe; });
        return { envois: l, couts: R.COUTS_CARTE, pays: R.PAYS_ENVOI };
      });
    },
    marquerCarteEnvoyee: function (envoiId) { return rpc('admin_marquer_carte_envoyee', { p_envoi: envoiId }); },
    remplacerCarte: function (compteId, motif) {
      if (!motif) return Promise.reject(Refus('motif', MESSAGES.motif_obligatoire));
      return rpc('admin_remplacer_carte', { p_compte: compteId, p_motif: motif });
    },
    journal: function () {
      exigerAdmin();
      return Promise.all([tout('journal_admin', db.from('journal_admin').select('*').order('le', { ascending: false }).limit(500)), tout('profils')]).then(function (r) {
        var parId = {}; r[1].forEach(function (p) { parId[p.id] = p; });
        return r[0].map(function (j) { return { id: j.id, admin: (parId[j.admin_id] || {}).email || 'serveur', action: j.action, cible: j.cible, details: j.details, le: ms(j.le) }; });
      });
    },
    verifierCarte: function (j) {
      return rpc('admin_verifier_carte', { p_jeton: j }).then(function (r) {
        var x = r && r[0];
        if (!x) return null;
        return { nom: x.nom, categorie: x.categorie, numero: x.numero ? parseInt(x.numero, 10) : null, suspendu: !x.categorie };
      });
    }
  };

  // Les pages gardent leurs fonctions de test uniquement en mode test.
  window.Club = Club;
  window.ClubAdmin = Admin;
})();
