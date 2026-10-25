// Administration du club : membres, fondateurs, lancements, événements, journal, outils de test.
(function () {
  'use strict';
  var Club = window.Club, A = window.ClubAdmin, NC = window.NC, e = NC.echapper;
  var app = document.getElementById('app');
  var NOMS = { founders: 'Founders', early: 'Early Access', signature: 'Signature' };
  var RUBRIQUES = [
    ['apercu', 'Vue d’ensemble'], ['membres', 'Membres'], ['fondateurs', 'Les 50 fondateurs'],
    ['lancements', 'Lancements'], ['evenements', 'Événements'], ['carte', 'Vérifier une carte'],
    ['journal', 'Journal'], ['test', 'Outils de test']
  ];
  var actuelle = (location.hash.slice(1) || 'apercu');
  if (!RUBRIQUES.some(function (r) { return r[0] === actuelle; })) actuelle = 'apercu';
  var filtre = { cat: 'tous', q: '' };

  function estAdmin() { var s = Club.session(); return s && s.role === 'admin'; }

  function demarrer() {
    var sortir = document.getElementById('sortir');
    sortir.hidden = !estAdmin();
    sortir.onclick = function (ev) { ev.preventDefault(); Club.deconnexion().then(demarrer); };
    if (!estAdmin()) return entree();
    app.innerHTML = '<div class="admin"><nav class="rubriques" role="tablist" aria-label="Rubriques"><span class="eyebrow">Private Club</span>' +
      RUBRIQUES.map(function (r) { return '<button type="button" role="tab" data-r="' + r[0] + '" aria-selected="' + (r[0] === actuelle) + '">' + r[1] + '</button>'; }).join('') +
      '<p class="sep"><span class="mode-test">Mode test</span></p></nav><section class="panneau" id="panneau" role="tabpanel"></section></div>';
    app.querySelector('.rubriques').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-r]');
      if (!b) return;
      actuelle = b.dataset.r;
      history.replaceState(null, '', '#' + actuelle);
      app.querySelectorAll('[data-r]').forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
      afficher();
    });
    afficher();
  }

  function entree() {
    app.innerHTML = '<div class="entree"><span class="eyebrow">Accès réservé</span><h1>Administration du Private Club</h1>' +
      '<p>En production, seule une personne connectée avec un compte au rôle « administrateur » ouvre cette page, et chaque action est vérifiée par le serveur puis inscrite au journal.</p>' +
      '<div class="encadre"><span class="mode-test" style="justify-self:start">Mode test</span><p style="margin:0">Le serveur n’est pas encore branché. Vous pouvez essayer l’administration avec des données qui restent dans ce navigateur. Aucun membre réel n’est affiché, aucun paiement n’est possible.</p></div>' +
      '<div style="margin-top:26px"><button class="btn plein" type="button" id="entrer">Entrer en mode test</button></div></div>';
    document.getElementById('entrer').addEventListener('click', function () { A.entrer().then(demarrer); });
  }

  function panneau(h) { document.getElementById('panneau').innerHTML = h; }
  function erreurDans(id) { return function (err) { var el = document.getElementById(id); if (el) el.textContent = err.message; }; }

  function afficher() {
    ({ apercu: apercu, membres: membres, fondateurs: fondateurs, lancements: lancements, evenements: evenements, carte: carte, journal: journal, test: outils })[actuelle]();
  }

  /* ---------- Vue d'ensemble ---------- */
  function apercu() {
    Promise.all([A.tableau(), A.notifications()]).then(function (r) {
      var s = r[0].stats, notes = r[1];
      var pris = 50 - s.fondateursRestants;
      panneau('<span class="eyebrow">Tableau de bord</span><h1>Vue d’ensemble</h1>' +
        '<p class="chapo">État du club au ' + NC.date(r[0].maintenant, true) + (r[0].decalage ? ' (horloge de test avancée)' : '') + '.</p>' +
        '<div class="chiffres">' +
        '<div><span>Fondateurs</span><b>' + s.founders + '<small style="font-size:16px"> / 50</small></b><div class="jauge"><i style="width:' + (pris * 2) + '%"></i></div><small>' + s.fondateursRestants + ' numéros encore libres</small></div>' +
        '<div><span>Early Access</span><b>' + s.early + '</b><small>abonnements actifs</small></div>' +
        '<div><span>Signature</span><b>' + s.signature + '</b><small>abonnements actifs</small></div>' +
        '<div><span>Expirés</span><b>' + s.expires + '</b><small>' + s.impayes + ' en retard de paiement</small></div>' +
        '<div><span>Revenu annuel</span><b>' + NC.chf(s.revenuAnnuel).replace('CHF ', '') + '</b><small>CHF, abonnements qui se renouvellent</small></div>' +
        '<div><span>Encaissé</span><b>' + NC.chf(s.encaisse).replace('CHF ', '') + '</b><small>CHF, adhésions et changements</small></div>' +
        '</div>' +
        '<div class="section"><h2>Notifications envoyées aux membres</h2><p>À chaque lancement publié, les membres avec accès anticipé sont prévenus. En mode test, rien ne part : la liste montre ce qui serait envoyé.</p>' +
        (notes.length ? '<div class="defile-x"><table class="reg"><thead><tr><th>Date</th><th>Sujet</th><th>Destinataires</th><th>Ouverture membres</th></tr></thead><tbody>' +
          notes.map(function (n) { return '<tr><td class="n">' + NC.date(n.le, true) + '</td><td>' + e(n.sujet) + '</td><td class="n">' + n.destinataires + '</td><td class="n">' + NC.date(n.ouvertureMembres, true) + '</td></tr>'; }).join('') + '</tbody></table></div>'
          : '<p style="margin-top:14px"><span class="pastille neutre">Aucune notification pour l’instant</span></p>') + '</div>');
    });
  }

  /* ---------- Membres ---------- */
  function statutAb(m) {
    if (m.suspendu) return '<span class="pastille refus">Suspendu</span>';
    if (m.categorie === 'founders') return '<span class="pastille ok">À vie</span>';
    var a = m.abonnement;
    if (!a) return '<span class="pastille neutre">Sans adhésion</span>';
    var t = { actif: ['ok', a.renouvellementAuto ? 'Actif' : 'Actif, sans renouvellement'], impaye: ['alerte', 'Impayé'], expire: ['neutre', 'Expiré'], en_attente: ['alerte', 'Paiement en attente'], echoue: ['refus', 'Paiement refusé'], abandonne: ['neutre', 'Paiement abandonné'], a_rembourser: ['refus', 'À rembourser'] }[a.statut] || ['neutre', a.statut];
    return '<span class="pastille ' + t[0] + '">' + t[1] + '</span>';
  }

  function membres() {
    A.membres().then(function (liste) {
      var q = filtre.q.toLowerCase();
      var vus = liste.filter(function (m) {
        if (q && (m.email + ' ' + m.nom).toLowerCase().indexOf(q) < 0) return false;
        switch (filtre.cat) {
          case 'founders': case 'early': case 'signature': return m.categorie === filtre.cat;
          case 'aucun': return !m.categorie && !m.suspendu;
          case 'expires': return !m.categorie && m.abonnement && m.abonnement.statut === 'expire';
          case 'suspendus': return m.suspendu;
        }
        return true;
      });
      panneau('<span class="eyebrow">Registre</span><h1>Membres</h1><p class="chapo">' + liste.length + ' comptes clients. La catégorie vient du serveur : elle change seulement par un paiement confirmé, un achat NC-01 ou une décision tracée de l’administration.</p>' +
        '<div class="outils-ligne"><div class="champ"><label for="f-cat">Catégorie</label><select id="f-cat">' +
        [['tous', 'Tous les comptes'], ['founders', 'Founders'], ['early', 'Early Access'], ['signature', 'Signature'], ['expires', 'Abonnements expirés'], ['aucun', 'Sans adhésion'], ['suspendus', 'Suspendus']].map(function (o) { return '<option value="' + o[0] + '"' + (filtre.cat === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
        '</select></div><div class="champ"><label for="f-q">Rechercher</label><input id="f-q" placeholder="Nom ou e-mail" value="' + e(filtre.q) + '"></div></div>' +
        '<p class="erreur" id="m-err" role="alert"></p>' +
        (vus.length ? '<div class="defile-x"><table class="reg"><thead><tr><th>Membre</th><th>Catégorie</th><th>N°</th><th>Statut</th><th>Échéance</th><th>Accès</th></tr></thead><tbody>' +
          vus.map(function (m) {
            var num = m.numero ? (m.categorie === 'founders' ? ('00' + m.numero).slice(-3) + ' / 050' : ('000' + m.numero).slice(-4)) : '';
            return '<tr><td>' + e(m.nom || '–') + '<br><small>' + e(m.email) + '</small></td>' +
              '<td class="cat">' + (m.categorie ? NOMS[m.categorie] : '<small>Aucune</small>') + '</td><td class="n">' + num + '</td>' +
              '<td>' + statutAb(m) + '</td><td class="n">' + (m.abonnement && m.abonnement.fin && m.categorie !== 'founders' ? NC.date(m.abonnement.fin) : '') + '</td>' +
              '<td><button class="btn petit" type="button" data-suspendre="' + m.id + '" data-etat="' + (m.suspendu ? '0' : '1') + '">' + (m.suspendu ? 'Rétablir' : 'Suspendre') + '</button></td></tr>';
          }).join('') + '</tbody></table></div>' : '<p style="margin-top:22px"><span class="pastille neutre">Aucun compte dans cette sélection</span></p>'));
      document.getElementById('f-cat').addEventListener('change', function (ev) { filtre.cat = ev.target.value; membres(); });
      var q2 = document.getElementById('f-q');
      q2.addEventListener('change', function () { filtre.q = q2.value.trim(); membres(); });
      document.querySelectorAll('[data-suspendre]').forEach(function (b) {
        b.addEventListener('click', function () {
          var suspendre = b.dataset.etat === '1';
          var w = NC.fenetre('<span class="eyebrow">Action tracée</span><h3>' + (suspendre ? 'Suspendre l’accès' : 'Rétablir l’accès') + '</h3>' +
            '<p class="conditions">' + (suspendre ? 'Le membre perd tous ses droits (avant-premières, événements) jusqu’à rétablissement. Son abonnement et son numéro sont conservés.' : 'Le membre retrouve les droits de sa catégorie.') + '</p>' +
            '<form novalidate style="display:grid;gap:18px;margin-top:18px"><div class="champ"><label for="motif">Motif (inscrit au journal)</label><input id="motif"></div><p class="erreur" id="s-err" role="alert"></p><button class="btn plein" type="submit">Confirmer</button></form>');
          w.corps.querySelector('form').addEventListener('submit', function (ev) {
            ev.preventDefault();
            A.suspendre(b.dataset.suspendre, suspendre, w.corps.querySelector('#motif').value.trim()).then(function () { w.fermer(); membres(); }, erreurDans('s-err'));
          });
        });
      });
    });
  }

  /* ---------- Fondateurs ---------- */
  function fondateurs() {
    A.fondateurs().then(function (r) {
      var attribues = r.places.filter(function (p) { return p.statut !== 'libre'; });
      panneau('<span class="eyebrow">Founders Club</span><h1>Les 50 fondateurs</h1>' +
        '<p class="chapo">Les numéros sont donnés automatiquement, dans l’ordre des paiements confirmés du cardigan NC-01, une seule fois chacun. Une commande remboursée en totalité retire son numéro : il n’est jamais redonné automatiquement. Vous pouvez le redonner à la main à un acheteur payé sans place, avec un motif inscrit au journal.</p>' +
        '<div class="places50">' + r.places.map(function (p) { return '<span class="' + p.statut + '" title="' + (p.email ? e(p.email) : 'Libre') + '">' + ('00' + p.numero).slice(-3) + '</span>'; }).join('') + '</div>' +
        '<div class="legende"><span><i style="background:var(--f-choc)"></i>Attribué</span><span><i style="background:rgba(138,59,34,.2)"></i>Retiré après remboursement</span><span><i></i>Libre</span></div>' +
        '<p class="erreur" id="f-err" role="alert"></p>' +
        (attribues.length ? '<div class="defile-x"><table class="reg"><thead><tr><th>N°</th><th>Membre</th><th>Statut</th><th>Depuis</th><th></th></tr></thead><tbody>' +
          attribues.map(function (p) {
            return '<tr><td class="n cat">' + ('00' + p.numero).slice(-3) + '</td><td>' + e(p.nom || '–') + '<br><small>' + e(p.email) + '</small></td>' +
              '<td>' + (p.statut === 'confirme' ? '<span class="pastille ok">Confirmé</span>' : '<span class="pastille refus">Retiré</span><br><small>' + e(p.motif || '') + ', ' + NC.date(p.retireLe) + '</small>') + '</td>' +
              '<td class="n">' + NC.date(p.attribueLe) + '</td>' +
              '<td>' + (p.statut === 'retire' ? (r.candidats.length ? '<button class="btn petit" type="button" data-redonner="' + p.numero + '">Redonner</button>' : '<small>Aucun acheteur payé sans place</small>') : '') + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<p style="margin-top:22px"><span class="pastille neutre">Aucun fondateur pour l’instant : la vente NC-01 ouvre le 25 novembre à 19h</span></p>'));
      document.querySelectorAll('[data-redonner]').forEach(function (b) {
        b.addEventListener('click', function () {
          var n = +b.dataset.redonner;
          var w = NC.fenetre('<span class="eyebrow">Action tracée</span><h3>Redonner le N° ' + ('00' + n).slice(-3) + '</h3>' +
            '<p class="conditions">Seuls les clients avec une commande NC-01 payée et sans place sont proposés, du plus ancien paiement au plus récent.</p>' +
            '<form novalidate style="display:grid;gap:18px;margin-top:18px"><div class="champ"><label for="cand">Client</label><select id="cand">' +
            r.candidats.map(function (c) { return '<option value="' + c.id + '">' + e(c.nom || c.email) + ' · payé le ' + NC.date(c.payeeLe) + '</option>'; }).join('') +
            '</select></div><div class="champ"><label for="motif2">Motif</label><input id="motif2"></div><p class="erreur" id="r-err" role="alert"></p><button class="btn plein" type="submit">Attribuer le numéro</button></form>');
          w.corps.querySelector('form').addEventListener('submit', function (ev) {
            ev.preventDefault();
            A.reattribuer(n, w.corps.querySelector('#cand').value, w.corps.querySelector('#motif2').value.trim()).then(function () { w.fermer(); fondateurs(); }, erreurDans('r-err'));
          });
        });
      });
    });
  }

  /* ---------- Lancements ---------- */
  function versChamp(ms) {
    var d = new Date(ms), p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function formLancement(l) {
    l = l || { heuresAnticipees: 48, stock: { S: 0, M: 0, L: 0 }, publie: false };
    return '<form class="formulaire" id="f-lan" novalidate>' +
      '<div class="champ"><label for="l-nom">Nom de la collection</label><input id="l-nom" value="' + e(l.nom || '') + '" placeholder="Seconda Edizione"></div>' +
      '<div class="champ"><label for="l-prod">Code produit</label><input id="l-prod" value="' + e(l.produit || '') + '" placeholder="NC-02"></div>' +
      '<div class="champ plein"><label for="l-desc">Description</label><textarea id="l-desc">' + e(l.description || '') + '</textarea></div>' +
      '<div class="champ"><label for="l-date">Lancement public (heure suisse)</label><input id="l-date" type="datetime-local" value="' + (l.publicLe ? versChamp(l.publicLe) : '') + '"></div>' +
      '<div class="champ"><label for="l-h">Accès anticipé des membres (heures)</label><input id="l-h" type="number" min="0" max="336" value="' + l.heuresAnticipees + '"></div>' +
      '<div class="champ"><label for="l-prix">Prix (CHF)</label><input id="l-prix" type="number" min="0" step="1" value="' + (l.prix || '') + '"></div>' +
      '<div class="champ"><label>Stock par taille</label><div class="stock">' + ['S', 'M', 'L'].map(function (t) { return '<input aria-label="Stock ' + t + '" id="l-s-' + t + '" type="number" min="0" value="' + ((l.stock && l.stock[t]) || 0) + '" placeholder="' + t + '">'; }).join('') + '</div></div>' +
      '<label class="case plein"><input type="checkbox" id="l-pub"' + (l.publie ? ' checked' : '') + '> <span>Publier : annonce visible et notification aux membres</span></label>' +
      '<p class="erreur plein" id="l-err" role="alert"></p>' +
      '<div class="boutons"><button class="btn plein" type="submit">' + (l.id ? 'Enregistrer' : 'Programmer le lancement') + '</button>' + (l.id ? '<button class="btn" type="button" id="l-annuler">Nouveau lancement</button>' : '') + '</div></form>';
  }
  function lancements(edition) {
    A.lancements().then(function (liste) {
      var enCours = edition && liste.filter(function (l) { return l.id === edition; })[0];
      panneau('<span class="eyebrow">Avant-premières</span><h1>Lancements</h1>' +
        '<p class="chapo">Programmez la date publique et la durée d’accès anticipé. Avant l’ouverture membres, la collection est seulement annoncée. Pendant l’accès anticipé, le serveur refuse toute vente à un non-membre. Le stock est décompté à chaque réservation et rendu si le paiement n’arrive pas en 30 minutes.</p>' +
        '<div class="section"><h2>' + (enCours ? 'Modifier « ' + e(enCours.nom) + ' »' : 'Nouveau lancement') + '</h2>' + formLancement(enCours) + '</div>' +
        '<div class="section"><h2>Programmés</h2>' + (liste.length ? '<div class="defile-x"><table class="reg"><thead><tr><th>Collection</th><th>Statut</th><th>Ouverture membres</th><th>Public</th><th>Stock</th><th></th></tr></thead><tbody>' +
          liste.map(function (l) {
            var ph = !l.publie ? '<span class="pastille neutre">Brouillon</span>' : { annonce: '<span class="pastille neutre">Annoncé</span>', membres: '<span class="pastille ok">Membres</span>', public: '<span class="pastille ok">Public</span>' }[l.phase];
            return '<tr><td class="cat">' + e(l.nom) + '<br><small>' + e(l.produit) + '</small></td><td>' + ph + '</td><td class="n">' + NC.date(l.ouvertureMembres, true) + '<br><small>' + l.heuresAnticipees + ' h avant</small></td><td class="n">' + NC.date(l.publicLe, true) + '</td>' +
              '<td class="n">' + Object.keys(l.stock).map(function (t) { return t + ' ' + l.stock[t]; }).join(' · ') + '</td><td><button class="btn petit" type="button" data-editer="' + l.id + '">Modifier</button></td></tr>';
          }).join('') + '</tbody></table></div>' : '<p style="margin-top:14px"><span class="pastille neutre">Aucun lancement programmé</span></p>') + '</div>');
      document.querySelectorAll('[data-editer]').forEach(function (b) { b.addEventListener('click', function () { lancements(b.dataset.editer); window.scrollTo(0, 0); }); });
      var ann = document.getElementById('l-annuler');
      if (ann) ann.addEventListener('click', function () { lancements(); });
      document.getElementById('f-lan').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var v = function (id) { return document.getElementById(id).value; };
        var stock = {};
        ['S', 'M', 'L'].forEach(function (t) { stock[t] = Math.max(0, parseInt(v('l-s-' + t), 10) || 0); });
        A.enregistrerLancement({
          id: enCours && enCours.id, nom: v('l-nom').trim(), produit: v('l-prod').trim(), description: v('l-desc').trim(),
          prix: v('l-prix'), publicLe: new Date(v('l-date')).getTime(), heuresAnticipees: v('l-h'), stock: stock,
          publie: document.getElementById('l-pub').checked
        }).then(function () { lancements(); }, erreurDans('l-err'));
      });
    });
  }

  /* ---------- Événements ---------- */
  function formEvenement(x) {
    x = x || { capacite: 20, prix: 0, publie: false };
    return '<form class="formulaire" id="f-evt" novalidate>' +
      '<div class="champ plein"><label for="e-titre">Nom de l’événement</label><input id="e-titre" value="' + e(x.titre || '') + '"></div>' +
      '<div class="champ plein"><label for="e-desc">Description</label><textarea id="e-desc">' + e(x.description || '') + '</textarea></div>' +
      '<div class="champ"><label for="e-date">Date et heure (heure suisse)</label><input id="e-date" type="datetime-local" value="' + (x.date ? versChamp(x.date) : '') + '"></div>' +
      '<div class="champ"><label for="e-lieu">Lieu</label><input id="e-lieu" value="' + e(x.lieu || '') + '"></div>' +
      '<div class="champ"><label for="e-cap">Capacité (places)</label><input id="e-cap" type="number" min="1" value="' + x.capacite + '"></div>' +
      '<div class="champ"><label for="e-prix">Participation (CHF, 0 = incluse)</label><input id="e-prix" type="number" min="0" step="1" value="' + (x.prix || 0) + '"></div>' +
      '<div class="champ plein"><label for="e-cond">Conditions d’accès</label><input id="e-cond" value="' + e(x.conditions || '') + '" placeholder="Une personne par carte, tenue de ville"></div>' +
      '<label class="case"><input type="checkbox" id="e-pub"' + (x.publie ? ' checked' : '') + '> <span>Publier pour Signature et Founders</span></label>' +
      (x.id ? '<label class="case"><input type="checkbox" id="e-ann"' + (x.annule ? ' checked' : '') + '> <span>Événement annulé</span></label>' : '') +
      '<p class="erreur plein" id="e-err" role="alert"></p>' +
      '<div class="boutons"><button class="btn plein" type="submit">' + (x.id ? 'Enregistrer' : 'Créer l’événement') + '</button>' + (x.id ? '<button class="btn" type="button" id="e-nouveau">Nouvel événement</button>' : '') + '</div></form>';
  }
  function evenements(edition) {
    A.evenements().then(function (liste) {
      var enCours = edition && liste.filter(function (x) { return x.id === edition; })[0];
      panneau('<span class="eyebrow">Private Events</span><h1>Événements</h1>' +
        '<p class="chapo">Seuls les membres Signature et Founders voient et réservent les événements publiés. Complet : liste d’attente, qui avance automatiquement quand une place se libère ou que vous augmentez la capacité.</p>' +
        '<div class="section"><h2>' + (enCours ? 'Modifier « ' + e(enCours.titre) + ' »' : 'Nouvel événement') + '</h2>' + formEvenement(enCours) + '</div>' +
        '<div class="section"><h2>Événements et inscriptions</h2>' + (liste.length ? liste.map(function (x) {
          var conf = x.inscrits.filter(function (i) { return i.statut === 'confirme'; }).length;
          var att = x.inscrits.filter(function (i) { return i.statut === 'attente'; }).length;
          return '<div style="margin-top:26px;border-top:1px solid var(--filo);padding-top:18px"><div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px 24px;align-items:baseline">' +
            '<h3 style="font-size:22px">' + e(x.titre) + '</h3><span>' + (x.annule ? '<span class="pastille refus">Annulé</span>' : x.publie ? '<span class="pastille ok">Publié</span>' : '<span class="pastille neutre">Brouillon</span>') + ' <button class="btn petit" type="button" data-editer-e="' + x.id + '">Modifier</button></span></div>' +
            '<p style="font-size:14px;color:var(--tabacco);margin-top:6px">' + NC.date(x.date, true) + ' · ' + e(x.lieu) + ' · ' + conf + ' / ' + x.capacite + ' confirmés · ' + att + ' en attente · ' + (x.prix ? NC.chf(x.prix) : 'entrée incluse') + '</p>' +
            (x.inscrits.length ? '<div class="defile-x"><table class="reg"><thead><tr><th>Ordre</th><th>Membre</th><th>Carte</th><th>Statut</th><th>Demande</th></tr></thead><tbody>' +
              x.inscrits.map(function (i, k) { return '<tr><td class="n">' + (k + 1) + '</td><td>' + e(i.nom || '–') + '<br><small>' + e(i.email) + '</small></td><td>' + NOMS[i.categorie] + '</td><td>' + { confirme: '<span class="pastille ok">Confirmé</span>', attente: '<span class="pastille alerte">Liste d’attente</span>', annule: '<span class="pastille neutre">Annulé</span>' }[i.statut] + '</td><td class="n">' + NC.date(i.creeLe, true) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p style="margin-top:10px"><small>Aucune inscription</small></p>') + '</div>';
        }).join('') : '<p style="margin-top:14px"><span class="pastille neutre">Aucun événement</span></p>') + '</div>');
      document.querySelectorAll('[data-editer-e]').forEach(function (b) { b.addEventListener('click', function () { evenements(b.dataset.editerE); window.scrollTo(0, 0); }); });
      var nv = document.getElementById('e-nouveau');
      if (nv) nv.addEventListener('click', function () { evenements(); });
      document.getElementById('f-evt').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var v = function (id) { return document.getElementById(id).value; };
        var ann = document.getElementById('e-ann');
        A.enregistrerEvenement({
          id: enCours && enCours.id, titre: v('e-titre').trim(), description: v('e-desc').trim(), date: new Date(v('e-date')).getTime(),
          lieu: v('e-lieu').trim(), capacite: v('e-cap'), prix: v('e-prix'), conditions: v('e-cond').trim(),
          publie: document.getElementById('e-pub').checked, annule: ann ? ann.checked : false
        }).then(function () { evenements(); }, erreurDans('e-err'));
      });
    });
  }

  /* ---------- Vérifier une carte ---------- */
  function carte() {
    panneau('<span class="eyebrow">À l’entrée d’un événement</span><h1>Vérifier une carte</h1>' +
      '<p class="chapo">Le QR code d’une carte contient seulement un code aléatoire. Collez ici le code (la fin de l’adresse, après « carte= ») pour voir le statut actuel du membre. Chaque vérification est inscrite au journal.</p>' +
      '<form class="outils-ligne" id="f-carte" novalidate><div class="champ" style="max-width:520px"><label for="jeton">Code de la carte</label><input id="jeton" autocomplete="off" spellcheck="false"></div><button class="btn plein" type="submit">Vérifier</button></form>' +
      '<div id="res-carte" style="margin-top:26px"></div>');
    document.getElementById('f-carte').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var j = document.getElementById('jeton').value.trim().replace(/^.*carte=/, '');
      A.verifierCarte(j).then(function (r) {
        var out = document.getElementById('res-carte');
        if (!r) { out.innerHTML = '<span class="pastille refus">Carte inconnue</span>'; return; }
        if (r.suspendu || !r.categorie) { out.innerHTML = '<p class="cat">' + e(r.nom) + '</p><span class="pastille refus">' + (r.suspendu ? 'Accès suspendu' : 'Adhésion inactive') + '</span>'; return; }
        out.innerHTML = '<p class="cat" style="font-size:24px">' + e(r.nom) + '</p><p style="margin:8px 0 12px">' + NOMS[r.categorie] + ' · ' + (r.categorie === 'founders' ? ('00' + r.numero).slice(-3) + ' / 050' : ('000' + r.numero).slice(-4)) + '</p><span class="pastille ok">Accès valide</span>';
      });
    });
  }

  /* ---------- Journal ---------- */
  function journal() {
    A.journal().then(function (j) {
      panneau('<span class="eyebrow">Traçabilité</span><h1>Journal</h1><p class="chapo">Chaque action d’administration, avec son auteur et sa date. Rien ne s’efface.</p>' +
        (j.length ? '<div class="defile-x"><table class="reg"><thead><tr><th>Date</th><th>Par</th><th>Action</th><th>Concerne</th><th>Détails</th></tr></thead><tbody>' +
          j.map(function (x) {
            var d = Object.keys(x.details || {}).map(function (k) { return k + ' : ' + (typeof x.details[k] === 'object' ? JSON.stringify(x.details[k]) : x.details[k]); }).join(' · ');
            return '<tr><td class="n">' + NC.date(x.le, true) + '</td><td><small>' + e(x.admin) + '</small></td><td>' + e(x.action) + '</td><td>' + e(x.cible || '') + '</td><td><small>' + e(d) + '</small></td></tr>';
          }).join('') + '</tbody></table></div>' : '<p style="margin-top:22px"><span class="pastille neutre">Journal vide</span></p>'));
    });
  }

  /* ---------- Outils de test ---------- */
  function outils() {
    A.tableau().then(function (t) {
      var dec = Math.round(t.decalage / 36e5);
      panneau('<span class="eyebrow"><span class="mode-test">Mode test</span></span><h1>Outils de test</h1>' +
        '<p class="chapo">Ils simulent ce que feront la boutique et le prestataire de paiement, pour vérifier les règles du club. Tout reste dans ce navigateur.</p>' +
        '<div class="section"><h2>Achat du cardigan NC-01</h2><p>Un achat payé donne une place fondateur, tant qu’il en reste. Un même client n’en reçoit qu’une.</p>' +
        '<form class="outils-ligne" id="t-achat" novalidate><div class="champ"><label for="t-email">E-mail du client</label><input id="t-email" placeholder="client@exemple.ch"></div><div class="champ"><label for="t-nom">Nom</label><input id="t-nom" placeholder="Client test"></div><button class="btn plein" type="submit">Simuler un achat payé</button></form>' +
        '<form class="outils-ligne" id="t-remb" novalidate><div class="champ"><label for="t-email2">E-mail à rembourser</label><input id="t-email2"></div><button class="btn" type="submit">Simuler un remboursement complet</button></form>' +
        '<div class="outils-ligne"><button class="btn" type="button" id="t-rafale">60 achats au même instant</button></div><p class="message" id="t-msg" role="status"></p><p class="erreur" id="t-err" role="alert"></p></div>' +
        '<div class="section"><h2>Abonné payé</h2><form class="outils-ligne" id="t-abo" novalidate><div class="champ"><label for="t-email3">E-mail</label><input id="t-email3"></div><div class="champ"><label for="t-plan">Formule</label><select id="t-plan"><option value="early">Early Access</option><option value="signature">Signature</option></select></div><button class="btn plein" type="submit">Créer l’abonné</button></form></div>' +
        '<div class="section"><h2>Horloge</h2><p>Avancez le temps pour tester l’accès anticipé, les renouvellements, les impayés et les expirations.</p><p class="horloge" style="margin-top:12px">' + NC.date(t.maintenant, true) + (dec ? ' <small style="font-family:var(--body);font-size:13px;color:var(--alerte)">(+' + dec + ' h)</small>' : '') + '</p>' +
        '<div class="outils-ligne">' + [[1, '+1 h'], [24, '+1 jour'], [48, '+48 h'], [720, '+30 jours'], [8784, '+1 an']].map(function (h) { return '<button class="btn petit" type="button" data-h="' + h[0] + '">' + h[1] + '</button>'; }).join('') + '<button class="btn petit" type="button" data-h="reset">Heure réelle</button></div></div>' +
        '<div class="section"><h2>Recommencer</h2><div class="outils-ligne" id="t-effacer"><button class="btn" type="button">Effacer toutes les données de test</button></div></div>');
      var msg = document.getElementById('t-msg'), err = erreurDans('t-err');
      function dire(t) { msg.textContent = t; document.getElementById('t-err').textContent = ''; }
      document.getElementById('t-achat').addEventListener('submit', function (ev) {
        ev.preventDefault();
        A.simulerAchatNC01(document.getElementById('t-email').value, document.getElementById('t-nom').value.trim()).then(function (f) {
          dire(f.attribue ? 'Paiement confirmé : place fondateur N° ' + ('00' + f.place.numero).slice(-3) + ' / 050.' : f.raison === 'deja_fondateur' ? 'Paiement confirmé. Ce client est déjà fondateur : pas de deuxième place.' : 'Paiement confirmé. Les 50 places sont déjà attribuées.');
        }, err);
      });
      document.getElementById('t-remb').addEventListener('submit', function (ev) {
        ev.preventDefault();
        A.rembourserNC01(document.getElementById('t-email2').value).then(function (r) {
          dire(r.retiree ? 'Remboursé. Le numéro ' + ('00' + r.place.numero).slice(-3) + ' est retiré, il ne sera pas redonné automatiquement.' : r.transferee ? 'Remboursé. Le client garde sa place grâce à une autre commande payée.' : 'Remboursé. Ce client n’avait pas de place.');
        }, err);
      });
      document.getElementById('t-rafale').addEventListener('click', function () {
        A.simulerRafale(60).then(function (r) { dire(r.total + ' paiements simultanés : ' + r.places + ' places données, aucune en double, jamais plus de 50.'); }, err);
      });
      document.getElementById('t-abo').addEventListener('submit', function (ev) {
        ev.preventDefault();
        A.simulerAbonne(document.getElementById('t-email3').value, '', document.getElementById('t-plan').value).then(function () { outils(); }, function (x) { alerteSous('t-abo', x.message); });
      });
      document.querySelectorAll('[data-h]').forEach(function (b) {
        b.addEventListener('click', function () { A.avancerHorloge(b.dataset.h === 'reset' ? null : +b.dataset.h).then(outils); });
      });
      var eff = document.getElementById('t-effacer');
      eff.querySelector('button').addEventListener('click', function () {
        eff.innerHTML = '<span>Tout effacer, y compris votre session ?</span><button class="btn plein petit" type="button" data-oui>Oui, effacer</button><button class="btn petit" type="button" data-non>Annuler</button>';
        eff.querySelector('[data-oui]').addEventListener('click', function () { A.toutEffacer().then(demarrer); });
        eff.querySelector('[data-non]').addEventListener('click', outils);
      });
    });
  }
  function alerteSous(id, t) {
    var f = document.getElementById(id);
    var p = f.nextElementSibling && f.nextElementSibling.classList.contains('erreur') ? f.nextElementSibling : null;
    if (!p) { p = document.createElement('p'); p.className = 'erreur'; p.setAttribute('role', 'alert'); f.after(p); }
    p.textContent = t;
  }

  demarrer();
})();
