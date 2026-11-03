// Assistant NOCELLI : répond seul, à partir de tout ce qui est écrit sur le site.
// - Lit en direct les pages du site (accueil, cardigan, club) : tableaux de mesures, matière, FAQ, cartes du club.
// - Calcule : taille conseillée à partir des mesures du client (cm, m, kg, pouces), aisance, longueurs,
//   compte à rebours, dates de livraison, totaux, conversion CHF → EUR (taux du jour, service gratuit).
// - Garde le fil de la conversation (mesures déjà données, « et en L ? », « pourquoi ? »).
// - Si le site n'a pas la réponse à une question générale : cherche sur Wikipédia (gratuit), sinon propose une recherche web.
// - Répond en français, anglais ou italien (langue du site ou de la question).
// Aucun service payant, aucune clé.
(function () {
  'use strict';

  /* ------------------------------------------------------------------ langue */
  var LANG = 'fr';
  try { LANG = (location.search.match(/[?&]lang=(fr|en|it)\b/) || [])[1] || localStorage.getItem('nocelli-langue') || 'fr'; } catch (e) {}
  if (!/^(fr|en|it)$/.test(LANG)) LANG = 'fr';
  var L = LANG; // langue de la réponse en cours
  function t(fr, en, it) { return L === 'en' ? en : L === 'it' ? it : fr; }
  function tu(fr, en, it) { return LANG === 'en' ? en : LANG === 'it' ? it : fr; } // textes de l'interface
  var LOC = { fr: 'fr-CH', en: 'en-GB', it: 'it-CH' };

  function sansAccents(s) { return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function norm(s) { return sansAccents(s).replace(/[’']/g, ' ').replace(/[^a-z0-9/ -]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function nombre(x) { var r = Math.round(x * 10) / 10; return L === 'en' ? String(r) : String(r).replace('.', ','); }

  function detecterLangue(q) {
    var w = ' ' + norm(q) + ' ', s = { fr: 0, en: 0, it: 0 };
    var M = {
      en: ['the', 'is', 'what', 'how', 'which', 'when', 'do', 'does', 'you', 'my', 'i', 'can', 'much', 'size', 'shipping', 'wool', 'are', 'it', 'of', 'chest', 'should', 'price', 'hello', 'hi', 'thanks', 'deliver', 'where', 'who', 'and', 'tall', 'am', 'have', 'fit', 'will', 'there'],
      it: ['il', 'che', 'come', 'quando', 'quanto', 'quanta', 'taglia', 'spedizione', 'lana', 'sono', 'cosa', 'posso', 'mio', 'della', 'per', 'non', 'ciao', 'grazie', 'qual', 'costa', 'ho', 'si', 'del', 'gli', 'questo', 'quale', 'alto', 'peso', 'consegna', 'buongiorno', 'dove', 'misura', 'anche', 'uscita', 'spedite', 'spedire', 'consegnate', 'avete', 'fate', 'vorrei', 'buonasera'],
      fr: ['le', 'les', 'est', 'quelle', 'quel', 'comment', 'quand', 'combien', 'taille', 'livraison', 'laine', 'je', 'vous', 'mon', 'des', 'du', 'pour', 'c', 'bonjour', 'merci', 'ou', 'pas', 'fais', 'mesure', 'suis', 'j', 'ai', 'une', 'et', 'sur', 'qui', 'quoi', 'avez', 'vos', 'sort', 'prendre']
    };
    Object.keys(M).forEach(function (l) { M[l].forEach(function (m) { if (w.indexOf(' ' + m + ' ') >= 0) s[l]++; }); });
    var best = Object.keys(s).sort(function (a, b) { return s[b] - s[a]; })[0];
    var autres = Object.keys(s).filter(function (l) { return l !== best; });
    if (s[best] >= 1 && s[best] > s[autres[0]] && s[best] > s[autres[1]]) return best;
    return null;
  }

  /* ------------------------------------------------------------------ faits (valeurs de secours ; remplacées par celles lues sur le site) */
  var F = {
    prix: 139, edition: 50, signature: 290,
    drop: new Date('2026-12-01T19:00:00+01:00'),
    livraison: [4, 6],
    email: 'maison.nocelli@gmail.com',
    insta: 'https://www.instagram.com/nocelli.ch',
    corps: { poitrine: { S: [91, 95], M: [96, 100], L: [101, 105] }, epaules: { S: [41, 43], M: [43, 45], L: [45, 47] }, bras: { S: [60, 63], M: [62, 65], L: [64, 67] }, hauteur: { S: [168, 178], M: [175, 185], L: [182, 192] } },
    vet: { poitrine: { S: 101, M: 106, L: 111 }, taille: { S: 93, M: 98, L: 103 }, bas: { S: 88, M: 93, L: 98 }, epaules: { S: 42.5, M: 44, L: 45.5 }, manche: { S: 63, M: 64, L: 65 }, longueur: { S: 62, M: 64, L: 66 }, biceps: { S: 33.4, M: 35, L: 36.6 }, col: { S: 7, M: 7, L: 7 } },
    club: null // lu sur club.html
  };
  var TAILLES = ['S', 'M', 'L'];
  var NOMS_VET = {
    poitrine: ['tour de poitrine', 'chest', 'giro petto'], taille: ['tour de taille', 'waist', 'giro vita'], bas: ['tour du bas', 'hem', 'giro fondo'],
    epaules: ["largeur d'épaules", 'shoulder width', 'larghezza spalle'], manche: ['longueur de manche', 'sleeve length', 'lunghezza manica'],
    longueur: ["longueur, du haut de l'épaule", 'length, from top of shoulder', 'lunghezza, dalla spalla'], biceps: ['tour de biceps', 'bicep', 'giro bicipite'], col: ['hauteur du col', 'collar height', 'altezza collo']
  };
  function nomVet(k) { var n = NOMS_VET[k]; return t(n[0], n[1], n[2]); }

  /* ------------------------------------------------------------------ lecture du site */
  var PAGES = [
    { url: 'index.html', fr: 'Accueil', en: 'Home', it: 'Home' },
    { url: 'cardigan-noce.html', fr: 'Le Cardigan Noce', en: 'The Noce Cardigan', it: 'Il Cardigan Noce' },
    { url: 'club.html', fr: 'Private Club', en: 'Private Club', it: 'Private Club' }
  ];
  var unites = [], pret = null, foundersOuvert = true;

  function traduire(s, l) {
    var api = window.NocelliLangue;
    if (!api || !api.traduire || l === 'fr') return null;
    return api.traduire(s, l);
  }
  function texteTraduit(el, l) { // traduit nœud par nœud avec le dictionnaire du site
    if (l === 'fr') return propre(el.textContent);
    var w = el.ownerDocument.createTreeWalker(el, 4), n, out = [], ok = false;
    while ((n = w.nextNode())) { var v = n.nodeValue; if (!v.trim()) { out.push(v); continue; } var tr = traduire(v, l); if (tr) ok = true; out.push(tr || v); }
    return ok ? propre(out.join('')) : null;
  }
  function propre(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function nums(s) { return (String(s).match(/\d+(?:[.,]\d+)?/g) || []).map(function (x) { return parseFloat(x.replace(',', '.')); }); }

  function lireTableaux(doc) {
    [].forEach.call(doc.querySelectorAll('tr'), function (tr) {
      var c = tr.querySelectorAll('td,th'); if (c.length < 4) return;
      var nom = norm(c[0].textContent), v = [1, 2, 3].map(function (i) { return propre(c[i].textContent); });
      if (/^(s|m|l)$/i.test(v[0])) return;
      var plage = v.every(function (x) { return / à |-|–/.test(x) && nums(x).length === 2; });
      var simple = v.every(function (x) { return nums(x).length === 1; });
      function pose(obj, k) { obj[k] = {}; TAILLES.forEach(function (T, i) { obj[k][T] = plage ? nums(v[i]) : nums(v[i])[0]; }); }
      if (plage) {
        if (/poitrine/.test(nom)) pose(F.corps, 'poitrine');
        else if (/epaule/.test(nom)) pose(F.corps, 'epaules');
        else if (/bras/.test(nom)) pose(F.corps, 'bras');
        else if (/votre taille|hauteur|stature/.test(nom)) pose(F.corps, 'hauteur');
      } else if (simple) {
        if (/poitrine/.test(nom)) pose(F.vet, 'poitrine');
        else if (/tour de taille/.test(nom)) pose(F.vet, 'taille');
        else if (/tour du bas/.test(nom)) pose(F.vet, 'bas');
        else if (/epaule/.test(nom) && /largeur/.test(nom)) pose(F.vet, 'epaules');
        else if (/manche/.test(nom)) pose(F.vet, 'manche');
        else if (/longueur/.test(nom)) pose(F.vet, 'longueur');
        else if (/biceps/.test(nom)) pose(F.vet, 'biceps');
        else if (/col/.test(nom)) pose(F.vet, 'col');
      }
    });
  }
  function lireClub(doc) {
    function carte(id) {
      var a = doc.getElementById(id); if (!a) return null;
      var li = [].map.call(a.querySelectorAll('li'), function (x) { return x; });
      var desc = [].map.call(a.querySelectorAll('.desc'), function (x) { return x; });
      var prix = a.querySelector('.prix');
      return { li: li, desc: desc, prix: prix };
    }
    var f = carte('f-founders'), s = carte('f-signature');
    if (f || s) F.club = { founders: f, signature: s };
    var p = doc.querySelector('#f-signature .prix'); if (p && nums(p.textContent)[0]) F.signature = nums(p.textContent)[0];
  }
  function lirePrix(doc) {
    var el = doc.querySelector('.prix, .fiche .prix, [data-prix]');
    var m = el && el.textContent.match(/CHF\s*(\d+)/); if (m && doc.getElementById('guide-taille') !== undefined) F.prix = parseInt(m[1], 10) || F.prix;
  }

  function indexer(doc, page) {
    var racine = doc.body; if (!racine) return;
    var vus = {};
    var sel = 'h1,h2,h3,p,li,details,dt,dd,tr,figcaption,blockquote';
    [].forEach.call(racine.querySelectorAll(sel), function (el) {
      if (el.closest('nav,.nav,.menu,footer,script,style,#assistant,.as-volet,.langues')) return;
      if (el.closest('details') && el.tagName !== 'DETAILS') return; // la question/réponse est prise en bloc
      if (el.tagName === 'P' && el.closest('li,td,th,dd')) return;
      if (el.tagName === 'LI' && el.querySelector('p,li')) return;
      var fond = !!el.closest('[data-founders]');
      var q = null, txt, el2 = el;
      if (el.tagName === 'DETAILS') {
        var su = el.querySelector('summary'); if (!su) return;
        q = propre(su.textContent);
        el2 = el.querySelector('.rep') || el; txt = propre(el2.textContent).replace(q, '').trim();
        if (el2 === el) txt = propre(el.textContent.replace(su.textContent, ''));
      } else if (el.tagName === 'TR') {
        var c = [].map.call(el.querySelectorAll('td,th'), function (x) { return propre(x.textContent); }).filter(Boolean);
        if (c.length < 2) return; txt = c.join(' · ');
      } else txt = propre(el.textContent);
      if (!txt || (txt.length < 18 && !/^H/.test(el.tagName)) || vus[txt]) return;
      vus[txt] = 1;
      var titre = '', p2 = el;
      var sec = el.closest('section,[id],.modal,dialog,.guide');
      if (sec) { var h = sec.querySelector('h2,h3'); if (h) titre = propre(h.textContent); }
      var ancre = sec && sec.id ? '#' + sec.id : '';
      var trad = {};
      if (el.tagName !== 'TR') { ['en', 'it'].forEach(function (l) { var x = texteTraduit(el2, l); if (x && q) x = x.replace(propre(traduire(q, l) || q), '').trim(); trad[l] = x; }); }
      var qtr = q ? { en: traduire(q, 'en'), it: traduire(q, 'it') } : {};
      unites.push({ page: page, ancre: ancre, titre: titre, q: q, qtr: qtr, txt: txt, trad: trad, titreTag: /^H/.test(el.tagName), fond: fond, tok: null });
    });
  }

  function chargerSite() {
    if (pret) return pret;
    var ici = (location.pathname.split('/').pop() || 'index.html');
    if (window.NOCELLI_FOUNDERS_OUVERT === false || document.documentElement.classList.contains('fondateurs-fermes')) foundersOuvert = false;
    var docs = PAGES.map(function (p) {
      // la page affichée est aussi relue depuis le serveur : son texte d'origine (français) sert à la traduction
      return fetch(new URL(p.url, location.href).href, { credentials: 'same-origin' })
        .then(function (r) { if (!r.ok) throw 0; return r.text(); })
        .then(function (h) { return { p: p, doc: new DOMParser().parseFromString(h, 'text/html') }; })
        .catch(function () { return p.url === ici && LANG === 'fr' ? { p: p, doc: document } : null; });
    });
    var offre = (window.NOCELLI_FOUNDERS_OUVERT === undefined)
      ? fetch(new URL('club/offre.js', location.href).href).then(function (r) { return r.ok ? r.text() : ''; }).then(function (s) { if (/NOCELLI_FOUNDERS_OUVERT\s*=\s*false/.test(s)) foundersOuvert = false; }).catch(function () {})
      : Promise.resolve();
    pret = Promise.all(docs.concat([offre])).then(function (rs) {
      rs.forEach(function (r) {
        if (!r || !r.doc) return;
        if (r.p.url === 'cardigan-noce.html') { lireTableaux(r.doc); lirePrix(r.doc); }
        if (r.p.url === 'index.html' && !rs.some(function (x) { return x && x.p && x.p.url === 'cardigan-noce.html'; })) lireTableaux(r.doc);
        if (r.p.url === 'club.html') lireClub(r.doc);
        indexer(r.doc, r.p);
      });
      if (!unites.length) indexer(document, { url: ici, fr: document.title, en: document.title, it: document.title });
      unites.forEach(function (u) {
        u.tok = jetons([u.q || '', u.qtr.en || '', u.qtr.it || '', u.q ? '' : u.titre, u.txt, u.trad.en || '', u.trad.it || ''].join(' '));
      });
      calcIdf();
    });
    return pret;
  }

  /* ------------------------------------------------------------------ recherche dans le site (BM25 + synonymes FR/EN/IT) */
  var VIDES = ('a au aux avec ce ces cet cette dans de des du elle en est et il ils je la le les leur lui ma mais me mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous y c d j l m n s t est-ce quoi quel quelle quels quelles comment combien quand pourquoi ou est-il fait faire peut peux puis-je avez avoir etre suis sont sera ca cela ' +
    'the a an and or of to in on for is are was be it its this that what which how when why where who do does did can could would should will my your you i me we our with at by from as if any there their have has much many ' +
    'il lo la i gli le un una uno di da del della dei delle e o per con su che chi come quando perche dove cosa qual quale quanto quanta sono sei e ho hai ha mi ti si ci vi non mio mia tuo vostro nostro al alla ai alle nel nella').split(' ');
  var VID = {}; VIDES.forEach(function (w) { VID[w] = 1; });
  var GROUPES = [
    'laine merinos wool lana matiere material materiale composition tissu fabric fibre fiber micron microns',
    'livraison livrer livre delivery deliver shipping ship spedizione consegna expedition envoi colis recevoir receive ricevere',
    'prix price prezzo cout cost costo chf tarif',
    'taille tailles size sizes taglia taglie',
    'paiement payer pay payment pagamento pagare twint carte-bancaire',
    'retour retourner return reso echange exchange cambio rembourse remboursement refund rimborso',
    'club membre membres member members membro membri adhesion',
    'voyage voyages trip trips travel viaggio viaggi',
    'diner diners dinner dinners cena cene restaurant restaurants ristorante',
    'soiree soirees evening evenings serata serate evenement evenements event events evento eventi',
    'lavage laver wash washing lavaggio lavare entretien care',
    'col collar collo',
    'zip fermeture zipper cerniera curseur',
    'manche manches sleeve sleeves manica maniche',
    'poche poches pocket pockets tasca tasche',
    'numero numerote numerotee number numbered numerato etiquette label etichetta',
    'annuler annulation cancel annullare resilier renouvellement renewal rinnovo',
    'carte cartes card cards tessera',
    'fondateur fondateurs founders founder fondatori',
    'sortie release lancement launch ouverture opening apertura drop uscita',
    'precommande preorder preordine commande order ordine commander acheter buy comprare achat',
    'boulochage pilling feutrage felting',
    'couleur coloris color colour colore chocolat chocolate cioccolato',
    'coupe fit vestibilita ajuste'
  ];
  var SYN = {};
  GROUPES.forEach(function (g, i) { g.split(' ').forEach(function (w) { SYN[racine(w)] = 'g' + i; }); });
  function racine(w) {
    w = w.replace(/(ements|ement)$/, '').replace(/(s|x)$/, '');
    if (w.length > 5) w = w.replace(/e$/, '');
    return w;
  }
  function jetons(s) {
    return norm(s).split(/[ /-]+/).filter(function (w) { return w && !VID[w] && (w.length > 1 || /\d/.test(w)); }).map(function (w) { var r = racine(w); return SYN[r] || r; });
  }
  var IDF = {}, LMOY = 1;
  function calcIdf() {
    var df = {}, tot = 0;
    unites.forEach(function (u) { tot += u.tok.length; var vu = {}; u.tok.forEach(function (w) { if (!vu[w]) { vu[w] = 1; df[w] = (df[w] || 0) + 1; } }); });
    var N = unites.length || 1; LMOY = tot / N || 1;
    Object.keys(df).forEach(function (w) { IDF[w] = Math.log(1 + (N - df[w] + 0.5) / (df[w] + 0.5)); });
  }
  function chercher(q) {
    var qt = jetons(q); if (!qt.length) return [];
    var uq = {}; qt.forEach(function (w) { uq[w] = 1; }); qt = Object.keys(uq);
    var res = unites.filter(function (u) { return !(u.fond && !foundersOuvert) && !u.titreTag; }).map(function (u) {
      var tf = {}; u.tok.forEach(function (w) { tf[w] = (tf[w] || 0) + 1; });
      var s = 0, hit = 0;
      qt.forEach(function (w) { if (tf[w]) { hit++; var f = tf[w]; s += (IDF[w] || 0) * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * u.tok.length / LMOY)); } });
      if (u.q) { var qq = jetons(u.q + ' ' + (u.qtr.en || '') + ' ' + (u.qtr.it || '')); qt.forEach(function (w) { if (qq.indexOf(w) >= 0) s += 1.2; }); }
      return { u: u, s: s * (hit / qt.length + 0.3), hit: hit };
    }).filter(function (r) { return r.hit > 0; });
    res.sort(function (a, b) { return b.s - a.s; });
    return res;
  }
  function lienPage(u) { return { h: u.page.url + u.ancre, l: t('Voir : ', 'See: ', 'Vedi: ') + (u.titre && u.titre.length < 40 ? traduireSi(u.titre) : u.page[L]).replace(/[.\s]+$/, '') }; }
  function traduireSi(s) { return (L !== 'fr' && traduire(s, L)) || s; }
  function texteUnite(u) {
    var tx = L === 'fr' ? u.txt : (u.trad[L] || null);
    if (!tx) return { t: u.txt, fr: true };
    return { t: tx, fr: false };
  }

  /* ------------------------------------------------------------------ mémoire de la conversation */
  var ctx = { profil: {}, pref: null, dernier: null, taille: null, pourquoi: null, tour: 0 };

  /* ------------------------------------------------------------------ mesures dans la question */
  function lireMesures(q) {
    var s = ' ' + sansAccents(q).replace(/[’]/g, "'") + ' ', out = {}, pris = [];
    function marque(a, b) { pris.push([a, b]); }
    function libre(a) { return !pris.some(function (p) { return a >= p[0] && a < p[1]; }); }
    var m, re;
    re = /\b([12])\s*(?:m|metres?|meters?|metri|mt)\s*(\d{1,2})\b/g;
    while ((m = re.exec(s))) { out.hauteur = 100 * +m[1] + (m[2].length === 1 ? 10 * +m[2] : +m[2]); marque(m.index, m.index + m[0].length); }
    re = /\b([12])[.,](\d{1,2})\s*(?:m|metres?|meters?|metri)?\b/g;
    while ((m = re.exec(s))) { if (!libre(m.index)) continue; var v = 100 * +m[1] + (m[2].length === 1 ? 10 * +m[2] : +m[2]); if (v >= 140 && v <= 215) { out.hauteur = v; marque(m.index, m.index + m[0].length); } }
    re = /\b([4-7])\s*(?:'|ft|feet|foot|pieds?)\s*(\d{1,2})?\s*(?:"|''|in\b|inches)?/g;
    while ((m = re.exec(s))) { if (!libre(m.index)) continue; out.hauteur = Math.round((+m[1] * 12 + (+m[2] || 0)) * 2.54); marque(m.index, m.index + m[0].length); }
    var KW = {
      poitrine: /poitrine|torse|thorax|pector|chest|bust|petto|torace/g,
      epaules: /epaule|shoulder|spall/g,
      bras: /\bbras\b|\barms?\b|bracci|arm length/g,
      tourTaille: /tour de taille|\bwaist|\bvita\b|giro vita|ventre|belly|pancia/g,
      hauteur: /je mesure|\bmesure\b|\bgrand\b|height|\btall\b|\balt[oa]\b|altezza|statura|hauteur|i am \d|i m \d/g,
      poids: /poids|\bpese|\bkg\b|kilo|weigh|\bpeso\b|\blbs?\b|pounds|livres/g
    };
    var pos = {};
    Object.keys(KW).forEach(function (k) { pos[k] = []; var r = KW[k], x; r.lastIndex = 0; while ((x = r.exec(s))) pos[k].push([x.index, x.index + x[0].length]); });
    // « tour de taille » ne doit pas compter comme hauteur, etc. : déjà séparé par les mots-clés.
    re = /(\d+(?:[.,]\d+)?)\s*(cm|centimetres?|centimeters?|centimetri|mm|kg|kilos?|kilogrammes?|chili|lbs?|pounds?|livres|inch(?:es)?|in\b|pouces?|pollici|"|m\b|metres?)?/g;
    var prev = 0;
    while ((m = re.exec(s))) {
      var a = m.index, b = a + m[0].length;
      if (!libre(a)) { prev = b; continue; }
      var val = parseFloat(m[1].replace(',', '.')), u = m[2] || '';
      if (/^(\d{4})$/.test(m[1]) && val > 1900) { prev = b; continue; } // une année
      if (/^mm$/.test(u)) val /= 10;
      if (/^(inch|in$|pouce|pollic|")/.test(u)) val *= 2.54;
      if (/^(m$|metre)/.test(u) && val < 3) val *= 100;
      if (/^(lb|pound|livre)/.test(u)) { val *= 0.4536; u = 'kg'; }
      var champ = null, dmin = 99;
      if (/^(kg|kilo|chili)/.test(u)) champ = 'poids';
      else Object.keys(pos).forEach(function (k) {
        pos[k].forEach(function (p) {
          var d = p[1] <= a ? a - p[1] : p[0] >= b ? p[0] - b + 6 : 99;
          if (p[1] <= a && p[1] < prev - 2) d = 99; // mot-clé qui appartient au nombre précédent
          if (d < dmin && d < 45) { dmin = d; champ = k; }
        });
      });
      if (!champ) {
        if (val >= 145 && val <= 215) champ = 'hauteur';
        else if (val >= 76 && val <= 140 && !/kg/.test(u)) champ = 'poitrine';
      }
      if (champ === 'poids' && !(val >= 35 && val <= 200)) champ = null;
      if (champ === 'hauteur' && !(val >= 140 && val <= 215)) champ = null;
      if (champ === 'poitrine' && !(val >= 60 && val <= 150)) champ = null;
      if (champ === 'epaules' && !(val >= 30 && val <= 60)) champ = null;
      if (champ === 'bras' && !(val >= 45 && val <= 80)) champ = null;
      if (champ === 'tourTaille' && !(val >= 55 && val <= 140)) champ = null;
      if (champ) out[champ] = Math.round(val * 10) / 10;
      prev = b;
    }
    return out;
  }
  function lirePref(n) {
    if (/pres du corps|ajuste|cintre|serre|slim|fitted|close fit|tight|snug|aderent|attillat|t-shirt|tshirt|t shirt/.test(n)) return 'pres';
    if (/ample|a l aise|large|chemise|col roule|par dessus|superpos|loose|relaxed|roomy|over a shirt|layer|comod|largo|camicia|dolcevita|sopra|oversize/.test(n)) return 'ample';
    return null;
  }
  function tailleHabituelle(n) {
    var m = n.match(/(?:je (?:fais|porte|prends|suis)|d habitude|normalement|habituellement|en general|i (?:wear|take|am|usually wear)|usually|normally|di solito|porto|prendo) (?:du |un |une |en |a |size |taglia |la |il )?(xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl)\b/);
    return m ? m[1].toUpperCase() : null;
  }
  function lettresTaille(q) {
    var out = [], m;
    var re = /(^|[^A-Za-z'’0-9])(XXL|XL|XS|S|M|L)(?![A-Za-z'’])/g;
    while ((m = re.exec(q))) { if (/^[A-Z]+$/.test(m[2])) out.push(m[2]); }
    var n = ' ' + sansAccents(q).replace(/[’']/g, "'") + ' ';
    var re2 = /(?:\b(?:en|le|du|un|taille|size|taglia|in|the|a|et|ou|or|o|vs|entre|and|e|la|une|il)\s+)(xxl|xl|xs|s|m|l)(?=[\s?,.!;:)]|$)/g;
    while ((m = re2.exec(n))) out.push(m[1].toUpperCase());
    var u = {}; return out.filter(function (x) { if (u[x]) return false; u[x] = 1; return true; });
  }

  /* ------------------------------------------------------------------ calcul de la taille */
  function tailleParPlage(tab, v) {
    if (v < tab.S[0]) return 'S-';
    if (v > tab.L[1]) return 'L+';
    var res = TAILLES.filter(function (T) { return v >= tab[T][0] - 0.5 && v <= tab[T][1] + 0.5; });
    if (res.length === 1) return res[0];
    if (res.length > 1) return res.join('/');
    // dans un trou entre deux plages
    for (var i = 0; i < 2; i++) if (v > tab[TAILLES[i]][1] && v < tab[TAILLES[i + 1]][0]) return TAILLES[i] + '/' + TAILLES[i + 1];
    return null;
  }
  function conseiller(p, pref) {
    var C = F.corps, V = F.vet, lignes = [], pourquoi = [], choix = null, alt = null;
    if (p.poitrine) {
      var c = p.poitrine, r = tailleParPlage(C.poitrine, c);
      if (r === 'S-') { choix = 'S'; }
      else if (r === 'L+') { choix = 'L'; }
      else if (r.indexOf('/') > 0) { var d2 = r.split('/'); choix = pref === 'pres' ? d2[0] : d2[1]; alt = pref ? null : d2[0]; if (!pref) choix = d2[1]; }
      else choix = r;
      var ais = V.poitrine[choix] - c;
      pourquoi.push(t('Votre poitrine fait ' + nombre(c) + ' cm. Le ' + choix + ' mesure ' + nombre(V.poitrine[choix]) + ' cm de tour : ' + nombre(ais) + ' cm d\'aisance (la coupe prévue en laisse 6 à 10).',
        'Your chest is ' + nombre(c) + ' cm. The ' + choix + ' measures ' + nombre(V.poitrine[choix]) + ' cm around: ' + nombre(ais) + ' cm of ease (the intended fit leaves 6 to 10).',
        'Il suo petto misura ' + nombre(c) + ' cm. La ' + choix + ' misura ' + nombre(V.poitrine[choix]) + ' cm di giro: ' + nombre(ais) + ' cm di agio (la vestibilità prevista ne lascia da 6 a 10).'));
      if (r === 'S-') lignes.push(t('Le S est la plus petite taille ; il vous laissera ' + nombre(ais) + ' cm d\'aisance, donc un tombé un peu plus souple que prévu.', 'S is the smallest size; it will leave you ' + nombre(ais) + ' cm of ease, so a slightly softer fit than intended.', 'La S è la taglia più piccola; le lascerà ' + nombre(ais) + ' cm di agio, quindi una vestibilità un po\' più morbida del previsto.'));
      if (r === 'L+') lignes.push(ais < 4
        ? t('Attention : le L est la plus grande taille et ne laisse que ' + nombre(ais) + ' cm d\'aisance. Il sera très près du corps, peut-être trop. Écrivez-nous avant de commander.', 'Careful: L is the largest size and leaves only ' + nombre(ais) + ' cm of ease. It will be very close-fitting, maybe too tight. Write to us before ordering.', 'Attenzione: la L è la taglia più grande e lascia solo ' + nombre(ais) + ' cm di agio. Sarà molto aderente, forse troppo. Ci scriva prima di ordinare.')
        : t('Le L est la plus grande taille ; il sera bien ajusté sur vous.', 'L is the largest size; it will fit you closely.', 'La L è la taglia più grande; le starà ben aderente.'));
      if (alt) {
        var ais2 = V.poitrine[alt] - c;
        lignes.push(t('Vous êtes entre le ' + alt + ' et le ' + choix + '. Le ' + alt + ' (' + nombre(ais2) + ' cm d\'aisance) pour une coupe nette sur un t-shirt ; le ' + choix + ' (' + nombre(ais) + ' cm) pour le porter sur une chemise ou un col roulé.',
          'You are between ' + alt + ' and ' + choix + '. ' + alt + ' (' + nombre(ais2) + ' cm of ease) for a clean fit over a T-shirt; ' + choix + ' (' + nombre(ais) + ' cm) to wear it over a shirt or a roll-neck.',
          'È tra la ' + alt + ' e la ' + choix + '. La ' + alt + ' (' + nombre(ais2) + ' cm di agio) per una linea pulita su una t-shirt; la ' + choix + ' (' + nombre(ais) + ' cm) per portarlo su una camicia o un dolcevita.'));
      }
    } else if (p.hauteur) {
      var h = p.hauteur, rh = tailleParPlage(C.hauteur, h), cand;
      if (rh === 'S-') cand = ['S']; else if (rh === 'L+') cand = ['L']; else cand = rh.split('/');
      if (cand.length > 1 && p.poids) { var imc = p.poids / Math.pow(h / 100, 2); choix = imc < 23.5 ? cand[0] : cand[cand.length - 1]; }
      else if (cand.length > 1) choix = pref === 'pres' ? cand[0] : cand[cand.length - 1];
      else choix = cand[0];
      if (p.poids) { var imc2 = p.poids / Math.pow(h / 100, 2); if (imc2 >= 26 && choix !== 'L') choix = TAILLES[TAILLES.indexOf(choix) + 1]; if (imc2 < 19 && choix !== 'S' && cand.length === 1) choix = TAILLES[TAILLES.indexOf(choix) - 1]; }
      pourquoi.push(t('Pour ' + nombre(h) + ' cm' + (p.poids ? ' et ' + nombre(p.poids) + ' kg' : '') + ', le guide indique plutôt le ' + choix + '.', 'For ' + nombre(h) + ' cm' + (p.poids ? ' and ' + nombre(p.poids) + ' kg' : '') + ', the guide points to ' + choix + '.', 'Per ' + nombre(h) + ' cm' + (p.poids ? ' e ' + nombre(p.poids) + ' kg' : '') + ', la guida indica piuttosto la ' + choix + '.'));
      lignes.push(t('C\'est une estimation : la poitrine décide. Mesurez votre tour de poitrine sous les bras et donnez-le-moi, je vous confirme la taille au centimètre.', 'This is an estimate: the chest decides. Measure your chest under the arms and tell me, I will confirm the size to the centimetre.', 'È una stima: decide il petto. Misuri il giro petto sotto le braccia e me lo dica, le confermo la taglia al centimetro.'));
    } else return null;

    var ic = TAILLES.indexOf(choix), plus = null;
    if (p.epaules) {
      var re = tailleParPlage(C.epaules, p.epaules), te = re === 'S-' ? 'S' : re === 'L+' ? 'L' : re.split('/').pop();
      var ie = TAILLES.indexOf(re.split('/')[0] === 'S-' ? 'S' : re.split('/')[0].replace('L+', 'L'));
      if (ie > ic) plus = TAILLES[Math.min(2, ic + 1)];
      if (ie > ic) lignes.push(t('Vos épaules (' + nombre(p.epaules) + ' cm) sont plus larges que la carrure du ' + choix + ' (' + nombre(V.epaules[choix]) + ' cm) : prenez le ' + TAILLES[Math.min(2, ic + 1)] + ' pour que l\'épaule tombe juste.', 'Your shoulders (' + nombre(p.epaules) + ' cm) are broader than the ' + choix + ' (' + nombre(V.epaules[choix]) + ' cm): take ' + TAILLES[Math.min(2, ic + 1)] + ' so the shoulder sits right.', 'Le sue spalle (' + nombre(p.epaules) + ' cm) sono più larghe della ' + choix + ' (' + nombre(V.epaules[choix]) + ' cm): prenda la ' + TAILLES[Math.min(2, ic + 1)] + ' perché la spalla cada giusta.'));
      else lignes.push(t('Vos épaules (' + nombre(p.epaules) + ' cm) vont bien avec la carrure du ' + choix + ' (' + nombre(V.epaules[choix]) + ' cm).', 'Your shoulders (' + nombre(p.epaules) + ' cm) suit the ' + choix + ' (' + nombre(V.epaules[choix]) + ' cm).', 'Le sue spalle (' + nombre(p.epaules) + ' cm) vanno bene con la ' + choix + ' (' + nombre(V.epaules[choix]) + ' cm).'));
      te = te;
    }
    if (p.bras) {
      var dm = V.manche[choix] - p.bras;
      if (dm < -1 && choix !== 'L') plus = TAILLES[ic + 1];
      if (dm < -1) lignes.push(t('Vos bras (' + nombre(p.bras) + ' cm) sont plus longs que la manche du ' + choix + ' (' + nombre(V.manche[choix]) + ' cm) : la manche s\'arrêtera ' + nombre(-dm) + ' cm avant le poignet. ' + (choix !== 'L' ? 'Le ' + TAILLES[ic + 1] + ' l\'allonge d\'1 cm.' : 'Le L est la plus longue.'), 'Your arms (' + nombre(p.bras) + ' cm) are longer than the ' + choix + ' sleeve (' + nombre(V.manche[choix]) + ' cm): it will stop ' + nombre(-dm) + ' cm short of the wrist. ' + (choix !== 'L' ? TAILLES[ic + 1] + ' adds 1 cm.' : 'L is the longest.'), 'Le sue braccia (' + nombre(p.bras) + ' cm) sono più lunghe della manica della ' + choix + ' (' + nombre(V.manche[choix]) + ' cm): si fermerà ' + nombre(-dm) + ' cm prima del polso. ' + (choix !== 'L' ? 'La ' + TAILLES[ic + 1] + ' la allunga di 1 cm.' : 'La L è la più lunga.')));
      else lignes.push(t('La manche du ' + choix + ' (' + nombre(V.manche[choix]) + ' cm) tombera au poignet pour vos bras de ' + nombre(p.bras) + ' cm.', 'The ' + choix + ' sleeve (' + nombre(V.manche[choix]) + ' cm) will reach the wrist for your ' + nombre(p.bras) + ' cm arms.', 'La manica della ' + choix + ' (' + nombre(V.manche[choix]) + ' cm) arriverà al polso per le sue braccia di ' + nombre(p.bras) + ' cm.'));
    }
    if (p.hauteur && p.poitrine) {
      var hp = C.hauteur[choix];
      if (p.hauteur > hp[1] + 1) lignes.push(t('Avec ' + nombre(p.hauteur) + ' cm, le ' + choix + ' (' + nombre(V.longueur[choix]) + ' cm de long) tombera un peu haut, juste au-dessus de la ceinture.', 'At ' + nombre(p.hauteur) + ' cm, the ' + choix + ' (' + nombre(V.longueur[choix]) + ' cm long) will sit a little high, just above the belt.', 'Con ' + nombre(p.hauteur) + ' cm, la ' + choix + ' (' + nombre(V.longueur[choix]) + ' cm di lunghezza) cadrà un po\' alta, appena sopra la cintura.'));
      else if (p.hauteur < hp[0] - 1) lignes.push(t('Avec ' + nombre(p.hauteur) + ' cm, le ' + choix + ' (' + nombre(V.longueur[choix]) + ' cm de long) tombera un peu sous la ceinture.', 'At ' + nombre(p.hauteur) + ' cm, the ' + choix + ' (' + nombre(V.longueur[choix]) + ' cm long) will fall a little below the belt.', 'Con ' + nombre(p.hauteur) + ' cm, la ' + choix + ' (' + nombre(V.longueur[choix]) + ' cm) cadrà un po\' sotto la cintura.'));
      else lignes.push(t('Pour ' + nombre(p.hauteur) + ' cm, la longueur (' + nombre(V.longueur[choix]) + ' cm) tombera à la ceinture, comme prévu.', 'For ' + nombre(p.hauteur) + ' cm, the length (' + nombre(V.longueur[choix]) + ' cm) will fall at the belt, as intended.', 'Per ' + nombre(p.hauteur) + ' cm, la lunghezza (' + nombre(V.longueur[choix]) + ' cm) cadrà alla cintura, come previsto.'));
    }
    if (p.tourTaille) {
      var dt = V.taille[choix] - p.tourTaille;
      if (dt < 2) lignes.push(t('Votre tour de taille (' + nombre(p.tourTaille) + ' cm) est proche de celui du ' + choix + ' (' + nombre(V.taille[choix]) + ' cm) : il sera près du corps à la taille' + (choix !== 'L' ? ', le ' + TAILLES[ic + 1] + ' donnera plus d\'aise.' : '.'), 'Your waist (' + nombre(p.tourTaille) + ' cm) is close to the ' + choix + ' waist (' + nombre(V.taille[choix]) + ' cm): it will be close at the waist' + (choix !== 'L' ? '; ' + TAILLES[ic + 1] + ' gives more room.' : '.'), 'La sua vita (' + nombre(p.tourTaille) + ' cm) è vicina a quella della ' + choix + ' (' + nombre(V.taille[choix]) + ' cm): sarà aderente in vita' + (choix !== 'L' ? '; la ' + TAILLES[ic + 1] + ' darà più agio.' : '.')));
    }
    if (pref && !alt && p.poitrine) {
      var aisC = V.poitrine[choix] - p.poitrine;
      if (pref === 'ample' && aisC <= 8 && choix !== 'L') lignes.push(t('Pour le porter sur une chemise, le ' + TAILLES[ic + 1] + ' vous donnera ' + nombre(V.poitrine[TAILLES[ic + 1]] - p.poitrine) + ' cm d\'aisance.', 'To wear it over a shirt, ' + TAILLES[ic + 1] + ' gives you ' + nombre(V.poitrine[TAILLES[ic + 1]] - p.poitrine) + ' cm of ease.', 'Per portarlo su una camicia, la ' + TAILLES[ic + 1] + ' le darà ' + nombre(V.poitrine[TAILLES[ic + 1]] - p.poitrine) + ' cm di agio.'));
      if (pref === 'pres' && aisC >= 9 && choix !== 'S') lignes.push(t('Pour une coupe très près du corps, le ' + TAILLES[ic - 1] + ' laisse ' + nombre(V.poitrine[TAILLES[ic - 1]] - p.poitrine) + ' cm d\'aisance.', 'For a very close fit, ' + TAILLES[ic - 1] + ' leaves ' + nombre(V.poitrine[TAILLES[ic - 1]] - p.poitrine) + ' cm of ease.', 'Per una vestibilità molto aderente, la ' + TAILLES[ic - 1] + ' lascia ' + nombre(V.poitrine[TAILLES[ic - 1]] - p.poitrine) + ' cm di agio.'));
    }
    if (plus && plus !== choix && !alt) {
      var tete0 = t('Le ' + choix + ' pour votre poitrine, le ' + plus + ' si vous voulez de l\'aise aux épaules et aux bras. Je pencherais pour le ' + plus + '.', choix + ' for your chest, ' + plus + ' if you want room in the shoulders and arms. I would lean towards ' + plus + '.', 'La ' + choix + ' per il petto, la ' + plus + ' se vuole agio a spalle e braccia. Io sceglierei la ' + plus + '.');
      ctx.taille = plus; ctx.pourquoi = pourquoi.join(' ');
      return { t: tete0 + ' ' + pourquoi.join(' ') + '\n' + lignes.join('\n') + '\n' + t('Mesures à confirmer sur les prototypes, tolérance ±1 cm.', 'Measurements to be confirmed on the prototypes, tolerance ±1 cm.', 'Misure da confermare sui prototipi, tolleranza ±1 cm.'), links: [{ h: 'cardigan-noce.html#guide', l: t('Guide des tailles', 'Size guide', 'Guida alle taglie'), guide: true }] };
    }
    var tete = alt ? t('Vous êtes entre deux tailles.', 'You are between two sizes.', 'È tra due taglie.') : t('Je vous conseille le ' + choix + '.', 'I recommend size ' + choix + '.', 'Le consiglio la ' + choix + '.');
    if (alt) pourquoi = [t('Votre poitrine fait ' + nombre(p.poitrine) + ' cm.', 'Your chest is ' + nombre(p.poitrine) + ' cm.', 'Il suo petto misura ' + nombre(p.poitrine) + ' cm.')];
    ctx.taille = choix;
    ctx.pourquoi = pourquoi.join(' ');
    return { t: tete + ' ' + pourquoi.join(' ') + (lignes.length ? '\n' + lignes.join('\n') : '') + '\n' + t('Mesures à confirmer sur les prototypes, tolérance ±1 cm.', 'Measurements to be confirmed on the prototypes, tolerance ±1 cm.', 'Misure da confermare sui prototipi, tolleranza ±1 cm.'), links: [{ h: 'cardigan-noce.html#guide', l: t('Guide des tailles', 'Size guide', 'Guida alle taglie'), guide: true }] };
  }

  /* ------------------------------------------------------------------ dates */
  function parts(d) { var o = {}; new Intl.DateTimeFormat(LOC[L], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Zurich' }).formatToParts(d).forEach(function (p) { o[p.type] = p.value; }); return o; }
  function fmtCourt(d) { var o = parts(d), j = o.day === '1' && L === 'fr' ? '1er' : o.day; return j + ' ' + o.month + ' ' + o.year; }
  function fmtJour(d) { return parts(d).weekday + ' ' + fmtCourt(d); }
  function heureDrop() { return t('19 h, heure suisse', '7 pm Swiss time', 'alle 19, ora svizzera'); }
  function rebours() {
    var ms = F.drop - Date.now();
    if (ms <= 0) return null;
    var j = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), mi = Math.floor(ms % 36e5 / 6e4);
    return t('dans ' + (j ? j + ' jour' + (j > 1 ? 's' : '') + ', ' : '') + h + ' h et ' + mi + ' min', 'in ' + (j ? j + ' day' + (j > 1 ? 's' : '') + ', ' : '') + h + ' h and ' + mi + ' min', 'tra ' + (j ? j + (j > 1 ? ' giorni' : ' giorno') + ', ' : '') + h + ' ore e ' + mi + ' min');
  }
  function plageLivraison() {
    var a = new Date(F.drop.getTime() + F.livraison[0] * 7 * 864e5), b = new Date(F.drop.getTime() + F.livraison[1] * 7 * 864e5);
    return [a, b];
  }

  /* ------------------------------------------------------------------ change CHF → EUR (gratuit, sans clé) */
  var tauxEur = null;
  function taux() {
    if (tauxEur) return Promise.resolve(tauxEur);
    return fetch('https://api.frankfurter.dev/v1/latest?base=CHF&symbols=EUR,USD,GBP').then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .catch(function () { return fetch('https://api.frankfurter.app/latest?from=CHF&to=EUR,USD,GBP').then(function (r) { return r.json(); }); })
      .then(function (j) { tauxEur = j; return j; }).catch(function () { return null; });
  }

  /* ------------------------------------------------------------------ Wikipédia (gratuit) */
  function wiki(q) {
    var mots = norm(q).split(' ').filter(function (w) { return !VID[w] && !/^(qu|est|ce|c|veut|dire|signifie|definition|define|meaning|mean|significa|vuol|dire|explain|explique|spiega|parle|moi|tell|about)$/.test(w); }).join(' ');
    if (!mots) return Promise.resolve(null);
    var base = 'https://' + L + '.wikipedia.org/w/api.php?format=json&origin=*&action=query&generator=search&gsrlimit=1&prop=extracts%7Cinfo&inprop=url&exintro=1&explaintext=1&exsentences=3&gsrsearch=';
    return fetch(base + encodeURIComponent(mots)).then(function (r) { return r.json(); }).then(function (j) {
      var p = j && j.query && j.query.pages; if (!p) return null;
      var k = Object.keys(p)[0], pg = p[k]; if (!pg || !pg.extract || pg.extract.length < 40) return null;
      return { titre: pg.title, ext: pg.extract.replace(/\s+/g, ' ').trim(), url: pg.fullurl };
    }).catch(function () { return null; });
  }
  function meteo(n) {
    var m = n.match(/\b(?:a|à|in|en|sur|at|di|per)\s+([a-z][a-z -]{2,30}?)(?:\s+(?:aujourd hui|demain|today|tomorrow|oggi|domani|ce soir|tonight|stasera))?\s*$/);
    var ville = m ? m[1].trim() : 'geneve';
    return fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=' + L + '&name=' + encodeURIComponent(ville)).then(function (r) { return r.json(); }).then(function (g) {
      var p = g && g.results && g.results[0]; if (!p) throw 0;
      return fetch('https://api.open-meteo.com/v1/forecast?latitude=' + p.latitude + '&longitude=' + p.longitude + '&current=temperature_2m,precipitation&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1').then(function (r) { return r.json(); }).then(function (w) {
        var c = w.current, d = w.daily;
        var pull = c.temperature_2m < 16 ? t(' Un temps à porter du mérinos.', ' Merino weather.', ' Tempo da merino.') : '';
        return { t: t('À ' + p.name + ', il fait ' + Math.round(c.temperature_2m) + ' °C en ce moment (aujourd\'hui ' + Math.round(d.temperature_2m_min[0]) + ' à ' + Math.round(d.temperature_2m_max[0]) + ' °C).', 'In ' + p.name + ', it is ' + Math.round(c.temperature_2m) + ' °C right now (today ' + Math.round(d.temperature_2m_min[0]) + ' to ' + Math.round(d.temperature_2m_max[0]) + ' °C).', 'A ' + p.name + ' ci sono ' + Math.round(c.temperature_2m) + ' °C adesso (oggi ' + Math.round(d.temperature_2m_min[0]) + '–' + Math.round(d.temperature_2m_max[0]) + ' °C).') + pull, links: [{ h: 'https://open-meteo.com', l: 'Open-Meteo' }] };
      });
    }).catch(function () { return { t: t('Je n\'ai pas pu lire la météo pour l\'instant.', 'I could not read the weather right now.', 'Non ho potuto leggere il meteo ora.'), links: [lienWeb(n)] }; });
  }
  function lienWeb(q) { return { h: 'https://duckduckgo.com/?q=' + encodeURIComponent(q), l: t('Chercher sur le web', 'Search the web', 'Cerca sul web') }; }
  var MARQUE = /inscri|liste|waitlist|iscriv|nocelli|cardigan|noce|nc ?01|club|founders|fondateur|signature|commande|livraison|livr|precommande|preorder|order|deliver|ship|spedizion|consegna|taille|size|taglia|prix|price|prezzo|coute|cost|membre|member|site|vous|your|vostro|votre|retour|return|paiement|payment|pagamento|drop|sortie|stock|piece|carte|card|tessera|edition|numero|label|etiquette/;
  var GENERAL = /^(quel temps|meteo|weather|que tempo|qui a |qui est |who won|who is |chi ha |qu est ce qu|qu est-ce|c est quoi|ca veut dire|que veut dire|que signifie|definition|define|what is|what are|what s|whats|who is|who was|what does|cos e|che cos|cosa significa|chi e|chi era|explique|explain|spiega|parle moi|tell me about|pourquoi|why|perche|comment fonctionne|how does)/;

  /* ------------------------------------------------------------------ intentions (réponses écrites + calculs) */
  function clubListe(qui) {
    var c = F.club && F.club[qui]; if (!c) return null;
    return c.li.map(function (li) { return (L !== 'fr' && texteTraduit(li, L)) || propre(li.textContent); });
  }
  function avertFr(x) { return x && L !== 'fr' && x.fr ? t('', ' (from the site, in French)', ' (dal sito, in francese)') : ''; }
  function rFounders() {
    if (!foundersOuvert) return rSignature();
    var l = clubListe('founders');
    var tete = t('La carte Founders est gratuite à vie, offerte aux ' + F.edition + ' premiers acheteurs du Cardigan Noce (NC-01), numérotés de 01 / 50 à 50 / 50. Elle ne s\'achète pas séparément.',
      'The Founders card is free for life, given to the first ' + F.edition + ' buyers of the Noce Cardigan (NC-01), numbered 01 / 50 to 50 / 50. It cannot be bought separately.',
      'La carta Founders è gratuita a vita, offerta ai primi ' + F.edition + ' acquirenti del Cardigan Noce (NC-01), numerati da 01 / 50 a 50 / 50. Non si acquista separatamente.');
    return { t: tete + (l && l.length ? '\n' + t('Elle donne : ', 'It includes: ', 'Comprende: ') + l.join(' ; ') + '.' : ''), links: [{ h: 'club.html#formules', l: 'Private Club' }] };
  }
  function rSignature() {
    var l = clubListe('signature');
    return { t: t('Signature coûte CHF ' + F.signature + ' par an, limitée à 50 membres.', 'Signature costs CHF ' + F.signature + ' a year, limited to 50 members.', 'Signature costa CHF ' + F.signature + ' all\'anno, limitata a 50 membri.') +
      (l && l.length ? '\n' + t('Elle donne : ', 'It includes: ', 'Comprende: ') + l.join(' ; ') + '.' : '') + '\n' +
      t('Les repas, soirées et voyages sont payants séparément. Un an dès le paiement, renouvellement automatique, annulable à tout moment.', 'Meals, evenings and trips are paid separately. One year from payment, automatic renewal, cancel anytime.', 'Cene, serate e viaggi si pagano a parte. Un anno dal pagamento, rinnovo automatico, annullabile in qualsiasi momento.'),
      links: [{ h: 'club.html#f-signature', l: t('Rejoindre Signature', 'Join Signature', 'Entra in Signature') }] };
  }
  function rClub() {
    if (!foundersOuvert) return { t: t('Le NOCELLI Private Club propose la carte Signature : CHF ' + F.signature + ' par an, limitée à 50 membres, avec les collections 72 h avant le public, des dîners privés et des soirées à Genève, et la priorité sur les voyages.', 'The NOCELLI Private Club offers the Signature card: CHF ' + F.signature + ' a year, limited to 50 members, with collections 72 h before the public, private dinners and evenings in Geneva, and priority on trips.', 'Il NOCELLI Private Club propone la carta Signature: CHF ' + F.signature + ' all\'anno, limitata a 50 membri, con le collezioni 72 ore prima del pubblico, cene private e serate a Ginevra, e la priorità sui viaggi.'), links: [{ h: 'club.html', l: 'Private Club' }] };
    return { t: t('Le NOCELLI Private Club a deux cartes. Founders : gratuite à vie pour les 50 premiers acheteurs du cardigan, avec accès à tout. Signature : CHF ' + F.signature + ' par an, limitée à 50 membres, avec dîners, soirées et voyages (payants séparément).',
      'The NOCELLI Private Club has two cards. Founders: free for life for the first 50 buyers of the cardigan, with access to everything. Signature: CHF ' + F.signature + ' a year, limited to 50 members, with dinners, evenings and trips (paid separately).',
      'Il NOCELLI Private Club ha due carte. Founders: gratuita a vita per i primi 50 acquirenti del cardigan, con accesso a tutto. Signature: CHF ' + F.signature + ' all\'anno, limitata a 50 membri, con cene, serate e viaggi (a pagamento a parte).'), links: [{ h: 'club.html', l: 'Private Club' }] };
  }
  function rDate() {
    var r = rebours();
    if (!r) return { t: t('La vente est ouverte depuis le ' + fmtJour(F.drop) + ' à 19 h. Tant qu\'il reste des pièces, la commande se fait sur la page du cardigan.', 'The sale has been open since ' + fmtJour(F.drop) + ' at 7 pm. While pieces remain, you order on the cardigan page.', 'La vendita è aperta dal ' + fmtJour(F.drop) + ' alle 19. Finché restano pezzi, si ordina sulla pagina del cardigan.'), links: [{ h: 'cardigan-noce.html', l: t('Le Cardigan Noce', 'The Noce Cardigan', 'Il Cardigan Noce') }] };
    var av = new Date(F.drop.getTime() - 72 * 36e5);
    return { t: t('L\'ouverture a lieu le ' + fmtJour(F.drop) + ' à ' + heureDrop() + ', soit ' + r + '. Les inscrits à la liste privée reçoivent le lien de commande en premier. Les membres du club accèdent aux lancements 72 h avant le public, donc dès le ' + fmtJour(av) + ' à 19 h.',
      'The opening is on ' + fmtJour(F.drop) + ' at ' + heureDrop() + ', ' + r + '. People on the private list get the order link first. Club members access launches 72 h before the public, so from ' + fmtJour(av) + ' at 7 pm.',
      'L\'apertura è ' + fmtJour(F.drop) + ' ' + heureDrop() + ', ' + r + '. Gli iscritti alla lista privata ricevono il link d\'ordine per primi. I membri del club accedono ai lanci 72 ore prima del pubblico, quindi dal ' + fmtJour(av) + ' alle 19.'), links: [{ h: 'index.html#liste', l: t('M\'inscrire', 'Sign up', 'Iscrivermi') }] };
  }
  function rLivraison(n) {
    var p = plageLivraison();
    var noel = /noel|christmas|natale|25 dec|fetes|holidays|feste/.test(n);
    return { t: t('C\'est une précommande : livraison en Suisse ' + F.livraison[0] + ' à ' + F.livraison[1] + ' semaines après l\'ouverture du ' + fmtCourt(F.drop) + ', donc entre le ' + fmtCourt(p[0]) + ' et le ' + fmtCourt(p[1]) + '.' + (noel ? ' Une livraison avant Noël n\'est donc pas prévue.' : ''),
      'It is a preorder: delivery in Switzerland ' + F.livraison[0] + ' to ' + F.livraison[1] + ' weeks after the opening on ' + fmtCourt(F.drop) + ', so between ' + fmtCourt(p[0]) + ' and ' + fmtCourt(p[1]) + '.' + (noel ? ' Delivery before Christmas is therefore not planned.' : ''),
      'È un preordine: consegna in Svizzera ' + F.livraison[0] + '–' + F.livraison[1] + ' settimane dopo l\'apertura del ' + fmtCourt(F.drop) + ', quindi tra il ' + fmtCourt(p[0]) + ' e il ' + fmtCourt(p[1]) + '.' + (noel ? ' Una consegna prima di Natale quindi non è prevista.' : '')) };
  }
  function quantite(n) {
    var M = { un: 1, une: 1, one: 1, uno: 1, una: 1, deux: 2, two: 2, due: 2, trois: 3, three: 3, tre: 3, quatre: 4, four: 4, quattro: 4, cinq: 5, five: 5, cinque: 5, dix: 10, ten: 10, dieci: 10 };
    var m = n.match(/\b(\d{1,2}|un|une|deux|trois|quatre|cinq|dix|one|two|three|four|five|ten|uno|una|due|tre|quattro|cinque|dieci)\s+(cardigan|piece|pieces|pull|exemplaire|pezzi|pezzo|capi)/);
    if (!m) return null; return M[m[1]] || parseInt(m[1], 10);
  }
  function rPrix(n) {
    if (/euro|eur\b|dollar|usd|sterling|pound|gbp/.test(n) && !quantite(n) && !/signature/.test(n) && ctx.prixN) n = ctx.prixN + ' ' + n;
    ctx.prixN = n.replace(/euros?|eur\b|dollars?|usd|en |in /g, ' ');
    var q = quantite(n), avecSig = /signature|abonnement|club/.test(n) && /\+|plus|avec|\bet\b|and|with|\be\b|con|total/.test(n);
    var total = (q || 1) * F.prix + (avecSig ? F.signature : 0);
    var base = q && q > 1
      ? t(q + ' cardigans à CHF ' + F.prix + ' font CHF ' + (q * F.prix) + '.', q + ' cardigans at CHF ' + F.prix + ' make CHF ' + (q * F.prix) + '.', q + ' cardigan a CHF ' + F.prix + ' fanno CHF ' + (q * F.prix) + '.')
      : t('Le Cardigan Noce coûte CHF ' + F.prix + ', TVA incluse.', 'The Noce Cardigan costs CHF ' + F.prix + ', VAT included.', 'Il Cardigan Noce costa CHF ' + F.prix + ', IVA inclusa.');
    if (avecSig) base += ' ' + t('Avec la carte Signature (CHF ' + F.signature + ' par an), le total est de CHF ' + total + '.', 'With the Signature card (CHF ' + F.signature + ' a year), the total is CHF ' + total + '.', 'Con la carta Signature (CHF ' + F.signature + ' all\'anno), il totale è CHF ' + total + '.');
    if (/euro|eur\b|€|dollar|usd|\$|livre sterling|pound|gbp|sterlin/.test(n)) {
      var cur = /dollar|usd|\$/.test(n) ? 'USD' : /sterling|pound|gbp|sterlin/.test(n) ? 'GBP' : 'EUR';
      return taux().then(function (j) {
        if (!j || !j.rates || !j.rates[cur]) return { t: base + ' ' + t('Le paiement se fait en francs suisses ; je n\'ai pas pu lire le taux du jour.', 'Payment is in Swiss francs; I could not read today\'s rate.', 'Il pagamento è in franchi svizzeri; non ho potuto leggere il cambio di oggi.') };
        var v = Math.round(total * j.rates[cur]);
        return { t: base + ' ' + t('Au taux du jour (' + j.date + '), cela fait environ ' + v + ' ' + cur + '. Le paiement se fait en francs suisses ; votre banque applique son propre taux.', 'At today\'s rate (' + j.date + '), that is about ' + v + ' ' + cur + '. Payment is in Swiss francs; your bank applies its own rate.', 'Al cambio di oggi (' + j.date + '), sono circa ' + v + ' ' + cur + '. Il pagamento è in franchi svizzeri; la banca applica il suo cambio.'), links: [{ h: 'https://frankfurter.dev', l: t('Source du taux (BCE)', 'Rate source (ECB)', 'Fonte del cambio (BCE)') }] };
      });
    }
    return { t: base };
  }
  function rDifference(a, b) {
    var cles = ['poitrine', 'taille', 'epaules', 'manche', 'longueur', 'biceps'];
    ctx.dernier = { type: 'vet', n: 'poitrine longueur manche epaules' };
    return { t: t('Du ' + a + ' au ' + b + ' :\n', 'From ' + a + ' to ' + b + ':\n', 'Dalla ' + a + ' alla ' + b + ':\n') + cles.map(function (k) { var d = F.vet[k][b] - F.vet[k][a]; return nomVet(k) + ' : ' + nombre(F.vet[k][a]) + ' → ' + nombre(F.vet[k][b]) + ' cm (' + (d >= 0 ? '+' : '') + nombre(d) + ')'; }).join('\n') + '\n' + t('Côté corps : poitrine ' + F.corps.poitrine[a].join(' à ') + ' cm pour le ' + a + ', ' + F.corps.poitrine[b].join(' à ') + ' cm pour le ' + b + '.', 'Body: chest ' + F.corps.poitrine[a].join('–') + ' cm for ' + a + ', ' + F.corps.poitrine[b].join('–') + ' cm for ' + b + '.', 'Corpo: petto ' + F.corps.poitrine[a].join('–') + ' cm per la ' + a + ', ' + F.corps.poitrine[b].join('–') + ' cm per la ' + b + '.'), links: [{ h: 'cardigan-noce.html#guide', l: t('Guide des tailles', 'Size guide', 'Guida alle taglie'), guide: true }] };
  }
  function rMesureVet(n, tailles) {
    var cles = [];
    if (/manche|sleeve|manica/.test(n)) cles.push('manche');
    if (/biceps|bicep|bicipit/.test(n)) cles.push('biceps');
    if (/col\b|collar|collo/.test(n) && /haut|height|alt|cm|combien|how/.test(n)) cles.push('col');
    if (/tour du bas|hem|fondo|ourlet/.test(n)) cles.push('bas');
    if (/tour de taille|waist|vita/.test(n)) cles.push('taille');
    if (/epaule|shoulder|spall|carrure/.test(n)) cles.push('epaules');
    if (/poitrine|chest|petto|torace/.test(n)) cles.push('poitrine');
    if (/longueur|\blong\b|length|lungo|lunghezza|hauteur du vetement|arrive ou/.test(n) && !/longueur de manche|sleeve length|lunghezza (della )?manica|longueur des manches/.test(n)) cles.push('longueur');
    if (!cles.length) return null;
    var tl = tailles.length ? tailles.filter(function (x) { return F.vet.poitrine[x]; }) : TAILLES;
    if (!tl.length) tl = TAILLES;
    var pouces = /pouce|inch|pollic|\bin\b/.test(n);
    function v(x) { return pouces ? nombre(x / 2.54) + ' in' : nombre(x) + ' cm'; }
    var out = cles.map(function (k) {
      return nomVet(k) + ' : ' + tl.map(function (T) { return T + ' ' + v(F.vet[k][T]); }).join(', ');
    });
    if (/difference|ecart|entre|compare|vs|plus grand|bigger|differenza|confronto/.test(n) && tl.length >= 2) {
      var a = tl[0], b = tl[tl.length - 1];
      out.push(t('Écart ' + a + ' → ' + b + ' : ', 'Difference ' + a + ' → ' + b + ': ', 'Differenza ' + a + ' → ' + b + ': ') + cles.map(function (k) { return '+' + v(F.vet[k][b] - F.vet[k][a]); }).join(', '));
    }
    ctx.dernier = { type: 'vet', n: n };
    return { t: t('Mesures du vêtement, prises à plat (tours ×2) :\n', 'Garment measurements, taken flat (circumferences ×2):\n', 'Misure del capo, prese in piano (giri ×2):\n') + out.join('\n') + '\n' + t('Tolérance ±1 cm, à confirmer sur les prototypes.', 'Tolerance ±1 cm, to be confirmed on the prototypes.', 'Tolleranza ±1 cm, da confermare sui prototipi.'), links: [{ h: 'cardigan-noce.html#guide', l: t('Guide des tailles', 'Size guide', 'Guida alle taglie'), guide: true }] };
  }
  function rTaillesGen() {
    var C = F.corps.poitrine;
    return { t: t('Trois tailles, choisies selon le tour de poitrine : S ' + C.S.join(' à ') + ' cm, M ' + C.M.join(' à ') + ' cm, L ' + C.L.join(' à ') + ' cm. La coupe est ajustée, avec 6 à 10 cm d\'aisance.\nDonnez-moi votre tour de poitrine (et si vous voulez vos épaules, vos bras, votre hauteur), je calcule votre taille.',
      'Three sizes, chosen by chest: S ' + C.S.join('–') + ' cm, M ' + C.M.join('–') + ' cm, L ' + C.L.join('–') + ' cm. The fit is close, with 6 to 10 cm of ease.\nTell me your chest (and if you like your shoulders, arms, height), I will work out your size.',
      'Tre taglie, scelte in base al giro petto: S ' + C.S.join('–') + ' cm, M ' + C.M.join('–') + ' cm, L ' + C.L.join('–') + ' cm. La vestibilità è aderente, con 6–10 cm di agio.\nMi dica il suo giro petto (e se vuole spalle, braccia, altezza), calcolo la sua taglia.'), links: [{ h: 'cardigan-noce.html#guide', l: t('Guide des tailles', 'Size guide', 'Guida alle taglie'), guide: true }] };
  }

  // [mots-clés (toutes langues), réponse fixe ou fonction]
  var R = [
    [['nocelli', 'marque', 'maison', 'qui etes', 'histoire', 'origine', 'signifie nocelli', 'veut dire', 'concept', 'brand', 'who are you', 'marchio', 'chi siete'], function () { return t('NOCELLI est une maison suisse de vêtements en petites séries. Le nom vient de « noce », le noyer en italien. Peu de pièces, chacune numérotée, faites pour durer.', 'NOCELLI is a Swiss clothing house making small series. The name comes from "noce", walnut in Italian. Few pieces, each numbered, made to last.', 'NOCELLI è una maison svizzera di abbigliamento in piccole serie. Il nome viene da « noce ». Pochi capi, ciascuno numerato, fatti per durare.'); }],
    [['style', 'luxe', 'esprit', 'inspiration', 'quiet luxury', 'old money', 'elegance', 'discret', 'lusso', 'luxury'], function () { return t('Une élégance discrète : belles matières, coupe nette, aucun logo à l\'extérieur. Le nom de la maison est seulement sur l\'étiquette numérotée, à l\'intérieur du col.', 'Quiet elegance: fine materials, a clean cut, no logo outside. The house name is only on the numbered label inside the collar.', 'Un\'eleganza discreta: belle materie, linea pulita, nessun logo all\'esterno. Il nome della maison è solo sull\'etichetta numerata, dentro il collo.'); }],
    [['suisse', 'ou etes', 'pays', 'geneve', 'swiss', 'switzerland', 'svizzera', 'where are you', 'dove siete'], function () { return t('NOCELLI est une maison suisse. Les événements du club ont lieu à Genève et la livraison se fait en Suisse.', 'NOCELLI is a Swiss house. Club events take place in Geneva and delivery is within Switzerland.', 'NOCELLI è una maison svizzera. Gli eventi del club si tengono a Ginevra e la consegna è in Svizzera.'); }],
    [['fabrique', 'fabrication', 'made in', 'produit ou', 'fait en', 'fait ou', 'fabbricato', 'prodotto in', 'where is it made', 'atelier', 'usine', 'factory', 'fabbrica'], function () { return t('Le site décrit une maille d\'esprit italien, pensée en Suisse. Il ne nomme pas encore l\'atelier de fabrication ; nous l\'annoncerons avec les prototypes.', 'The site describes Italian-spirited knitwear, designed in Switzerland. It does not name the workshop yet; we will announce it with the prototypes.', 'Il sito descrive una maglia di spirito italiano, pensata in Svizzera. Non nomina ancora il laboratorio; lo annunceremo con i prototipi.'); }],
    [['prima edizione', 'premiere edition', 'first edition', 'edizione'], function () { return t('Prima Edizione veut dire « première édition » en italien : c\'est la première collection NOCELLI, le Cardigan Noce en ' + F.edition + ' pièces numérotées.', 'Prima Edizione means "first edition" in Italian: it is the first NOCELLI collection, the Noce Cardigan in ' + F.edition + ' numbered pieces.', 'Prima Edizione è la prima collezione NOCELLI: il Cardigan Noce in ' + F.edition + ' pezzi numerati.'); }],
    [['cardigan', 'piece', 'produit', 'nc-01', 'nc01', 'vetement', 'pull', 'gilet', 'collection', 'product', 'sweater', 'prodotto', 'maglione'], function () { return { t: t('La première pièce est Le Cardigan Noce (NC-01) : un cardigan zippé en maille unie couleur chocolat, 100 % laine mérinos extrafine, coupe ajustée, sans logo à l\'extérieur. ' + F.edition + ' exemplaires numérotés, CHF ' + F.prix + '.', 'The first piece is the Noce Cardigan (NC-01): a zipped cardigan in plain chocolate knit, 100 % extra-fine merino wool, close fit, no logo outside. ' + F.edition + ' numbered pieces, CHF ' + F.prix + '.', 'Il primo capo è il Cardigan Noce (NC-01): un cardigan con zip in maglia unita color cioccolato, 100 % lana merino extrafine, vestibilità aderente, nessun logo all\'esterno. ' + F.edition + ' pezzi numerati, CHF ' + F.prix + '.'), links: [{ h: 'cardigan-noce.html', l: t('Voir la pièce', 'See the piece', 'Vedi il capo') }] }; }],
    [['prix', 'combien coute', 'cout', 'tarif', 'chf', 'price', 'how much', 'cost', 'prezzo', 'quanto costa', 'costa', 'euro', 'euros', 'en euros', 'dollars', 'in euro', 'eur'], rPrix],
    [['exemplaire', 'combien de pieces', 'quantite', 'limite', 'stock', 'rupture', 'reste', 'disponible', 'edition', 'how many', 'quanti', 'sold out', 'esaurito'], function () { return t('Le Cardigan Noce est édité à ' + F.edition + ' exemplaires seulement, en trois tailles. Il n\'y aura pas de réédition à l\'identique annoncée sur le site.', 'The Noce Cardigan is made in ' + F.edition + ' pieces only, in three sizes.', 'Il Cardigan Noce è prodotto in soli ' + F.edition + ' pezzi, in tre taglie.').replace(' Il n\'y aura pas de réédition à l\'identique annoncée sur le site.', ''); }],
    [['numero', 'numerote', 'etiquette', 'label', '01 / 50', '01/50', 'unique', 'numbered', 'number', 'numerato', 'etichetta', 'choisir mon numero', 'choose my number'], function (n) { var choix = /choisir|choose|scegliere|quel numero|which number|lequel/.test(n); return t('Chaque cardigan porte une étiquette tissée beige à l\'intérieur du col, avec NOCELLI et son numéro, de N° 01 / 50 à N° 50 / 50. C\'est la seule marque de la pièce.' + (choix ? ' Le site ne prévoit pas de choisir son numéro.' : ''), 'Each cardigan has a beige woven label inside the collar with NOCELLI and its number, from N° 01 / 50 to N° 50 / 50. It is the only branding on the piece.' + (choix ? ' The site does not offer choosing your number.' : ''), 'Ogni cardigan ha un\'etichetta tessuta beige dentro il collo con NOCELLI e il suo numero, da N° 01 / 50 a N° 50 / 50. È l\'unico segno del marchio.' + (choix ? ' Il sito non prevede la scelta del numero.' : '')); }],
    [['matiere', 'laine', 'merinos', 'composition', 'tissu', 'qualite', 'micron', 'gratte', 'pique', 'itchy', 'scratchy', 'punge', 'pungere', 'doux', 'soft', 'morbido', 'douceur', 'chaud', 'maille', 'jauge', 'wool', 'merino', 'material', 'fabric', 'itch', 'warm', 'lana', 'materiale', 'caldo', 'prude', 'synthetique', 'acrylique', 'cachemire', 'cashmere'], function (n) {
      var r = t('100 % laine mérinos extrafine, 18,5 à 19,5 microns : douce, elle ne gratte pas. Jersey uni 12 jauges, 280 à 320 g/m², léger et respirant. Traité anti-boulochage et anti-feutrage. Aucune fibre synthétique.', '100 % extra-fine merino wool, 18.5 to 19.5 microns: soft, it does not itch. Plain 12-gauge jersey, 280 to 320 g/m², light and breathable. Anti-pilling and anti-felting finish. No synthetic fibre.', '100 % lana merino extrafine, 18,5–19,5 micron: morbida, non punge. Jersey unito 12 gauge, 280–320 g/m², leggero e traspirante. Trattato antipilling e antifeltro. Nessuna fibra sintetica.');
      if (/cachemire|cashmere/.test(n)) r += ' ' + t('Ce n\'est pas du cachemire : c\'est du mérinos extrafin, plus résistant au quotidien.', 'It is not cashmere: it is extra-fine merino, sturdier for daily wear.', 'Non è cashmere: è merino extrafine, più resistente nell\'uso quotidiano.');
      if (/chaud|warm|caldo|hiver|winter|inverno|froid|cold|freddo/.test(n)) r += ' ' + t('Le mérinos tient chaud sans surchauffer ; en plein hiver, il se porte sous un manteau.', 'Merino keeps you warm without overheating; in deep winter, wear it under a coat.', 'Il merino scalda senza surriscaldare; in pieno inverno si porta sotto un cappotto.');
      return r; }],
    [['couleur', 'coloris', 'chocolat', 'marron', 'brun', 'noir', 'beige', 'autre couleur', 'colour', 'color', 'colore', 'brown', 'marrone'], function () { return t('Un seul coloris : chocolat, teint en un seul bain pour les 50 pièces.', 'One colour only: chocolate, dyed in a single bath for all 50 pieces.', 'Un solo colore: cioccolato, tinto in un unico bagno per tutti i 50 pezzi.'); }],
    [['zip', 'fermeture', 'eclair', 'bouton', 'tirette', 'zipper', 'cerniera', 'bottoni'], function () { return t('Zip métal à double curseur, tirettes lisses : il s\'ouvre par le haut ou par le bas. Pas de boutons.', 'Two-way metal zip with plain pullers: it opens from the top or the bottom. No buttons.', 'Zip in metallo a doppio cursore, tiretti lisci: si apre dall\'alto o dal basso. Niente bottoni.'); }],
    [['col', 'cou', 'montant', 'collar', 'collo'], function () { return t('Col montant en côte doublée, 7 cm, légèrement conique : il tient bien autour du cou.', 'Stand collar in double rib, 7 cm, slightly tapered: it sits well around the neck.', 'Collo alto a coste doppie, 7 cm, leggermente conico: sta bene attorno al collo.'); }],
    [['poche', 'poches', 'pocket', 'tasca', 'tasche'], function () { return t('Le Cardigan Noce n\'a pas de poches, pour garder une ligne nette.', 'The Noce Cardigan has no pockets, to keep a clean line.', 'Il Cardigan Noce non ha tasche, per mantenere una linea pulita.'); }],
    [['manche', 'epaule', 'coupe', 'fit', 'ajuste', 'ample', 'slim', 'oversize', 'forme', 'sleeve', 'shoulder', 'vestibilita', 'manica', 'spalla', 'poignet', 'cuff', 'polsino'], function () { return t('Coupe ajustée, près du corps sans serrer, 6 à 10 cm d\'aisance à la poitrine. Manches montées, épaule naturelle. Poignets 7 cm et bas 6 cm en côte.', 'Close fit, near the body without squeezing, 6 to 10 cm of ease at the chest. Set-in sleeves, natural shoulder. Ribbed cuffs 7 cm and hem 6 cm.', 'Vestibilità aderente, vicina al corpo senza stringere, 6–10 cm di agio al petto. Maniche montate, spalla naturale. Polsini 7 cm e fondo 6 cm a coste.'); }],
    [['logo', 'marque visible', 'brode', 'imprime', 'branding', 'logo visibile'], function () { return t('Aucun logo à l\'extérieur. NOCELLI apparaît seulement sur l\'étiquette numérotée à l\'intérieur du col.', 'No logo outside. NOCELLI appears only on the numbered label inside the collar.', 'Nessun logo all\'esterno. NOCELLI compare solo sull\'etichetta numerata dentro il collo.'); }],
    [['taille', 'tailles', 'quelle taille', 'guide', 'mesurer', 'size', 'sizes', 'which size', 'what size', 'taglia', 'taglie', 'quale taglia', 'xs', 'xl', 'xxl'], function (n) {
      var hab = tailleHabituelle(n);
      if (hab) {
        var C = F.corps.poitrine;
        if (/X/.test(hab) && hab !== 'XS') return t('Notre plus grande taille est le L (poitrine ' + C.L.join(' à ') + ' cm, 111 cm de tour pour le vêtement). Si vous portez du ' + hab + ', mesurez votre poitrine : jusqu\'à 105 cm le L vous ira, au-delà il sera trop juste.', 'Our largest size is L (chest ' + C.L.join('–') + ' cm, 111 cm garment chest). If you wear ' + hab + ', measure your chest: up to 105 cm L will fit, above that it will be too tight.', 'La nostra taglia più grande è la L (petto ' + C.L.join('–') + ' cm, 111 cm il capo). Se porta la ' + hab + ', misuri il petto: fino a 105 cm la L va bene, oltre sarà troppo stretta.');
        if (hab === 'XS' || hab === 'XXS') return t('Notre plus petite taille est le S (poitrine ' + C.S.join(' à ') + ' cm). Avec une poitrine sous 91 cm, le S tombera un peu plus souple.', 'Our smallest size is S (chest ' + C.S.join('–') + ' cm). With a chest under 91 cm, S will fit a little looser.', 'La nostra taglia più piccola è la S (petto ' + C.S.join('–') + ' cm). Con un petto sotto 91 cm, la S sarà un po\' più morbida.');
        return t('Si vous portez du ' + hab + ' ailleurs, notre ' + hab + ' correspond à une poitrine de ' + C[hab].join(' à ') + ' cm (le vêtement fait ' + F.vet.poitrine[hab] + ' cm de tour). Les tailles varient entre marques : donnez-moi votre tour de poitrine pour être sûr.', 'If you wear ' + hab + ' elsewhere, our ' + hab + ' fits a ' + C[hab].join('–') + ' cm chest (garment ' + F.vet.poitrine[hab] + ' cm). Sizes vary between brands: tell me your chest to be sure.', 'Se altrove porta la ' + hab + ', la nostra ' + hab + ' corrisponde a un petto di ' + C[hab].join('–') + ' cm (capo ' + F.vet.poitrine[hab] + ' cm). Le taglie variano tra marchi: mi dica il suo giro petto per essere sicuri.');
      }
      return rTaillesGen(); }],
    [['lavage', 'laver', 'entretien', 'machine', 'retrecit', 'retrecir', 'repasser', 'sechage', 'boulochage', 'bouloche', 'detend', 'se detendre', 'stretch', 'allonge', 'deforme', 'si allarga', 'wash', 'care', 'shrink', 'pilling', 'lavare', 'lavaggio', 'restringe'], function () { return t('Lavage laine à 30 °C au plus (à la main ou programme laine), puis séchage à plat. Le mérinos est traité anti-feutrage : il ne rétrécit pas, il se détend légèrement en le portant. Traité anti-boulochage aussi.', 'Wool wash at 30 °C max (by hand or wool cycle), then dry flat. The merino is anti-felting treated: it does not shrink, it relaxes slightly with wear. Anti-pilling too.', 'Lavaggio lana a 30 °C al massimo (a mano o programma lana), poi asciugare in piano. Il merino è trattato antifeltro: non si restringe, si rilassa leggermente indossandolo. Anche antipilling.'); }],
    [['homme', 'femme', 'unisexe', 'genre', 'pour qui', 'men', 'women', 'unisex', 'uomo', 'donna'], function () { return t('Le Cardigan Noce se porte comme on veut. Les tailles se choisissent au tour de poitrine : donnez-moi le vôtre et je calcule.', 'The Noce Cardigan is for whoever wants to wear it. Sizes go by chest: tell me yours and I will work it out.', 'Il Cardigan Noce si porta come si vuole. Le taglie si scelgono in base al giro petto: mi dica il suo e calcolo.'); }],
    [['date', 'quand', 'sortie', 'lancement', 'drop', 'heure', 'ouverture', 'decembre', 'combien de jours', 'compte a rebours', 'when', 'release', 'launch', 'opening', 'quando', 'uscita', 'lancio', 'apertura', 'dicembre', 'december'], rDate],
    [['acheter', 'commander', 'precommande', 'achat', 'commande', 'reserver', 'ou acheter', 'buy', 'order', 'preorder', 'purchase', 'comprare', 'ordinare', 'preordine'], function () { var r = rebours(); return { t: t('La vente se fait uniquement sur ce site, en précommande, à partir du ' + fmtJour(F.drop) + ' à 19 h' + (r ? ' (' + r + ')' : '') + '. Inscrivez-vous à la liste privée : vous recevrez le lien de commande en premier. Aucun paiement maintenant.', 'Sales happen only on this site, as a preorder, from ' + fmtJour(F.drop) + ' at 7 pm' + (r ? ' (' + r + ')' : '') + '. Join the private list: you will get the order link first. No payment now.', 'La vendita avviene solo su questo sito, in preordine, dal ' + fmtJour(F.drop) + ' alle 19' + (r ? ' (' + r + ')' : '') + '. Si iscriva alla lista privata: riceverà il link d\'ordine per primo. Nessun pagamento ora.'), links: [{ h: 'index.html#liste', l: t('M\'inscrire', 'Sign up', 'Iscrivermi') }] }; }],
    [['livraison', 'livr', 'delai', 'expedition', 'recevoir', 'envoi', 'colis', 'poste', 'noel', 'delivery', 'shipping', 'receive', 'christmas', 'consegna', 'spedizione', 'ricevere', 'natale'], rLivraison],
    [['etranger', 'france', 'international', 'europe', 'hors suisse', 'douane', 'allemagne', 'liechtenstein', 'abroad', 'germany', 'estero', 'germania', 'outside switzerland', 'italie', 'italy', 'italia', 'spedite', 'ship to', 'deliver to', 'livrez', 'autriche', 'austria', 'uk', 'usa'], function () { return t('Pour l\'instant, la livraison du cardigan se fait en Suisse uniquement.', 'For now, the cardigan ships within Switzerland only.', 'Per ora il cardigan si spedisce solo in Svizzera.'); }],
    [['paiement', 'payer', 'twint', 'carte bancaire', 'visa', 'mastercard', 'facture', 'plusieurs fois', 'payment', 'pay', 'pagamento', 'pagare', 'apple pay', 'paypal'], function (n) { return t('Paiement par carte ou TWINT, en francs suisses, TVA incluse.' + (/paypal|plusieurs fois|facture|installment|rate/.test(n) ? ' Le site ne prévoit pas d\'autre moyen pour l\'instant.' : ''), 'Payment by card or TWINT, in Swiss francs, VAT included.' + (/paypal|installment|invoice/.test(n) ? ' The site does not offer other methods for now.' : ''), 'Pagamento con carta o TWINT, in franchi svizzeri, IVA inclusa.' + (/paypal|rate|fattura/.test(n) ? ' Il sito non prevede altri metodi per ora.' : '')); }],
    [['retour', 'echange', 'rembourse', 'remboursement', 'pas la bonne taille', 'return', 'exchange', 'refund', 'reso', 'cambio', 'rimborso'], function () { return t('Le site ne détaille pas encore la politique de retour. Pour un échange de taille ou un retour, écrivez-nous à ' + F.email + ' : nous trouverons une solution. Une commande remboursée perd sa place Founders.', 'The site does not detail the returns policy yet. For a size exchange or a return, write to ' + F.email + ': we will find a solution. A refunded order loses its Founders place.', 'Il sito non descrive ancora la politica di reso. Per un cambio taglia o un reso, ci scriva a ' + F.email + ': troveremo una soluzione. Un ordine rimborsato perde il posto Founders.').replace(foundersOuvert ? '§' : / Une commande remboursée perd sa place Founders\.| A refunded order loses its Founders place\.| Un ordine rimborsato perde il posto Founders\./, ''); }],
    [['m inscrire', 's inscrire', 'date limite', 'jusqu a quand', 'until when', 'deadline', 'fino a quando', 'inscri', 'liste', 'newsletter', 'prevenu', 'alerte', 'waitlist', 'attente', 'sign up', 'register', 'iscriv', 'lista', 'desinscri', 'unsubscribe'], function () { return { t: t('Inscrivez-vous à la liste privée sur la page d\'accueil (bouton « M\'inscrire ») : prénom, e-mail et taille. C\'est gratuit, sans engagement, désinscription possible à tout moment. On peut s\'inscrire jusqu\'à l\'ouverture. Vous recevrez le lien de commande le ' + fmtCourt(F.drop) + ' à 19 h.', 'Join the private list on the home page ("Sign up" button): first name, e-mail and size. Free, no commitment, unsubscribe anytime, open until the launch. You will get the order link on ' + fmtCourt(F.drop) + ' at 7 pm.', 'Si iscriva alla lista privata nella home (pulsante « Iscrivermi »): nome, e-mail e taglia. Gratis, senza impegno, disiscrizione in qualsiasi momento, fino all\'apertura. Riceverà il link d\'ordine il ' + fmtCourt(F.drop) + ' alle 19.'), links: [{ h: 'index.html#liste', l: t('M\'inscrire', 'Sign up', 'Iscrivermi') }] }; }],
    [['club', 'private club', 'cartes', 'membre', 'adhesion', 'difference entre les cartes', 'membership', 'member', 'membro', 'tessera'], rClub],
    [['founders', 'fondateur', 'fondateurs', 'founder', 'fondatori', 'premiers acheteurs', 'gratuit a vie', 'free for life'], rFounders],
    [['signature', 'abonnement', '290', 'carte noire', 'subscription', 'abbonamento', 'black card'], rSignature],
    [['diner', 'soiree', 'evenement', 'restaurant', 'rencontre', 'cocktail', 'fete', 'hotel', 'dinner', 'event', 'party', 'cena', 'evento', 'serata', 'diners', 'dinners', 'cene'], function () { return { t: t('Les membres ' + (foundersOuvert ? 'Signature et les fondateurs ont' : 'Signature ont') + ' accès à des dîners privés dans les restaurants les plus prisés de Genève, à des soirées privées et aux rencontres entre membres. Chaque événement est payant séparément' + (foundersOuvert ? ' ; les fondateurs ont 10 % de réduction.' : '.'), (foundersOuvert ? 'Signature members and founders get' : 'Signature members get') + ' access to private dinners in Geneva\'s most sought-after restaurants, private evenings and member meet-ups. Each event is paid separately' + (foundersOuvert ? '; founders get 10 % off.' : '.'), 'I membri Signature' + (foundersOuvert ? ' e i fondatori hanno' : ' hanno') + ' accesso a cene private nei ristoranti più ambiti di Ginevra, serate private e incontri tra membri. Ogni evento si paga a parte' + (foundersOuvert ? '; i fondatori hanno il 10 % di sconto.' : '.')), links: [{ h: 'club.html', l: 'Private Club' }] }; }, 6],
    [['voyage', 'voyages', 'trip', 'acompte', 'destination', 'travel', 'viaggio', 'viaggi'], function () { return t('Les membres Signature' + (foundersOuvert ? ' et les fondateurs ont' : ' ont') + ' un accès prioritaire aux voyages NOCELLI. Chaque membre paie sa part' + (foundersOuvert ? ' ; les fondateurs ont 10 % de réduction' : '') + '. Acompte non remboursable à la réservation.', 'Signature members' + (foundersOuvert ? ' and founders get' : ' get') + ' priority on NOCELLI trips. Each member pays their own share' + (foundersOuvert ? '; founders get 10 % off' : '') + '. Non-refundable deposit at booking.', 'I membri Signature' + (foundersOuvert ? ' e i fondatori hanno' : ' hanno') + ' accesso prioritario ai viaggi NOCELLI. Ogni membro paga la sua parte' + (foundersOuvert ? '; i fondatori hanno il 10 % di sconto' : '') + '. Acconto non rimborsabile alla prenotazione.'); }, 6],
    [['annuler ma precommande', 'annuler ma commande', 'annuler la commande', 'annuler une commande', 'cancel my order', 'cancel my preorder', 'cancel the order', 'annullare l ordine', 'annullare ordine'], function () { return t('Le site ne précise pas encore les conditions d\'annulation d\'une précommande. Écrivez-nous à ' + F.email + ' : une personne de la maison vous répond.' + (foundersOuvert ? ' Une commande remboursée perd sa place Founders.' : ''), 'The site does not yet detail how to cancel a preorder. Write to ' + F.email + ': someone from the house will reply.' + (foundersOuvert ? ' A refunded order loses its Founders place.' : ''), 'Il sito non precisa ancora come annullare un preordine. Scriva a ' + F.email + ': una persona della maison le risponderà.' + (foundersOuvert ? ' Un ordine rimborsato perde il posto Founders.' : '')); }],
    [['annuler', 'resilier', 'arreter', 'renouvellement', 'desabonner', 'duree', 'annulation', 'cancel', 'renewal', 'annullare', 'disdire', 'rinnovo'], function () { return t('Signature dure un an dès le paiement et se renouvelle au même prix. Vous pouvez arrêter le renouvellement à tout moment dans votre espace membre ; l\'accès reste jusqu\'à la fin de l\'année payée, sans remboursement.', 'Signature lasts one year from payment and renews at the same price. You can stop renewal anytime in your member area; access stays until the end of the paid year, no refund.', 'Signature dura un anno dal pagamento e si rinnova allo stesso prezzo. Può fermare il rinnovo in qualsiasi momento nell\'area membri; l\'accesso resta fino alla fine dell\'anno pagato, senza rimborso.'); }, 6],
    [['les deux', 'cumuler', 'founders et signature', 'deja fondateur', 'both cards', 'entrambe'], function () { return foundersOuvert ? t('Oui. Un fondateur peut ajouter Signature et garde son numéro Founders.', 'Yes. A founder can add Signature and keeps their Founders number.', 'Sì. Un fondatore può aggiungere Signature e mantiene il suo numero Founders.') : rSignature(); }],
    [['vote', 'voter', 'futures collections', 'prochaine collection', 'prochaine piece', 'next collection', 'prossima collezione', 'nouveaute'], function () { return t('La suite sera annoncée aux membres du club en premier' + (foundersOuvert ? ' ; les fondateurs votent sur les futures collections.' : '.'), 'What comes next will be announced to club members first' + (foundersOuvert ? '; founders vote on future collections.' : '.'), 'Il seguito sarà annunciato prima ai membri del club' + (foundersOuvert ? '; i fondatori votano sulle future collezioni.' : '.')); }],
    [['invitation', 'troisieme carte', 'secrete', 'secret', 'nocelli prive', 'carte privee', 'by invitation', 'third card', 'invito'], function () { return t('Au-delà de ces deux cartes, une autre. Elle ne se demande pas.', 'Beyond these two cards, another. It is not requested.', 'Oltre a queste due carte, un\'altra. Non si chiede.'); }],
    [['compte', 'connexion', 'connecter', 'espace membre', 'mot de passe', 'login', 'account', 'password', 'accedi', 'qr'], function () { return { t: t('Votre espace membre est sur la page « Mon compte ». La connexion se fait par un lien envoyé à votre e-mail, sans mot de passe. Le QR code de la carte contient un code aléatoire, sans donnée personnelle.', 'Your member area is on the "My account" page. You log in with a link sent to your e-mail, no password. The card\'s QR code holds a random code, no personal data.', 'L\'area membri è nella pagina « Il mio account ». Si accede con un link inviato all\'e-mail, senza password. Il QR della carta contiene un codice casuale, nessun dato personale.'), links: [{ h: 'membre.html', l: t('Mon compte', 'My account', 'Il mio account') }] }; }],
    [['instagram', 'insta', 'tiktok', 'reseaux', 'contact', 'contacter', 'email', 'mail', 'joindre', 'telephone', 'service client', 'humain', 'quelqu un', 'parler a', 'human', 'someone', 'customer service', 'contattare', 'persona'], function () { return { t: t('Écrivez-nous à ' + F.email + ' ou sur Instagram, @nocelli.ch. Une personne de la maison vous répond.', 'Write to us at ' + F.email + ' or on Instagram, @nocelli.ch. Someone from the house will reply.', 'Ci scriva a ' + F.email + ' o su Instagram, @nocelli.ch. Una persona della maison le risponderà.'), links: [{ h: 'mailto:' + F.email, l: F.email }, { h: F.insta, l: 'Instagram' }] }; }],
    [['magasin', 'boutique', 'showroom', 'essayer', 'physique', 'store', 'shop', 'try on', 'negozio', 'provare'], function () { return t('NOCELLI vend uniquement en ligne, sur ce site. Pour bien choisir sans essayer, donnez-moi vos mesures : je calcule votre taille.', 'NOCELLI sells online only, on this site. To choose without trying on, give me your measurements: I will work out your size.', 'NOCELLI vende solo online, su questo sito. Per scegliere senza provare, mi dia le sue misure: calcolo la taglia.'); }],
    [['cadeau', 'offrir', 'emballage', 'boite', 'gift', 'present', 'regalo'], function () { return t('Le cardigan peut tout à fait être offert : choisissez la taille avec le guide (ou donnez-moi les mesures de la personne), et écrivez-nous pour une demande particulière.', 'The cardigan makes a fine gift: choose the size with the guide (or give me the person\'s measurements), and write to us for any special request.', 'Il cardigan è un ottimo regalo: scelga la taglia con la guida (o mi dia le misure della persona), e ci scriva per richieste particolari.'); }],
    [['promo', 'code promo', 'promo code', 'reduction', 'soldes', 'rabais', 'discount', 'sale', 'coupon', 'sconto', 'saldi'], function () { return t('Le site n\'annonce aucun code promo : la pièce est à CHF ' + F.prix + ' pour tous. ' + (foundersOuvert ? 'Les fondateurs ont ensuite 10 % sur les événements et voyages.' : ''), 'The site lists no promo code: the piece is CHF ' + F.prix + ' for everyone. ' + (foundersOuvert ? 'Founders then get 10 % off events and trips.' : ''), 'Il sito non annuncia codici sconto: il capo costa CHF ' + F.prix + ' per tutti. ' + (foundersOuvert ? 'I fondatori hanno poi il 10 % su eventi e viaggi.' : '')).trim(); }],
    [['photo', 'photos', 'photo portee', 'prototype', 'vraie', 'real photo', 'worn', 'foto', 'prototipo', '360', 'rendu', 'image'], function () { return t('Le modèle 360° et les images du site montrent la pièce telle qu\'elle est dessinée. Les mesures seront confirmées sur les prototypes.', 'The 360° model and the site\'s images show the piece as designed. Measurements will be confirmed on the prototypes.', 'Il modello 360° e le immagini del sito mostrano il capo come è disegnato. Le misure saranno confermate sui prototipi.'); }],
    [['bonjour', 'salut', 'hello', 'coucou', 'bonsoir', 'hi', 'hey', 'ciao', 'buongiorno', 'buonasera'], function () { return t('Bonjour. Posez-moi votre question : le cardigan, votre taille (donnez-moi vos mesures), la livraison, le club…', 'Hello. Ask me anything: the cardigan, your size (give me your measurements), delivery, the club…', 'Buongiorno. Mi chieda pure: il cardigan, la sua taglia (mi dia le misure), la consegna, il club…'); }],
    [['merci', 'super', 'parfait', 'top', 'genial', 'thanks', 'thank you', 'great', 'grazie', 'perfetto'], function () { return t('Avec plaisir. À très bientôt chez NOCELLI.', 'My pleasure. See you soon at NOCELLI.', 'Con piacere. A presto da NOCELLI.'); }],
    [['qui es tu', 'tu es qui', 'robot', 'bot', 'ia', 'intelligence artificielle', 'chatgpt', 'are you a bot', 'who are you', 'sei un bot', 'assistant'], function () { return t('Je suis l\'assistant de la maison. Je réponds à partir de tout ce qui est écrit sur le site, je calcule votre taille à partir de vos mesures, et pour une question générale je cherche sur Wikipédia. Pour le reste, une personne vous répond à ' + F.email + '.', 'I am the house assistant. I answer from everything written on the site, work out your size from your measurements, and look up general questions on Wikipedia. For anything else, a person replies at ' + F.email + '.', 'Sono l\'assistente della maison. Rispondo in base a tutto ciò che è scritto sul sito, calcolo la taglia dalle sue misure e per le domande generali cerco su Wikipedia. Per il resto, una persona risponde a ' + F.email + '.'); }]
  ];

  var VOCAB = {};
  R.forEach(function (r) { r[0].forEach(function (m) { jetons(m).forEach(function (w) { VOCAB[w] = 1; }); }); });
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
  var GENERIQUE = { cardigan: 1, nocelli: 1 };
  function meilleureIntention(n) {
    var mots = n.split(' '), best = null, score = 0;
    R.forEach(function (r) {
      var s = 0;
      r[0].forEach(function (m) {
        var k = norm(m);
        if ((' ' + n + ' ').indexOf(k.length < 5 ? ' ' + k + ' ' : k) >= 0) s += Math.max(4, k.length) * (k.indexOf(' ') > 0 ? 2 : 1);
        else if (k.length >= 5 && k.indexOf(' ') < 0 && mots.some(function (w) { return w.length >= 4 && proche(w, k); })) s += k.length - 1;
      });
      if (s && r[2]) s += r[2];
      if (s && GENERIQUE[r[0][0]]) s = Math.max(4, s * 0.5);
      if (s > score) { score = s; best = r; }
    });
    return best ? { r: best, s: score } : null;
  }

  /* ------------------------------------------------------------------ le raisonnement */
  function enObjet(x) { return typeof x === 'string' ? { t: x } : x; }
  function repondre(q) {
    q = String(q || '').trim();
    var dl = detecterLangue(q); L = dl || LANG;
    var n = norm(q);
    return chargerSite().then(function () { return reflechir(q, n); }).then(function (a) {
      a = enObjet(a || { t: '' }); ctx.tour++; return a;
    });
  }
  function reflechir(q, n) {
    // 0. taille portée ailleurs (« je fais du M chez … »)
    var hab = tailleHabituelle(n);
    if (hab && !Object.keys(lireMesures(q)).length) { ctx.dernier = { type: 'int' }; return R.filter(function (r) { return r[0][0] === 'taille'; })[0][1](n); }
    // prix combiné (« le cardigan plus la carte Signature, ça fait combien ? »)
    if (/combien|total|how much|quanto|prix|price|prezzo|cout|cost|fait|font|euro|eur\b/.test(n) && (/signature/.test(n) && /cardigan|piece|pull|nc/.test(n) || quantite(n))) return rPrix(n);
    // météo (open-meteo.com, gratuit, sans clé)
    if (/\b(meteo|quel temps|weather|tempo fa|che tempo|il pleut|pleuvoir|rain|piove)\b/.test(n)) return meteo(n);
    // pour une autre personne : on repart d'un profil vide
    if (/\b(mon|ma|mes|un|une) (copain|copine|ami|amie|frere|soeur|fils|fille|pere|mere|mari|femme|partenaire|cousin|cousine|compagnon|compagne|collegue)\b|\bfor (my|a) (friend|boyfriend|girlfriend|husband|wife|son|brother|father|partner|dad)\b|\b(il mio|la mia|mio|mia) (ragazzo|ragazza|amico|amica|fratello|figlio|marito|moglie|padre|compagno)\b|\bmy (friend|boyfriend|girlfriend|husband|wife|son|brother|father|partner|dad)\b/.test(n)) { ctx.profil = {}; ctx.pref = null; }
    // 1. Mesures personnelles → taille conseillée
    var mes = lireMesures(q), pref = lirePref(n);
    if (pref) ctx.pref = pref;
    var aMes = Object.keys(mes).length > 0;
    var personnel = /\b(je|j|mon|ma|mes|moi|i|my|me|i m|mi|ho|sono|mio|mia|faccio|misuro|peso|lui|il fait|he|she|elle|son|sa)\b/.test(n);
    var questionVet = /(quelle|quel|combien|what|how|which|quanto|quale|qual) .*(longueur|manche|length|sleeve|lunghezza|manica|largeur|tour)/.test(n) && !personnel;
    if (aMes && !questionVet) {
      Object.keys(mes).forEach(function (k) { ctx.profil[k] = mes[k]; });
      var conseil = conseiller(ctx.profil, ctx.pref);
      if (conseil) { ctx.dernier = { type: 'taille' }; return conseil; }
      if (ctx.profil.poids && !ctx.profil.hauteur) return t('Le poids seul ne suffit pas pour une taille. Donnez-moi votre tour de poitrine (sous les bras, ruban à plat), ou au moins votre hauteur.', 'Weight alone is not enough to pick a size. Give me your chest (under the arms, tape flat), or at least your height.', 'Il peso da solo non basta per la taglia. Mi dia il giro petto (sotto le braccia, metro piatto), o almeno l\'altezza.');
      if (false) return '';
      if (ctx.profil.epaules || ctx.profil.bras || ctx.profil.tourTaille) return t('Merci. Il me manque votre tour de poitrine (sous les bras, ruban à plat) : c\'est lui qui décide de la taille.', 'Thanks. I still need your chest (under the arms, tape flat): it decides the size.', 'Grazie. Mi manca il giro petto (sotto le braccia, metro piatto): è lui che decide la taglia.');
    }
    if (!aMes && /\d/.test(n) && /\b(je fais|j ai|i m|i am|i have|faccio|ho|misuro|mon|my|il mio)\b/.test(n) && !/cardigan|piece|pezzi|chf|jour|day|giorn|semaine|week/.test(n)) {
      var nb = (n.match(/\d+(?:[.,]\d+)?/) || [''])[0];
      return t(nb + ' : de quoi s\'agit-il ? Dites-moi par exemple « poitrine ' + nb + ' cm », « je mesure 1 m 80 » ou « ' + nb + ' kg », et je calcule votre taille.', nb + ': what is it? Tell me for example "chest ' + nb + ' cm", "I am 180 cm" or "' + nb + ' kg", and I will work out your size.', nb + ': di cosa si tratta? Mi dica per esempio « petto ' + nb + ' cm », « sono alto 180 cm » o « ' + nb + ' kg », e calcolo la taglia.');
    }
    // préférence seule après un conseil (« je veux le porter sur une chemise »)
    if (pref && !aMes && ctx.profil.poitrine && /taille|size|taglia|porter|wear|portare|chemise|shirt|camicia|ample|pres|loose|fitted/.test(n)) return conseiller(ctx.profil, ctx.pref);
    if (/^(et |mais |and |but |e |ma )?(pourquoi|why|perche|comment ca|explique|how come)\b/.test(n) && ctx.pourquoi && n.split(' ').length <= 4) return ctx.pourquoi;
    // 2. Mesures du vêtement / conversions
    var tl = lettresTaille(q);
    if (tl.length >= 2 && /difference|ecart|entre|compare|vs|versus|differenza|confronto|plus grand|change/.test(n)) {
      var tt = tl.filter(function (x) { return F.vet.poitrine[x]; });
      if (tt.length >= 2) { tt.sort(function (a, b) { return TAILLES.indexOf(a) - TAILLES.indexOf(b); }); return rDifference(tt[0], tt[tt.length - 1]); }
    }
    var vet = rMesureVet(n, tl);
    if (vet && !/^(taille|size|taglia)s?$/.test(n)) return vet;
    // suite : « et en L ? »
    if (tl.length && n.split(' ').length <= 5 && ctx.dernier && ctx.dernier.type === 'vet') return rMesureVet(ctx.dernier.n, tl);
    if (tl.length && n.split(' ').length <= 6 && !meilleureIntention(n.replace(/\b(xs|s|m|l|xl|xxl)\b/g, ''))) {
      var T = tl[0]; if (F.vet.poitrine[T]) { var rr = rMesureVet('poitrine epaules manche longueur', [T]); ctx.dernier = { type: 'vet', n: 'poitrine epaules manche longueur' }; return rr; }
    }
    if (/aisance|ease|agio|large de combien|marge/.test(n)) {
      if (ctx.profil.poitrine) return conseiller(ctx.profil, ctx.pref);
      return t('La coupe laisse 6 à 10 cm d\'aisance à la poitrine : le S fait 101 cm de tour pour une poitrine de 91 à 95 cm. Donnez-moi votre tour de poitrine et je calcule la vôtre.', 'The fit leaves 6 to 10 cm of ease at the chest: S is 101 cm around for a 91 to 95 cm chest. Tell me your chest and I will compute yours.', 'La vestibilità lascia 6–10 cm di agio al petto: la S misura 101 cm per un petto di 91–95 cm. Mi dica il suo giro petto e calcolo il suo.');
    }
    // 3. intentions écrites
    var mi = meilleureIntention(n);
    var site = chercher(q);
    var def = GENERAL.test(n), general = false;
    // part de la question que le site « connaît » : peu de mots connus = question hors sujet
    var qt = jetons(q).filter(function (w) { return !/^\d+$/.test(w); });
    var connus = qt.filter(function (w) { return IDF[w] !== undefined || VOCAB[w]; }).length;
    var part = qt.length ? connus / qt.length : 0;
    if (!MARQUE.test(n) && (def && part < 0.5 || qt.length >= 3 && part < 0.4)) general = true;
    if (def && !MARQUE.test(n) && mi && mi.s >= 10 && !GENERIQUE[mi.r[0][0]]) {
      // question de définition sur un sujet que le site traite : réponse du site + définition Wikipédia
      var base = enObjet(mi.r[1](n));
      return wiki(q).then(function (w) { if (!w) return base; return { t: base.t + '\n' + t('Selon Wikipédia : ', 'According to Wikipedia: ', 'Secondo Wikipedia: ') + w.ext, links: (base.links || []).concat([{ h: w.url, l: 'Wikipédia · ' + w.titre }]) }; });
    }
    // question de la FAQ du site posée presque mot pour mot
    var faq = site.filter(function (r) { return r.u.q; })[0];
    if (faq && !general) {
      var qq = jetons(faq.u.q + ' ' + (faq.u.qtr.en || '') + ' ' + (faq.u.qtr.it || ''));
      var com = qt.filter(function (w) { return qq.indexOf(w) >= 0; }).length;
      if (qt.length && com >= 2 && com / qt.length >= 0.6) { ctx.dernier = { type: 'site' }; var fx = texteUnite(faq.u); return { t: fx.t + avertFr(fx), links: [lienPage(faq.u)] }; }
    }
    // le texte du site couvre toute la question, mieux qu'une intention vague
    if (site.length && !general && mi && site[0].s >= 2.2 && (GENERIQUE[mi.r[0][0]] && mi.s < 12 || site[0].hit >= qt.length && qt.length >= 2 && site[0].u.q && mi.s < (qt.length >= 3 ? 16 : 8))) mi = null;
    if (mi && mi.s >= 4 && !general) { ctx.dernier = { type: 'int' }; return mi.r[1](n); }
    // 4. recherche dans le texte du site
    if (site.length && site[0].s >= 2.2 && !general) {
      var a = site[0].u, x = texteUnite(a), out = (a.q ? (L === 'fr' ? a.q : (a.qtr[L] || a.q)) + '\n' : '') + x.t + avertFr(x);
      if (site[1] && site[1].s > site[0].s * 0.85 && site[1].u.page === a.page && site[1].u.txt !== a.txt) { var y = texteUnite(site[1].u); out += '\n' + y.t; }
      ctx.dernier = { type: 'site' };
      return { t: out, links: [lienPage(a)] };
    }
    if (mi && mi.s >= 3 && !general) return mi.r[1](n);
    // 5. question générale → Wikipédia
    if (!MARQUE.test(n) && (GENERAL.test(n) || n.split(' ').length >= 3)) {
      return wiki(q).then(function (w) {
        if (w) return { t: t('Selon Wikipédia : ', 'According to Wikipedia: ', 'Secondo Wikipedia: ') + w.ext, links: [{ h: w.url, l: 'Wikipédia · ' + w.titre }, lienWeb(q)] };
        return { t: t('Je ne trouve pas la réponse sur le site ni sur Wikipédia. Vous pouvez chercher sur le web, ou nous écrire à ' + F.email + '.', 'I cannot find the answer on the site or on Wikipedia. You can search the web, or write to us at ' + F.email + '.', 'Non trovo la risposta sul sito né su Wikipedia. Può cercare sul web, o scriverci a ' + F.email + '.'), links: [lienWeb(q), { h: 'mailto:' + F.email, l: F.email }] };
      });
    }
    return { t: t('Le site ne le précise pas encore. Écrivez-nous à ' + F.email + ' ou sur Instagram, @nocelli.ch : une personne de la maison vous répond.', 'The site does not say yet. Write to us at ' + F.email + ' or on Instagram, @nocelli.ch: someone from the house will reply.', 'Il sito non lo precisa ancora. Ci scriva a ' + F.email + ' o su Instagram, @nocelli.ch: una persona della maison le risponderà.'), links: [{ h: 'mailto:' + F.email, l: F.email }] };
  }

  /* ------------------------------------------------------------------ interface (même design qu'avant) */
  var hote = document.getElementById('assistant');
  var UI = { titre: tu('Une question ?', 'A question?', 'Una domanda?'), sous: tu('La maison vous répond', 'The house answers', 'La maison risponde'),
    accueil: tu('Bonjour. Posez-moi votre question sur NOCELLI, le Cardigan Noce, votre taille (donnez-moi vos mesures en cm), la livraison ou le club.', 'Hello. Ask me about NOCELLI, the Noce Cardigan, your size (give me your measurements in cm), delivery or the club.', 'Buongiorno. Mi chieda di NOCELLI, del Cardigan Noce, della sua taglia (mi dia le misure in cm), della consegna o del club.'),
    ph: tu('Écrivez votre question…', 'Type your question…', 'Scriva la sua domanda…'), env: tu('Envoyer', 'Send', 'Invia'), fermer: tu('Fermer', 'Close', 'Chiudi'),
    sugg: LANG === 'en' ? ['When is the release?', 'I have a 98 cm chest, which size?', 'What wool is it?', 'When will I receive it?', 'What does Signature give?']
      : LANG === 'it' ? ['Quando esce?', 'Ho 98 cm di petto, che taglia?', 'Che lana è?', 'Quando lo ricevo?', 'Cosa offre Signature?']
      : ['Quand sort le cardigan ?', 'J\'ai 98 cm de poitrine, quelle taille ?', 'C\'est quelle laine ?', 'Quand vais-je le recevoir ?', 'Que donne Signature ?'] };
  if (!hote) {
    // Pages sans section questions : petit bouton flottant qui ouvre la même case.
    var lanceur = document.createElement('button');
    lanceur.type = 'button'; lanceur.className = 'as-lanceur'; lanceur.setAttribute('aria-expanded', 'false'); lanceur.setAttribute('data-sans-traduction', '');
    lanceur.innerHTML = '<span class="as-l-d"></span><span class="as-l-t"></span><span class="as-l-q">?</span>';
    lanceur.querySelector('.as-l-t').textContent = UI.titre; lanceur.setAttribute('aria-label', UI.titre);
    var volet = document.createElement('div');
    volet.className = 'as-volet'; volet.setAttribute('aria-hidden', 'true'); volet.setAttribute('data-sans-traduction', '');
    volet.innerHTML = '<button type="button" class="as-fermer">×</button><div id="assistant"></div>';
    volet.querySelector('.as-fermer').setAttribute('aria-label', UI.fermer);
    document.body.appendChild(volet); document.body.appendChild(lanceur);
    hote = volet.querySelector('#assistant');
    var s2 = document.createElement('style');
    s2.textContent =
      '.as-lanceur{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));z-index:60;display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:999px;background:linear-gradient(180deg,#3a2b23,#251a15);color:#F7F3EC;border:1px solid rgba(201,164,106,.55);font-family:Jost,sans-serif;font-size:9.5px;letter-spacing:.24em;text-transform:uppercase;cursor:pointer;box-shadow:0 10px 26px -12px rgba(20,14,10,.55),inset 0 1px 0 rgba(255,255,255,.06);transition:transform .5s cubic-bezier(.2,.7,.2,1),box-shadow .5s,bottom .4s}' +
      '.as-lanceur:hover{transform:translateY(-2px);box-shadow:0 16px 32px -14px rgba(20,14,10,.6)}' +
      '.as-l-q{display:none;font-family:"Bodoni Moda",serif;font-size:17px;letter-spacing:0;line-height:1}' +
      '@media (max-width:600px){.as-lanceur{width:40px;height:40px;padding:0;justify-content:center}.as-l-t,.as-l-d{display:none}.as-l-q{display:block}}' +
      '.as-l-d{width:5px;height:5px;transform:rotate(45deg);border:1px solid #c9a46a}' +
      '.as-volet{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:calc(max(16px,env(safe-area-inset-bottom)) + 52px);z-index:61;width:min(370px,calc(100vw - 32px));max-height:calc(100vh - 100px);overflow:auto;border-radius:20px;box-shadow:0 24px 60px -22px rgba(20,14,10,.45),0 2px 8px -4px rgba(20,14,10,.15);opacity:0;transform:translateY(12px) scale(.97);transform-origin:bottom right;pointer-events:none;visibility:hidden;transition:opacity .45s cubic-bezier(.2,.7,.2,1),transform .45s cubic-bezier(.2,.7,.2,1),visibility 0s .45s}' +
      '.as-volet.ouvert{opacity:1;transform:none;pointer-events:auto;visibility:visible;transition-delay:0s}' +
      '.as-volet #assistant{max-width:none}' +
      '.as-volet #assistant .as-boite{border-radius:20px;padding:26px 22px 20px;gap:16px}' +
      '.as-volet #assistant .as-boite::before{border-radius:16px}' +
      '.as-volet #assistant .as-titre{font-size:21px}' +
      '.as-volet #assistant .as-fil{max-height:min(300px,42vh);gap:12px;padding-top:14px}' +
      '.as-volet #assistant .as-n{font-size:14px;line-height:1.5}' +
      '.as-volet #assistant input{font-size:15px;padding:9px 0}' +
      '.as-volet #assistant .as-sugg{gap:6px 14px}' +
      '.as-volet #assistant .as-sugg button{font-size:11.5px}' +
      '.as-fermer{position:absolute;top:12px;right:16px;z-index:2;width:26px;height:26px;border-radius:50%;border:1px solid rgba(176,141,87,.35);background:#FBF8F3;font-size:15px;line-height:1;color:#b08d57;cursor:pointer}';
    document.head.appendChild(s2);
    // au-dessus d'une barre d'achat fixe en bas de page, s'il y en a une visible
    function decaler() {
      var b = document.querySelector('.barre');
      var h = 0; if (b) { var r = b.getBoundingClientRect(), cs = getComputedStyle(b); if (cs.position === 'fixed' && cs.display !== 'none' && r.height && r.top < innerHeight && r.bottom > innerHeight - 4) h = r.height; }
      lanceur.style.bottom = h ? 'calc(' + h + 'px + 12px)' : '';
      volet.style.bottom = h ? 'calc(' + h + 'px + 64px)' : '';
    }
    addEventListener('scroll', decaler, { passive: true }); addEventListener('resize', decaler); setTimeout(decaler, 300);
    lanceur.addEventListener('click', function () {
      var o = volet.classList.toggle('ouvert'); lanceur.setAttribute('aria-expanded', String(o)); volet.setAttribute('aria-hidden', String(!o));
      if (o) { chargerSite(); setTimeout(function () { var c = volet.querySelector('input'); if (c) c.focus({ preventScroll: true }); }, 50); }
    });
    var fermer = function () { volet.classList.remove('ouvert'); lanceur.setAttribute('aria-expanded', 'false'); volet.setAttribute('aria-hidden', 'true'); };
    volet.querySelector('.as-fermer').addEventListener('click', fermer);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fermer(); });
  } else hote.setAttribute('data-sans-traduction', '');

  hote.innerHTML =
    '<div class="as-boite">' +
      '<div class="as-tete"><span class="as-titre"></span><span class="as-sous"></span></div>' +
      '<div class="as-fil" aria-live="polite"></div>' +
      '<form class="as-f" autocomplete="off"><label class="sr" for="as-q"></label><input id="as-q" type="text" maxlength="300"><button type="submit">→</button></form>' +
      '<div class="as-sugg"></div>' +
    '</div>';
  hote.querySelector('.as-titre').textContent = UI.titre; hote.querySelector('.as-sous').textContent = UI.sous;
  hote.querySelector('label').textContent = UI.ph; hote.querySelector('input').placeholder = UI.ph; hote.querySelector('.as-f button').setAttribute('aria-label', UI.env);
  var st = document.createElement('style');
  st.textContent =
    '#assistant{max-width:430px}' +
    '#assistant .as-boite{position:relative;border:1px solid rgba(176,141,87,.45);background:#FBF8F3;padding:34px 30px 26px;display:grid;gap:22px}' +
    '#assistant .as-boite::before{content:"";position:absolute;inset:5px;border:1px solid rgba(176,141,87,.18);pointer-events:none}' +
    '#assistant .as-tete{display:grid;justify-items:center;gap:10px;text-align:center}' +
    '#assistant .as-tete::before{content:"";width:7px;height:7px;transform:rotate(45deg);border:1px solid #b08d57}' +
    '#assistant .as-titre{font-family:"Bodoni Moda",serif;font-size:25px;letter-spacing:.01em;color:#30231D}' +
    '#assistant .as-sous{font-size:9.5px;letter-spacing:.34em;text-transform:uppercase;color:#b08d57}' +
    '#assistant .as-fil{display:flex;flex-direction:column;gap:18px;max-height:360px;overflow-y:auto;scroll-behavior:smooth;padding-top:20px;border-top:1px solid rgba(176,141,87,.35);scrollbar-width:thin}' +
    '#assistant .as-m{margin:0;line-height:1.6}' +
    '#assistant .as-n{font-family:"Bodoni Moda",serif;font-style:italic;font-size:16.5px;color:#3A2519;padding-left:16px;border-left:1px solid #b08d57;white-space:pre-line}' +
    '#assistant .as-n .as-liens{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:8px;font-family:Jost,sans-serif;font-style:normal;font-size:11px;letter-spacing:.12em;text-transform:uppercase}' +
    '#assistant .as-n .as-liens a{color:#8a6a3c;text-decoration:none;border-bottom:1px solid rgba(176,141,87,.5)}' +
    '#assistant .as-n .as-liens a:hover{color:#30231D;border-color:#30231D}' +
    '#assistant .as-attente{letter-spacing:.3em;color:#b08d57;animation:as-p 1.2s ease-in-out infinite}' +
    '@keyframes as-p{50%{opacity:.35}}' +
    '#assistant .as-u{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:rgba(58,37,25,.6);text-align:right}' +
    '#assistant .as-sugg{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 18px}' +
    '#assistant .as-sugg button{border:0;border-bottom:1px solid rgba(176,141,87,.5);background:none;padding:2px 0;font:inherit;font-size:12.5px;color:rgba(58,37,25,.8);cursor:pointer;transition:color .3s,border-color .3s}' +
    '#assistant .as-sugg button:hover{color:#30231D;border-color:#30231D}' +
    '#assistant .as-f{display:flex;align-items:center;border-bottom:1px solid #30231D}' +
    '#assistant input{flex:1;min-width:0;border:0;background:none;font-family:"Bodoni Moda",serif;font-style:italic;font-size:16px;padding:12px 0;color:#3A2519;outline:none}' +
    '#assistant input::placeholder{color:rgba(58,37,25,.45)}' +
    '#assistant .as-f button{border:0;background:none;color:#b08d57;font-size:20px;padding:0 2px 0 12px;cursor:pointer;transition:transform .3s}' +
    '#assistant .as-f button:hover{transform:translateX(3px)}' +
    '#assistant .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}';
  document.head.appendChild(st);
  var fil = hote.querySelector('.as-fil'), champ = hote.querySelector('input'), sugg = hote.querySelector('.as-sugg');
  function ouvrirGuide(e) {
    var dlg = document.getElementById('guide');
    if (dlg && dlg.showModal) { e.preventDefault(); if (!dlg.open) { var b = document.querySelector('[data-guide]'); if (b) b.click(); if (!dlg.open) dlg.showModal(); } }
  }
  function bulle(a, c) {
    var p = document.createElement('p'); p.className = 'as-m ' + c;
    a = enObjet(a); p.appendChild(document.createTextNode(a.t));
    if (a.links && a.links.length) {
      var d = document.createElement('span'); d.className = 'as-liens';
      a.links.forEach(function (k) {
        var x = document.createElement('a'); x.href = k.h; x.textContent = k.l;
        if (/^https?:/.test(k.h)) { x.target = '_blank'; x.rel = 'noopener'; }
        if (k.guide) x.addEventListener('click', ouvrirGuide);
        d.appendChild(x);
      });
      p.appendChild(document.createElement('br')); p.appendChild(d);
    }
    fil.appendChild(p); fil.scrollTop = fil.scrollHeight; return p;
  }
  function demander(q) {
    q = q.trim(); if (!q) return;
    bulle({ t: q }, 'as-u'); champ.value = '';
    var att = bulle({ t: '· · ·' }, 'as-n as-attente'), debut = Date.now();
    repondre(q).then(function (a) {
      setTimeout(function () { att.remove(); bulle(a, 'as-n'); }, Math.max(0, 450 - (Date.now() - debut)));
    }).catch(function () { att.remove(); bulle({ t: tu('Désolé, une erreur est survenue. Écrivez-nous à ', 'Sorry, something went wrong. Write to us at ', 'Spiacenti, si è verificato un errore. Ci scriva a ') + F.email }, 'as-n'); });
  }
  bulle({ t: UI.accueil }, 'as-n');
  UI.sugg.forEach(function (s) { var b = document.createElement('button'); b.type = 'button'; b.textContent = s; b.addEventListener('click', function () { demander(s); }); sugg.appendChild(b); });
  hote.querySelector('form').addEventListener('submit', function (e) { e.preventDefault(); demander(champ.value); });
  if (document.getElementById('assistant') && !document.querySelector('.as-volet')) chargerSite();
  window.NocelliAssistant = { repondre: repondre, mesures: lireMesures, faits: F, contexte: ctx, chercher: function (q) { return chargerSite().then(function () { return chercher(q).slice(0, 5).map(function (r) { return [Math.round(r.s * 100) / 100, r.u.txt]; }); }); } };
})();
