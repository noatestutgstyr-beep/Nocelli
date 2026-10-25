// Espace membre « My Membership » : carte, adhésion, collections, événements, commandes.
(function () {
  'use strict';
  var Club = window.Club, C = window.NocelliCartes, NC = window.NC, e = NC.echapper;
  var app = document.getElementById('app');
  var NOMS = { founders: 'Founders Club', signature: 'Signature Club' };
  var params = new URLSearchParams(location.search);

  // [avantage, a-t-il ce droit ?, réservé aux fondateurs (masqué pour les autres)]
  var AVANTAGES = [
    ['Les nouvelles collections 48 h avant le public', function (d) { return d.accesAnticipe; }],
    ['Notifications des lancements', function (d) { return d.membre; }],
    ['Événements privés et présentations', function (d) { return d.evenements; }],
    ['Votes sur les futures collections', function (d) { return d.votes; }],
    ['Contenus réservés aux membres', function (d) { return d.contenus; }],
    ['Carte numérique et imprimée', function (d) { return d.membre; }],
    ['Priorité sur les éditions limitées', function (d) { return d.categorie === 'founders'; }, true],
    ['Gratuit, à vie', function (d) { return d.categorie === 'founders'; }, true]
  ];

  function rendre() {
    if (!Club.session()) return connexion();
    Club.monEspace().then(espace, function (err) {
      if (err.code === 'connexion') return connexion();
      app.innerHTML = '<section class="bloc"><div class="wrap"><p class="erreur">' + e(err.message) + '</p></div></section>';
    });
  }

  /* ---------------- Connexion ---------------- */
  function connexion() {
    var carte = params.get('carte');
    app.innerHTML =
      '<section class="connexion"><div class="wrap connexion-grid"><div>' +
      '<span class="eyebrow apparait">Il Mio Conto</span>' +
      '<h1 class="apparait d1">Mon compte Nocelli</h1>' +
      (carte ? '<p class="apparait d2" style="margin-top:18px;max-width:46ch">Vous avez scanné une carte du Private Club. Pour ouvrir l’espace membre, connectez-vous avec l’adresse de votre compte. La carte seule ne donne accès à rien.</p>' :
        '<p class="apparait d2" style="margin-top:18px;max-width:46ch">Votre carte, vos avant-premières, vos invitations et vos commandes.</p>') +
      '<form id="f-cnx" class="apparait d3" novalidate>' +
      '<div class="champ"><label for="c-email">E-mail</label><input id="c-email" type="email" inputmode="email" autocomplete="email" placeholder="vous@exemple.ch"></div>' +
      '<div class="champ"><label for="c-nom">Prénom et nom <span style="letter-spacing:0;text-transform:none">(nouveau compte)</span></label><input id="c-nom" autocomplete="name" placeholder="Lorenzo Bianchi"></div>' +
      '<p class="erreur" id="c-err" role="alert"></p>' +
      '<button class="btn plein" type="submit">Recevoir mon lien de connexion</button>' +
      '<p class="note">Pas de mot de passe : nous vous envoyons un lien de connexion par e-mail.' + (Club.modeTest ? ' <span class="mode-test">Mode test</span> ici, la connexion est immédiate.' : '') + '</p>' +
      '</form></div><div class="apercu" id="apercu" aria-hidden="true"></div></div></section>';
    var ap = document.getElementById('apercu');
    ['founders', 'signature'].forEach(function (c) { ap.appendChild(C.creer({ categorie: c, numero: 1, retournable: false, vivante: false })); });
    document.getElementById('f-cnx').addEventListener('submit', function (ev) {
      ev.preventDefault();
      Club.connexion(document.getElementById('c-email').value, document.getElementById('c-nom').value.trim()).then(function (r) {
        if (r && r.lienEnvoye) { document.getElementById('f-cnx').innerHTML = '<div style="display:grid;gap:14px">' + NC.lienEnvoye(r.email) + '</div>'; return; }
        rendre();
      }, function (err) {
        document.getElementById('c-err').textContent = err.message + ' Exemple : nom@exemple.ch.';
      });
    });
  }

  /* ---------------- Espace ---------------- */
  function espace(s) {
    var d = s.droits, c = s.compte, ab = s.abonnement;
    var prenom = (c.nom || '').split(' ')[0];
    var html =
      '<section class="titre-page"><div class="wrap">' +
      '<span class="eyebrow">My Membership</span>' +
      '<h1>' + (prenom ? 'Bonjour, ' + e(prenom) + '.' : 'Bonjour.') + '</h1>' +
      '<nav class="sous-nav" aria-label="Espace membre"><a href="#adhesion">Ma carte</a><a href="#collections">Collections</a>' +
      (d.membre ? '<a href="#evenements">Private Events</a>' : '') + '<a href="#commandes">Mes commandes</a><button type="button" id="deco">Se déconnecter</button></nav>' +
      '</div></section>';

    html += '<section class="bloc" id="adhesion"><div class="wrap">' + (d.membre ? blocAdhesion(s) : blocNonMembre(s)) + '</div></section>';
    if (d.membre) html += '<section class="bloc" id="envoi"><div class="wrap">' + blocEnvoi(s) + '</div></section>';
    if (d.membre) html += '<section class="bloc"><div class="wrap"><div class="bloc-tete"><div><span class="eyebrow">I Privilegi</span><h2>Vos avantages actifs</h2></div></div>' + listeAvantages(d) + '</div></section>';
    html += '<section class="bloc" id="collections"><div class="wrap">' + blocCollections(s) + '</div></section>';
    if (d.membre) html += '<section class="bloc" id="evenements"><div class="wrap">' + blocEvenements(s) + '</div></section>';
    if (d.votes) html += '<section class="bloc"><div class="wrap"><div class="bloc-tete"><div><span class="eyebrow">Dietro le quinte</span><h2>Votes et coulisses</h2></div></div>' +
      vide('Aucun vote ouvert pour le moment.', 'Vous serez prévenu par e-mail.') + '</div></section>';
    html += '<section class="bloc" id="commandes"><div class="wrap">' + blocCommandes(s) + '</div></section>';
    app.innerHTML = html;

    document.getElementById('deco').addEventListener('click', function () { Club.deconnexion().then(rendre); });
    if (s.carte) {
      var scene = document.getElementById('scene-carte');
      var carte = C.creer(s.carte);
      scene.insertBefore(carte, scene.firstChild);
      document.getElementById('carte-retourner').addEventListener('click', function () { carte.retourner(); });
      document.getElementById('carte-plein').addEventListener('click', function () { C.pleinEcran(s.carte); });
    }
    brancherGestion(s);
    brancherEnvoi(s);
    brancherCollections();
    brancherEvenements();
    var nomBtn = document.getElementById('modifier-nom');
    if (nomBtn) nomBtn.addEventListener('click', function () { modifierNom(c.nom); });
    if (location.hash) { var cible = document.querySelector(location.hash); if (cible) cible.scrollIntoView(); }
  }

  function statutAbonnement(s) {
    var ab = s.abonnement;
    if (s.droits.categorie === 'founders') return '<span class="pastille ok">Membre fondateur' + (s.droits.signature ? ' · Signature' : '') + '</span>';
    if (!ab) return '';
    if (ab.statut === 'impaye') return '<span class="pastille alerte">Paiement à régulariser</span>';
    if (!ab.renouvellementAuto) return '<span class="pastille neutre">Actif jusqu’au ' + NC.date(ab.fin) + '</span>';
    return '<span class="pastille ok">Actif</span>';
  }

  function blocAdhesion(s) {
    var d = s.droits, c = s.compte, ab = s.abonnement, f = s.fondateur;
    var numero = d.categorie === 'founders' ? 'Founding Member ' + ('00' + f.numero).slice(-3) + ' / 050' : 'Member ' + ('000' + c.numeroMembre).slice(-4);
    var lignes =
      '<div><dt>Membre</dt><dd>' + e(c.nom || c.email) + ' <button class="lien" type="button" id="modifier-nom" style="margin-left:10px;font-size:9.5px">Modifier</button></dd></div>' +
      '<div><dt>Catégorie</dt><dd><b>' + NOMS[d.categorie] + '</b></dd></div>' +
      '<div><dt>Numéro</dt><dd>' + numero + '</dd></div>' +
      '<div><dt>Membre depuis</dt><dd>' + NC.date(d.categorie === 'founders' ? f.attribueLe : (ab.debutInitial || ab.debut)) + '</dd></div>';
    if (d.categorie === 'founders') lignes += '<div><dt>Cotisation</dt><dd>Aucune, à vie</dd></div>';
    if (ab) {
      lignes += '<div><dt>' + (d.categorie === 'founders' ? 'Signature' : (ab.renouvellementAuto ? 'Renouvellement' : 'Fin de l’adhésion')) + '</dt><dd>' +
        (d.categorie === 'founders' ? (ab.renouvellementAuto ? 'Renouvellement le ' : 'Jusqu’au ') : '') + NC.date(ab.fin) +
        (ab.renouvellementAuto ? ', ' + NC.chf(Club.CATEGORIES.signature.prix) : '') + '</dd></div>';
      if (ab.statut === 'impaye') lignes += '<div><dt>Paiement</dt><dd>Le renouvellement n’a pas pu être prélevé. Vos avantages restent actifs jusqu’au ' + NC.date(ab.fin + 7 * 864e5) + '. Mettez à jour votre moyen de paiement.</dd></div>';
    }
    lignes += '<div><dt>Statut</dt><dd>' + statutAbonnement(s) + '</dd></div>';
    var env = envoiActuel(s);
    if (env) lignes += '<div><dt>Carte imprimée</dt><dd>' + pastilleEnvoi(env) + ' <a class="lien" href="#envoi" style="margin-left:10px;font-size:9.5px">Détails</a></dd></div>';

    return '<div class="adhesion">' +
      '<div class="scene" id="scene-carte"><div class="outils"><button class="lien" type="button" id="carte-retourner">Retourner</button><button class="lien" type="button" id="carte-plein">Plein écran</button></div></div>' +
      '<div><span class="eyebrow">La mia tessera</span><h2 style="margin:12px 0 28px;font-size:clamp(28px,3vw,40px)">' + NOMS[d.categorie] + '</h2>' +
      '<dl class="fiche">' + lignes + '</dl>' +
      (ab ? blocGestion(s) : '<p style="margin-top:22px;font-size:14px"><a class="lien" href="club.html#rejoindre-signature">Ajouter Signature pour les événements privés · CHF 59/an</a></p>') +
      '</div></div>';
  }

  /* ----- Carte imprimée envoyée par la poste ----- */
  var PAYS = { CH: 'Suisse', LI: 'Liechtenstein' };

  function envoiActuel(s) {
    var l = (s.envois || []).filter(function (x) { return x.categorie === s.droits.categorie; });
    return l.length ? l[l.length - 1] : null;
  }

  function pastilleEnvoi(env) {
    if (env.statut === 'envoyee') return '<span class="pastille ok">Envoyée le ' + NC.date(env.envoyeeLe) + '</span>';
    if (env.statut === 'adresse_manquante') return '<span class="pastille alerte">Adresse à indiquer</span>';
    return '<span class="pastille neutre">En préparation</span>';
  }

  function texteEnvoi(env) {
    var colis = env.mode === 'colis';
    if (env.statut === 'envoyee') return colis
      ? 'Votre carte est partie le ' + NC.date(env.envoyeeLe) + ', glissée dans le colis de votre cardigan.'
      : 'Votre carte est partie le ' + NC.date(env.envoyeeLe) + ' par courrier B. Comptez deux à quatre jours ouvrables.';
    if (env.statut === 'adresse_manquante') return 'Indiquez l’adresse où recevoir votre carte. Elle est imprimée sur papier épais, avec votre numéro, et envoyée une seule fois : elle reste valable tant que vous êtes membre.';
    return colis
      ? 'Votre carte numérotée sera glissée dans le colis de votre cardigan NC-01.'
      : 'Votre carte est en préparation. Elle partira par la poste, sous enveloppe, à l’adresse ci-dessous.';
  }

  function blocEnvoi(s) {
    var env = envoiActuel(s), a = s.compte.adresse;
    var adresse = a ? '<address style="font-style:normal;line-height:1.7">' + e(a.nom) + '<br>' + e(a.rue) + (a.complement ? '<br>' + e(a.complement) : '') + '<br>' + e(a.npa) + ' ' + e(a.localite) + '<br>' + PAYS[a.pays] + '</address>' : '';
    var modifiable = !env || env.statut !== 'envoyee';
    return '<div class="bloc-tete"><div><span class="eyebrow">Per posta</span><h2>Votre carte imprimée</h2></div>' +
      '<p>' + texteEnvoi(env || { statut: 'adresse_manquante' }) + '</p></div>' +
      '<div class="adhesion" style="align-items:start"><div>' +
      (env ? '<dl class="fiche"><div><dt>Carte</dt><dd><b>' + NOMS[env.categorie] + '</b></dd></div><div><dt>Envoi</dt><dd>' + pastilleEnvoi(env) + '</dd></div>' +
        '<div><dt>Par</dt><dd>' + (env.mode === 'colis' ? 'Dans le colis du cardigan' : 'Courrier B, sous enveloppe') + '</dd></div></dl>' : '') +
      '</div><div id="zone-adresse">' +
      (a ? '<span class="eyebrow">Adresse de livraison</span><div style="margin-top:14px">' + adresse + '</div>' +
        (modifiable ? '<button class="btn petit" type="button" id="adresse-modifier" style="margin-top:18px">Modifier l’adresse</button>' : '<p style="margin-top:14px;font-size:13px;color:var(--tabacco)">Vous avez déménagé ? Modifiez votre adresse ici pour vos prochains envois.</p><button class="btn petit" type="button" id="adresse-modifier" style="margin-top:12px">Modifier l’adresse</button>')
        : formulaireAdresse(null)) +
      '</div></div>';
  }

  function formulaireAdresse(a) {
    a = a || {};
    function champ(id, label, val, attrs) {
      return '<div class="champ"><label for="a-' + id + '">' + label + '</label><input id="a-' + id + '" name="' + id + '" value="' + e(val || '') + '" ' + (attrs || '') + '></div>';
    }
    return '<form id="f-adresse" novalidate style="display:grid;gap:20px;max-width:460px">' +
      champ('nom', 'Nom sur l’enveloppe', a.nom, 'autocomplete="name" required maxlength="80"') +
      champ('rue', 'Rue et numéro', a.rue, 'autocomplete="address-line1" required maxlength="120"') +
      champ('complement', 'Complément (facultatif)', a.complement, 'autocomplete="address-line2" maxlength="120"') +
      '<div style="display:grid;grid-template-columns:110px 1fr;gap:18px">' +
      champ('npa', 'NPA', a.npa, 'autocomplete="postal-code" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required') +
      champ('localite', 'Localité', a.localite, 'autocomplete="address-level2" required maxlength="60"') + '</div>' +
      '<div class="champ"><label for="a-pays">Pays</label><select id="a-pays" name="pays" autocomplete="country">' +
      Object.keys(PAYS).map(function (k) { return '<option value="' + k + '"' + (a.pays === k ? ' selected' : '') + '>' + PAYS[k] + '</option>'; }).join('') + '</select></div>' +
      '<p style="font-size:13px;color:var(--tabacco)">Votre adresse ne sert qu’à l’envoi de votre carte et de vos commandes. Elle n’apparaît ni sur la carte ni dans son QR code.</p>' +
      '<div><button class="btn plein" type="submit">Enregistrer l’adresse</button></div><p class="erreur" id="adresse-erreur" role="alert"></p></form>';
  }

  function brancherEnvoi(s) {
    var zone = document.getElementById('zone-adresse');
    if (!zone) return;
    var mod = document.getElementById('adresse-modifier');
    if (mod) mod.addEventListener('click', function () { zone.innerHTML = formulaireAdresse(s.compte.adresse); brancherEnvoi(s); document.getElementById('a-nom').focus(); });
    var f = document.getElementById('f-adresse');
    if (!f) return;
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = {};
      ['nom', 'rue', 'complement', 'npa', 'localite', 'pays'].forEach(function (k) { v[k] = f.elements[k].value; });
      Club.enregistrerAdresse(v).then(function () { rendre(); setTimeout(function () { var x = document.getElementById('envoi'); if (x) x.scrollIntoView(); }, 200); },
        function (err) { document.getElementById('adresse-erreur').textContent = err.message; });
    });
  }

  function blocGestion(s) {
    var ab = s.abonnement;
    var h = '<div class="gerer" id="gerer"><h3>Mon abonnement Signature</h3><div class="rangee">';
    if (ab.renouvellementAuto) h += '<button class="btn petit" type="button" data-action="arreter">Arrêter le renouvellement</button>';
    else if (ab.statut === 'actif') h += '<button class="btn petit" type="button" data-action="reprendre">Reprendre le renouvellement</button>';
    h += '</div><div id="gerer-zone"></div><p class="erreur" id="gerer-err" role="alert"></p>' +
      '<p>Nocelli ne conserve aucune donnée bancaire.</p></div>';
    return h;
  }

  function brancherGestion(s) {
    var g = document.getElementById('gerer');
    if (!g) return;
    var zone = document.getElementById('gerer-zone'), err = document.getElementById('gerer-err');
    var ab = s.abonnement;
    function echec(x) { err.textContent = x.message; }
    g.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-action]');
      if (!b) return;
      err.textContent = '';
      var a = b.dataset.action;
      if (a === 'arreter') {
        zone.innerHTML = '<div class="confirm"><p>Aucun nouveau prélèvement. Vos avantages restent actifs jusqu’au ' + NC.date(ab.fin) + ', puis votre adhésion se termine. La période en cours n’est pas remboursée.</p><div class="rangee"><button class="btn plein petit" type="button" data-ok>Arrêter le renouvellement</button><button class="btn petit" type="button" data-non>Garder mon abonnement</button></div></div>';
        zone.querySelector('[data-ok]').addEventListener('click', function () { Club.annulerRenouvellement().then(rendre, echec); });
        zone.querySelector('[data-non]').addEventListener('click', function () { zone.innerHTML = ''; });
      } else if (a === 'reprendre') {
        Club.reprendreRenouvellement().then(rendre, echec);
      }
    });
  }

  function blocNonMembre(s) {
    var der = s.dernierAbonnement;
    var etat = '';
    if (der && der.statut === 'expire') etat = '<p style="margin-top:14px"><span class="pastille neutre">Adhésion ' + NOMS[der.plan] + ' terminée le ' + NC.date(der.fin) + '</span></p>';
    if (der && der.statut === 'echoue') etat = '<p style="margin-top:14px"><span class="pastille refus">Dernier paiement refusé, rien n’a été activé</span></p>';
    if (s.compte.suspendu) etat = '<p style="margin-top:14px"><span class="pastille refus">Accès suspendu, contactez-nous</span></p>';
    return '<div class="verrou"><div><span class="eyebrow">Private Club</span><h3>Vous n’êtes pas encore membre.</h3>' +
      '<p>Signature : les collections 48 h avant le public et les événements privés, CHF 59 par an. Founders : offerte aux 50 premiers acheteurs du cardigan NC-01.</p>' + etat + '</div>' +
      '<div style="display:grid;gap:10px"><a class="btn clair" href="club.html#rejoindre-signature">Rejoindre Signature · CHF 59</a></div></div>';
  }

  function listeAvantages(d) {
    return '<ul class="avantages">' + AVANTAGES.filter(function (a) { return !a[2] || a[1](d); }).map(function (a) {
      var actif = a[1](d);
      return '<li class="' + (actif ? '' : 'ferme') + '"><span>' + a[0] + (actif ? '' : '<small>Avec Signature Club</small>') + '</span></li>';
    }).join('') + '</ul>';
  }

  function vide(titre, texte) {
    return '<div class="vide"><span class="losange" aria-hidden="true"></span><h3>' + titre + '</h3><p>' + texte + '</p></div>';
  }

  /* ---------------- Collections ---------------- */
  function blocCollections(s) {
    var tete = '<div class="bloc-tete"><div><span class="eyebrow">In anteprima</span><h2>Collections en avant-première</h2></div>' +
      '<p>' + (s.droits.accesAnticipe ? 'Achat possible 48 h avant le public. Quantités limitées.' : 'Les membres achètent 48 h avant le public.') + '</p></div>';
    if (!s.lancements.length) return tete + vide('Aucune collection annoncée pour le moment.', 'Vous serez prévenu par e-mail.');
    return tete + '<div class="liste-items">' + s.lancements.map(function (l) {
      var phase = { annonce: '<span class="pastille neutre">Annoncée</span>', membres: '<span class="pastille ok">Ouverte aux membres</span>', public: '<span class="pastille ok">Ouverte à tous</span>' }[l.phase];
      var prochain = l.phase === 'annonce' ? l.ouvertureMembres : l.phase === 'membres' ? l.publicLe : null;
      var tailles = l.tailles.map(function (t) {
        var dispo = t.ok;
        return '<button class="btn petit' + (dispo ? ' plein' : '') + '" type="button" data-acheter="' + l.id + '" data-taille="' + e(t.taille) + '"' + (dispo ? '' : ' disabled title="' + e(t.message) + '"') + '>' + e(t.taille) + '</button>';
      }).join('');
      var raison = l.tailles.length && !l.tailles.some(function (t) { return t.ok; }) ? l.tailles[0].message : '';
      if (l.restant === 0) raison = 'Toutes les pièces ont trouvé preneur.';
      return '<article class="item"><div><h3>' + e(l.nom) + '</h3>' +
        '<div class="meta"><span>Membres : ' + NC.date(l.ouvertureMembres, true) + '</span><span>Public : ' + NC.date(l.publicLe, true) + '</span>' + (l.prix ? '<span>' + NC.chf(l.prix) + '</span>' : '') + '</div>' +
        (l.description ? '<p class="texte">' + e(l.description) + '</p>' : '') + '</div>' +
        '<div class="droite">' + phase + (prochain ? '<span class="compte-a" data-vers="' + prochain + '">' + NC.duree(prochain - s.maintenant) + '</span><small style="color:var(--tabacco)">' + (l.phase === 'annonce' ? 'avant l’ouverture membres' : 'avant l’ouverture publique') + '</small>' : '') +
        '<div class="tailles-achat" aria-label="Choisir une taille">' + tailles + '</div>' +
        (raison ? '<small style="color:var(--tabacco);max-width:30ch">' + e(raison) + '</small>' : '') +
        '</div></article>';
    }).join('') + '</div>';
  }

  function brancherCollections() {
    document.querySelectorAll('[data-acheter]').forEach(function (b) {
      b.addEventListener('click', function () {
        b.disabled = true;
        Club.reserverPiece(b.dataset.acheter, b.dataset.taille).then(function (cmd) {
          // Vrai serveur : la pièce est réservée et la page de paiement sécurisée s'ouvre.
          if (cmd && cmd.redirection) return NC.fenetre('<span class="eyebrow">Commande · taille ' + e(b.dataset.taille) + '</span><h3>Votre pièce est réservée 30 minutes.</h3><p class="conditions">Ouverture du paiement sécurisé…</p>');
          var w = NC.fenetre('<span class="eyebrow">Commande · taille ' + e(cmd.taille) + '</span><h3>Votre pièce est réservée 30 minutes.</h3>' +
            '<div class="paiement-test"><span class="mode-test">Mode test</span><p>Le paiement réel n’est pas encore branché. Aucun argent n’est débité. Choisissez la réponse de la banque :</p>' +
            '<div class="boutons"><button class="btn plein petit" type="button" data-ok>Paiement accepté</button><button class="btn petit" type="button" data-ko>Paiement refusé</button></div></div><p class="erreur" role="alert"></p>', { apres: rendre });
          w.corps.querySelector('[data-ok]').addEventListener('click', function () {
            Club.paiementTestCommande(cmd.id, true).then(function (r) {
              var f = r.fondateur;
              w.remplacer('<span class="eyebrow">Grazie</span><h3>Commande confirmée.</h3>' +
                (f && f.attribue ? '<p class="conditions">Vous êtes le membre fondateur N° ' + ('00' + f.place.numero).slice(-3) + ' / 050.</p>' : '<p class="conditions">Vous recevrez la confirmation par e-mail.</p>') +
                '<div style="display:grid;margin-top:18px"><button class="btn plein" type="button" data-fermer>Fermer</button></div>');
              w.corps.querySelector('[data-fermer]').addEventListener('click', w.fermer);
            });
          });
          w.corps.querySelector('[data-ko]').addEventListener('click', function () {
            Club.paiementTestCommande(cmd.id, false).then(function () {
              w.corps.querySelector('.erreur').textContent = 'Paiement refusé. La pièce est remise en vente, rien n’a été débité.';
            });
          });
        }, function (err) {
          b.disabled = false;
          NC.fenetre('<span class="eyebrow">Achat impossible</span><h3>' + e(err.message) + '</h3>');
        });
      });
    });
  }

  /* ---------------- Événements ---------------- */
  function blocEvenements(s) {
    var tete = '<div class="bloc-tete"><div><span class="eyebrow">Private Events</span><h2>Événements privés</h2></div>' +
      '<p>Chaque événement indique s’il est payant. Complet : liste d’attente.</p></div>';
    if (!s.droits.evenements) {
      return tete + '<div class="verrou"><div><span class="eyebrow">Signature</span><h3>Les événements privés sont réservés à Signature.</h3>' +
        '<p>Ajoutez Signature à votre carte Founders pour CHF 59 par an. Vous gardez votre numéro.</p></div>' +
        '<div><a class="btn clair" href="club.html#rejoindre-signature">Ajouter Signature</a></div></div>';
    }
    if (!s.evenements.length) return tete + vide('Aucun événement annoncé pour le moment.', 'Les invitations arriveront ici et par e-mail.');
    return tete + '<div class="liste-items">' + s.evenements.map(function (v) {
      var etat, bouton;
      if (v.monInscription === 'confirme') { etat = '<span class="pastille ok">Inscrit</span>'; bouton = '<button class="lien" type="button" data-desinscrire="' + v.id + '">Annuler ma venue</button>'; }
      else if (v.monInscription === 'attente') { etat = '<span class="pastille alerte">Liste d’attente · rang ' + v.rangAttente + '</span>'; bouton = '<button class="lien" type="button" data-desinscrire="' + v.id + '">Quitter la liste</button>'; }
      else if (v.restantes > 0) { etat = '<span class="pastille neutre">' + v.restantes + ' place' + (v.restantes > 1 ? 's' : '') + ' sur ' + v.capacite + '</span>'; bouton = '<button class="btn plein petit" type="button" data-inscrire="' + v.id + '">Réserver ma place</button>'; }
      else { etat = '<span class="pastille refus">Complet</span>'; bouton = '<button class="btn petit" type="button" data-inscrire="' + v.id + '">Rejoindre la liste d’attente</button>'; }
      return '<article class="item"><div><h3>' + e(v.titre) + '</h3>' +
        '<div class="meta"><span>' + NC.date(v.date, true) + '</span><span>' + e(v.lieu) + '</span><span>' + (v.prix > 0 ? 'Participation ' + NC.chf(v.prix) : 'Entrée incluse') + '</span></div>' +
        (v.description ? '<p class="texte">' + e(v.description) + '</p>' : '') +
        (v.conditions ? '<p class="texte" style="font-size:14px;color:var(--tabacco)">Conditions : ' + e(v.conditions) + '</p>' : '') + '</div>' +
        '<div class="droite">' + etat + bouton + '</div></article>';
    }).join('') + '</div>';
  }

  function brancherEvenements() {
    document.querySelectorAll('[data-inscrire]').forEach(function (b) {
      b.addEventListener('click', function () {
        Club.inscrire(b.dataset.inscrire).then(rendre, function (err) { NC.fenetre('<h3>' + e(err.message) + '</h3>'); });
      });
    });
    document.querySelectorAll('[data-desinscrire]').forEach(function (b) {
      b.addEventListener('click', function () { Club.annulerInscription(b.dataset.desinscrire).then(rendre); });
    });
  }

  /* ---------------- Commandes ---------------- */
  function blocCommandes(s) {
    var tete = '<div class="bloc-tete"><div><span class="eyebrow">I miei ordini</span><h2>Mes commandes</h2></div></div>';
    var cmds = s.commandes.filter(function (c) { return c.statut !== 'expiree'; }).sort(function (a, b) { return b.creeLe - a.creeLe; });
    if (!cmds.length) return tete + vide('Aucune commande.', 'Vos commandes apparaîtront ici. Les 50 premières commandes payées du Cardigan Noce NC-01 ouvrent le Founders Club.');
    var STATUTS = { en_attente: 'Paiement en attente', payee: 'Payée', annulee: 'Annulée', remboursee: 'Remboursée' };
    return tete + '<div class="defile-x"><table class="cmd"><thead><tr><th>Date</th><th>Pièce</th><th>Taille</th><th>Statut</th></tr></thead><tbody>' +
      cmds.map(function (c) { return '<tr><td>' + NC.date(c.creeLe) + '</td><td>' + e(c.produit) + '</td><td>' + e(c.taille || '') + '</td><td>' + (STATUTS[c.statut] || c.statut) + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
  }

  function modifierNom(nom) {
    var w = NC.fenetre('<span class="eyebrow">Mon profil</span><h3>Nom sur la carte</h3><form novalidate style="display:grid;gap:22px;margin-top:22px"><div class="champ"><label for="n-nom">Prénom et nom</label><input id="n-nom" autocomplete="name" value="' + e(nom) + '"></div><button class="btn plein" type="submit">Enregistrer</button></form>');
    w.corps.querySelector('form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      Club.modifierNom(w.corps.querySelector('#n-nom').value.trim()).then(function () { w.fermer(); rendre(); });
    });
  }

  // Comptes à rebours des lancements
  setInterval(function () {
    var now = Club.maintenant();
    document.querySelectorAll('[data-vers]').forEach(function (el) {
      var r = +el.dataset.vers - now;
      if (r <= 0) { rendre(); return; }
      el.textContent = NC.duree(r);
    });
  }, 30000);

  // Retour de la page de paiement : Stripe confirme au serveur en quelques secondes.
  function retourPaiement() {
    var ok = params.get('paiement') === 'ok' || params.get('commande') === 'ok';
    var annule = params.get('commande') === 'annulee';
    if (!ok && !annule) return;
    history.replaceState(null, '', location.pathname + location.hash);
    if (annule) { NC.fenetre('<span class="eyebrow">Paiement annulé</span><h3>Rien n’a été débité.</h3><p class="conditions">La pièce reste réservée 30 minutes, puis elle est remise en vente.</p>'); return; }
    NC.fenetre('<span class="eyebrow">Grazie</span><h3>Paiement reçu.</h3><p class="conditions">' +
      (params.get('paiement') === 'ok' ? 'Votre adhésion Signature s’active dans un instant.' : 'Votre commande est confirmée. Elle apparaît dans « Mes commandes ».') + '</p>');
    setTimeout(rendre, 4000);
    setTimeout(rendre, 12000);
  }

  (Club.pret || Promise.resolve()).then(function () { rendre(); retourPaiement(); });
})();
