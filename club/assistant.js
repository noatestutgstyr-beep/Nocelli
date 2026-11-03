// Case à questions NOCELLI : l'assistant IA (fonction serveur « assistant ») répond ; à défaut, des réponses toutes faites.
(function () {
  var hote = document.getElementById('assistant');
  if (!hote) {
    // Pages sans section questions (accueil) : petit bouton flottant qui ouvre la même case.
    var lanceur = document.createElement('button');
    lanceur.type = 'button'; lanceur.className = 'as-lanceur'; lanceur.setAttribute('aria-expanded', 'false');
    lanceur.innerHTML = '<span class="as-l-d"></span><span class="as-l-t">Une question ?</span><span class="as-l-q">?</span>'; lanceur.setAttribute('aria-label', 'Une question ?');
    var volet = document.createElement('div');
    volet.className = 'as-volet'; volet.setAttribute('aria-hidden', 'true');
    volet.innerHTML = '<button type="button" class="as-fermer" aria-label="Fermer">×</button><div id="assistant"></div>';
    document.body.appendChild(volet); document.body.appendChild(lanceur);
    hote = volet.querySelector('#assistant');
    var s2 = document.createElement('style');
    s2.textContent =
      '.as-lanceur{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));z-index:60;display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:999px;background:linear-gradient(180deg,#3a2b23,#251a15);color:#F7F3EC;border:1px solid rgba(201,164,106,.55);font-family:Jost,sans-serif;font-size:9.5px;letter-spacing:.24em;text-transform:uppercase;cursor:pointer;box-shadow:0 10px 26px -12px rgba(20,14,10,.55),inset 0 1px 0 rgba(255,255,255,.06);transition:transform .5s cubic-bezier(.2,.7,.2,1),box-shadow .5s}' +
      '.as-lanceur:hover{transform:translateY(-2px);box-shadow:0 16px 32px -14px rgba(20,14,10,.6)}' +
      '.as-l-q{display:none;font-family:"Bodoni Moda",serif;font-size:17px;letter-spacing:0;line-height:1}' +
      '@media (max-width:600px){.as-lanceur{width:40px;height:40px;padding:0;justify-content:center}.as-l-t,.as-l-d{display:none}.as-l-q{display:block}}' +
      '.as-l-d{width:5px;height:5px;transform:rotate(45deg);border:1px solid #c9a46a}' +
      '.as-volet{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:calc(max(16px,env(safe-area-inset-bottom)) + 52px);z-index:61;width:min(350px,calc(100vw - 32px));max-height:calc(100vh - 100px);overflow:auto;border-radius:20px;box-shadow:0 24px 60px -22px rgba(20,14,10,.45),0 2px 8px -4px rgba(20,14,10,.15);opacity:0;transform:translateY(12px) scale(.97);transform-origin:bottom right;pointer-events:none;visibility:hidden;transition:opacity .45s cubic-bezier(.2,.7,.2,1),transform .45s cubic-bezier(.2,.7,.2,1),visibility 0s .45s}' +
      '.as-volet.ouvert{opacity:1;transform:none;pointer-events:auto;visibility:visible;transition-delay:0s}' +
      '.as-volet #assistant{max-width:none}' +
      '.as-volet #assistant .as-boite{border-radius:20px;padding:26px 22px 20px;gap:16px}' +
      '.as-volet #assistant .as-boite::before{border-radius:16px}' +
      '.as-volet #assistant .as-titre{font-size:21px}' +
      '.as-volet #assistant .as-fil{max-height:min(210px,34vh);gap:12px;padding-top:14px}' +
      '.as-volet #assistant .as-n{font-size:14px;line-height:1.5}' +
      '.as-volet #assistant input{font-size:15px;padding:9px 0}' +
      '.as-volet #assistant .as-sugg{gap:6px 14px}' +
      '.as-volet #assistant .as-sugg button{font-size:11.5px}' +
      '.as-fermer{position:absolute;top:12px;right:16px;z-index:2;width:26px;height:26px;border-radius:50%;border:1px solid rgba(176,141,87,.35);background:#FBF8F3;font-size:15px;line-height:1;color:#b08d57;cursor:pointer}';
    document.head.appendChild(s2);
    lanceur.addEventListener('click', function () {
      var o = volet.classList.toggle('ouvert'); lanceur.setAttribute('aria-expanded', String(o)); volet.setAttribute('aria-hidden', String(!o));
      if (o) setTimeout(function () { var c = volet.querySelector('input'); if (c) c.focus({ preventScroll: true }); }, 50);
    });
    function fermer() { volet.classList.remove('ouvert'); lanceur.setAttribute('aria-expanded', 'false'); volet.setAttribute('aria-hidden', 'true'); }
    volet.querySelector('.as-fermer').addEventListener('click', fermer);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fermer(); });
  }
  // [mots-clés, réponse]. Les mots sont comparés sans accents, avec tolérance aux fautes.
  var R = [
    [['nocelli', 'marque', 'maison', 'qui etes', 'histoire', 'origine', 'nom', 'signifie', 'veut dire', 'concept', 'fondateur de la marque', 'createur'], "NOCELLI est une maison suisse de vêtements en petites séries. Le nom vient de « noce », le noyer en italien : une couleur, un bois, une idée de durée. Chaque pièce est éditée en quantité limitée et numérotée."],
    [['style', 'luxe', 'esprit', 'inspiration', 'quiet', 'old money', 'elegance', 'discret'], "Une élégance discrète : belles matières, coupes nettes, aucun logo visible. Le seul nom de la maison est sur l'étiquette intérieure numérotée."],
    [['suisse', 'ou etes', 'base', 'pays', 'geneve', 'localisation'], "NOCELLI est une maison suisse. Les événements du club ont lieu à Genève et la livraison se fait en Suisse."],
    [['cardigan', 'piece', 'produit', 'nc-01', 'nc01', 'noce', 'vetement', 'pull', 'gilet', 'premiere piece', 'collection'], "La première pièce est Le Cardigan Noce (NC-01) : un cardigan zippé en maille unie couleur chocolat, en 100 % laine mérinos extrafine. 50 exemplaires numérotés, CHF 139."],
    [['prix cardigan', 'combien cardigan', 'prix du cardigan', 'cout cardigan', 'combien coute le cardigan', 'prix piece', '139', 'cardigan prix', 'prix'], "Le Cardigan Noce coûte CHF 139."],
    [['exemplaire', 'combien de pieces', 'quantite', 'limite', 'stock', 'rupture', 'reste', 'disponible', 'edition'], "Le Cardigan Noce est édité à 50 exemplaires seulement."],
    [['numero', 'numerote', 'etiquette', 'label', '01 / 50', '01/50', 'unique'], "Chaque cardigan porte une étiquette tissée à l'intérieur du col, avec NOCELLI et son numéro : de N° 01 / 50 à N° 50 / 50. Chaque pièce est unique."],
    [['matiere', 'laine', 'merinos', 'composition', 'tissu', 'qualite', 'micron', 'gratte', 'pique', 'doux', 'douceur', 'chaud', 'maille', 'jauge'], "100 % laine mérinos extrafine (19,5 microns au plus), tricotée en jauge 12 en maille unie. Elle est douce, ne gratte pas, traitée anti-feutrage et adoucie. Aucune fibre synthétique."],
    [['couleur', 'coloris', 'chocolat', 'marron', 'brun', 'noir', 'beige', 'autre couleur'], "Le Cardigan Noce existe en un seul coloris : chocolat."],
    [['zip', 'fermeture', 'eclair', 'bouton', 'tirette'], "Il se ferme par un zip métal double sens, avec des tirettes lisses : on peut l'ouvrir par le haut ou par le bas."],
    [['col', 'cou', 'montant'], "Col montant côtelé d'environ 7 cm, légèrement évasé, qui tient bien autour du cou."],
    [['poche', 'poches'], "Le Cardigan Noce n'a pas de poches, pour garder une ligne nette."],
    [['manche', 'epaule', 'coupe', 'fit', 'ajuste', 'ample', 'slim', 'oversize', 'forme'], "Coupe droite et nette, manches montées avec une épaule naturelle légèrement structurée. Poignets et bas côtelés."],
    [['logo', 'marque visible', 'brode', 'imprime'], "Il n'y a aucun logo visible. Le nom NOCELLI apparaît seulement sur l'étiquette numérotée à l'intérieur du col."],
    [['taille', 'tailles', 'mesure', 'quelle taille', 'grand', 'petit', 'guide', 'tour de poitrine', 'longueur', 'cm', 'xs', 'xl'], "Trois tailles : S (tour de poitrine 91 à 95 cm), M (96 à 100 cm), L (101 à 105 cm). Longueur : 62, 64 et 66 cm. Entre deux tailles, prenez la plus grande pour plus d'aisance. Le guide complet est sur la page du cardigan."],
    [['lavage', 'laver', 'entretien', 'machine', 'retrecit', 'retrecir', 'repasser', 'sechage', 'boulochage', 'bouloche'], "Lavage à la main ou en machine au programme laine, à froid, puis séchage à plat. La laine est traitée anti-feutrage et ne rétrécit presque pas."],
    [['homme', 'femme', 'unisexe', 'genre', 'pour qui'], "Le Cardigan Noce se porte comme on veut. Regardez le guide des tailles pour choisir selon votre tour de poitrine."],
    [['date', 'quand sort', 'quand ouvr', 'quand commence', 'quand acheter', 'sortie', 'lancement', 'drop', 'heure', 'ouverture', 'decembre', 'disponible quand', 'quand ca sort'], "Le lancement a lieu le mardi 1er décembre 2026 à 19 h, heure suisse. Les membres du club y ont accès avant : 72 h pour Signature, 48 h pour Founders."],
    [['acheter', 'commander', 'precommande', 'achat', 'commande', 'reserver', 'ou acheter'], "La vente se fait uniquement sur ce site, en précommande à partir du 1er décembre à 19 h. Créez votre compte (page « Inscription ») pour être prévenu."],
    [['livraison', 'livr', 'livrez', 'livrez quand', 'quand recevoir', 'delai', 'expedition', 'recevoir', 'envoi', 'colis', 'poste', 'semaine'], "C'est une précommande : livraison en Suisse 4 à 6 semaines après l'ouverture."],
    [['etranger', 'france', 'international', 'europe', 'hors suisse', 'douane', 'en france', 'livrez vous en'], "Pour l'instant, la livraison se fait en Suisse uniquement."],
    [['paiement', 'payer', 'twint', 'carte bancaire', 'visa', 'mastercard', 'facture', 'plusieurs fois'], "Paiement par carte ou TWINT, en francs suisses."],
    [['retour', 'echange', 'rembourse', 'remboursement', 'pas la bonne taille'], "Pour un échange de taille ou un retour, écrivez-nous sur Instagram, @nocelli.ch, nous trouverons une solution. Une commande remboursée perd sa place Founders."],
    [['inscri', 'liste', 'newsletter', 'prevenu', 'alerte', 'm inscrire', 'waitlist', 'attente'], "Créez votre compte sur la page « Inscription » (en haut à droite) : vous recevez le lien de commande en premier le jour de l'ouverture."],
    [['club', 'private club', 'carte', 'cartes', 'membre', 'adhesion', 'difference'], "Le NOCELLI Private Club a deux cartes. Founders : gratuite à vie pour les 50 premiers acheteurs du cardigan. Signature : CHF 290 par an, limitée à 50 membres, avec dîners, soirées et voyages."],
    [['founders', 'fondateur', 'fondateurs', 'gratuit', 'devenir', 'premiers acheteurs'], "Founders est gratuite à vie pour les 50 premiers acheteurs du cardigan NC-01 : carte numérotée et accès à tout : collections 72 h avant le public, priorité sur les éditions limitées, dîners privés, soirées, rencontres entre membres, accès prioritaire aux voyages, vote sur les futures collections, et 10 % sur tous les événements NOCELLI."],
    [['signature', 'abonnement', 'prix signature', 'combien signature', '290', 'carte noire'], "Signature coûte CHF 290 par an, limitée à 50 membres : carte noire personnalisée, collections 72 h avant le public, priorité sur les éditions limitées, dîners privés dans les restaurants les plus prisés de Genève, soirées privées et accès prioritaire aux voyages. Les repas, soirées et voyages sont payants séparément."],
    [['diner', 'soiree', 'evenement', 'restaurant', 'rencontre', 'cocktail', 'fete'], "Les membres Signature et les fondateurs ont accès à des dîners privés dans les restaurants les plus prisés de Genève, à des soirées privées ; les fondateurs ont aussi accès aux rencontres entre membres. Chaque événement est payant séparément ; les fondateurs ont 10 % de réduction."],
    [['voyage', 'voyages', 'trip', 'acompte', 'destination'], "Les membres Signature et les fondateurs ont un accès prioritaire aux voyages NOCELLI. Chaque membre paie sa part. Un acompte non remboursable est demandé à la réservation."],
    [['annuler', 'resilier', 'arreter', 'renouvellement', 'desabonner', 'duree', 'annuler signature', 'resilier signature', 'annulation'], "Signature dure un an dès le paiement et se renouvelle automatiquement. Vous pouvez l'annuler à tout moment depuis votre espace membre ; l'accès reste ouvert jusqu'à la fin de l'année payée."],
    [['les deux', 'cumuler', 'founders et signature', 'deja fondateur', 'fondateur et signature', 'founders et signature', 'et signature'], "Oui. Un fondateur peut ajouter Signature pour CHF 290 par an et garde son numéro Founders."],
    [['vote', 'voter', 'futures collections', 'prochaine collection', 'prochaine piece'], "Les membres Founders votent sur les futures collections. La suite sera annoncée aux membres du club en premier."],
    [['invitation', 'prive', 'autre carte', 'troisieme', 'secrete', 'secret', 'nocelli prive', 'carte privee', 'by invitation'], "Au-delà de ces deux cartes, une autre. Elle ne se demande pas."],
    [['compte', 'connexion', 'connecter', 'espace membre', 'mot de passe', 'login'], "Votre espace membre est sur la page « Mon compte ». La connexion se fait par un lien envoyé à votre e-mail, sans mot de passe."],
    [['instagram', 'insta', 'tiktok', 'reseaux', 'contact', 'contacter', 'email', 'mail', 'joindre', 'telephone', 'service client'], "Retrouvez-nous sur Instagram, @nocelli.ch, et sur TikTok (icônes en bas de page). Pour toute question, écrivez-nous sur Instagram."],
    [['magasin', 'boutique', 'showroom', 'essayer', 'physique'], "NOCELLI vend uniquement en ligne, sur ce site."],
    [['cadeau', 'offrir', 'emballage', 'boite'], "Le cardigan peut tout à fait être offert : choisissez la taille avec le guide, et écrivez-nous sur Instagram pour toute demande particulière."],
    [['bonjour', 'salut', 'hello', 'coucou', 'bonsoir'], "Bonjour. Posez votre question sur la maison, le cardigan, les tailles, la livraison ou le club."],
    [['merci', 'super', 'parfait', 'top'], "Avec plaisir. À très bientôt chez NOCELLI."]
  ];
  var SUGG = ['Quand sort le cardigan ?', 'Quelle taille choisir ?', 'C\'est quelle laine ?', 'Que donne Signature ?', 'Délais de livraison'];
  function norm(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9/ -]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function proche(a, b) { // distance d'édition <= 1
    if (Math.abs(a.length - b.length) > 1) return false;
    var i = 0, j = 0, d = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++d > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return d + (a.length - i) + (b.length - j) <= 1;
  }
  function repondre(q) {
    var n = norm(q), mots = n.split(' '), best = null, score = 0;
    R.forEach(function (r) {
      var s = 0;
      r[0].forEach(function (m) {
        var k = norm(m);
        if ((' ' + n + ' ').indexOf(k.length < 4 ? ' ' + k + ' ' : k) >= 0) s += k.length * (k.indexOf(' ') > 0 ? 2 : 1);
        else if (k.length >= 5 && k.indexOf(' ') < 0 && mots.some(function (w) { return w.length >= 4 && proche(w, k); })) s += k.length - 1;
      });
      if (s > score) { score = s; best = r[1]; }
    });
    return best || "Je n'ai pas encore la réponse à cette question. Écrivez-nous sur Instagram, @nocelli.ch, nous vous répondrons personnellement.";
  }
  hote.innerHTML =
    '<div class="as-boite">' +
      '<div class="as-tete"><span class="as-titre">Une question ?</span><span class="as-sous">La maison vous répond</span></div>' +
      '<div class="as-fil" aria-live="polite"><p class="as-m as-n">Bonjour. Posez-moi votre question sur NOCELLI, le Cardigan Noce, les tailles, la livraison ou le club.</p></div>' +
      '<form class="as-f" autocomplete="off"><label class="sr" for="as-q">Votre question</label><input id="as-q" type="text" placeholder="Écrivez votre question…" maxlength="600"><button type="submit" aria-label="Envoyer">→</button></form>' +
      '<div class="as-sugg"></div>' +
    '</div>';
  var st = document.createElement('style');
  st.textContent =
    '#assistant{max-width:430px}' +
    '#assistant .as-boite{position:relative;border:1px solid rgba(176,141,87,.45);background:#FBF8F3;padding:34px 30px 26px;display:grid;gap:22px}' +
    '#assistant .as-boite::before{content:"";position:absolute;inset:5px;border:1px solid rgba(176,141,87,.18);pointer-events:none}' +
    '#assistant .as-tete{display:grid;justify-items:center;gap:10px;text-align:center}' +
    '#assistant .as-tete::before{content:"";width:7px;height:7px;transform:rotate(45deg);border:1px solid #b08d57}' +
    '#assistant .as-titre{font-family:"Bodoni Moda",serif;font-size:25px;letter-spacing:.01em;color:#30231D}' +
    '#assistant .as-sous{font-size:9.5px;letter-spacing:.34em;text-transform:uppercase;color:#b08d57}' +
    '#assistant .as-fil{display:flex;flex-direction:column;gap:18px;max-height:320px;overflow-y:auto;scroll-behavior:smooth;padding-top:20px;border-top:1px solid rgba(176,141,87,.35);scrollbar-width:thin}' +
    '#assistant .as-m{margin:0;line-height:1.6}' +
    '#assistant .as-n{font-family:"Bodoni Moda",serif;font-style:italic;font-size:16.5px;color:#3A2519;padding-left:16px;border-left:1px solid #b08d57}' +
    '#assistant .as-u{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:rgba(58,37,25,.6);text-align:right}' +
    '#assistant .as-sugg{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 18px}' +
    '#assistant .as-sugg button{border:0;border-bottom:1px solid rgba(176,141,87,.5);background:none;padding:2px 0;font:inherit;font-size:12.5px;color:rgba(58,37,25,.8);cursor:pointer;transition:color .3s,border-color .3s}' +
    '#assistant .as-sugg button:hover{color:#30231D;border-color:#30231D}' +
    '#assistant .as-f{display:flex;align-items:center;border-bottom:1px solid #30231D}' +
    '#assistant input{flex:1;min-width:0;border:0;background:none;font-family:"Bodoni Moda",serif;font-style:italic;font-size:16px;padding:12px 0;color:#3A2519;outline:none}' +
    '#assistant input::placeholder{color:rgba(58,37,25,.45)}' +
    '#assistant .as-f button{border:0;background:none;color:#b08d57;font-size:20px;padding:0 2px 0 12px;cursor:pointer;transition:transform .3s}' +
    '#assistant .as-f button:hover{transform:translateX(3px)}' +
    '#assistant .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}' +
    // trois points qui respirent pendant que l'assistant cherche
    '#assistant .as-attente{display:flex;gap:6px;height:26px;align-items:center}' +
    '#assistant .as-attente::before,#assistant .as-attente::after{content:"";width:5px;height:5px;transform:rotate(45deg);background:#b08d57;animation:as-souffle 1.2s ease-in-out infinite}' +
    '#assistant .as-attente::after{animation-delay:.4s}' +
    '@keyframes as-souffle{0%,100%{opacity:.2}50%{opacity:1}}' +
    '#assistant .as-src{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:8px;font-family:Jost,sans-serif;font-style:normal;font-size:11px;letter-spacing:.06em}' +
    '#assistant .as-src a{color:#b08d57;text-decoration:none;border-bottom:1px solid rgba(176,141,87,.4)}';
  document.head.appendChild(st);
  var fil = hote.querySelector('.as-fil'), champ = hote.querySelector('input'), sugg = hote.querySelector('.as-sugg');
  function bulle(t, c) { var p = document.createElement('p'); p.className = 'as-m ' + c; p.textContent = t; fil.appendChild(p); fil.scrollTop = fil.scrollHeight; return p; }
  function sourcesSous(p, sources) {
    if (!sources || !sources.length) return;
    var d = document.createElement('span'); d.className = 'as-src';
    sources.forEach(function (s) {
      var a = document.createElement('a'); a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = s.titre;
      d.appendChild(a);
    });
    p.appendChild(d); fil.scrollTop = fil.scrollHeight;
  }

  // Assistant IA (fonction serveur « assistant », Claude) : il relit tout le site et cherche sur le web.
  // Sans serveur, ou s'il ne répond pas, la case garde les réponses toutes faites ci-dessus.
  var histo = [], enCours = false;
  function demanderIA(q) {
    var srv = window.NOCELLI_SERVEUR;
    if (!srv || !srv.url || !window.fetch) return Promise.reject(new Error('sans_serveur'));
    histo.push({ role: 'user', content: q });
    return fetch(srv.url + '/functions/v1/assistant', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': srv.cle },
      body: JSON.stringify({ messages: histo, langue: (document.documentElement.lang || 'fr').slice(0, 2), page: location.pathname.split('/').pop() })
    }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (j) {
      if (j.reponse) { histo.push({ role: 'assistant', content: j.reponse }); return j; }
      histo.pop();
      // question refusée ou trop de questions : le message de l'assistant ; panne : réponses toutes faites
      if (j.erreur === 'refus' || j.erreur === 'limite') return { reponse: j.message };
      throw new Error(j.erreur || 'erreur');
    }, function (e) { histo.pop(); throw e; });
  }
  function demander(q) {
    q = q.trim(); if (!q || enCours) return;
    bulle(q, 'as-u'); champ.value = '';
    enCours = true;
    var attente = bulle('', 'as-n as-attente');
    demanderIA(q).then(function (r) {
      attente.remove(); sourcesSous(bulle(r.reponse, 'as-n'), r.sources);
    }, function () {
      attente.remove(); bulle(repondre(q), 'as-n');
    }).then(function () { enCours = false; });
  }
  SUGG.forEach(function (s) { var b = document.createElement('button'); b.type = 'button'; b.textContent = s; b.addEventListener('click', function () { demander(s); }); sugg.appendChild(b); });
  hote.querySelector('form').addEventListener('submit', function (e) { e.preventDefault(); demander(champ.value); });
  window.NocelliAssistant = { repondre: repondre };
})();
