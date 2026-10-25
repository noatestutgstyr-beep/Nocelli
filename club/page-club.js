// Page Private Club : cartes, comparatif, onglets sur téléphone, adhésion.
(function () {
  'use strict';
  var C = window.NocelliCartes, Club = window.Club, NC = window.NC;

  // Cartes : éventail d'ouverture et une carte par formule (spécimens).
  var eventail = document.getElementById('eventail');
  ['founders', 'signature'].forEach(function (cat) {
    eventail.insertBefore(C.creer({ categorie: cat, numero: 1, retournable: false }), eventail.querySelector('.specimen'));
    var scene = document.querySelector('[data-carte=' + cat + ']');
    scene.appendChild(C.creer({ categorie: cat, numero: 1, nom: 'Votre nom' }));
  });

  // Tableau comparatif
  var LIGNES = [
    ['Collections 48 h avant le public', 1, 1],
    ['Priorité sur les éditions limitées', 1, 0],
    ['Événements privés et présentations', 0, 1],
    ['Votes sur les futures collections', 1, 1],
    ['Carte numérique et imprimée', 1, 1],
    ['Gratuit, à vie', 1, 0]
  ];
  document.getElementById('lignes-comparer').innerHTML = LIGNES.map(function (l) {
    function c(v, i) { return '<td' + (i === 0 ? ' class="col-founders"' : '') + '>' + (v ? '<span class="oui" aria-hidden="true"></span><span class="sr">Oui</span>' : '<span class="nonc" aria-hidden="true"></span><span class="sr">Non</span>') + '</td>'; }
    return '<tr><th scope="row">' + l[0] + '</th>' + c(l[1], 0) + c(l[2], 1) + '</tr>';
  }).join('');

  // Places fondateurs restantes
  Club.placesFondateurs().then(function (p) {
    var t = p.restantes === 0 ? 'Les 50 places sont attribuées.' : p.restantes + ' places sur 50 encore libres.';
    document.querySelectorAll('[data-places]').forEach(function (el) { el.textContent = t; });
  });

  // Téléphone : onglets synchronisés avec le défilement horizontal.
  var trio = document.getElementById('trio');
  var onglets = Array.prototype.slice.call(document.querySelectorAll('.onglets button'));
  var formules = Array.prototype.slice.call(trio.children);
  onglets.forEach(function (b) {
    b.addEventListener('click', function () {
      var f = formules[+b.dataset.cible];
      trio.scrollTo({ left: f.offsetLeft - trio.offsetLeft - parseFloat(getComputedStyle(trio).paddingLeft), behavior: 'smooth' });
    });
  });
  var calcul;
  trio.addEventListener('scroll', function () {
    cancelAnimationFrame(calcul);
    calcul = requestAnimationFrame(function () {
      var i = Math.round(trio.scrollLeft / (trio.clientWidth || 1));
      onglets.forEach(function (b, k) { b.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
    });
  }, { passive: true });

  /* ---------------- Adhésion ---------------- */
  var NOMS = { signature: 'Signature Club' };

  document.querySelectorAll('[data-rejoindre]').forEach(function (b) {
    b.addEventListener('click', function () { rejoindre(b.dataset.rejoindre); });
  });
  // Lien direct depuis une autre page : club.html#rejoindre-signature
  var m = location.hash.match(/^#rejoindre-(signature)$/) || location.search.match(/[?&]rejoindre=(signature)\b/);
  if (m) (Club.pret || Promise.resolve()).then(function () { setTimeout(function () { rejoindre(m[1]); }, 400); });

  function rejoindre(plan) {
    var w = NC.fenetre('', { titre: 'Rejoindre ' + NOMS[plan] });
    if (Club.session()) recap(w, plan); else identite(w, plan);
  }

  function identite(w, plan) {
    w.remplacer(
      '<span class="eyebrow">' + NOMS[plan] + ' · étape 1 sur 2</span>' +
      '<h3>Votre compte Nocelli</h3>' +
      '<p class="conditions">Si votre adresse e-mail est déjà connue, nous reprenons votre compte.</p>' +
      '<form id="f-id" novalidate style="display:grid;gap:22px;margin-top:22px">' +
      '<div class="champ"><label for="id-prenom">Prénom et nom</label><input id="id-prenom" autocomplete="name" placeholder="Lorenzo Bianchi"></div>' +
      '<div class="champ"><label for="id-email">E-mail</label><input id="id-email" type="email" inputmode="email" autocomplete="email" placeholder="vous@exemple.ch"></div>' +
      '<p class="erreur" id="id-err" role="alert"></p>' +
      '<button class="btn plein" type="submit">Continuer</button></form>');
    w.corps.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      var email = w.corps.querySelector('#id-email').value, nom = w.corps.querySelector('#id-prenom').value.trim();
      Club.connexion(email, nom, { rejoindre: plan }).then(function (r) {
        if (r && r.lienEnvoye) return w.remplacer(NC.lienEnvoye(r.email));
        recap(w, plan);
      }, function (err) {
        w.corps.querySelector('#id-err').textContent = err.message + ' Exemple : nom@exemple.ch.';
      });
    });
  }

  function recap(w, plan) {
    var cat = Club.CATEGORIES[plan];
    var debut = Club.maintenant();
    var fin = new Date(debut); fin.setUTCFullYear(fin.getUTCFullYear() + 1);
    w.remplacer(
      '<span class="eyebrow">' + NOMS[plan] + ' · étape 2 sur 2</span>' +
      '<h3>Avant de payer</h3>' +
      '<dl class="recap">' +
      '<div><dt>Formule</dt><dd>' + NOMS[plan] + '</dd></div>' +
      '<div><dt>Prix</dt><dd>' + NC.chf(cat.prix) + ' par an, TVA incluse</dd></div>' +
      '<div><dt>Période</dt><dd>Du ' + NC.date(debut) + ' au ' + NC.date(fin.getTime()) + '</dd></div>' +
      '<div><dt>Renouvellement</dt><dd>Automatique le ' + NC.date(fin.getTime()) + ', ' + NC.chf(cat.prix) + '</dd></div>' +
      '</dl>' +
      '<div class="conditions">' +
      '<p>Vous pouvez arrêter le renouvellement à tout moment dans votre espace membre. L’accès reste jusqu’à la fin de l’année payée.</p>' +
      '<p>Paiement sécurisé chez notre prestataire. Nocelli ne conserve aucune donnée bancaire.</p>' +
      '</div>' +
      '<label class="case"><input type="checkbox" id="accepte"> <span>J’ai lu les conditions de facturation et de renouvellement.</span></label>' +
      '<p class="erreur" id="r-err" role="alert"></p>' +
      '<div style="display:grid;gap:10px;margin-top:6px"><button class="btn plein" type="button" id="payer">Payer ' + NC.chf(cat.prix) + '</button></div>');
    w.corps.querySelector('#payer').addEventListener('click', function () {
      var err = w.corps.querySelector('#r-err');
      if (!w.corps.querySelector('#accepte').checked) { err.textContent = 'Cochez la case pour confirmer que vous avez lu les conditions.'; return; }
      var bouton = w.corps.querySelector('#payer');
      bouton.disabled = true;
      Club.demarrerAbonnement(plan).then(function (ab) {
        // Vrai serveur : la page de paiement sécurisée s'ouvre.
        if (ab && ab.redirection) return w.remplacer('<span class="eyebrow">Paiement</span><h3>Ouverture du paiement sécurisé…</h3>');
        paiementTest(w, plan, ab);
      }, function (e) {
        bouton.disabled = false;
        err.innerHTML = NC.echapper(e.message) + ' <a href="membre.html">Ouvrir mon espace membre</a>';
      });
    });
  }

  // Remplace la page de paiement Stripe tant que le site est en mode test.
  function paiementTest(w, plan, ab) {
    w.remplacer(
      '<span class="eyebrow">Paiement</span><h3>' + NOMS[plan] + ' · ' + NC.chf(ab.prix) + '</h3>' +
      '<div class="paiement-test"><span class="mode-test">Mode test</span>' +
      '<p>Le paiement réel n’est pas encore branché. Ici, aucune carte n’est demandée et aucun argent n’est débité. Choisissez ce que la banque répondrait :</p>' +
      '<div class="boutons"><button class="btn plein petit" type="button" data-ok>Paiement accepté</button><button class="btn petit" type="button" data-ko>Paiement refusé</button></div></div>' +
      '<p class="erreur" id="p-err" role="alert"></p>');
    w.corps.querySelector('[data-ok]').addEventListener('click', function () {
      Club.paiementTestAbonnement(ab.id, true).then(function (r) {
        if (r.aRembourser) { w.corps.querySelector('#p-err').textContent = 'Un autre abonnement était déjà actif : ce paiement serait remboursé automatiquement.'; return; }
        bienvenue(w, plan);
      }, function (e) { w.corps.querySelector('#p-err').textContent = e.message; });
    });
    w.corps.querySelector('[data-ko]').addEventListener('click', function () {
      Club.paiementTestAbonnement(ab.id, false).then(function () {
        w.corps.querySelector('#p-err').textContent = 'Paiement refusé. Rien n’a été activé ni débité. Vous pouvez réessayer.';
        setTimeout(function () { recap(w, plan); }, 1800);
      });
    });
  }

  function bienvenue(w, plan) {
    Club.monEspace().then(function (esp) {
      w.remplacer('<span class="eyebrow">Benvenuto</span><h3>Bienvenue au ' + NOMS[plan] + '.</h3>' +
        '<div data-ici style="margin-top:24px"></div>' +
        '<p class="conditions">Indiquez votre adresse pour recevoir la carte imprimée.</p>' +
        '<div style="display:grid;margin-top:20px"><a class="btn plein" href="membre.html#envoi">Donner mon adresse</a></div>');
      var c = C.creer(esp.carte);
      c.style.animation = 'revele 1.3s var(--doux) both';
      w.corps.querySelector('[data-ici]').appendChild(c);
    });
  }
})();
