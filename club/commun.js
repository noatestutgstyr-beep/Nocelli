// Outils partagés par les pages du club : menu, fenêtres, formats suisses.
(function () {
  'use strict';

  var burger = document.getElementById('burger');
  var menu = document.getElementById('menu');
  if (burger && menu) {
    var setMenu = function (open) {
      menu.hidden = !open;
      document.body.classList.toggle('menu-ouvert', open);
      document.body.style.overflow = open ? 'hidden' : '';
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    };
    burger.addEventListener('click', function () { setMenu(menu.hidden); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) setMenu(false); });
  }

  var tz = 'Europe/Zurich';
  function date(ms, heure) {
    var o = { day: 'numeric', month: 'long', year: 'numeric', timeZone: tz };
    if (heure) { o.hour = '2-digit'; o.minute = '2-digit'; }
    return new Date(ms).toLocaleString('fr-CH', o).replace(' à ', ', ');
  }
  function chf(n) {
    return 'CHF ' + Number(n).toFixed(2).replace(/\.00$/, '.–');
  }
  function echapper(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function duree(ms) {
    if (ms <= 0) return 'maintenant';
    var j = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
    if (j) return j + ' j ' + h + ' h';
    if (h) return h + ' h ' + m + ' min';
    return m + ' min';
  }

  // Fenêtre modale simple, accessible au clavier.
  function fenetre(contenuHtml, options) {
    options = options || {};
    var voile = document.createElement('div');
    voile.className = 'voile';
    voile.innerHTML = '<div class="fenetre" role="dialog" aria-modal="true" tabindex="-1"><button class="fermer" type="button" aria-label="Fermer">×</button><div class="corps"></div></div>';
    var f = voile.querySelector('.fenetre');
    var corps = voile.querySelector('.corps');
    corps.innerHTML = contenuHtml;
    if (options.titre) f.setAttribute('aria-label', options.titre);
    document.body.appendChild(voile);
    document.body.style.overflow = 'hidden';
    var avant = document.activeElement;
    function fermer() {
      voile.remove();
      document.body.style.overflow = '';
      document.removeEventListener('keydown', touche);
      if (avant && avant.focus) avant.focus();
      if (options.apres) options.apres();
    }
    function touche(e) { if (e.key === 'Escape') fermer(); }
    document.addEventListener('keydown', touche);
    voile.querySelector('.fermer').addEventListener('click', fermer);
    voile.addEventListener('mousedown', function (e) { if (e.target === voile) fermer(); });
    setTimeout(function () { (corps.querySelector('input,button,select') || f).focus(); }, 30);
    return { voile: voile, corps: corps, fermer: fermer, remplacer: function (h) { corps.innerHTML = h; var x = corps.querySelector('input,button,select'); if (x) x.focus(); } };
  }

  // Le badge « mode test » rappelle qu'aucune donnée ni aucun paiement n'est réel.
  if (window.Club && window.Club.modeTest) {
    var a = document.querySelector('.annonce');
    if (a) a.insertAdjacentHTML('beforeend', ' &nbsp;<span class="mode-test" title="Démonstration : les données restent dans ce navigateur, aucun paiement réel">Mode test</span>');
  }

  // « Mon compte » affiche le prénom quand on est connecté.
  var s = window.Club && window.Club.session();
  document.querySelectorAll('[data-lien-compte]').forEach(function (l) {
    if (s) l.textContent = s.role === 'admin' ? 'Administration' : 'Mon compte';
    if (s && s.role === 'admin') l.href = 'admin.html';
  });

  window.NC = { date: date, chf: chf, echapper: echapper, duree: duree, fenetre: fenetre };
})();
