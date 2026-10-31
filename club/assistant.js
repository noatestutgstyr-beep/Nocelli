// Petite assistante de la page club : répond aux questions à partir des textes du site (aucun service externe).
(function () {
  var hote = document.getElementById('assistant');
  if (!hote) return;
  var R = [
    [['prix', 'combien', 'coute', 'cher', 'tarif', 'abonnement', 'que donne', 'avantage'], "Signature coûte CHF 290 par an, limitée à 50 membres. Founders est gratuite à vie, offerte aux 50 premiers acheteurs du cardigan NC-01."],
    [['founders', 'fondateur', 'gratuit', 'devenir', 'numero'], "Achetez le cardigan NC-01 : les 50 premières commandes payées reçoivent une carte Founders numérotée de 01 / 50 à 50 / 50, gratuite à vie. Une place par client."],
    [['date', 'quand sort', 'quand ouvr', 'quand commence', 'sortie', 'lancement', 'drop', 'heure', 'ouverture', 'decembre'], "Le lancement a lieu le mardi 1er décembre 2026 à 19 h, heure suisse. Les membres y ont accès avant le public : 72 h pour Signature, 48 h pour Founders."],
    [['livr', 'livraison quand', 'delai', 'expedition', 'recevoir', 'semaine'], "C'est une précommande : livraison en Suisse 4 à 6 semaines après l'ouverture."],
    [['paiement', 'payer', 'twint', 'carte bancaire', 'visa', 'mastercard'], "Paiement par carte ou TWINT. Les prix sont en CHF."],
    [['taille', 'mesure', 'coupe', 'grand', 'petit', 'guide'], "Le cardigan existe en S, M et L. Tour de poitrine : S 91-95 cm, M 96-100 cm, L 101-105 cm. Entre deux tailles, prenez la plus grande pour une coupe aisée. Le guide complet est sur la page du cardigan."],
    [['matiere', 'laine', 'merinos', 'composition', 'tissu', 'qualite', 'lavage', 'laver', 'entretien'], "Le Cardigan Noce est en 100 % laine mérinos extrafine, maille unie couleur chocolat, zip métal double sens, col montant côtelé."],
    [['cardigan', 'piece', 'produit', 'nc-01', 'exemplaire', '50 pieces', 'combien de pieces'], "Le Cardigan Noce (NC-01) est édité à 50 exemplaires, chacun numéroté sur son étiquette, de N° 01 / 50 à N° 50 / 50. Prix : CHF 139."],
    [['diner', 'soiree', 'evenement', 'restaurant', 'geneve', 'rencontre'], "Signature donne accès à des dîners privés dans les restaurants les plus prisés de Genève, à des soirées privées et aux rencontres entre membres. Les repas et soirées sont payants séparément. Les fondateurs ont 10 % de réduction."],
    [['voyage', 'trip', 'acompte'], "Les membres Signature ont un accès prioritaire aux voyages NOCELLI. Chaque membre paie sa part ; les fondateurs ont 10 % de réduction. Acompte non remboursable à la réservation."],
    [['annuler', 'resilier', 'arreter', 'remboursement', 'rembourse', 'renouvellement'], "Signature dure un an dès le paiement et se renouvelle automatiquement. Vous pouvez l'annuler à tout moment depuis votre espace membre ; l'accès reste ouvert jusqu'à la fin de la période."],
    [['invitation', 'prive', 'autre carte', 'troisieme', 'secrete'], "Au-delà de ces deux cartes, une autre. Elle ne se demande pas."],
    [['inscri', 'liste', 'newsletter', 'prevenu', 'alerte'], "Inscrivez-vous à la liste privée sur la page d'accueil pour être prévenu avant l'ouverture."],
    [['compte', 'connexion', 'connecter', 'espace membre', 'mot de passe'], "Votre espace membre se trouve sur la page « Mon compte ». La connexion se fait par un lien envoyé à votre e-mail."],
    [['vote', 'voter'], "Les membres Founders et Signature votent sur les futures collections."],
    [['bonjour', 'salut', 'hello', 'merci'], "Bonjour. Posez votre question sur la pièce, le club, la livraison ou les tailles."]
  ];
  function norm(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 -]/g, ' '); }
  function repondre(q) {
    var n = ' ' + norm(q) + ' ', best = null, score = 0;
    R.forEach(function (r) {
      var s = 0; r[0].forEach(function (m) { if (n.indexOf(norm(m)) >= 0) s += m.length; });
      if (s > score) { score = s; best = r[1]; }
    });
    return best || "Je n'ai pas la réponse à cette question. Écrivez-nous sur Instagram, @nocelli.ch, nous vous répondrons.";
  }
  hote.innerHTML = '<form class="as-f" autocomplete="off"><label class="eyebrow" for="as-q">Une question ?</label>' +
    '<div class="as-l"><input id="as-q" type="text" placeholder="Livraison, tailles, Signature…" maxlength="200"><button type="submit" aria-label="Demander">→</button></div></form>' +
    '<p class="as-r" aria-live="polite"></p>';
  var st = document.createElement('style');
  st.textContent = '#assistant{display:grid;gap:14px;max-width:380px}' +
    '#assistant .as-f{display:grid;gap:10px}' +
    '#assistant .as-l{display:flex;border-bottom:1px solid var(--noce,#3A2519)}' +
    '#assistant input{flex:1;min-width:0;border:0;background:none;font:inherit;font-size:15px;padding:10px 0;color:inherit;outline:none}' +
    '#assistant button{border:0;background:none;font-size:18px;cursor:pointer;color:inherit;padding:0 4px}' +
    '#assistant .as-r{font-family:"Bodoni Moda",serif;font-style:italic;font-size:16px;line-height:1.55;color:rgba(58,37,25,.88);min-height:0}' +
    '#assistant .as-r:empty{display:none}';
  document.head.appendChild(st);
  var champ = hote.querySelector('input'), sortie = hote.querySelector('.as-r');
  hote.querySelector('form').addEventListener('submit', function (e) {
    e.preventDefault();
    var q = champ.value.trim(); if (!q) return;
    sortie.textContent = repondre(q);
  });
  window.NocelliAssistant = { repondre: repondre };
})();
