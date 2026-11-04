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
  { nom: 'Radici', sous: 'Autunno 2026', pieces: [
    { nom: 'Le Cardigan Noce', num: 'N° 01 / 50', prix: 'CHF 139', url: 'cardigan-noce.html', modele: 'img/360/',
      ref: 'NC-01', montant: 139, image: 'img/cardigan-face.webp' }
  ] },
  { nom: 'Seconda Edizione', sous: 'In arrivo' },
  { nom: 'Terza Edizione', sous: 'In arrivo' },
  { nom: 'Quarta Edizione', sous: 'In arrivo' },
  { nom: 'Quinta Edizione', sous: 'In arrivo' },
  { nom: 'Sesta Edizione', sous: 'In arrivo' },
  { nom: 'Settima Edizione', sous: 'In arrivo' }
];

// Dimensions de la salle (mètres)
var HW = 2.3, ZB = -2.2, D = 0.62, T = 0.035, Y_BAS = 0.86, Y_HAUT = 2.35, Y_TRINGLE = 2.2, PLAFOND = 2.9;
// les pièces et leurs cintres sont présentés un peu plus grands que nature, pour habiter le rayon
var ECHELLE = 1.4;
var Z_COTE = .9, Z_PORTE = 3.4, Z_DEPART = 7.0, Z_ARRIVEE = 1.85, OEIL = 1.5;

