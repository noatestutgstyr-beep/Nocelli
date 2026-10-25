/*
 * Les trois cartes du NOCELLI PRIVATE CLUB, recto et verso, en HTML/CSS.
 * Même code pour la vitrine du club, la carte numérique de l'espace membre,
 * le plein écran et les fichiers d'impression (85,6 × 54 mm).
 *
 * Le QR code ne contient qu'une adresse avec un jeton aléatoire : aucune donnée
 * personnelle, et la page ouverte demande toujours de se connecter.
 */
(function () {
  'use strict';

  var TEXTES = {
    founders: { mention: 'Founders Club', devise: 'A founding member shapes what comes next.', qr: '#30231D' },
    early: { mention: 'Early Access', devise: 'Be the first to discover what comes next.', qr: '#30231D' },
    signature: { mention: 'Signature Club', devise: 'Access a world of exclusive experiences.', qr: '#111111' }
  };

  // Grains de matière (bruit fractal SVG), très légers.
  function grain(freq, oct, couleur, alpha) {
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='" + freq + "' numOctaves='" + oct + "' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 " + couleur[0] + " 0 0 0 0 " + couleur[1] + " 0 0 0 0 " + couleur[2] + " 0 0 0 " + alpha + " 0'/></filter><rect width='100%' height='100%' filter='url(%23g)'/></svg>";
    return 'url("data:image/svg+xml;utf8,' + svg.replace(/"/g, "'").replace(/</g, '%3C').replace(/>/g, '%3E') + '")';
  }
  var GRAINS = {
    founders: grain(0.9, 3, [0.95, 0.85, 0.7], 0.11),
    early: grain(0.55, 4, [0.45, 0.35, 0.26], 0.10),
    signature: grain(1.1, 2, [0.9, 0.9, 0.9], 0.07)
  };

  function qrSvg(texte, couleur) {
    if (typeof qrcode !== 'function') return '';
    var q = qrcode(0, 'M');
    q.addData(texte);
    q.make();
    var n = q.getModuleCount(), d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
    return '<svg viewBox="0 0 ' + n + ' ' + n + '" shape-rendering="crispEdges" aria-hidden="true"><path fill="' + couleur + '" d="' + d + '"/></svg>';
  }

  function pad(n, l) { n = String(n == null ? 0 : n); while (n.length < l) n = '0' + n; return n; }

  function libelleNumero(categorie, numero) {
    if (categorie === 'founders') return 'Member <b>' + pad(numero || 1, 3) + '</b> / 050';
    return 'Member <b>' + pad(numero || 1, 4) + '</b>';
  }

  function adresseQr(jeton) {
    // Fichiers d'impression : adresse publique du site (sinon, celle de la page).
    var base = window.NOCELLI_SITE || location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    return base + 'membre.html' + (jeton ? '?carte=' + jeton : '');
  }

  var SYMBOLE = '<svg class="symbole" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width=".8"><path d="M12 1.5 22.5 12 12 22.5 1.5 12Z"/><path d="M12 6.2 17.8 12 12 17.8 6.2 12Z"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/></svg>';
  var ARCHE = '<svg class="arche" viewBox="0 0 100 200" preserveAspectRatio="none" aria-hidden="true" fill="none" stroke="currentColor" stroke-width=".7"><path d="M6 200V50a44 44 0 0 1 88 0v150"/><path d="M16 200V52a34 34 0 0 1 68 0v148"/><path d="M50 8v8"/></svg>';

  function htmlRecto(cat, o) {
    var n = libelleNumero(cat, o.numero);
    if (cat === 'founders') {
      return '<div class="filet-or"></div><div class="contenu">' + SYMBOLE +
        '<div class="centre"><div class="logo dorure">NOCELLI</div><div class="mention">Founders Club</div></div>' +
        '<div class="pied"><span class="numero">' + n + '</span><span class="petit">Est. 2026 · NC-01</span></div></div>';
    }
    if (cat === 'early') {
      return '<div class="contenu"><div class="centre"><div class="logo">NOCELLI</div><div class="trait"></div><div class="mention">Early Access</div></div>' +
        '<div class="pied"><span class="petit">Private Club</span><span class="numero">' + n.replace(/<\/?b>/g, '') + '</span></div></div>';
    }
    return '<div class="cannelures"></div>' + ARCHE +
      '<div class="contenu"><div class="centre"><div class="logo dorure">NOCELLI</div><div class="mention">Signature Club</div></div>' +
      '<div class="pied"><span class="numero">' + n + '</span><span class="petit">Private Club</span></div></div>';
  }

  function htmlVerso(cat, o) {
    var t = TEXTES[cat];
    return (cat === 'signature' ? '<div class="cannelures" style="opacity:.5"></div>' : '') +
      '<div class="contenu"><p class="devise">' + t.devise + '</p>' +
      '<div class="qr" title="QR code : ouvre l’espace membre, connexion requise">' + qrSvg(adresseQr(o.jeton), t.qr) + '</div>' +
      '<div class="bas-verso"><span class="qui"><span class="nom-membre">' + echapper(o.nom || 'Membre du Private Club') + '</span>' +
      '<span class="petit">Personnelle · non transférable</span></span><span class="marque-verso">NOCELLI</span></div></div>';
  }

  function echapper(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  /*
   * creer({ categorie, numero, nom, jeton, retournable, vivante, etiquette })
   * Renvoie l'élément .carte prêt à insérer.
   */
  function creer(o) {
    var cat = o.categorie;
    var el = document.createElement('div');
    el.className = 'carte ' + cat;
    el.setAttribute('role', 'img');
    var nom = { founders: 'Founders Club', early: 'Early Access', signature: 'Signature Club' }[cat];
    el.setAttribute('aria-label', o.etiquette || ('Carte NOCELLI ' + nom + ', ' + libelleNumero(cat, o.numero).replace(/<\/?b>/g, '') + '. Au verso : ' + TEXTES[cat].devise));
    el.innerHTML = '<div class="carte-corps">' +
      '<div class="face recto"><div class="grain" style="background-image:' + GRAINS[cat] + '"></div>' + htmlRecto(cat, o) + '<div class="reflet"></div></div>' +
      '<div class="face verso"><div class="grain" style="background-image:' + GRAINS[cat] + '"></div>' + htmlVerso(cat, o) + '<div class="reflet"></div></div>' +
      '</div>';
    if (o.retournable !== false) rendreRetournable(el);
    if (o.vivante !== false) rendreVivante(el);
    return el;
  }

  function rendreRetournable(el) {
    el.setAttribute('data-retournable', '');
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.setAttribute('aria-pressed', 'false');
    function basculer() {
      var r = el.classList.toggle('retournee');
      el.setAttribute('aria-pressed', r ? 'true' : 'false');
    }
    el.addEventListener('click', basculer);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); basculer(); }
    });
    el.retourner = basculer;
  }

  // Léger effet 3D et reflet de dorure qui suivent la souris (ordinateur uniquement).
  var fin = window.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches;
  var calme = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
  function rendreVivante(el) {
    if (!fin || calme) return;
    el.addEventListener('pointermove', function (e) {
      var b = el.getBoundingClientRect();
      var x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height;
      el.classList.add('vivante');
      el.style.setProperty('--ry', ((x - .5) * 14).toFixed(2) + 'deg');
      el.style.setProperty('--rx', ((.5 - y) * 10).toFixed(2) + 'deg');
      el.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
      el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
      el.style.setProperty('--lueur', '1');
    });
    el.addEventListener('pointerleave', function () {
      el.classList.remove('vivante');
      el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg');
      el.style.setProperty('--mx', '50%'); el.style.setProperty('--my', '30%');
      el.style.setProperty('--lueur', '0');
    });
  }

  // Carte en plein écran, avec animation d'apparition.
  function pleinEcran(o) {
    var voile = document.createElement('div');
    voile.className = 'voile plein-ecran';
    voile.setAttribute('role', 'dialog');
    voile.setAttribute('aria-modal', 'true');
    voile.setAttribute('aria-label', 'Votre carte de membre');
    voile.innerHTML = '<div class="scene-plein"></div>';
    var scene = voile.firstChild;
    var c = creer(o);
    scene.appendChild(c);
    var aide = document.createElement('p');
    aide.className = 'aide';
    aide.textContent = 'Touchez la carte pour la retourner';
    var actions = document.createElement('div');
    actions.className = 'actions';
    actions.innerHTML = '<button class="btn clair petit" type="button" data-r>Retourner</button><button class="btn clair petit" type="button" data-f>Fermer</button>';
    scene.appendChild(aide);
    scene.appendChild(actions);
    document.body.appendChild(voile);
    document.body.style.overflow = 'hidden';
    var avant = document.activeElement;
    function fermer() {
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
      voile.remove();
      document.body.style.overflow = '';
      document.removeEventListener('keydown', touche);
      if (avant && avant.focus) avant.focus();
    }
    function touche(e) { if (e.key === 'Escape') fermer(); }
    document.addEventListener('keydown', touche);
    actions.querySelector('[data-r]').addEventListener('click', function () { c.retourner(); });
    actions.querySelector('[data-f]').addEventListener('click', fermer);
    voile.addEventListener('click', function (e) { if (e.target === voile) fermer(); });
    if (voile.requestFullscreen) voile.requestFullscreen().catch(function () {});
    c.focus();
    return voile;
  }

  window.NocelliCartes = { creer: creer, pleinEcran: pleinEcran, libelleNumero: libelleNumero, TEXTES: TEXTES };
})();
