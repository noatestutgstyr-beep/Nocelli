/*
 * NOCELLI PRIVATE CLUB — accès aux données.
 *
 * Aujourd'hui le site est statique (GitHub Pages) : il n'y a ni base de données,
 * ni comptes, ni paiements. Ce fichier fournit donc un SERVEUR DE TEST qui tourne
 * dans le navigateur : il applique les vraies règles (club/regles.js) et garde
 * les données uniquement dans ce navigateur. Aucun paiement réel n'est possible.
 *
 * Toutes les pages passent par l'objet Club ci-dessous, jamais par l'état
 * directement : quand la base Supabase sera branchée, seules ces fonctions
 * changeront (appels aux fonctions SQL de backend/supabase/schema.sql).
 */
(function () {
  'use strict';
  var R = window.NocelliRegles;
  var CLE = 'nocelli-club-test-v1';
  var memoire = null;

  function charger() {
    if (memoire) return memoire;
    try { var t = localStorage.getItem(CLE); if (t) memoire = JSON.parse(t); } catch (_) {}
    if (!memoire || !memoire.etat) memoire = { etat: R.etatVide(), session: null, decalage: 0 };
    return memoire;
  }
  function sauver() { try { localStorage.setItem(CLE, JSON.stringify(memoire)); } catch (_) {} }
  // Horloge de test : l'administration peut avancer le temps pour essayer les échéances.
  function maintenant() { return Date.now() + (charger().decalage || 0); }

  function jeton() {
    var b = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(b);
    return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }

  // Chaque appel : lit l'état, applique la règle, enregistre. Les refus remontent en erreur lisible.
  function appel(fn) {
    return new Promise(function (ok, ko) {
      try {
        var m = charger();
        R.libererCommandesExpirees(m.etat, maintenant());
        R.synchroniserEnvois(m.etat, maintenant());
        var r = fn(m.etat, maintenant(), m);
        R.synchroniserEnvois(m.etat, maintenant());
        sauver();
        setTimeout(function () { ok(r); }, 120);
      } catch (e) { sauver(); ko(e); }
    });
  }

  function moi(etat, m) {
    var id = m.session;
    if (!id || !etat.comptes[id]) throw R.Refus('connexion', 'Connectez-vous pour continuer.');
    return etat.comptes[id];
  }
  function exigerAdmin(etat, m) {
    var c = moi(etat, m);
    if (c.role !== 'admin') throw R.Refus('admin', 'Réservé à l’administration.');
    return c;
  }
  function journal(etat, admin, action, cible, details, now) {
    etat.journal.push({ id: etat.journal.length + 1, admin: admin.email, action: action, cible: cible, details: details || {}, le: now });
  }
  function copie(x) { return JSON.parse(JSON.stringify(x)); }

  function compteAvecJeton(etat, email, nom, now) {
    var c = R.trouverOuCreerCompte(etat, email, nom, now);
    if (!c.carteJeton) c.carteJeton = jeton();
    return c;
  }

  function carteDe(etat, compte, now) {
    var d = R.droits(etat, compte.id, now);
    if (!d.membre) return null;
    return {
      categorie: d.categorie,
      numero: d.categorie === 'founders' ? d.fondateur.numero : compte.numeroMembre,
      nom: compte.nom || compte.email,
      jeton: compte.carteJeton
    };
  }

  function vueLancement(etat, l, compteId, now) {
    var v = copie(l);
    v.phase = R.phaseLancement(l, now);
    v.ouvertureMembres = l.publicLe - l.heuresAnticipees * R.HEURE;
    v.restant = R.stockTotal(l);
    v.tailles = Object.keys(l.stock).map(function (t) {
      var p = R.peutAcheter(etat, compteId, l.id, t, now);
      return { taille: t, stock: l.stock[t], ok: p.ok, raison: p.raison, message: p.message };
    });
    return v;
  }

  function vueEvenement(etat, e, compteId) {
    var v = copie(e);
    v.restantes = R.placesRestantes(etat, e.id);
    var i = compteId && R.inscriptionDe(etat, e.id, compteId);
    v.monInscription = i ? i.statut : null;
    if (i && i.statut === 'attente') {
      var avant = 0;
      for (var k in etat.inscriptions) {
        var x = etat.inscriptions[k];
        if (x.evenementId === e.id && x.statut === 'attente' && x.creeLe < i.creeLe) avant++;
      }
      v.rangAttente = avant + 1;
    }
    return v;
  }

  var Club = {
    modeTest: true,
    maintenant: maintenant,
    CATEGORIES: R.CATEGORIES,

    /* ----- Session (en vrai : lien de connexion par e-mail, Supabase Auth) ----- */
    session: function () {
      var m = charger();
      var c = m.session && m.etat.comptes[m.session];
      return c ? copie(c) : null;
    },
    connexion: function (email, nom) {
      return appel(function (etat, now, m) {
        var c = compteAvecJeton(etat, email, nom, now);
        m.session = c.id;
        return copie(c);
      });
    },
    deconnexion: function () {
      return appel(function (etat, now, m) { m.session = null; });
    },
    modifierNom: function (nom) {
      return appel(function (etat, now, m) { moi(etat, m).nom = String(nom || '').slice(0, 80); });
    },
    // Adresse où envoyer la carte imprimée (Suisse et Liechtenstein).
    enregistrerAdresse: function (adresse) {
      return appel(function (etat, now, m) { return copie(R.enregistrerAdresse(etat, moi(etat, m).id, adresse)); });
    },

    /* ----- Vitrine du club ----- */
    placesFondateurs: function () {
      return appel(function (etat) {
        return { restantes: Math.max(0, R.MAX_FONDATEURS - (etat.compteurs.fondateur - 1)), total: R.MAX_FONDATEURS };
      });
    },

    /* ----- Espace membre ----- */
    monEspace: function () {
      return appel(function (etat, now, m) {
        var c = moi(etat, m);
        var d = R.droits(etat, c.id, now);
        var ab = R.abonnementCourant(etat, c.id, now);
        var dernier = null;
        for (var id in etat.abonnements) {
          var a = etat.abonnements[id];
          if (a.compteId === c.id && (!dernier || a.creeLe > dernier.creeLe)) dernier = a;
        }
        var lancements = [], evenements = [], commandes = [];
        for (var l in etat.lancements) if (etat.lancements[l].publie) lancements.push(vueLancement(etat, etat.lancements[l], c.id, now));
        lancements.sort(function (a, b) { return a.publicLe - b.publicLe; });
        if (d.membre) for (var e in etat.evenements) {
          var ev = etat.evenements[e];
          if (ev.publie && !ev.annule && ev.date > now) evenements.push(vueEvenement(etat, ev, c.id));
        }
        evenements.sort(function (a, b) { return a.date - b.date; });
        for (var k in etat.commandes) if (etat.commandes[k].compteId === c.id) commandes.push(copie(etat.commandes[k]));
        return {
          compte: copie(c),
          droits: { membre: d.membre, categorie: d.categorie, signature: d.signature, accesAnticipe: d.accesAnticipe, evenements: d.evenements, experiences: d.experiences, votes: d.votes, contenus: d.contenus },
          fondateur: d.fondateur ? copie(d.fondateur) : null,
          abonnement: ab ? copie(ab) : null,
          dernierAbonnement: dernier ? copie(dernier) : null,
          carte: carteDe(etat, c, now),
          lancements: lancements,
          evenements: evenements,
          commandes: commandes,
          paiements: etat.paiements.filter(function (p) { return p.compteId === c.id; }),
          envois: copie(R.envoisDe(etat, c.id)).filter(function (e) { return e.statut !== 'annulee'; }),
          maintenant: now
        };
      });
    },

    /* ----- Abonnements (en vrai : Stripe Checkout, confirmé par le webhook) ----- */
    demarrerAbonnement: function (plan) {
      return appel(function (etat, now, m) { return copie(R.demarrerAbonnement(etat, moi(etat, m).id, plan, now)); });
    },
    // Remplace la page de paiement Stripe en mode test : aucun argent n'est débité.
    paiementTestAbonnement: function (abonnementId, reussi) {
      return appel(function (etat, now, m) {
        var a = etat.abonnements[abonnementId];
        if (!a || a.compteId !== moi(etat, m).id) throw R.Refus('introuvable', 'Paiement introuvable.');
        var evt = 'test_' + jeton();
        return copie(reussi ? R.confirmerPaiementAbonnement(etat, abonnementId, evt, now) : R.echecPaiementAbonnement(etat, abonnementId, evt, now));
      });
    },
    annulerRenouvellement: function () {
      return appel(function (etat, now, m) { return copie(R.annulerRenouvellement(etat, moi(etat, m).id, now)); });
    },
    reprendreRenouvellement: function () {
      return appel(function (etat, now, m) { return copie(R.reprendreRenouvellement(etat, moi(etat, m).id, now)); });
    },

    /* ----- Collections en avant-première ----- */
    reserverPiece: function (lancementId, taille) {
      return appel(function (etat, now, m) { return copie(R.reserverPiece(etat, moi(etat, m).id, lancementId, taille, now)); });
    },
    paiementTestCommande: function (commandeId, reussi) {
      return appel(function (etat, now, m) {
        var c = etat.commandes[commandeId];
        if (!c || c.compteId !== moi(etat, m).id) throw R.Refus('introuvable', 'Commande introuvable.');
        if (!reussi) { R.rembourserCommande(etat, commandeId, 'annulee', now); var l = etat.lancements[c.lancementId]; if (l) l.stock[c.taille] += 1; return { annulee: true }; }
        return copie(R.confirmerPaiementCommande(etat, commandeId, now));
      });
    },

    /* ----- Événements privés ----- */
    inscrire: function (evenementId) {
      return appel(function (etat, now, m) { return copie(R.inscrireEvenement(etat, moi(etat, m).id, evenementId, now)); });
    },
    annulerInscription: function (evenementId) {
      return appel(function (etat, now, m) { return copie(R.annulerInscription(etat, moi(etat, m).id, evenementId, now)); });
    }
  };

  /* ===================== Administration ===================== */
  var Admin = {
    // Mode test : entrer comme administrateur. En vrai : compte Supabase avec rôle admin.
    entrer: function (email) {
      return appel(function (etat, now, m) {
        var c = compteAvecJeton(etat, email || 'admin@nocelli.ch', 'Administration', now);
        c.role = 'admin';
        m.session = c.id;
        return copie(c);
      });
    },
    tableau: function () {
      return appel(function (etat, now, m) {
        exigerAdmin(etat, m);
        return { stats: R.statistiques(etat, now), maintenant: now, decalage: m.decalage || 0 };
      });
    },
    membres: function () {
      return appel(function (etat, now, m) {
        exigerAdmin(etat, m);
        var liste = [];
        for (var id in etat.comptes) {
          var c = etat.comptes[id];
          if (c.role === 'admin') continue;
          var d = R.droits(etat, c.id, now);
          var dernier = null;
          for (var k in etat.abonnements) {
            var a = R.mettreAJourAbonnement(etat.abonnements[k], now);
            if (a.compteId === c.id && (!dernier || a.creeLe > dernier.creeLe)) dernier = a;
          }
          var f = R.placeFondateur(etat, c.id);
          liste.push({
            id: c.id, email: c.email, nom: c.nom, creeLe: c.creeLe, suspendu: c.suspendu,
            categorie: d.categorie, numero: f ? f.numero : c.numeroMembre,
            carte: (function () { var l = R.envoisDe(etat, c.id).filter(function (e) { return e.statut !== 'annulee'; }); return l.length ? l[l.length - 1].statut : null; })(),
            abonnement: dernier ? { plan: dernier.plan, statut: dernier.statut, fin: dernier.fin, renouvellementAuto: dernier.renouvellementAuto, debut: dernier.debut } : null,
            commandesNC01: Object.keys(etat.commandes).filter(function (k) { var x = etat.commandes[k]; return x.compteId === c.id && x.produit === R.PRODUIT_FONDATEUR && x.statut === 'payee'; }).length
          });
        }
        liste.sort(function (a, b) { return b.creeLe - a.creeLe; });
        return liste;
      });
    },
    fondateurs: function () {
      return appel(function (etat, now, m) {
        exigerAdmin(etat, m);
        var places = [];
        for (var n = 1; n <= R.MAX_FONDATEURS; n++) {
          var f = etat.fondateurs[n];
          var c = f && etat.comptes[f.compteId];
          places.push(f ? { numero: n, statut: f.statut, email: c && c.email, nom: c && c.nom, attribueLe: f.attribueLe, retireLe: f.retireLe, motif: f.motif, commandeId: f.commandeId } : { numero: n, statut: 'libre' });
        }
        // Acheteurs payés sans place : candidats si un numéro retiré est redonné.
        var candidats = [];
        for (var id in etat.comptes) {
          var cc = etat.comptes[id];
          if (R.placeFondateur(etat, cc.id)) continue;
          for (var k in etat.commandes) {
            var x = etat.commandes[k];
            if (x.compteId === cc.id && x.produit === R.PRODUIT_FONDATEUR && x.statut === 'payee') { candidats.push({ id: cc.id, email: cc.email, nom: cc.nom, payeeLe: x.payeeLe }); break; }
          }
        }
        candidats.sort(function (a, b) { return a.payeeLe - b.payeeLe; });
        return { places: places, candidats: candidats };
      });
    },
    suspendre: function (compteId, suspendu, motif) {
      return appel(function (etat, now, m) {
        var a = exigerAdmin(etat, m);
        var c = etat.comptes[compteId];
        if (!c) throw R.Refus('introuvable', 'Membre introuvable.');
        if (!motif) throw R.Refus('motif', 'Indiquez un motif : il est inscrit au journal.');
        c.suspendu = !!suspendu;
        journal(etat, a, suspendu ? 'Accès suspendu' : 'Accès rétabli', c.email, { motif: motif }, now);
      });
    },
    reattribuer: function (numero, compteId, motif) {
      return appel(function (etat, now, m) {
        var a = exigerAdmin(etat, m);
        if (!motif) throw R.Refus('motif', 'Indiquez un motif : il est inscrit au journal.');
        var ancien = etat.fondateurs[numero] && etat.comptes[etat.fondateurs[numero].compteId];
        R.reattribuerNumeroRetire(etat, numero, compteId, now);
        journal(etat, a, 'Numéro fondateur redonné', 'N° ' + ('00' + numero).slice(-3), { ancien: ancien && ancien.email, nouveau: etat.comptes[compteId].email, motif: motif }, now);
      });
    },
    lancements: function () {
      return appel(function (etat, now, m) {
        exigerAdmin(etat, m);
        var l = [];
        for (var id in etat.lancements) l.push(vueLancement(etat, etat.lancements[id], null, now));
        l.sort(function (a, b) { return a.publicLe - b.publicLe; });
        return l;
      });
    },
    enregistrerLancement: function (d) {
      return appel(function (etat, now, m) {
        var a = exigerAdmin(etat, m);
        if (!d.nom || !d.publicLe || isNaN(d.publicLe)) throw R.Refus('champs', 'Indiquez au moins le nom et la date de lancement public.');
        var h = Number(d.heuresAnticipees);
        if (!(h >= 0 && h <= 336)) throw R.Refus('heures', 'L’accès anticipé doit être entre 0 et 336 heures.');
        var nouveau = !d.id;
        var l = nouveau ? { id: R.nouvelId(etat, 'lan') } : etat.lancements[d.id];
        var etaitPublie = l.publie;
        l.nom = d.nom; l.produit = d.produit || d.nom; l.description = d.description || ''; l.prix = Number(d.prix) || 0;
        l.publicLe = d.publicLe; l.heuresAnticipees = h; l.stock = d.stock; l.publie = !!d.publie;
        etat.lancements[l.id] = l;
        journal(etat, a, nouveau ? 'Lancement créé' : 'Lancement modifié', l.nom, { public: new Date(l.publicLe).toISOString(), heures: h, stock: l.stock, publie: l.publie }, now);
        if (l.publie && !etaitPublie) {
          // Notification prioritaire aux membres (en vrai : e-mail via le prestataire choisi).
          var n = 0;
          for (var id in etat.comptes) if (R.droits(etat, id, now).accesAnticipe) n++;
          etat.notifications.push({ le: now, sujet: 'Avant-première : ' + l.nom, destinataires: n, ouvertureMembres: l.publicLe - h * R.HEURE });
        }
        return copie(l);
      });
    },
    evenements: function () {
      return appel(function (etat, now, m) {
        exigerAdmin(etat, m);
        var l = [];
        for (var id in etat.evenements) {
          var v = vueEvenement(etat, etat.evenements[id], null);
          v.inscrits = [];
          for (var k in etat.inscriptions) {
            var i = etat.inscriptions[k];
            if (i.evenementId !== id) continue;
            var c = etat.comptes[i.compteId];
            v.inscrits.push({ email: c.email, nom: c.nom, statut: i.statut, creeLe: i.creeLe, categorie: i.categorie });
          }
          v.inscrits.sort(function (a, b) { return a.creeLe - b.creeLe; });
          l.push(v);
        }
        l.sort(function (a, b) { return a.date - b.date; });
        return l;
      });
    },
    enregistrerEvenement: function (d) {
      return appel(function (etat, now, m) {
        var a = exigerAdmin(etat, m);
        if (!d.titre || !d.lieu || !d.date || isNaN(d.date)) throw R.Refus('champs', 'Indiquez le nom, la date et le lieu.');
        var cap = parseInt(d.capacite, 10);
        if (!(cap > 0)) throw R.Refus('capacite', 'La capacité doit être d’au moins une place.');
        var nouveau = !d.id;
        var e = nouveau ? { id: R.nouvelId(etat, 'evt') } : etat.evenements[d.id];
        var avant = e.capacite;
        ['titre', 'description', 'lieu', 'conditions'].forEach(function (k) { e[k] = d[k] || ''; });
        e.date = d.date; e.capacite = cap; e.prix = Math.max(0, Number(d.prix) || 0); e.publie = !!d.publie; e.annule = !!d.annule;
        etat.evenements[e.id] = e;
        // Capacité augmentée : la liste d'attente avance.
        if (!nouveau && cap > avant) while (R.promouvoirListeAttente(etat, e.id, now)) {}
        journal(etat, a, nouveau ? 'Événement créé' : 'Événement modifié', e.titre, { date: new Date(e.date).toISOString(), capacite: cap, prix: e.prix, publie: e.publie, annule: e.annule }, now);
        return copie(e);
      });
    },
    /* ----- Cartes imprimées à envoyer ----- */
    envois: function () {
      return appel(function (etat, now, m) {
        exigerAdmin(etat, m);
        var l = [];
        for (var id in etat.envois) {
          var e = copie(etat.envois[id]);
          var c = etat.comptes[e.compteId];
          e.email = c.email; e.nomCompte = c.nom;
          if (e.statut !== 'envoyee') e.adresse = c.adresse ? copie(c.adresse) : null;
          e.cout = R.coutEnvoi(e);
          l.push(e);
        }
        l.sort(function (a, b) { return a.creeLe - b.creeLe; });
        return { envois: l, couts: R.COUTS_CARTE, pays: R.PAYS_ENVOI };
      });
    },
    marquerCarteEnvoyee: function (envoiId) {
      return appel(function (etat, now, m) {
        var a = exigerAdmin(etat, m);
        var e = R.marquerCarteEnvoyee(etat, envoiId, now);
        journal(etat, a, 'Carte envoyée', etat.comptes[e.compteId].email, { categorie: e.categorie, numero: e.numero, mode: e.mode === 'colis' ? 'dans le colis NC-01' : 'courrier B' }, now);
        return copie(e);
      });
    },
    remplacerCarte: function (compteId, motif) {
      return appel(function (etat, now, m) {
        var a = exigerAdmin(etat, m);
        if (!motif) throw R.Refus('motif', 'Indiquez un motif : il est inscrit au journal.');
        var e = R.remplacerCarte(etat, compteId, now);
        journal(etat, a, 'Nouvelle carte demandée', etat.comptes[compteId].email, { motif: motif }, now);
        return copie(e);
      });
    },
    journal: function () {
      return appel(function (etat, now, m) { exigerAdmin(etat, m); return copie(etat.journal).reverse(); });
    },
    notifications: function () {
      return appel(function (etat, now, m) { exigerAdmin(etat, m); return copie(etat.notifications).reverse(); });
    },
    verifierCarte: function (j) {
      return appel(function (etat, now, m) {
        var a = exigerAdmin(etat, m);
        for (var id in etat.comptes) if (etat.comptes[id].carteJeton === j) {
          var c = etat.comptes[id];
          journal(etat, a, 'Carte vérifiée', c.email, {}, now);
          var carte = carteDe(etat, c, now);
          return { nom: c.nom || c.email, categorie: carte && carte.categorie, numero: carte && carte.numero, suspendu: c.suspendu };
        }
        return null;
      });
    },

    /* ----- Outils de test : simulent ce que feront la boutique et Stripe ----- */
    simulerAchatNC01: function (email, nom, rembourser) {
      return appel(function (etat, now, m) {
        var a = exigerAdmin(etat, m);
        var c = compteAvecJeton(etat, email, nom, now);
        var cmd = { id: R.nouvelId(etat, 'cmd'), compteId: c.id, produit: R.PRODUIT_FONDATEUR, quantite: 1, taille: 'M', statut: 'en_attente', creeLe: now };
        etat.commandes[cmd.id] = cmd;
        var r = R.confirmerPaiementCommande(etat, cmd.id, now);
        journal(etat, a, 'Test : achat NC-01 payé', c.email, { place: r.fondateur && r.fondateur.place ? r.fondateur.place.numero : r.fondateur.raison }, now);
        return r.fondateur;
      });
    },
    simulerRafale: function (n) {
      return appel(function (etat, now, m) {
        var a = exigerAdmin(etat, m);
        var donnes = 0;
        for (var i = 0; i < n; i++) {
          var c = compteAvecJeton(etat, 'test.rafale' + (Object.keys(etat.comptes).length + 1) + '@exemple.ch', 'Client test', now);
          var cmd = { id: R.nouvelId(etat, 'cmd'), compteId: c.id, produit: R.PRODUIT_FONDATEUR, quantite: 1, taille: 'M', statut: 'en_attente', creeLe: now };
          etat.commandes[cmd.id] = cmd;
          if (R.confirmerPaiementCommande(etat, cmd.id, now + i).fondateur.attribue) donnes++;
        }
        journal(etat, a, 'Test : ' + n + ' achats NC-01 simultanés', null, { placesDonnees: donnes }, now);
        return { places: donnes, total: n };
      });
    },
    rembourserNC01: function (email) {
      return appel(function (etat, now, m) {
        var a = exigerAdmin(etat, m);
        var e = R.normaliserEmail(email), cmd = null;
        for (var k in etat.commandes) {
          var x = etat.commandes[k];
          if (x.produit === R.PRODUIT_FONDATEUR && x.statut === 'payee' && etat.comptes[x.compteId].email === e) { cmd = x; break; }
        }
        if (!cmd) throw R.Refus('introuvable', 'Aucune commande NC-01 payée pour cette adresse.');
        var r = R.rembourserCommande(etat, cmd.id, 'remboursee', now);
        journal(etat, a, 'Test : remboursement NC-01', e, { resultat: r.retiree ? 'numéro retiré' : r.transferee ? 'place gardée (autre commande)' : 'sans effet' }, now);
        return r;
      });
    },
    simulerAbonne: function (email, nom, plan) {
      return appel(function (etat, now, m) {
        var a = exigerAdmin(etat, m);
        var c = compteAvecJeton(etat, email, nom, now);
        var ab = R.demarrerAbonnement(etat, c.id, plan, now);
        R.confirmerPaiementAbonnement(etat, ab.id, 'test_' + jeton(), now);
        journal(etat, a, 'Test : abonnement payé', c.email, { formule: plan }, now);
      });
    },
    avancerHorloge: function (heures) {
      return appel(function (etat, now, m) {
        var a = exigerAdmin(etat, m);
        m.decalage = heures === null ? 0 : (m.decalage || 0) + heures * R.HEURE;
        journal(etat, a, 'Test : horloge', null, { decalageHeures: Math.round(m.decalage / R.HEURE) }, now);
      });
    },
    toutEffacer: function () {
      return appel(function (etat, now, m) {
        exigerAdmin(etat, m);
        memoire = { etat: R.etatVide(), session: null, decalage: 0 };
        sauver();
      });
    }
  };

  window.Club = Club;
  window.ClubAdmin = Admin;
})();