function hasard(seed) {
  return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function lisse(x) { return x * x * (3 - 2 * x); }

export async function ouvrir(o) {
  // les plaques sont gravées avec les polices du site : on les attend
  if (document.fonts) { try { await Promise.all([document.fonts.load('60px "Bodoni Moda"'), document.fonts.load('26px Jost')]); } catch (e) {} }
  var racine = o.racine, canvas = racine.querySelector('canvas'), fiche = o.fiche;
  var reduit = !!o.reduit, tactile = matchMedia('(hover: none)').matches;
  var mobile = Math.min(innerWidth, innerHeight) < 700;

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  var finesse = Math.min(devicePixelRatio || 1, 1.5), mesure = { n: 0, s: 0 };
  renderer.setPixelRatio(finesse);
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
  var matSol = new THREE.MeshPhysicalMaterial({ color: 0x130c08, roughness: .2, metalness: 0, clearcoat: .5, clearcoatRoughness: .3, envMapIntensity: .5 });
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
    new THREE.Vector3(-.148, -.106, 0), new THREE.Vector3(-.11, -.09, 0), new THREE.Vector3(-.06, -.068, 0),
    new THREE.Vector3(0, -.058, 0), new THREE.Vector3(.06, -.068, 0), new THREE.Vector3(.11, -.09, 0), new THREE.Vector3(.148, -.106, 0)]);
  var geoCintre = new THREE.TubeGeometry(courbeCintre, 64, .009, 14, false);
  var geoBout = new THREE.SphereGeometry(.009, 14, 10);
  var crochet = [];
  for (i = 0; i <= 24; i++) { a = i / 24; var ang = Math.PI * 1.25 * a - Math.PI * .25; crochet.push(new THREE.Vector3(Math.cos(ang) * .026 - .0, Math.sin(ang) * .026 + .0, 0)); }
  crochet.push(new THREE.Vector3(-.026, -.01, 0), new THREE.Vector3(-.02, -.03, 0), new THREE.Vector3(0, -.045, 0));
  var geoCrochet = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(crochet), 48, .0035, 8, false);
  // corps : la barre du cintre (par défaut, celle des cintres vides) ; le crochet descend jusqu'à son milieu
  function cintre(corps) {
    var g = new THREE.Group(), geo = corps ? corps.geo : geoCintre, bouts = corps ? corps.bouts : [new THREE.Vector3(-.148, -.106, 0), new THREE.Vector3(.148, -.106, 0)];
    var milieu = corps ? corps.milieu : -.058;
    var c = new THREE.Mesh(geoCrochet, matLaiton); c.position.y = -.002; c.rotation.y = Math.PI / 2; c.castShadow = true; g.add(c);
    var b = new THREE.Mesh(geo, matCintre); b.castShadow = true; g.add(b);
    bouts.forEach(function (p) { var s = new THREE.Mesh(corps ? corps.geoBout : geoBout, matCintre); s.position.copy(p); g.add(s); });
    var h = Math.max(.01, -.045 - milieu), n = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, h, 10), matLaiton);
    n.position.y = -.045 - h / 2; g.add(n);
    return g;
  }
  // Barre de cintre qui épouse l'intérieur des épaules du vêtement : sous le dessus de la maille,
  // entre le devant et le dos, et qui s'arrête avant le bout des épaules (rien ne dépasse)
  function corpsSur(g, s, y0) {
    var raw = atob(g.d), rx = atob(g.ox), ry = atob(g.oy), haut = [];
    for (var i = 0; i < g.nx; i++) for (var j = 0; j < g.ny; j++) {
      var k = j * g.nx + i;
      if (raw.charCodeAt(k) === 255) continue;
      haut.push({ x: g.gx0 + i * g.step + (rx.charCodeAt(k) << 24 >> 24) - g.cx, y: g.ymid - (g.gy0 + j * g.step + (ry.charCodeAt(k) << 24 >> 24)), z: g.c[j] });
      break;
    }
    function pres(x) { return haut.reduce(function (m, p) { return Math.abs(p.x - x) < Math.abs(m.x - x) ? p : m; }); }
    // dessus moyen des deux côtés, pour un cintre symétrique
    function dessus(x) { var a = pres(x), b = pres(-x); return { y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }; }
    var epaule = g.arms && g.arms[0] ? Math.abs(g.arms[0].xc[0]) : 280, fin = epaule * .8, marge = .022 / s;
    var p40 = dessus(fin * .4), p70 = dessus(fin * .7), p100 = dessus(fin);
    // au milieu, le col monte : la barre prolonge la pente des épaules au lieu de le suivre
    var milieu = { y: p40.y + (p40.y - p70.y) * .45, z: (p40.z + p70.z) / 2 };
    var pts = [[-1, p100], [-.7, p70], [-.4, p40], [0, milieu], [.4, p40], [.7, p70], [1, p100]].map(function (q) {
      return new THREE.Vector3(q[0] * fin * s, y0 + (q[1].y - marge) * s, q[1].z * s);
    });
    return { geo: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, .0065, 12, false), geoBout: new THREE.SphereGeometry(.0065, 12, 8),
      bouts: [pts[0], pts[6]], milieu: pts[3].y };
  }

  // ---------- Vêtement : le volume reconstruit de la visionneuse 360° (img/360/) ----------
  // Chaque face reçoit la vraie photo (face, dos, côté) ; la maille jersey est rendue en relief,
  // avec le reflet velouté de la laine (sheen) : de près, on voit la matière.
  var chargeur = new THREE.TextureLoader(), attentes = [];
  function charger(url, srgb, rep) {
    return new Promise(function (ok) {
      chargeur.load(url, function (t) {
        t.flipY = false; t.anisotropy = aniso;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
        ok(t);
      }, undefined, function () { ok(null); });
    });
  }
  function volume(g) {
    var nx = g.nx, ny = g.ny, N = nx * ny, raw = atob(g.d), d = new Uint8Array(N), i, j;
    for (i = 0; i < N; i++) d[i] = raw.charCodeAt(i);
    var ox = new Int8Array(N), oy = new Int8Array(N), rx = atob(g.ox), ry = atob(g.oy);
    for (i = 0; i < N; i++) { ox[i] = rx.charCodeAt(i) << 24 >> 24; oy[i] = ry.charCodeAt(i) << 24 >> 24; }
    var K = 32, bras = g.arms || [], NA = 0;
    bras.forEach(function (a) { NA += a.y.length * (K + 1); });
    var P = new Float32Array(N * 6 + NA * 3), Nr = new Float32Array(N * 6 + NA * 3), idx = [];
    for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
      var k = j * nx + i, q = d[k], dd = q === 255 ? 0 : q / 254 * g.dmax;
      var X = g.gx0 + i * g.step + ox[k] - g.cx, Y = g.ymid - (g.gy0 + j * g.step + oy[k]), c = g.c[j];
      P.set([X, Y, c + dd], k * 3); P.set([X, Y, c - dd], (N + k) * 3);
    }
    function tri(a, b, c) {
      idx.push(a, b, c);
      var ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
      var ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az;
      var vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
      var n1 = uy * vz - uz * vy, n2 = uz * vx - ux * vz, n3 = ux * vy - uy * vx;
      [a, b, c].forEach(function (v) { Nr[v * 3] += n1; Nr[v * 3 + 1] += n2; Nr[v * 3 + 2] += n3; });
    }
    for (j = 0; j < ny - 1; j++) for (i = 0; i < nx - 1; i++) {
      var a = j * nx + i, b = a + 1, c2 = a + nx, e = c2 + 1;
      if (d[a] === 255 || d[b] === 255 || d[c2] === 255 || d[e] === 255) continue;
      tri(a, c2, b); tri(b, c2, e);
      tri(N + a, N + b, N + c2); tri(N + b, N + e, N + c2);
    }
    var base = 2 * N;
    bras.forEach(function (a) {
      var n = a.y.length, r, t;
      for (r = 0; r < n; r++) for (t = 0; t <= K; t++) {
        var th = t / K * Math.PI * 2, co = Math.cos(th), si = Math.sin(th), v = base + r * (K + 1) + t;
        P.set([a.xc[r] + a.r[r] * co, g.ymid - a.y[r], a.zc[r] + a.r[r] * si], v * 3);
        Nr.set([co, 0, si], v * 3);
      }
      for (r = 0; r < n - 1; r++) for (t = 0; t < K; t++) {
        var q0 = base + r * (K + 1) + t, q1 = q0 + 1, q2 = q0 + K + 1, q3 = q2 + 1;
        idx.push(q0, q2, q1, q1, q2, q3);
      }
      base += n * (K + 1);
    });
    for (i = 0; i < Nr.length; i += 3) { var l = Math.hypot(Nr[i], Nr[i + 1], Nr[i + 2]) || 1; Nr[i] /= l; Nr[i + 1] /= l; Nr[i + 2] /= l; }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(Nr, 3));
    geo.setIndex(idx);
    return geo;
  }
  function tricot(g, tx) {
    var F = g.F, B = g.B, S = g.S;
    var u = {
      tF: { value: tx[0] }, tB: { value: tx[1] }, tS: { value: tx[2] }, tM: { value: tx[3] }, tK: { value: tx[4] }, tA: { value: tx[5] },
      uK: { value: new THREE.Vector2(g.kScale || 0, g.kAmp || 0) }, uRelief: { value: .0004 },
      uF: { value: new THREE.Vector4(g.cx, g.ymid, 1 / F.W, 1 / F.H) },
      uB: { value: new THREE.Vector4(B.bcx, B.kx, 1 / B.W, 1 / B.H) },
      uB2: { value: new THREE.Vector4(B.by0, B.fy0, B.ky, S.sy0) },
      uS: { value: new THREE.Vector4(S.C0, 1 / S.r, 1 / S.W, 1 / S.H) }
    };
    var m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .86, metalness: 0, sheen: .3, sheenRoughness: .55, sheenColor: new THREE.Color(0x5a3620), envMapIntensity: .15, side: THREE.DoubleSide });
    m.onBeforeCompile = function (sh) {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = 'varying vec3 vP0;\nvarying vec3 vN0;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vP0 = position; vN0 = normal;');
      sh.fragmentShader = 'uniform sampler2D tF,tB,tS,tM,tK,tA;\nuniform vec2 uK;\nuniform float uRelief;\nuniform vec4 uF,uB,uB2,uS;\nvarying vec3 vP0;\nvarying vec3 vN0;\n' +
        sh.fragmentShader.replace('#include <map_fragment>', [
          'float yf=uF.y-vP0.y;',
          'vec2 uvF=vec2((vP0.x+uF.x)*uF.z,yf*uF.w);',
          'vec2 uvB=vec2((uB.x-vP0.x*uB.y)*uB.z,(uB2.x+(yf-uB2.y)*uB2.z)*uB.w);',
          'vec2 uvS=vec2((uS.x-vP0.z*uS.y)*uS.z,(uB2.w+(yf-uB2.y)*uS.y)*uS.w);',
          'vec3 n0=normalize(vN0);',
          'if(texture2D(tM,uvF).r<.5&&abs(n0.z)>.55)discard;',
          'vec2 h0=normalize(n0.xz+vec2(0.,1e-4));',
          'float wf=pow(max(h0.y,0.),6.),wb=pow(max(-h0.y,0.),6.),ws=pow(abs(h0.x),6.),wt=wf+wb+ws+1e-4;',
          'vec3 cTex=(texture2D(tF,uvF).rgb*wf+texture2D(tB,uvB).rgb*wb+texture2D(tS,uvS).rgb*ws)/wt;',
          'float kn=mix(texture2D(tK,vP0.xy*uK.x).r,texture2D(tK,vec2(vP0.z,vP0.y)*uK.x).r,ws/wt);',
          // pas de maille jersey sur le zip ni sur les bord-côtes, déjà dans les photos
          'float aK=(texture2D(tA,uvF).r*wf+texture2D(tA,uvB).g*wb+texture2D(tA,uvS).b*ws)/wt;',
          'diffuseColor.rgb*=cTex*(1.+uK.y*.6*aK*(kn-.5)*2.);'
        ].join('\n'))
        // face toujours tournée vers le regard : les manches (tubes) ne s'assombrissent plus selon leur sens de construction
        .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', 'normal *= sign(dot(normal, vViewPosition) + 1e-6);'))
        .replace('#include <normal_fragment_maps>', [
          '#include <normal_fragment_maps>',
          '{ vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);',
          '  float pr=1.-smoothstep(.12,.45,length(fwidth(vP0.xy*uK.x)));',
          '  float hx=dFdx(kn)*aK*pr,hy=dFdy(kn)*aK*pr;',
          '  vec3 r1=cross(sy,normal),r2=cross(normal,sx); float dt=dot(sx,r1)*faceDirection;',
          '  normal=normalize(abs(dt)*normal-sign(dt)*(hx*r1+hy*r2)*uRelief); }'
        ].join('\n'));
    };
    return m;
  }
  function vetement(dossier) {
    return Promise.all([fetch(dossier + 'geo.json').then(function (r) { return r.json(); }),
      charger(dossier + 'tex-face.jpg', true), charger(dossier + 'tex-dos.jpg', true), charger(dossier + 'tex-cote.jpg', true),
      charger(dossier + 'masque.png'), charger(dossier + 'maille.png', false, true), charger(dossier + 'maille-masque.png')]).then(function (a) {
      var g = a[0], s = .64 / g.Hn; // le vêtement mesure 64 cm du col à l'ourlet
      var m = new THREE.Mesh(volume(g), tricot(g, a.slice(1)));
      m.scale.setScalar(s);
      // l'épaule (départ des manches) se pose sur les bouts du cintre
      var yEpaule = g.arms && g.arms[0] ? g.ymid - g.arms[0].y[0] : g.ymid - g.fy0 - 180;
      m.position.y = -.112 - yEpaule * s;
      m.castShadow = true; m.receiveShadow = true;
      return { vetement: m, cintre: cintre(corpsSur(g, s, m.position.y)) };
    });
  }

  // ---------- Armoire : une rangée de rayons face à +z ----------
  var rayons = [], pieces = [], tiroirs = [];
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
      // tiroirs : un clic les ouvre (caisson vide, doublé de daim, prêt pour les accessoires), un autre les referme
      [.2075, .4625, .7175].forEach(function (y) {
        var lt = l - T - .012, ht = .245, pr = D - .14, tg = new THREE.Group();
        tg.position.set(x, y, 0); g.add(tg);
        var face = boite(tg, lt, ht, .024, bois(1.2, .4, true), 0, 0, .006);
        boite(tg, .2, .012, .016, matLaiton, 0, .07, .026);
        boite(tg, lt - .03, .01, pr, matDaim, 0, -ht / 2 + .035, -.006 - pr / 2);
        [-1, 1].forEach(function (s) { boite(tg, .012, ht - .07, pr, bois(.6, .3, true), s * (lt / 2 - .021), -.005, -.006 - pr / 2); });
        boite(tg, lt - .03, ht - .07, .012, bois(1.2, .3, true), 0, -.005, -.006 - pr);
        var tir = { groupe: tg, face: face, t: 0, ouvert: false, rayon: r };
        face.userData.tiroir = tir; tiroirs.push(tir);
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
      var sp = new THREE.SpotLight(0xffc98f, ordre[k] === 0 ? 2.6 : 3.2, 3.2, 1.05, 1, 2);
      sp.position.set(x, Y_HAUT - .06, -.08); sp.target.position.set(x, Y_BAS + .2, -D + .04);
      g.add(sp); g.add(sp.target); r.lumiere = sp; r.base = sp.intensity;
      // pièces de la collection, ou cintres vides en attente
      var liste = c.pieces || [], nb = liste.length || 3, ecart = Math.min(.24, (l - .3) / Math.max(1, nb - 1));
      for (var j = 0; j < nb; j++) {
        var px = x + (nb === 1 ? 0 : (j - (nb - 1) / 2) * ecart);
        var pivot = new THREE.Group(); pivot.position.set(px, Y_TRINGLE + .028 * ECHELLE, -D / 2); pivot.rotation.order = 'YXZ'; g.add(pivot);
        pivot.scale.setScalar(ECHELLE);
        // comme dans une vraie armoire : la pièce pend perpendiculaire à la tringle, l'épaule vers le visiteur
        var etat = { pivot: pivot, x: px, rayon: r, t: 0, v: 0, cible: 0, repos: -Math.PI / 2 + .1, ph: Math.random() * 6.28, info: liste[j] || null };
        // cintre vide ; celui d'une pièce est taillé à ses épaules une fois le vêtement chargé
        etat.cintre = cintre(); pivot.add(etat.cintre);
        pivot.rotation.y = etat.repos;
        if (etat.info) {
          var proxy = new THREE.Mesh(new THREE.BoxGeometry(.5, .72, .5), matInvisible); proxy.position.y = -.4; proxy.userData.piece = etat; pivot.add(proxy);
          etat.proxy = proxy; pieces.push(etat);
          attentes.push(vetement(etat.info.modele).then(function (v) {
            this.pivot.remove(this.cintre); this.cintre = v.cintre;
            this.pivot.add(v.vetement); this.pivot.add(v.cintre);
          }.bind(etat)).catch(function () {}));
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
  var cle = new THREE.SpotLight(0xffe2bd, 3.4, 7, .5, 1, 1.6);
  cle.position.set(.35, 2.45, .7); cle.target.position.set(0, 1.62, ZB + D / 2);
  cle.castShadow = true; cle.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048); cle.shadow.bias = -.0004; cle.shadow.radius = 5; cle.shadow.normalBias = .02;
  scene.add(cle); scene.add(cle.target);
  for (i = 0; i < 3; i++) { // spots encastrés au plafond
    var sx = (i - 1) * 1.4, spot = new THREE.Mesh(new THREE.CircleGeometry(.035, 24), matSpot);
    spot.rotation.x = Math.PI / 2; spot.position.set(sx, PLAFOND - .002, ZB + D + 1.1); scene.add(spot);
  }
  var lumTiroir = new THREE.PointLight(0xffd2a0, 0, .55, 2); scene.add(lumTiroir);
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
    if (composer) { composer.setPixelRatio(finesse); composer.setSize(w, h); }
  }
  taille(); addEventListener('resize', taille);

  // ---------- Regard et survol ----------
  var souris = new THREE.Vector2(0, 0), regard = { yaw: 0, pitch: 0, cy: 0, cp: 0 }, glisse = null, survol = null, choisi = null;
  var ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), entree = reduit ? 1 : 0, sortie = -1, finSortie = null;
  var balayage = tactile && !reduit ? 0 : -1, dernier = null, surFiche = false;
  var cibles = pieces.map(function (p) { return p.proxy; }).concat(tiroirs.map(function (t) { return t.face; }));
  var tiroirSurvol = null, tiroirOuvert = null, tiroirVu = null;
  // ce qui est sous le pointeur : { piece } ou { tiroir }, ou rien
  function viser(cx, cy) {
    var r = canvas.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    var h = ray.intersectObjects(cibles, false)[0];
    return h ? h.object.userData : {};
  }
  function survoler(c) {
    choisir(c.piece || null); tiroirSurvol = c.tiroir || null;
    canvas.style.cursor = c.piece || c.tiroir ? 'pointer' : '';
  }
  function basculer(t) {
    if (t.ouvert) { t.ouvert = false; tiroirOuvert = null; return; }
    if (tiroirOuvert) tiroirOuvert.ouvert = false;
    t.ouvert = true; tiroirOuvert = tiroirVu = t; choisir(null);
  }
  function choisir(p) {
    if (survol === p) return;
    // zone de survol élargie tant que la pièce est choisie : la caméra qui s'approche ne la fait pas clignoter
    if (survol) { survol.cible = 0; survol.proxy.scale.setScalar(1); }
    survol = p; if (p) { p.cible = 1; p.proxy.scale.setScalar(1.4); }
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
  // une pièce choisie ouvre sa fiche détaillée sans quitter la salle (sinon, sa page)
  function aller(p) { if (!p || entree < 1) return; if (o.ouvrirFiche) o.ouvrirFiche(p.info); else o.aller(p.info.url); }
  canvas.addEventListener('pointermove', function (e) {
    var r = canvas.getBoundingClientRect();
    if (e.pointerType === 'mouse') { souris.set((e.clientX - r.left) / r.width * 2 - 1, (e.clientY - r.top) / r.height * 2 - 1); dernier = [e.clientX, e.clientY]; }
    if (glisse) {
      var dx = e.clientX - glisse.x, dy = e.clientY - glisse.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) glisse.bouge = true;
      regard.yaw = Math.max(-1, Math.min(1, glisse.yaw + dx * .004));
      regard.pitch = Math.max(-.25, Math.min(.2, glisse.pitch + dy * .002));
    } else if (e.pointerType === 'mouse' && entree >= 1) survoler(viser(e.clientX, e.clientY));
  });
  canvas.addEventListener('pointerdown', function (e) {
    balayage = -1;
    if (e.pointerType !== 'mouse') glisse = { x: e.clientX, y: e.clientY, yaw: regard.yaw, pitch: regard.pitch, bouge: false };
  });
  canvas.addEventListener('pointerup', function (e) {
    var g = glisse; glisse = null;
    if (g && g.bouge) return;
    var c = viser(e.clientX, e.clientY), p = c.piece || null;
    if (entree < 1) return;
    // un tiroir s'ouvre ou se referme ; un clic dans le vide referme celui qui est ouvert
    if (c.tiroir) { basculer(c.tiroir); return; }
    if (!p && tiroirOuvert) { basculer(tiroirOuvert); }
    if (e.pointerType === 'mouse') { aller(p); return; }
    // au doigt : un premier toucher présente la pièce, le second ouvre sa fiche
    if (p && p === survol) aller(p); else choisir(p);
  });
  canvas.addEventListener('pointercancel', function () { glisse = null; });
  canvas.addEventListener('pointerleave', function (e) {
    if (e.pointerType !== 'mouse' || (e.relatedTarget && fiche.contains(e.relatedTarget))) return; // vers la fiche : elle reste
    souris.set(0, 0); dernier = null; survoler({});
  });
  fiche.addEventListener('pointerenter', function () { surFiche = true; });
  fiche.addEventListener('pointerleave', function (e) { surFiche = false; if (e.relatedTarget !== canvas) { dernier = null; choisir(null); } });
  fiche.addEventListener('focus', function () { if (!survol && pieces[0]) choisir(pieces[0]); });
  fiche.addEventListener('click', function (e) { if (survol && o.ouvrirFiche) { e.preventDefault(); o.ouvrirFiche(survol.info); } });

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
        p.pivot.rotation.x = -.13 * p.t + Math.sin(temps * .7 + p.ph) * .006 * (1 - p.t);
        p.pivot.rotation.z = Math.sin(temps * .9 + p.ph) * .01 * (1 - p.t) + p.v * .012;
      });
      var actif = survol && survol.rayon === r ? survol.t : 0, autre = survol && survol.rayon !== r ? survol.t : 0;
      r.lumiere.intensity = r.base * (1 - .35 * autre);
    });
    // tiroirs : ils glissent comme sur des coulisses à fermeture douce ; au survol, ils s'entrouvrent à peine
    tiroirs.forEach(function (t) {
      var c = t.ouvert ? 1 : t === tiroirSurvol ? .06 : 0;
      t.t += (c - t.t) * Math.min(1, dt * (t.ouvert ? 4 : 5.5));
      t.groupe.position.z = t.t * .36;
    });
    // une lumière douce s'allume dans le tiroir ouvert
    if (tiroirVu) {
      tiroirVu.groupe.parent.localToWorld(lumTiroir.position.set(tiroirVu.groupe.position.x, tiroirVu.groupe.position.y + .02, tiroirVu.groupe.position.z - .12));
      lumTiroir.intensity = .45 * lisse(Math.min(1, tiroirVu.t));
    }
  }
  function boucle() {
    raf = requestAnimationFrame(boucle);
    var dt = Math.min(.05, horloge.getDelta()), temps = horloge.elapsedTime;
    // résolution adaptative : si l'appareil peine, on affine moins plutôt que de saccader
    mesure.n++; mesure.s += dt;
    if (mesure.n === 30) {
      if (mesure.s / 30 > .021 && finesse > .8) { finesse = Math.max(.8, finesse - .2); renderer.setPixelRatio(finesse); taille(); }
      mesure.n = 0; mesure.s = 0;
    }
    // entrée : la caméra arrive en plein élan (relais du zoom de la vidéo) puis ralentit jusqu'à l'armoire
    if (entree < 1) entree = Math.min(1, entree + dt / 2.8);
    // survol recalculé à chaque image : la pièce réagit aussi quand c'est la vue qui glisse sous la souris
    if (!tactile && dernier && !surFiche && entree >= 1 && sortie < 0) survoler(viser(dernier[0], dernier[1]));
    var e = 1 - Math.pow(1 - entree, 2.6);
    // sortie : elle repart doucement puis accélère ; à mi-course la page reprend la main en fondu
    if (sortie >= 0) {
      sortie = Math.min(1, sortie + dt / 1.6); e = Math.min(e, 1 - Math.pow(sortie, 2.2));
      if (sortie >= .42 && finSortie) { var f = finSortie; finSortie = null; f(); }
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
    // la pièce survolée (ou le tiroir ouvert) attire le regard et rapproche un peu le visiteur
    var avance = .42, hauteur = .3;
    if (foc > 0) { survol.pivot.getWorldPosition(regardCible); regardCible.y -= .4 * ECHELLE; }
    else if (tiroirVu && tiroirVu.t > .02) {
      foc = lisse(Math.min(1, tiroirVu.t)); avance = .55; hauteur = .85;
      tiroirVu.groupe.getWorldPosition(regardCible);
    }
    // pour un tiroir, le regard reste au-dessus et plonge dedans
    var leve = foc > 0 && !survol ? 1.1 : 0, plonge = survol ? .6 : .92;
    if (foc > 0) {
      bx += (regardCible.x - bx) * avance * foc; by += (regardCible.y + leve - by) * hauteur * foc; z += (regardCible.z - z) * avance * foc;
      var dx = regardCible.x - bx, dy = regardCible.y - by, dz = regardCible.z - z;
      yaw += (Math.atan2(-dx, -dz) - yaw) * .6 * foc;
      pitch += (Math.atan2(dy, Math.hypot(dx, dz)) - pitch) * plonge * foc;
    }
    camera.position.set(bx, by, z);
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
    poser(dt, temps);
    // fiche à côté de la pièce survolée
    if (survol && !fiche.hidden) {
      survol.pivot.getWorldPosition(vec); vec.y -= .42 * ECHELLE;
      vec.project(camera);
      var w = racine.clientWidth, h = racine.clientHeight, sx = (vec.x + 1) / 2 * w, sy = (1 - vec.y) / 2 * h;
      if (w > 700) { fiche.style.left = Math.min(w - 300, sx + Math.min(240, w * .14)) + 'px'; fiche.style.top = Math.max(90, Math.min(h - 240, sy - 70)) + 'px'; }
      else { fiche.style.left = ''; fiche.style.top = ''; }
    }
    if (composer) composer.render(); else renderer.render(scene, camera);
  }

  // tout est chargé et compilé avant le premier clic : l'entrée démarre sans à-coup
  await Promise.all(attentes);
  camera.position.set(0, OEIL - .12, Z_DEPART); camera.rotation.set(-.05, 0, 0);
  try { if (renderer.compileAsync) await renderer.compileAsync(scene, camera); else renderer.compile(scene, camera); } catch (e) {}
  if (composer) composer.render(); else renderer.render(scene, camera);

  return {
    demarrer: function () {
      entree = reduit ? 1 : 0; sortie = -1; finSortie = null; balayage = tactile && !reduit ? 0 : -1; dernier = null;
      tiroirs.forEach(function (t) { t.ouvert = false; t.t = 0; t.groupe.position.z = 0; }); tiroirOuvert = tiroirVu = tiroirSurvol = null;
      regard.yaw = regard.pitch = regard.cy = regard.cp = 0; souris.set(0, 0);
      horloge.start(); if (!raf) boucle();
    },
    quitter: function (mi) {
      choisir(null);
      if (reduit) { mi(); return; }
      sortie = 0; finSortie = mi;
    },
    // Échap referme d'abord un tiroir ouvert
    echap: function () { if (!tiroirOuvert) return false; basculer(tiroirOuvert); return true; },
    arreter: function () { cancelAnimationFrame(raf); raf = 0; }
  };
}
