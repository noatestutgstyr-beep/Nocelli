/* Nocelli : la salle du coffre (Three.js).
   On franchit la porte du coffre et on arrive devant une armoire en U : un rayon par collection.
   Chaque pièce pend à un cintre ; au survol elle se tourne et s'incline vers le visiteur, un clic ouvre sa fiche.
   Pour ajouter une collection ou une pièce, il suffit de compléter COLLECTIONS ci-dessous. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Ordre des rayons : fond au centre, fond gauche, fond droite, côté gauche (fond puis avant), côté droit (fond puis avant)
var COLLECTIONS = [
  { nom: 'Prima Edizione', sous: 'Autunno 2026', pieces: [
    { nom: 'Le Cardigan Noce', num: 'N° 01 / 50', prix: 'CHF 139', url: 'cardigan-noce.html',
      face: 'img/cardigan-face.webp', dos: 'img/cardigan-dos.webp' }
  ] },
  { nom: 'Seconda Edizione', sous: 'In arrivo' },
  { nom: 'Terza Edizione', sous: 'In arrivo' },
  { nom: 'Quarta Edizione', sous: 'In arrivo' },
  { nom: 'Quinta Edizione', sous: 'In arrivo' },
  { nom: 'Sesta Edizione', sous: 'In arrivo' },
  { nom: 'Settima Edizione', sous: 'In arrivo' }
];

// Dimensions de la salle (mètres)
var HW = 2.3, ZB = -2.2, D = 0.62, T = 0.035, Y_BAS = 0.62, Y_HAUT = 2.35, Y_TRINGLE = 2.2, PLAFOND = 2.9;
var Z_COTE = .9, Z_PORTE = 3.4, Z_DEPART = 6.4, Z_ARRIVEE = 1.85, OEIL = 1.5;

function hasard(seed) {
  return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function lisse(x) { return x * x * (3 - 2 * x); }
function easeInOut(x) { return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }

export async function ouvrir(o) {
  // les plaques sont gravées avec les polices du site : on les attend
  if (document.fonts) { try { await Promise.all([document.fonts.load('60px "Bodoni Moda"'), document.fonts.load('26px Jost')]); } catch (e) {} }
  var racine = o.racine, canvas = racine.querySelector('canvas'), fiche = o.fiche;
  var reduit = !!o.reduit, tactile = matchMedia('(hover: none)').matches;
  var mobile = Math.min(innerWidth, innerHeight) < 700;

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.6 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  var aniso = renderer.capabilities.getMaxAnisotropy();

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0705);
  scene.fog = new THREE.Fog(0x0b0705, 7, 15);
  var pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  var camera = new THREE.PerspectiveCamera(50, 1, 0.05, 40);
  camera.rotation.order = 'YXZ';

  // ---------- Matières ----------
  function toile(w, h, dessin) {
    var c = document.createElement('canvas'); c.width = w; c.height = h; dessin(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  // Noyer : fibres verticales ondulées, quelques flammes plus claires
  function noyer(base, clair, seed) {
    return toile(1024, 1024, function (g, w, h) {
      var r = hasard(seed);
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (var b = 0; b < 14; b++) {
        var x0 = r() * w, lw = 30 + r() * 90, gr = g.createLinearGradient(x0 - lw, 0, x0 + lw, 0);
        gr.addColorStop(0, 'rgba(' + clair + ',0)'); gr.addColorStop(.5, 'rgba(' + clair + ',' + (.05 + r() * .08) + ')'); gr.addColorStop(1, 'rgba(' + clair + ',0)');
        g.fillStyle = gr; g.fillRect(x0 - lw, 0, lw * 2, h);
      }
      for (var i = 0; i < 1100; i++) {
        var x = r() * w, a = .025 + r() * .09, amp = 2 + r() * 7, f = (1 + Math.floor(r() * 3)) * Math.PI * 2 / h, ph = r() * 6.28;
        g.strokeStyle = r() < .62 ? 'rgba(10,5,2,' + a + ')' : 'rgba(' + clair + ',' + a * .9 + ')';
        g.lineWidth = .4 + r() * 2.2; g.beginPath();
        for (var y = 0; y <= h; y += 8) { var xx = x + Math.sin(y * f + ph) * amp; if (y) g.lineTo(xx, y); else g.moveTo(xx, y); }
        g.stroke();
      }
    });
  }
  // Daim couleur sable pour le fond des rayons : la pièce chocolat s'y détache
  function daim() {
    return toile(512, 512, function (g, w, h) {
      var r = hasard(7), im = g.createImageData(w, h);
      for (var i = 0; i < w * h; i++) { var n = (r() - .5) * 22; im.data[i * 4] = 150 + n; im.data[i * 4 + 1] = 125 + n * .9; im.data[i * 4 + 2] = 96 + n * .8; im.data[i * 4 + 3] = 255; }
      g.putImageData(im, 0, 0);
      var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,230,190,.10)'); gr.addColorStop(.55, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(20,10,4,.45)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
  }
  var texNoyer = noyer('#3b2619', '214,170,120', 11), texNoyerH = texNoyer.clone();
  texNoyerH.center.set(.5, .5); texNoyerH.rotation = Math.PI / 2; texNoyerH.needsUpdate = true;
  var texMur = noyer('#22150d', '160,120,80', 23);
  var cacheMat = {};
  function bois(rx, ry, horiz) {
    var k = rx.toFixed(1) + ',' + ry.toFixed(1) + (horiz ? 'h' : 'v');
    if (cacheMat[k]) return cacheMat[k];
    var t = (horiz ? texNoyerH : texNoyer).clone(); t.repeat.set(rx, ry); t.needsUpdate = true;
    return cacheMat[k] = new THREE.MeshStandardMaterial({ map: t, roughness: .42, metalness: 0, envMapIntensity: .55 });
  }
  var matDaim = new THREE.MeshStandardMaterial({ map: daim(), roughness: .95, envMapIntensity: .2 });

  var matLaiton = new THREE.MeshStandardMaterial({ color: 0xc6a066, metalness: 1, roughness: .26, envMapIntensity: 1.2 });
  var matAcier = new THREE.MeshStandardMaterial({ color: 0x6d655c, metalness: .95, roughness: .36, envMapIntensity: 1 });
  var matLed = new THREE.MeshBasicMaterial({ color: 0xffd8a0 });
  matLed.color.multiplyScalar(2.2);
  var matSpot = new THREE.MeshBasicMaterial({ color: 0x8a7458 });
  var matSol = new THREE.MeshPhysicalMaterial({ color: 0x130c08, roughness: .2, metalness: 0, clearcoat: 1, clearcoatRoughness: .12, envMapIntensity: .5 });
  var matPlafond = new THREE.MeshStandardMaterial({ color: 0x120b07, roughness: .9 });
  var matCintre = new THREE.MeshStandardMaterial({ map: texNoyer, color: 0xc08a5a, roughness: .3, envMapIntensity: .8 });
  var matInvisible = new THREE.MeshBasicMaterial({ visible: false });

  function boite(parent, w, h, d, mat, x, y, z) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  }

  // ---------- Pièce : murs, sol, plafond, porte du coffre ----------
  var sol = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), matSol);
  sol.rotation.x = -Math.PI / 2; sol.receiveShadow = true; scene.add(sol);
  var plafond = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), matPlafond);
  plafond.rotation.x = Math.PI / 2; plafond.position.y = PLAFOND; scene.add(plafond);
  var matMur = new THREE.MeshStandardMaterial({ map: texMur, roughness: .55, envMapIntensity: .3 });
  texMur.repeat.set(3, 1);
  [[0, ZB - .02, 0], [-HW - .02, 0, Math.PI / 2], [HW + .02, 0, -Math.PI / 2]].forEach(function (m) {
    var p = new THREE.Mesh(new THREE.PlaneGeometry(8, PLAFOND), matMur);
    p.position.set(m[0], PLAFOND / 2, m[1] || 0); p.rotation.y = m[2];
    if (m[2]) p.position.z = .6;
    scene.add(p);
  });
  // Mur de la porte, percé d'un cercle, avec l'anneau d'acier et ses rivets (comme dans la vidéo)
  var R_PORTE = 1.28, Y_PORTE = 1.34;
  var forme = new THREE.Shape(); forme.moveTo(-7, 0); forme.lineTo(7, 0); forme.lineTo(7, PLAFOND); forme.lineTo(-7, PLAFOND); forme.lineTo(-7, 0);
  var trou = new THREE.Path(); trou.absarc(0, Y_PORTE, R_PORTE, 0, Math.PI * 2, true); forme.holes.push(trou);
  var murPorte = new THREE.Mesh(new THREE.ShapeGeometry(forme, 64), matMur);
  murPorte.position.z = Z_PORTE; murPorte.material.side = THREE.DoubleSide; scene.add(murPorte);
  var porte = new THREE.Group(); porte.position.set(0, Y_PORTE, Z_PORTE); scene.add(porte);
  var anneau = new THREE.Mesh(new THREE.TorusGeometry(R_PORTE + .06, .11, 24, 128), matAcier); anneau.position.z = .02; porte.add(anneau);
  var filet = new THREE.Mesh(new THREE.TorusGeometry(R_PORTE + .17, .012, 8, 128), matLaiton); filet.position.z = .06; porte.add(filet);
  var tunnel = new THREE.Mesh(new THREE.CylinderGeometry(R_PORTE, R_PORTE, .7, 96, 1, true), new THREE.MeshStandardMaterial({ color: 0x4a443e, metalness: .9, roughness: .4, side: THREE.BackSide }));
  tunnel.rotation.x = Math.PI / 2; tunnel.position.z = -.35; porte.add(tunnel);
  var rivet = new THREE.SphereGeometry(.022, 12, 8);
  for (var i = 0; i < 36; i++) {
    var a = i / 36 * Math.PI * 2, rv = new THREE.Mesh(rivet, matLaiton);
    rv.position.set(Math.cos(a) * (R_PORTE + .06), Math.sin(a) * (R_PORTE + .06), .13); porte.add(rv);
  }
  for (i = 0; i < 14; i++) { // logements des pênes dans l'épaisseur
    a = i / 14 * Math.PI * 2;
    var pn = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .02, 16), new THREE.MeshStandardMaterial({ color: 0x0c0907, roughness: .8 }));
    pn.position.set(Math.cos(a) * (R_PORTE - .005), Math.sin(a) * (R_PORTE - .005), -.3); pn.rotation.z = a + Math.PI / 2; porte.add(pn);
  }

  // ---------- Plaques gravées ----------
  function plaque(nom, sous) {
    var t = toile(1024, 220, function (g, w, h) {
      var gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#d9b97f'); gr.addColorStop(.5, '#b8945c'); gr.addColorStop(1, '#9c7a48');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(60,38,18,.55)'; g.lineWidth = 3; g.strokeRect(14, 14, w - 28, h - 28);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      // lettres gravées : un trait clair décalé sous le trait sombre
      var lettres = function (txt, y, px, fam, esp) {
        g.font = px + 'px ' + fam; g.letterSpacing = esp + 'px';
        g.fillStyle = 'rgba(255,236,200,.45)'; g.fillText(txt.toUpperCase(), w / 2 + 1.5 + esp / 2, y + 2);
        g.fillStyle = '#3a2414'; g.fillText(txt.toUpperCase(), w / 2 + esp / 2, y);
      };
      lettres(nom, 92, 66, '"Bodoni Moda", Georgia, serif', 14);
      lettres(sous, 162, 32, 'Jost, "Helvetica Neue", Arial, sans-serif', 14);
    });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return new THREE.MeshStandardMaterial({ map: t, metalness: .5, roughness: .42, envMapIntensity: .8 });
  }

  // ---------- Cintre ----------
  var courbeCintre = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.215, -.125, 0), new THREE.Vector3(-.16, -.098, 0), new THREE.Vector3(-.08, -.07, 0),
    new THREE.Vector3(0, -.058, 0), new THREE.Vector3(.08, -.07, 0), new THREE.Vector3(.16, -.098, 0), new THREE.Vector3(.215, -.125, 0)]);
  var geoCintre = new THREE.TubeGeometry(courbeCintre, 64, .009, 14, false);
  var geoBout = new THREE.SphereGeometry(.009, 14, 10);
  var crochet = [];
  for (i = 0; i <= 24; i++) { a = i / 24; var ang = Math.PI * 1.25 * a - Math.PI * .25; crochet.push(new THREE.Vector3(Math.cos(ang) * .026 - .0, Math.sin(ang) * .026 + .0, 0)); }
  crochet.push(new THREE.Vector3(-.026, -.01, 0), new THREE.Vector3(-.02, -.03, 0), new THREE.Vector3(0, -.045, 0));
  var geoCrochet = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(crochet), 48, .0035, 8, false);
  function cintre() {
    var g = new THREE.Group();
    var c = new THREE.Mesh(geoCrochet, matLaiton); c.position.y = -.002; c.rotation.y = Math.PI / 2; c.castShadow = true; g.add(c);
    var b = new THREE.Mesh(geoCintre, matCintre); b.castShadow = true; g.add(b);
    [-.215, .215].forEach(function (x) { var s = new THREE.Mesh(geoBout, matCintre); s.position.set(x, -.125, 0); g.add(s); });
    var n = new THREE.Mesh(new THREE.CylinderGeometry(.007, .007, .02, 10), matLaiton); n.position.y = -.05; g.add(n);
    return g;
  }

  // ---------- Vêtement : la photo détourée posée sur une surface galbée, face et dos ----------
  var chargeur = new THREE.TextureLoader();
  function charger(url) {
    return new Promise(function (ok) {
      chargeur.load(url, function (t) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; ok(t); }, undefined, function () { ok(null); });
    });
  }
  function vetement(face, dos) {
    var asp = face.image.height / face.image.width, W = .7, H = W * asp, g = new THREE.Group();
    function nappe(tex, sens) {
      var geo = new THREE.PlaneGeometry(W, H, 32, 40), p = geo.attributes.position;
      for (var k = 0; k < p.count; k++) {
        var x = p.getX(k) / (W / 2), y = (p.getY(k) + H / 2) / H; // y : 0 en bas, 1 au col
        var torse = Math.max(0, 1 - x * x * 1.15);                  // volume du buste, nul aux manches
        var epaule = lisse(Math.min(1, (1 - y) / .16));             // l'épaule s'aplatit sur le cintre
        p.setZ(k, .045 * torse * epaule + .011);
      }
      geo.computeVertexNormals();
      var m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, alphaTest: .5, roughness: .92, envMapIntensity: .12, side: THREE.FrontSide }));
      if (sens < 0) m.rotation.y = Math.PI;
      m.castShadow = true; m.receiveShadow = true;
      m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: .5 });
      return m;
    }
    // le haut de l'image (col) dépasse un peu au-dessus des épaules du cintre
    var yc = .005 - H / 2;
    var f = nappe(face, 1); f.position.y = yc; g.add(f);
    if (dos) { var b = nappe(dos, -1); b.position.y = yc; g.add(b); }
    return g;
  }

  // ---------- Armoire : une rangée de rayons face à +z ----------
  var rayons = [], pieces = [], lumieres = [];
  function armoire(n, l, ordre) {
    var g = new THREE.Group(), L = n * l;
    boite(g, L, .08, D - .05, bois(L / .8, .2, true), 0, .04, -D / 2 - .025);
    boite(g, L, Y_BAS - .08, D - .04, bois(L / .8, .6, true), 0, (Y_BAS + .08) / 2, -D / 2 - .03);
    boite(g, L + .01, T, D, bois(L / .8, .3, true), 0, Y_BAS + T / 2, -D / 2);
    boite(g, L + .01, T, D, bois(L / .8, .3, true), 0, Y_HAUT - T / 2, -D / 2);
    boite(g, L + .06, .26, D + .04, bois(L / .8, .4, true), 0, Y_HAUT + .13, -D / 2 + .02);
    boite(g, L + .1, .025, D + .08, bois(L / .8, .1, true), 0, Y_HAUT + .2725, -D / 2 + .04);
    boite(g, L, PLAFOND - Y_HAUT - .285, D, bois(L / .8, .2, true), 0, (PLAFOND + Y_HAUT + .285) / 2, -D / 2);
    for (var k = 0; k <= n; k++) boite(g, T, Y_HAUT + .26 - .08, D + .005, bois(.25, 2.2, false), -L / 2 + k * l, (Y_HAUT + .26 + .08) / 2, -D / 2);
    for (k = 0; k < n; k++) {
      var x = -L / 2 + (k + .5) * l, c = COLLECTIONS[ordre[k]], r = { groupe: g, x: x, coll: c, pieces: [] };
      // tiroirs et poignées
      [.215, .485].forEach(function (y) {
        boite(g, l - T - .012, .255, .024, bois(1.2, .4, true), x, y, .006);
        boite(g, .2, .012, .016, matLaiton, x, y + .07, .026);
      });
      // fond en daim, bande LED, tringle et supports
      boite(g, l - T, Y_HAUT - Y_BAS - T * 2, .02, matDaim, x, (Y_HAUT + Y_BAS) / 2, -D + .012);
      var led = new THREE.Mesh(new THREE.BoxGeometry(l - T - .03, .007, .014), matLed); led.position.set(x, Y_HAUT - T - .006, -.05); g.add(led);
      var tr = new THREE.Mesh(new THREE.CylinderGeometry(.011, .011, l - T, 20), matLaiton);
      tr.rotation.z = Math.PI / 2; tr.position.set(x, Y_TRINGLE, -D / 2); tr.castShadow = true; g.add(tr);
      [-1, 1].forEach(function (s) { boite(g, .006, .05, .04, matLaiton, x + s * (l - T) / 2 - s * .004, Y_TRINGLE + .01, -D / 2); });
      // plaque gravée au fronton
      var pl = new THREE.Mesh(new THREE.BoxGeometry(.66, .145, .008), [matLaiton, matLaiton, matLaiton, matLaiton, plaque(c.nom, c.sous), matLaiton]);
      pl.position.set(x, Y_HAUT + .13, .045); g.add(pl);
      // lumière du rayon : elle lave le daim depuis la bande LED
      var sp = new THREE.SpotLight(0xffc98f, ordre[k] === 0 ? 5 : 3.2, 3.2, 1.05, 1, 2);
      sp.position.set(x, Y_HAUT - .06, -.08); sp.target.position.set(x, Y_BAS + .2, -D + .04);
      g.add(sp); g.add(sp.target); r.lumiere = sp; r.base = sp.intensity;
      // pièces de la collection, ou cintres vides en attente
      var liste = c.pieces || [], nb = liste.length || 3, ecart = Math.min(.24, (l - .3) / Math.max(1, nb - 1));
      for (var j = 0; j < nb; j++) {
        var px = x + (nb === 1 ? 0 : (j - (nb - 1) / 2) * ecart);
        var pivot = new THREE.Group(); pivot.position.set(px, Y_TRINGLE + .028, -D / 2); pivot.rotation.order = 'YXZ'; g.add(pivot);
        pivot.add(cintre());
        var etat = { pivot: pivot, x: px, rayon: r, t: 0, v: 0, cible: 0, repos: liste.length === 1 ? -.5 : -1.3, ph: Math.random() * 6.28, info: liste[j] || null };
        pivot.rotation.y = etat.repos;
        if (etat.info) {
          var proxy = new THREE.Mesh(new THREE.BoxGeometry(.66, .95, .3), matInvisible); proxy.position.y = -.44; proxy.userData.piece = etat; pivot.add(proxy);
          etat.proxy = proxy; pieces.push(etat);
          (function (e) {
            Promise.all([charger(e.info.face), charger(e.info.dos)]).then(function (tx) { if (tx[0]) e.pivot.add(vetement(tx[0], tx[1])); });
          })(etat);
        }
        r.pieces.push(etat);
      }
      rayons.push(r);
    }
    return g;
  }
  // Fond entre les deux côtés ; les côtés partent du fond et s'avancent vers la porte. Coins pleins.
  var lFond = (HW - D) * 2 / 3, lCote = (Z_COTE - (ZB + D)) / 2;
  var fond = armoire(3, lFond, [1, 0, 2]); fond.position.set(0, 0, ZB + D); scene.add(fond);
  // côté gauche : son +x local part vers le fond, on liste donc l'avant puis le fond
  var gauche = armoire(2, lCote, [5, 3]); gauche.rotation.y = Math.PI / 2; gauche.position.set(-HW + D, 0, ZB + D + lCote); scene.add(gauche);
  var droite = armoire(2, lCote, [4, 6]); droite.rotation.y = -Math.PI / 2; droite.position.set(HW - D, 0, ZB + D + lCote); scene.add(droite);
  [-1, 1].forEach(function (s) { boite(scene, D, PLAFOND, D, bois(.6, 2.4, false), s * (HW - D / 2), PLAFOND / 2, ZB + D / 2); });

  // Lumières d'ensemble : très peu, la lumière vient des rayons
  scene.add(new THREE.HemisphereLight(0x8a6a4c, 0x0a0604, .35));
  var cle = new THREE.SpotLight(0xffe2bd, 12, 7, .3, .95, 1.6);
  cle.position.set(.35, 2.45, .7); cle.target.position.set(0, 1.62, ZB + D / 2);
  cle.castShadow = true; cle.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048); cle.shadow.bias = -.0004; cle.shadow.radius = 5; cle.shadow.normalBias = .02;
  scene.add(cle); scene.add(cle.target);
  for (i = 0; i < 3; i++) { // spots encastrés au plafond
    var sx = (i - 1) * 1.4, spot = new THREE.Mesh(new THREE.CircleGeometry(.035, 24), matSpot);
    spot.rotation.x = Math.PI / 2; spot.position.set(sx, PLAFOND - .002, ZB + D + 1.1); scene.add(spot);
  }
  var lumPorte = new THREE.PointLight(0xffc896, 1.4, 4, 2); lumPorte.position.set(0, 2.4, Z_PORTE - .3); scene.add(lumPorte);

  // ---------- Rendu ----------
  var composer = null;
  if (!mobile) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), .22, .5, .95));
    composer.addPass(new OutputPass());
  }
  function taille() {
    var w = racine.clientWidth || innerWidth, h = racine.clientHeight || innerHeight;
    camera.aspect = w / h;
    camera.fov = w / h < .8 ? 52 : w / h < 1.2 ? 56 : 48;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    if (composer) composer.setSize(w, h);
  }
  taille(); addEventListener('resize', taille);

  // ---------- Regard et survol ----------
  var souris = new THREE.Vector2(0, 0), regard = { yaw: 0, pitch: 0, cy: 0, cp: 0 }, glisse = null, survol = null, choisi = null;
  var ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), entree = reduit ? 1 : 0, sortie = -1, finSortie = null;
  var balayage = tactile && !reduit ? 0 : -1;
  var proxies = pieces.map(function (p) { return p.proxy; });
  function viser(cx, cy) {
    var r = canvas.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    var h = ray.intersectObjects(proxies, false)[0];
    return h ? h.object.userData.piece : null;
  }
  function choisir(p) {
    if (survol === p) return;
    if (survol) survol.cible = 0;
    survol = p; if (p) p.cible = 1;
    canvas.style.cursor = p ? 'pointer' : '';
    if (p) {
      fiche.href = p.info.url;
      fiche.querySelector('[data-num]').textContent = p.info.num;
      fiche.querySelector('[data-nom]').textContent = p.info.nom;
      fiche.querySelector('[data-prix]').textContent = p.info.prix;
      fiche.hidden = false;
      requestAnimationFrame(function () { fiche.classList.add('visible'); });
    } else fiche.classList.remove('visible');
  }
  function aller(p) { if (p && entree >= 1) o.aller(p.info.url); }
  canvas.addEventListener('pointermove', function (e) {
    var r = canvas.getBoundingClientRect();
    if (e.pointerType === 'mouse') souris.set((e.clientX - r.left) / r.width * 2 - 1, (e.clientY - r.top) / r.height * 2 - 1);
    if (glisse) {
      var dx = e.clientX - glisse.x, dy = e.clientY - glisse.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) glisse.bouge = true;
      regard.yaw = Math.max(-1, Math.min(1, glisse.yaw + dx * .004));
      regard.pitch = Math.max(-.25, Math.min(.2, glisse.pitch + dy * .002));
    } else if (e.pointerType === 'mouse' && entree >= 1) choisir(viser(e.clientX, e.clientY));
  });
  canvas.addEventListener('pointerdown', function (e) {
    balayage = -1;
    if (e.pointerType !== 'mouse') glisse = { x: e.clientX, y: e.clientY, yaw: regard.yaw, pitch: regard.pitch, bouge: false };
  });
  canvas.addEventListener('pointerup', function (e) {
    var g = glisse; glisse = null;
    if (g && g.bouge) return;
    var p = viser(e.clientX, e.clientY);
    if (e.pointerType === 'mouse') { aller(p); return; }
    // au doigt : un premier toucher présente la pièce, le second ouvre sa fiche
    if (p && p === survol) aller(p); else choisir(p);
  });
  canvas.addEventListener('pointercancel', function () { glisse = null; });
  canvas.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') { souris.set(0, 0); choisir(null); } });
  fiche.addEventListener('focus', function () { if (!survol && pieces[0]) choisir(pieces[0]); });

  // ---------- Animation ----------
  var horloge = new THREE.Clock(), raf = 0, vec = new THREE.Vector3(), cam = new THREE.Vector3(), regardCible = new THREE.Vector3();
  function poser(dt, temps) {
    rayons.forEach(function (r) {
      r.pieces.forEach(function (p) {
        // ressort amorti : la pièce se tourne, puis se balance un peu avant de s'immobiliser
        var k = 38, amort = 9.5;
        p.v += ((p.cible - p.t) * k - p.v * amort) * dt; p.t += p.v * dt;
        var loc = r.groupe.worldToLocal(cam.copy(camera.position));
        var face = Math.atan2(loc.x - p.x, loc.z - (-D / 2)) * .8;
        var voisin = 0;
        if (survol && survol !== p && survol.rayon === r) voisin = (p.x < survol.x ? -1 : 1) * .07 * survol.t;
        p.pivot.position.x = p.x + voisin;
        p.pivot.rotation.y = THREE.MathUtils.lerp(p.repos, face, Math.max(0, Math.min(1.08, p.t)));
        p.pivot.rotation.x = -.2 * p.t + Math.sin(temps * .7 + p.ph) * .006 * (1 - p.t);
        p.pivot.rotation.z = Math.sin(temps * .9 + p.ph) * .01 * (1 - p.t) + p.v * .012;
      });
      var actif = survol && survol.rayon === r ? survol.t : 0, autre = survol && survol.rayon !== r ? survol.t : 0;
      r.lumiere.intensity = r.base * (1 + .55 * actif - .35 * autre);
    });
  }
  function boucle() {
    raf = requestAnimationFrame(boucle);
    var dt = Math.min(.05, horloge.getDelta()), temps = horloge.elapsedTime;
    if (entree < 1) entree = Math.min(1, entree + dt / 2.6);
    var e = easeInOut(entree);
    if (sortie >= 0) {
      sortie = Math.min(1, sortie + dt / 1.4); e = 1 - easeInOut(sortie);
      if (sortie >= 1 && finSortie) { var f = finSortie; finSortie = null; f(); return; }
    }
    // regard : la souris oriente doucement la tête, le doigt fait glisser la vue
    if (!tactile && !glisse) { regard.yaw = -souris.x * .5; regard.pitch = -souris.y * .1; }
    // au doigt, un regard lent vers la gauche puis la droite montre que la salle continue sur les côtés
    if (balayage >= 0 && entree >= 1) {
      balayage += dt / 5;
      if (balayage >= 1) { balayage = -1; regard.yaw = 0; } else regard.yaw = .75 * Math.sin(balayage * Math.PI * 2);
    }
    regard.cy += (regard.yaw - regard.cy) * Math.min(1, dt * 3.2);
    regard.cp += (regard.pitch - regard.cp) * Math.min(1, dt * 3.2);
    var z = THREE.MathUtils.lerp(Z_DEPART, Z_ARRIVEE, e), foc = survol ? lisse(Math.max(0, Math.min(1, survol.t))) : 0;
    var bx = regard.cy * -.35 * e, by = OEIL + (1 - e) * -.12, yaw = regard.cy * e, pitch = -.05 + regard.cp * e;
    // la pièce survolée attire le regard et rapproche un peu le visiteur
    if (foc > 0) {
      survol.pivot.getWorldPosition(regardCible); regardCible.y -= .4;
      bx += (regardCible.x - bx) * .22 * foc; by += (regardCible.y - by) * .15 * foc; z += (regardCible.z - z) * .22 * foc;
      var dx = regardCible.x - bx, dy = regardCible.y - by, dz = regardCible.z - z;
      yaw += (Math.atan2(-dx, -dz) - yaw) * .6 * foc;
      pitch += (Math.atan2(dy, Math.hypot(dx, dz)) - pitch) * .6 * foc;
    }
    camera.position.set(bx, by, z);
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
    poser(dt, temps);
    // fiche à côté de la pièce survolée
    if (survol && !fiche.hidden) {
      survol.pivot.getWorldPosition(vec); vec.y -= .42;
      vec.project(camera);
      var w = racine.clientWidth, h = racine.clientHeight, sx = (vec.x + 1) / 2 * w, sy = (1 - vec.y) / 2 * h;
      if (w > 700) { fiche.style.left = Math.min(w - 300, sx + Math.min(240, w * .14)) + 'px'; fiche.style.top = Math.max(90, Math.min(h - 240, sy - 70)) + 'px'; }
      else { fiche.style.left = ''; fiche.style.top = ''; }
    }
    if (composer) composer.render(); else renderer.render(scene, camera);
  }

  return {
    demarrer: function () { horloge.start(); boucle(); },
    quitter: function (fin) {
      choisir(null);
      if (reduit) { fin(); return; }
      sortie = 0; finSortie = fin;
    },
    detruire: function () {
      cancelAnimationFrame(raf); removeEventListener('resize', taille);
      scene.traverse(function (m) { if (m.geometry) m.geometry.dispose(); });
      renderer.dispose(); pmrem.dispose();
    }
  };
}
