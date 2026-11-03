/* Offre Founders visible tant que les 50 cardigans ne sont pas tous vendus.
   Pour la retirer à la main : mettre false ci-dessous. Elle disparaît aussi toute seule
   quand le serveur indique 0 place libre (page du club). Les fondateurs gardent leur carte
   dans leur espace membre. */
window.NOCELLI_FOUNDERS_OUVERT = true;

(function () {
  var st = document.createElement('style');
  st.textContent =
    '.fondateurs-fermes [data-founders]{display:none!important}' +
    '.fondateurs-fermes .carte.founders{display:none!important}' +
    '.fondateurs-fermes .trio{grid-template-columns:1fr!important;max-width:490px!important;grid-auto-columns:100%!important}' +
    '.fondateurs-fermes .club-cartes .carte.signature,.fondateurs-fermes .eventail .carte.signature{transform:none!important}';
  document.head.appendChild(st);
  window.NocelliFermerFounders = function () {
    var r = document.documentElement;
    if (r.classList.contains('fondateurs-fermes')) return;
    r.classList.add('fondateurs-fermes');
    document.querySelectorAll('[data-sans-founders]').forEach(function (el) { el.textContent = el.getAttribute('data-sans-founders'); });
  };
  if (!window.NOCELLI_FOUNDERS_OUVERT) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.NocelliFermerFounders);
    else window.NocelliFermerFounders();
  }
})();
