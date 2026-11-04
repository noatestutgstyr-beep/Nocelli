/* NOCELLI : compte et panier, sur toutes les pages.
   - En-tête : « Inscription » tant que personne n'est connecté ; le prénom du compte (vers l'espace membre) une fois connecté.
   - « Panier » affiche le nombre de pièces.
   - Le panier est réservé aux comptes : sans compte, la pièce choisie est gardée de côté, on passe par l'inscription,
     et elle entre dans le panier dès que la personne est connectée.
   Le panier est gardé dans ce navigateur, un par compte. */
(function () {
  'use strict';

  // Liens de paiement Stripe (un par taille, chacun limité à son nombre de pièces), à coller le jour de l'ouverture.
  // Tant qu'ils sont vides, le panier garde les pièces et annonce l'ouverture.
  var LIENS_PAIEMENT = { 'NC-01': { S: '', M: '', L: '' } };
  var OUVERTURE = Date.UTC(2026, 11, 1, 18, 0, 0); // 1er décembre 2026, 19 h à Zurich

  function lire(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function ecrire(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  // Session Supabase gardée par le navigateur (même clé que club/serveur.js), sans charger la librairie
  function session() {
    var srv = window.NOCELLI_SERVEUR;
    if (!srv || !srv.url) return null;
    var ref = new URL(srv.url).hostname.split('.')[0], s = lire('sb-' + ref + '-auth-token');
    var u = s && (s.user || (s.currentSession && s.currentSession.user));
    if (!u || !u.id) return null;
    var nom = (u.user_metadata && u.user_metadata.nom) || '';
    return { id: u.id, email: u.email || '', nom: nom, prenom: nom.split(' ')[0] || (u.email || '').split('@')[0] };
  }
  var moi = session();

  function cle() { return moi ? 'nocelli-panier-' + moi.id : null; }
  function articles() { return (cle() && lire(cle())) || []; }
  function garder(l) { ecrire(cle(), l.length ? l : null); majEntete(); document.dispatchEvent(new CustomEvent('nocelli-panier')); }
  function nombre() { return articles().reduce(function (n, a) { return n + a.qte; }, 0); }

  function ajouterDans(l, art) {
    var x = l.filter(function (a) { return a.ref === art.ref && a.taille === art.taille; })[0];
    if (x) x.qte = Math.min(10, x.qte + 1); else l.push({ ref: art.ref, nom: art.nom, taille: art.taille, prix: art.prix, image: art.image, url: art.url, qte: 1 });
    return l;
  }
  // Ajoute une pièce. Sans compte : elle est gardée de côté et on part vers l'inscription ; renvoie false.
  function ajouter(art) {
    if (!moi) { ecrire('nocelli-panier-attente', art); location.href = 'inscription.html?panier=1'; return false; }
    garder(ajouterDans(articles(), art));
    return true;
  }
  // La pièce gardée de côté entre dans le panier dès que la personne est connectée
  if (moi) {
    var att = lire('nocelli-panier-attente');
    if (att) { ecrire('nocelli-panier-attente', null); ecrire(cle(), ajouterDans(articles(), att)); ecrire('nocelli-panier-ajoute', 1); }
  }

  function majEntete() {
    var n = nombre();
    document.querySelectorAll('[data-panier]').forEach(function (a) {
      a.textContent = 'Panier' + (n ? ' (' + n + ')' : '');
    });
    document.querySelectorAll('[data-lien-compte]').forEach(function (a) {
      if (!moi) return;
      a.textContent = moi.prenom; a.href = 'membre.html'; a.title = moi.email;
      a.setAttribute('aria-label', 'Mon compte : ' + moi.prenom);
    });
  }

  window.NocelliPanier = {
    connecte: function () { return !!moi; },
    compte: function () { return moi; },
    articles: articles,
    nombre: nombre,
    ajouter: ajouter,
    changer: function (i, qte) { var l = articles(); if (!l[i]) return; if (qte <= 0) l.splice(i, 1); else l[i].qte = Math.min(10, qte); garder(l); },
    vider: function () { garder([]); },
    total: function () { return articles().reduce(function (n, a) { return n + a.prix * a.qte; }, 0); },
    lienPaiement: function (a) { var l = LIENS_PAIEMENT[a.ref]; return (l && l[a.taille]) || ''; },
    ouvert: function () { return Date.now() >= OUVERTURE; },
    // le nom affiché peut être précisé par le serveur (club/commun.js) une fois le profil chargé
    preciser: function (s) { if (moi && s && s.nom) { moi.nom = s.nom; moi.prenom = s.nom.split(' ')[0]; majEntete(); } }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', majEntete); else majEntete();
})();
