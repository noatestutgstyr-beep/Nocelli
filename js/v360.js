/* Nocelli : cardigan à faire tourner (WebGL, sans librairie).
   Le volume est reconstruit à partir des trois vues du tech pack (face, dos, côté) ;
   chaque face du modèle reçoit la vraie photo correspondante. */
(function () {
  'use strict';

  var VS = [
    'attribute vec3 aP;attribute vec3 aN;',
    'uniform mat4 uM;uniform vec3 uZ;',
    'varying vec3 vP;varying vec3 vN;',
    'void main(){vP=aP;vN=aN;vec4 p=uM*vec4(aP,1.);p.xy=p.xy*uZ.x+uZ.yz*p.w;gl_Position=p;}'
  ].join('');
  var FS = [
    'precision highp float;',
    'uniform sampler2D tF,tB,tS,tM;',
    'uniform vec4 uF,uB,uB2,uS;',
    'varying vec3 vP;varying vec3 vN;',
    'void main(){',
    ' float yf=uF.y-vP.y;',
    ' vec2 uvF=vec2((vP.x+uF.x)*uF.z,yf*uF.w);',
    ' vec2 uvB=vec2((uB.x-vP.x*uB.y)*uB.z,(uB2.x+(yf-uB2.y)*uB2.z)*uB.w);',
    ' vec2 uvS=vec2((uS.x-vP.z*uS.y)*uS.z,(uB2.w+(yf-uB2.y)*uS.y)*uS.w);',
    ' vec3 n=normalize(vN);',
    ' if(texture2D(tM,uvF).r<.5&&abs(n.z)>.55)discard;',
    ' vec2 h=normalize(n.xz+vec2(0.,1e-4));',
    ' float wf=pow(max(h.y,0.),3.),wb=pow(max(-h.y,0.),3.),ws=pow(abs(h.x),3.);',
    ' vec3 c=texture2D(tF,uvF).rgb*wf+texture2D(tB,uvB).rgb*wb+texture2D(tS,uvS).rgb*ws;',
    ' gl_FragColor=vec4(c/(wf+wb+ws+1e-4),1.);',
    '}'
  ].join('');

  function persp(fov, asp, n, f) {
    var t = 1 / Math.tan(fov / 2), nf = 1 / (n - f);
    return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0];
  }
  function mul(a, b) {
    var o = new Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s;
    }
    return o;
  }

  function Viewer(el, base) {
    var cv = el.querySelector('canvas'), still = el.querySelector('.v360-repos');
    var gl = cv.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true }) ||
             cv.getContext('experimental-webgl');
    if (!gl) return;
    var ang = 0, vel = 0, target = null, zoom = 1, zTarget = 1, pan = [0, 0], panTarget = null;
    var geo, prog, nIdx, idxType, u = {}, ready = false, raf = 0, last = 0, touched = false, intro = null;
    var fov = 16 * Math.PI / 180, Hv = 1.1;

    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s;
    }
    function tex(img, unit, lum) {
      var t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      var f = lum ? gl.LUMINANCE : gl.RGB;
      gl.texImage2D(gl.TEXTURE_2D, 0, f, f, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      var an = gl.getExtension('EXT_texture_filter_anisotropic');
      if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    }

    function build(g) {
      var nx = g.nx, ny = g.ny, N = nx * ny, raw = atob(g.d), d = new Uint8Array(N);
      for (var i = 0; i < N; i++) d[i] = raw.charCodeAt(i);
      var ox = new Int8Array(N), oy = new Int8Array(N), rx = atob(g.ox), ry = atob(g.oy);
      for (i = 0; i < N; i++) { ox[i] = rx.charCodeAt(i) << 24 >> 24; oy[i] = ry.charCodeAt(i) << 24 >> 24; }
      var P = new Float32Array(N * 6), Nr = new Float32Array(N * 6), idx = [];
      for (var j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
        var k = j * nx + i, q = d[k], dd = q === 255 ? 0 : q / 254 * g.dmax;
        var X = g.gx0 + i * g.step + ox[k] - g.cx, Y = g.ymid - (g.gy0 + j * g.step + oy[k]), c = g.c[j];
        P.set([X, Y, c + dd], k * 3); P.set([X, Y, c - dd], (N + k) * 3);
      }
      function tri(a, b, c) {
        idx.push(a, b, c);
        var ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
        var ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az;
        var vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
        var nx_ = uy * vz - uz * vy, ny_ = uz * vx - ux * vz, nz_ = ux * vy - uy * vx;
        [a, b, c].forEach(function (v) { Nr[v * 3] += nx_; Nr[v * 3 + 1] += ny_; Nr[v * 3 + 2] += nz_; });
      }
      for (j = 0; j < ny - 1; j++) for (i = 0; i < nx - 1; i++) {
        var a = j * nx + i, b = a + 1, c2 = a + nx, e = c2 + 1;
        if (d[a] === 255 || d[b] === 255 || d[c2] === 255 || d[e] === 255) continue;
        tri(a, c2, b); tri(b, c2, e);
        tri(N + a, N + b, N + c2); tri(N + b, N + e, N + c2);
      }
      var big = 2 * N > 65535 && gl.getExtension('OES_element_index_uint');
      idxType = big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
      nIdx = idx.length;
      function buf(target, data) { var b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b; }
      buf(gl.ARRAY_BUFFER, P); var aP = gl.getAttribLocation(prog, 'aP');
      gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
      buf(gl.ARRAY_BUFFER, Nr); var aN = gl.getAttribLocation(prog, 'aN');
      gl.enableVertexAttribArray(aN); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 0, 0);
      buf(gl.ELEMENT_ARRAY_BUFFER, big ? new Uint32Array(idx) : new Uint16Array(idx));
    }

    function size() {
      var r = el.getBoundingClientRect(), pr = Math.min(2, Math.max(1.5, window.devicePixelRatio || 1));
      cv.width = Math.round(r.width * pr); cv.height = Math.round(r.height * pr);
      var asp = r.width / r.height;
      Hv = Math.max(1.12, 0.98 / asp);
      if (geo && still) {
        // l'image fixe occupe exactement la place du rendu de face
        var h = 100 / Hv, off = ((geo.fx0 + geo.fx1) / 2 - geo.cx) / geo.Hn / (Hv * asp) * 100;
        still.style.height = h + '%';
        still.style.left = (50 + off) + '%';
      }
      draw();
    }

    function draw() {
      if (!ready) return;
      gl.viewport(0, 0, cv.width, cv.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      var asp = cv.width / cv.height, dist = (Hv / 2) / Math.tan(fov / 2), s = 1 / geo.Hn;
      var c = Math.cos(ang), si = Math.sin(ang);
      var M = [c * s, 0, -si * s, 0, 0, s, 0, 0, si * s, 0, c * s, 0, 0, 0, -dist, 1];
      gl.uniformMatrix4fv(u.uM, false, mul(persp(fov, asp, dist - 2, dist + 2), M));
      gl.uniform3f(u.uZ, zoom, pan[0], pan[1]);
      gl.drawElements(gl.TRIANGLES, nIdx, idxType, 0);
    }

    function loop(t) {
      raf = 0;
      var dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016; last = t;
      var moving = false;
      if (intro) {
        var p = Math.max(0, (t - intro.t0) / 2600);
        if (p >= 1 || touched) { intro = null; ang = 0; } else { ang = 0.6 * Math.pow(Math.sin(p * Math.PI), 2); moving = true; }
      } else if (!drag) {
        if (Math.abs(vel) > 0.02) { ang += vel * dt; vel *= Math.exp(-dt * 3.2); moving = true; }
        else {
          vel = 0;
          if (target === null) {
            var q = Math.round(ang / (Math.PI / 2)) * (Math.PI / 2);
            if (Math.abs(q - ang) < 0.2) target = q;
          }
          if (target !== null) {
            ang += (target - ang) * Math.min(1, dt * 7);
            if (Math.abs(target - ang) < 1e-4) { ang = target; } else moving = true;
          }
        }
      }
      if (Math.abs(zTarget - zoom) > 1e-3) { zoom += (zTarget - zoom) * Math.min(1, dt * 9); moving = true; } else zoom = zTarget;
      if (panTarget) {
        pan[0] += (panTarget[0] - pan[0]) * Math.min(1, dt * 9); pan[1] += (panTarget[1] - pan[1]) * Math.min(1, dt * 9);
        if (Math.abs(panTarget[0] - pan[0]) + Math.abs(panTarget[1] - pan[1]) < 1e-4) { pan = panTarget.slice(); panTarget = null; } else moving = true;
      }
      draw();
      if (moving) kick(); else last = 0;
    }
    function kick() { if (!raf) raf = requestAnimationFrame(loop); }

    // interaction
    var pts = {}, drag = false, lx = 0, ly = 0, lt = 0, pinch = null, tap = { t: 0, x: 0, y: 0 }, moved = 0;
    function count() { return Object.keys(pts).length; }
    function ndc(x, y) { var r = cv.getBoundingClientRect(); return [(x - r.left) / r.width * 2 - 1, 1 - (y - r.top) / r.height * 2]; }
    function clampPan(p, z) { var m = z - 1; return [Math.max(-m, Math.min(m, p[0])), Math.max(-m, Math.min(m, p[1]))]; }
    function zoomAt(z1, x, y, anim) {
      z1 = Math.max(1, Math.min(3.2, z1));
      var p = ndc(x, y), z0 = anim ? zTarget : zoom, p0 = anim && panTarget ? panTarget : pan;
      var np = clampPan([p[0] - (p[0] - p0[0]) * z1 / z0, p[1] - (p[1] - p0[1]) * z1 / z0], z1);
      if (z1 === 1) np = [0, 0];
      if (anim) { zTarget = z1; panTarget = np; } else { zoom = zTarget = z1; pan = np; panTarget = null; }
      el.classList.toggle('zoome', z1 > 1.01);
      kick();
    }
    function firstTouch() { if (!touched) { touched = true; el.classList.add('touche'); } }

    cv.addEventListener('pointerdown', function (e) {
      if (!ready) return;
      firstTouch(); cv.setPointerCapture(e.pointerId);
      pts[e.pointerId] = [e.clientX, e.clientY];
      if (count() === 2) {
        var k = Object.keys(pts), a = pts[k[0]], b = pts[k[1]];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: zoom }; drag = false;
      } else { drag = true; lx = e.clientX; ly = e.clientY; lt = e.timeStamp; vel = 0; target = null; moved = 0; el.classList.add('saisi'); }
      kick();
    });
    cv.addEventListener('pointermove', function (e) {
      if (!pts[e.pointerId]) return;
      pts[e.pointerId] = [e.clientX, e.clientY];
      if (pinch && count() === 2) {
        var k = Object.keys(pts), a = pts[k[0]], b = pts[k[1]];
        zoomAt(pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, false);
        return;
      }
      if (!drag) return;
      var dx = e.clientX - lx, dy = e.clientY - ly, dt = Math.max(1, e.timeStamp - lt) / 1000, w = cv.getBoundingClientRect().width;
      moved += Math.abs(dx) + Math.abs(dy);
      if (zoom > 1.01) {
        var r = cv.getBoundingClientRect();
        pan = clampPan([pan[0] + dx / r.width * 2, pan[1] - dy / r.height * 2], zoom); panTarget = null;
      } else {
        var da = dx / (w * 1.15) * Math.PI * 2;
        ang += da; vel = vel * 0.6 + (da / dt) * 0.4;
      }
      lx = e.clientX; ly = e.clientY; lt = e.timeStamp;
      kick();
    });
    function up(e) {
      if (!pts[e.pointerId]) return;
      delete pts[e.pointerId];
      if (count() < 2) pinch = null;
      if (count() === 0) {
        drag = false; el.classList.remove('saisi');
        if (e.timeStamp - lt > 80) vel = 0;
        if (zoom > 1.01) vel = 0;
        // double tape au doigt : agrandir / revenir
        if (e.pointerType !== 'mouse' && moved < 10) {
          if (e.timeStamp - tap.t < 320 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 30) {
            zoomAt(zTarget > 1.01 ? 1 : 2.4, e.clientX, e.clientY, true); tap.t = 0;
          } else tap = { t: e.timeStamp, x: e.clientX, y: e.clientY };
        }
        kick();
      }
    }
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('dblclick', function (e) { firstTouch(); zoomAt(zTarget > 1.01 ? 1 : 2.4, e.clientX, e.clientY, true); });
    cv.addEventListener('wheel', function (e) {
      if (!ready || (zTarget <= 1.01 && !e.ctrlKey)) return;
      e.preventDefault(); zoomAt(zTarget * Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY, false);
    }, { passive: false });
    cv.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault(); firstTouch();
        target = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4) + (e.key === 'ArrowRight' ? 1 : -1) * Math.PI / 4; kick();
      }
    });

    var face = el.querySelector('.v360-face'), plus = el.querySelector('.v360-loupe');
    if (face) face.addEventListener('click', function () {
      firstTouch(); vel = 0; target = Math.round(ang / (Math.PI * 2)) * Math.PI * 2; zTarget = 1; panTarget = [0, 0];
      el.classList.remove('zoome'); kick();
    });
    if (plus) plus.addEventListener('click', function () {
      firstTouch(); var r = cv.getBoundingClientRect();
      zoomAt(zTarget > 1.01 ? 1 : 2.4, r.left + r.width / 2, r.top + r.height * 0.38, true);
    });

    // chargement
    function img(src) {
      return new Promise(function (ok, ko) { var i = new Image(); i.decoding = 'async'; i.onload = function () { ok(i); }; i.onerror = ko; i.src = base + src; });
    }
    var started = false;
    function start() {
      if (started) return; started = true;
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
      gl.useProgram(prog);
      ['uM', 'uZ', 'uF', 'uB', 'uB2', 'uS', 'tF', 'tB', 'tS', 'tM'].forEach(function (n) { u[n] = gl.getUniformLocation(prog, n); });
      Promise.all([fetch(base + 'geo.json').then(function (r) { return r.json(); }),
        img('tex-face.jpg'), img('tex-dos.jpg'), img('tex-cote.jpg'), img('masque.png')]).then(function (a) {
        geo = a[0]; build(geo);
        tex(a[1], 0); tex(a[2], 1); tex(a[3], 2); tex(a[4], 3, true);
        gl.uniform1i(u.tF, 0); gl.uniform1i(u.tB, 1); gl.uniform1i(u.tS, 2); gl.uniform1i(u.tM, 3);
        var F = geo.F, B = geo.B, S = geo.S;
        gl.uniform4f(u.uF, geo.cx, geo.ymid, 1 / F.W, 1 / F.H);
        gl.uniform4f(u.uB, B.bcx, B.kx, 1 / B.W, 1 / B.H);
        gl.uniform4f(u.uB2, B.by0, B.fy0, B.ky, S.sy0);
        gl.uniform4f(u.uS, S.C0, 1 / S.r, 1 / S.W, 1 / S.H);
        gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
        ready = true; size();
        requestAnimationFrame(function () {
          el.classList.add('pret');
          if (!touched && !matchMedia('(prefers-reduced-motion: reduce)').matches) { intro = { t0: performance.now() + 700 }; kick(); }
        });
      }).catch(function () { /* l'image fixe reste affichée */ });
    }
    el.v360 = { angle: function (a) { touched = true; intro = null; vel = 0; target = null; ang = a; draw(); }, pret: function () { return ready; } };
    if ('ResizeObserver' in window) new ResizeObserver(size).observe(el); else addEventListener('resize', size);
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { start(); io.disconnect(); } }, { rootMargin: '600px 0px' });
      io.observe(el);
    } else start();
    size();
  }

  window.NocelliV360 = Viewer;
})();
