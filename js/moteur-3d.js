/* Rune Clash — moteur 3D du site. FICHIER GÉNÉRÉ par outils/construire.js le 2026-11-11.
   Ne pas modifier à la main : modifier le jeu puis relancer « node outils/construire.js ». */

/* ---------- engine.js (jeu) ---------- */
/* ===== Mini moteur 3D (WebGL) : cel shading + contours ===== */
const G3 = (function () {
  /* ---------- maths ---------- */
  const M = {
    ident() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
    mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
      return o;
    },
    persp(fov, asp, n, f) { const t = 1 / Math.tan(fov / 2), m = new Float32Array(16); m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m; },
    look(e, t, u) {
      let zx = e[0] - t[0], zy = e[1] - t[1], zz = e[2] - t[2]; let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
      let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      const m = new Float32Array(16);
      m[0] = xx; m[1] = yx; m[2] = zx; m[4] = xy; m[5] = yy; m[6] = zy; m[8] = xz; m[9] = yz; m[10] = zz;
      m[12] = -(xx * e[0] + xy * e[1] + xz * e[2]); m[13] = -(yx * e[0] + yy * e[1] + yz * e[2]); m[14] = -(zx * e[0] + zy * e[1] + zz * e[2]); m[15] = 1;
      return m;
    },
    // rotation ordre YXZ (comme three.js) + translation + échelle uniforme
    compose(p, r, s) {
      const cx = Math.cos(r[0]), sx = Math.sin(r[0]), cy = Math.cos(r[1]), sy = Math.sin(r[1]), cz = Math.cos(r[2]), sz = Math.sin(r[2]);
      const m = new Float32Array(16);
      m[0] = (cy * cz + sy * sx * sz) * s; m[1] = (cx * sz) * s; m[2] = (-sy * cz + cy * sx * sz) * s;
      m[4] = (-cy * sz + sy * sx * cz) * s; m[5] = (cx * cz) * s; m[6] = (sy * sz + cy * sx * cz) * s;
      m[8] = (sy * cx) * s; m[9] = (-sx) * s; m[10] = (cy * cx) * s;
      m[12] = p[0]; m[13] = p[1]; m[14] = p[2]; m[15] = 1;
      return m;
    },
    xform(m, v) { return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]]; }
  };
  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: a => Math.hypot(a[0], a[1], a[2]), norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
  };

  /* ---------- géométrie ---------- */
  // grille paramétrique : f(i, j) -> {p:[x,y,z], uv:[u,v]} ; normales lissées et soudées
  function grid(nu, nv, f, opt) {
    opt = opt || {};
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const r = f(i / nu, j / nv); pos.push(r.p[0], r.p[1], r.p[2]); uv.push(r.uv ? r.uv[0] : i / nu, r.uv ? r.uv[1] : j / nv); }
    const keep = opt.keep;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      if (keep && !keep(i, j, nu, nv)) continue;
      if (opt.flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
    return finalize(pos, uv, idx);
  }
  function finalize(pos, uv, idx) {
    const n = pos.length / 3, nor = new Float32Array(n * 3);
    for (let k = 0; k < idx.length; k += 3) {
      const a = idx[k] * 3, b = idx[k + 1] * 3, c = idx[k + 2] * 3;
      const e1 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]], e2 = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
      const fn = V.cross(e1, e2);
      [a, b, c].forEach(q => { nor[q] += fn[0]; nor[q + 1] += fn[1]; nor[q + 2] += fn[2]; });
    }
    // soudure des normales aux coutures
    const map = new Map();
    for (let q = 0; q < n; q++) {
      const key = Math.round(pos[q * 3] * 2000) + ',' + Math.round(pos[q * 3 + 1] * 2000) + ',' + Math.round(pos[q * 3 + 2] * 2000);
      if (!map.has(key)) map.set(key, []); map.get(key).push(q);
    }
    map.forEach(list => {
      if (list.length < 2) return;
      let s = [0, 0, 0]; list.forEach(q => { s[0] += nor[q * 3]; s[1] += nor[q * 3 + 1]; s[2] += nor[q * 3 + 2]; });
      list.forEach(q => { nor[q * 3] = s[0]; nor[q * 3 + 1] = s[1]; nor[q * 3 + 2] = s[2]; });
    });
    for (let q = 0; q < n; q++) { const v = V.norm([nor[q * 3], nor[q * 3 + 1], nor[q * 3 + 2]]); nor[q * 3] = v[0]; nor[q * 3 + 1] = v[1]; nor[q * 3 + 2] = v[2]; }
    return { pos: new Float32Array(pos), nor, uv: new Float32Array(uv), idx: n > 65535 ? new Uint32Array(idx) : new Uint16Array(idx) };
  }
  function sphere(r, nu, nv, deform) {
    return grid(nu, nv, (u, v) => {
      const ph = (u - 0.5) * Math.PI * 2, th = v * Math.PI;
      let p = [Math.sin(ph) * Math.sin(th) * r, Math.cos(th) * r, Math.cos(ph) * Math.sin(th) * r];
      if (deform) p = deform(p, ph, th);
      return { p, uv: [u, v] };
    });
  }
  function ellipsoid(rx, ry, rz, nu, nv) { return sphere(1, nu || 20, nv || 14, p => [p[0] * rx, p[1] * ry, p[2] * rz]); }
  // profil de révolution [[rayon, y], ...] lissé ; phi0/phiLen pour les vêtements ouverts ; sz = aplatissement avant/arrière
  function lathe(prof, nu, opt) {
    opt = opt || {};
    const pts = smooth(prof, opt.sub || 4);
    const p0 = opt.phi0 || 0, pl = opt.phiLen || Math.PI * 2, sz = opt.sz || 1, sx = opt.sx || 1;
    const up = pts[pts.length - 1][1] > pts[0][1];
    return grid(nu, pts.length - 1, (u, v) => {
      const k = Math.round(v * (pts.length - 1)), pr = pts[k], ph = p0 + u * pl;
      return { p: [Math.sin(ph) * pr[0] * sx, pr[1], Math.cos(ph) * pr[0] * sz], uv: [u, v] };
    }, { flip: up ? !opt.flip : !!opt.flip });
  }
  function smooth(pts, sub) {
    if (pts.length < 3 || sub < 2) return pts;
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let s = 0; s < sub; s++) {
        const t = s / sub, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map(k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  // tube le long d'un chemin, section elliptique (largeur w, épaisseur h) ; rf(t) -> [w, h]
  function tube(path, rf, nr, up) {
    const P = smooth3(path, 3), n = P.length;
    const T = P.map((p, i) => V.norm(V.sub(P[Math.min(n - 1, i + 1)], P[Math.max(0, i - 1)])));
    let hint = up || [0, 1, 0];
    const frames = T.map(t => {
      let N = V.sub(hint, V.mul(t, V.dot(hint, t)));
      if (V.len(N) < 1e-4) N = V.sub([1, 0, 0], V.mul(t, V.dot([1, 0, 0], t)));
      N = V.norm(N); const B = V.cross(t, N); return [N, B];
    });
    return grid(nr, n - 1, (u, v) => {
      const k = Math.round(v * (n - 1)), a = u * Math.PI * 2, r = rf(v), F = frames[k];
      const o = V.add(V.mul(F[1], Math.cos(a) * r[0]), V.mul(F[0], Math.sin(a) * r[1]));
      return { p: V.add(P[k], o), uv: [u, v] };
    });
  }
  function smooth3(pts, sub) {
    if (pts.length < 3) return pts;
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let s = 0; s < sub; s++) {
        const t = s / sub, t2 = t * t, t3 = t2 * t;
        out.push([0, 1, 2].map(k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  // capsule entre a et b (extrémités arrondies)
  function capsule(a, b, ra, rb, nr, flat) {
    const d = V.sub(b, a), L = V.len(d);
    const path = []; for (let i = 0; i <= 10; i++) path.push(V.add(a, V.mul(d, i / 10)));
    const e = Math.min(ra, rb) / L * 0.9;
    return tube(path, t => {
      let r = ra + (rb - ra) * t;
      if (t < e) r *= Math.sqrt(Math.max(0, 1 - Math.pow(1 - t / e, 2)));
      else if (t > 1 - e) r *= Math.sqrt(Math.max(0, 1 - Math.pow((t - 1 + e) / e, 2)));
      return [r, r * (flat || 1)];
    }, nr || 12, Math.abs(d[1]) > Math.abs(d[2]) ? [0, 0, 1] : [0, 1, 0]);
  }
  function merge(list) {
    const pos = [], nor = [], uv = [], idx = [];
    let off = 0;
    list.forEach(g => { pos.push(...g.pos); nor.push(...g.nor); uv.push(...g.uv); g.idx.forEach(i => idx.push(i + off)); off += g.pos.length / 3; });
    return { pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv), idx: off > 65535 ? new Uint32Array(idx) : new Uint16Array(idx) };
  }
  function xformGeo(g, m) {
    const pos = new Float32Array(g.pos.length), nor = new Float32Array(g.nor.length);
    for (let i = 0; i < g.pos.length; i += 3) {
      const p = M.xform(m, [g.pos[i], g.pos[i + 1], g.pos[i + 2]]); pos[i] = p[0]; pos[i + 1] = p[1]; pos[i + 2] = p[2];
      const n = V.norm([m[0] * g.nor[i] + m[4] * g.nor[i + 1] + m[8] * g.nor[i + 2], m[1] * g.nor[i] + m[5] * g.nor[i + 1] + m[9] * g.nor[i + 2], m[2] * g.nor[i] + m[6] * g.nor[i + 1] + m[10] * g.nor[i + 2]]);
      nor[i] = n[0]; nor[i + 1] = n[1]; nor[i + 2] = n[2];
    }
    return { pos, nor, uv: g.uv, idx: g.idx };
  }

  /* ---------- scène ---------- */
  function Node(name) { this.name = name || ''; this.pos = [0, 0, 0]; this.rot = [0, 0, 0]; this.s = 1; this.kids = []; this.meshes = []; this.world = M.ident(); this.visible = true; }
  Node.prototype.add = function (n) { this.kids.push(n); return n; };
  Node.prototype.update = function (pm) {
    this.world = pm ? M.mul(pm, M.compose(this.pos, this.rot, this.s)) : M.compose(this.pos, this.rot, this.s);
    this.kids.forEach(k => k.update(this.world));
  };
  Node.prototype.wpos = function (local) { return M.xform(this.world, local || [0, 0, 0]); };

  /* ---------- rendu ---------- */
  const VS = `attribute vec3 aP; attribute vec3 aN; attribute vec2 aU;
  uniform mat4 uPV; uniform mat4 uM; uniform float uOut;
  varying vec3 vN; varying vec3 vW; varying vec2 vU;
  void main(){ vec4 w = uM * vec4(aP + aN * uOut, 1.0); vW = w.xyz; vN = (uM * vec4(aN, 0.0)).xyz; vU = aU; gl_Position = uPV * w; }`;
  const FS = `precision mediump float;
  uniform vec3 uCol; uniform vec3 uShade; uniform sampler2D uMap; uniform float uUseMap; uniform vec3 uL; uniform vec3 uCam;
  uniform vec3 uRimC; uniform float uRim; uniform float uA; uniform float uFlat; uniform vec3 uEm; uniform float uSpec; uniform float uFlash;
  varying vec3 vN; varying vec3 vW; varying vec2 vU;
  void main(){
    if (uFlat > 0.5) { gl_FragColor = vec4(uCol, uA); return; }
    vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
    vec4 b = vec4(uCol, 1.0);
    if (uUseMap > 0.5) { b = texture2D(uMap, vU); if (b.a < 0.02) discard; }
    float d = dot(n, normalize(uL));
    float t = smoothstep(-0.02, 0.06, d);
    vec3 c = b.rgb * mix(uShade, vec3(1.0), t);
    vec3 v = normalize(uCam - vW);
    float sp = pow(max(dot(n, normalize(normalize(uL) + v)), 0.0), 40.0);
    c += vec3(1.0) * smoothstep(0.5, 0.55, sp) * uSpec * t;
    float r = 1.0 - max(dot(n, v), 0.0);
    c += uRimC * smoothstep(0.62, 0.72, r) * uRim * (0.35 + 0.65 * smoothstep(-0.4, 0.3, dot(n, normalize(uRimDir()))));
    c += uEm;
    c = mix(c, vec3(1.0), uFlash);
    gl_FragColor = vec4(c, b.a * uA);
  }`.replace('uRimDir()', 'vec3(-uL.x, 0.35, -uL.z)');
  const VSF = `attribute vec3 aP; attribute vec4 aC; attribute vec2 aU; uniform mat4 uPV; varying vec4 vC; varying vec2 vU;
  void main(){ vC = aC; vU = aU; gl_Position = uPV * vec4(aP, 1.0); }`;
  const FSF = `precision mediump float; varying vec4 vC; varying vec2 vU; uniform float uSoft;
  void main(){ float a = 1.0; if (uSoft > 0.5) { vec2 q = vU * 2.0 - 1.0; a = smoothstep(1.0, 0.0, dot(q, q)); } else if (uSoft < -0.5) { a = smoothstep(0.0, 0.35, vU.x) * smoothstep(1.0, 0.65, vU.x); } gl_FragColor = vec4(vC.rgb, vC.a * a); }`;
  const VSB = `attribute vec2 aP; varying vec2 vP; void main(){ vP = aP; gl_Position = vec4(aP, 0.999, 1.0); }`;
  const FSB = `precision mediump float; varying vec2 vP; uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBot;
  void main(){ float y = vP.y * 0.5 + 0.5; vec3 c = y > 0.45 ? mix(uMid, uTop, smoothstep(0.45, 1.0, y)) : mix(uBot, uMid, smoothstep(0.0, 0.45, y)); gl_FragColor = vec4(c, 1.0); }`;

  function Renderer(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false }) || canvas.getContext('webgl', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL indisponible');
    this.gl = gl; this.cv = canvas;
    this.big = gl instanceof (window.WebGL2RenderingContext || function () {}) || !!gl.getExtension('OES_element_index_uint');
    this.p = prog(gl, VS, FS, ['uPV', 'uM', 'uOut', 'uCol', 'uShade', 'uMap', 'uUseMap', 'uL', 'uCam', 'uRimC', 'uRim', 'uA', 'uFlat', 'uEm', 'uSpec', 'uFlash']);
    this.pf = prog(gl, VSF, FSF, ['uPV', 'uSoft']);
    this.pb = prog(gl, VSB, FSB, ['uTop', 'uMid', 'uBot']);
    this.bq = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.bq); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.fxb = gl.createBuffer();
    this.light = V.norm([0.4, 0.8, 0.85]);
    this.id = 'b' + (Renderer.n = (Renderer.n || 0) + 1); this.tc = new Map();
    this.white = tex(gl, (() => { const c = document.createElement('canvas'); c.width = c.height = 2; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 2, 2); return c; })());
  }
  function prog(gl, vs, fs, un) {
    const mk = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; un.forEach(n => { u[n] = gl.getUniformLocation(p, n); });
    return { p, u, aP: gl.getAttribLocation(p, 'aP'), aN: gl.getAttribLocation(p, 'aN'), aU: gl.getAttribLocation(p, 'aU'), aC: gl.getAttribLocation(p, 'aC') };
  }
  function tex(gl, canvas, repeat) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    const pot = (canvas.width & (canvas.width - 1)) === 0 && (canvas.height & (canvas.height - 1)) === 0;
    if (pot) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
    else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const w = repeat && pot ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w);
    return t;
  }
  Renderer.prototype.texture = function (canvas, repeat) { return tex(this.gl, canvas, repeat); };
  Renderer.prototype.upload = function (geo) {
    const gl = this.gl;
    const key = this.id;
    if (geo[key]) return geo[key];
    const mk = (d, t) => { const b = gl.createBuffer(); gl.bindBuffer(t, b); gl.bufferData(t, d, gl.STATIC_DRAW); return b; };
    let idx = geo.idx;
    if (idx instanceof Uint32Array && !this.big) idx = new Uint16Array(idx);
    geo[key] = { buf: { p: mk(geo.pos, gl.ARRAY_BUFFER), n: mk(geo.nor, gl.ARRAY_BUFFER), u: mk(geo.uv, gl.ARRAY_BUFFER), i: mk(idx, gl.ELEMENT_ARRAY_BUFFER), cnt: idx.length, t: idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT } };
    return geo[key];
  };
  // mat : {col, shade, map, rim, rimC, out (épaisseur contour), outC, alpha, em, spec, decal}
  function Mesh(geo, mat) { this.geo = geo; this.mat = mat; }
  Renderer.prototype.resize = function (w, h, dpr) {
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px';
    this.W = w; this.H = h; this.dpr = dpr; this.vw = w; this.vh = h;
    this.vpx = 0; this.vpy = 0; this.vpw = this.cv.width; this.vph = this.cv.height;
    this.gl.viewport(0, 0, this.cv.width, this.cv.height);
  };
  Renderer.prototype.view2 = function (x, y, w, h) { // sous-zone en pixels CSS (origine en haut à gauche)
    const gl = this.gl, d = this.dpr, H = this.cv.height;
    this.vpx = Math.round(x * d); this.vpy = Math.round(H - (y + h) * d); this.vpw = Math.round(w * d); this.vph = Math.round(h * d);
    gl.viewport(this.vpx, this.vpy, this.vpw, this.vph);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(Math.round(x * d), Math.round(H - (y + h) * d), Math.round(w * d), Math.round(h * d));
    this.vw = w; this.vh = h;
  };
  Renderer.prototype.full = function () { const gl = this.gl; gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, this.cv.width, this.cv.height); this.vw = this.W; this.vh = this.H; this.vpx = 0; this.vpy = 0; this.vpw = this.cv.width; this.vph = this.cv.height; };
  Renderer.prototype.camera = function (eye, target, fov) {
    this.eye = eye; this.proj = M.persp(fov || 0.8, (this.vw || this.W) / (this.vh || this.H), 0.1, 200); this.view = M.look(eye, target, [0, 1, 0]);
    this.pv = M.mul(this.proj, this.view);
  };
  Renderer.prototype.project = function (p) {
    const m = this.pv, x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    return [(x / w * 0.5 + 0.5) * this.W, (1 - (y / w * 0.5 + 0.5)) * this.H, w];
  };
  Renderer.prototype.clear = function (sky) {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (sky) {
      const P = this.pb; gl.useProgram(P.p); gl.disable(gl.DEPTH_TEST);
      gl.uniform3fv(P.u.uTop, sky[0]); gl.uniform3fv(P.u.uMid, sky[1]); gl.uniform3fv(P.u.uBot, sky[2]);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bq); gl.enableVertexAttribArray(P.aP); gl.vertexAttribPointer(P.aP, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.disableVertexAttribArray(P.aP);
    }
    gl.enable(gl.DEPTH_TEST);
  };
  Renderer.prototype.draw = function (roots) {
    const gl = this.gl, P = this.p, list = [], trans = [];
    const walk = n => { if (!n.visible) return; n.meshes.forEach(m => (m.mat.alpha < 1 || m.mat.decal ? trans : list).push([m, n.world, n])); n.kids.forEach(walk); };
    roots.forEach(r => { if (!r.visible) return; r.update(); if (r.skinFn) r.skinFn(); walk(r); });
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uPV, false, this.pv); gl.uniform3fv(P.u.uL, this.light); gl.uniform3fv(P.u.uCam, this.eye);
    gl.enableVertexAttribArray(P.aP); gl.enableVertexAttribArray(P.aN); gl.enableVertexAttribArray(P.aU);
    gl.enable(gl.CULL_FACE); gl.depthMask(true); gl.disable(gl.BLEND);
    // passe 1 : objets opaques ; passe 2 : contours (faces arrière gonflées)
    list.forEach(e => { if (e[0].mat.twoSide) { gl.disable(gl.CULL_FACE); this.drawMesh(e[0], e[1], false, e[2]); gl.enable(gl.CULL_FACE); } else this.drawMesh(e[0], e[1], false, e[2]); });
    gl.cullFace(gl.FRONT);
    list.forEach(e => { if (e[0].mat.out && !e[0].mat.twoSide) this.drawMesh(e[0], e[1], true, e[2]); });
    gl.cullFace(gl.BACK);
    // passe 3 : décalcomanies (visage) et transparents
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -2);
    trans.forEach(e => { if (e[0].mat.decal) this.drawMesh(e[0], e[1], false, e[2]); });
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.depthMask(false);
    trans.forEach(e => { if (!e[0].mat.decal) { if (e[0].mat.twoSide) gl.disable(gl.CULL_FACE); this.drawMesh(e[0], e[1], false, e[2]); gl.enable(gl.CULL_FACE); } });
    gl.depthMask(true); gl.disable(gl.BLEND);
    gl.disableVertexAttribArray(P.aN); gl.disableVertexAttribArray(P.aU);
  };
  Renderer.prototype.drawMesh = function (m, world, outline, node) {
    const gl = this.gl, P = this.p, g = this.upload(m.geo), mt = m.mat;
    gl.uniformMatrix4fv(P.u.uM, false, world);
    gl.uniform1f(P.u.uOut, outline ? mt.out : 0);
    gl.uniform1f(P.u.uFlat, outline ? 1 : 0);
    gl.uniform3fv(P.u.uCol, outline ? (mt.outC || [0.05, 0.035, 0.06]) : mt.col);
    gl.uniform3fv(P.u.uShade, mt.shade || [0.6, 0.55, 0.72]);
    gl.uniform1f(P.u.uRim, mt.rim == null ? 0.5 : mt.rim); gl.uniform3fv(P.u.uRimC, mt.rimC || [1, 0.7, 0.45]);
    gl.uniform1f(P.u.uA, mt.alpha == null ? 1 : mt.alpha);
    gl.uniform3fv(P.u.uEm, mt.em || [0, 0, 0]);
    gl.uniform1f(P.u.uSpec, mt.spec || 0);
    gl.uniform1f(P.u.uFlash, (node && node.flash) || 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, mt.map || this.white); gl.uniform1i(P.u.uMap, 0); gl.uniform1f(P.u.uUseMap, mt.map ? 1 : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.buf.p); gl.vertexAttribPointer(P.aP, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.buf.n); gl.vertexAttribPointer(P.aN, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.buf.u); gl.vertexAttribPointer(P.aU, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.buf.i);
    gl.drawElements(gl.TRIANGLES, g.buf.cnt, g.buf.t, 0);
  };
  // effets : liste de quads face caméra {p, s, c:[r,g,b,a]} ou rubans {a, b, w, c}
  Renderer.prototype.fx = function (quads, mode) {
    if (!quads.length) return;
    const gl = this.gl, P = this.pf;
    const v = this.view, rx = [v[0], v[4], v[8]], ry = [v[1], v[5], v[9]];
    const data = new Float32Array(quads.length * 6 * 9);
    let o = 0;
    const put = (p, c, u, w) => { data[o++] = p[0]; data[o++] = p[1]; data[o++] = p[2]; data[o++] = c[0]; data[o++] = c[1]; data[o++] = c[2]; data[o++] = c[3]; data[o++] = u; data[o++] = w; };
    quads.forEach(q => {
      let A, B, C, D;
      if (q.a) { // ruban entre deux points, largeur face caméra
        const d = V.norm(V.sub(q.b, q.a)), side = V.mul(V.norm(V.cross(d, V.sub(this.eye, q.a))), q.w);
        A = V.sub(q.a, side); B = V.add(q.a, side); C = V.sub(q.b, side); D = V.add(q.b, side);
      } else if (q.quad) { [A, B, C, D] = q.quad; }
      else { const sx = V.mul(rx, q.s), sy = V.mul(ry, q.s); A = V.sub(V.sub(q.p, sx), sy); B = V.sub(V.add(q.p, sx), sy); C = V.add(V.sub(q.p, sx), sy); D = V.add(V.add(q.p, sx), sy); }
      const c = q.c;
      put(A, c, 0, 0); put(B, c, 1, 0); put(C, c, 0, 1); put(B, c, 1, 0); put(D, c, 1, 1); put(C, c, 0, 1);
    });
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uPV, false, this.pv); gl.uniform1f(P.u.uSoft, mode === 'soft' || mode === 'dark' ? 1 : mode === 'beam' ? -1 : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fxb); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(P.aP); gl.enableVertexAttribArray(P.aC); gl.enableVertexAttribArray(P.aU);
    gl.vertexAttribPointer(P.aP, 3, gl.FLOAT, false, 36, 0); gl.vertexAttribPointer(P.aC, 4, gl.FLOAT, false, 36, 12); gl.vertexAttribPointer(P.aU, 2, gl.FLOAT, false, 36, 28);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, mode === 'dark' ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, quads.length * 6);
    gl.depthMask(true); gl.enable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.disableVertexAttribArray(P.aC); gl.disableVertexAttribArray(P.aU);
  };
  return { M, V, grid, sphere, ellipsoid, lathe, tube, capsule, merge, xformGeo, smooth3, Node, Mesh, Renderer };
})();

;

/* ---------- soft.js (jeu) ---------- */
/* ===== Rendu « 3D détaillée » : éclairage doux, ombres portées, tonemapping ===== */
const SOFT = (function () {
  const { M, V } = G3;
  const VS = `attribute vec3 aP; attribute vec3 aN; attribute vec2 aU;
  uniform mat4 uPV; uniform mat4 uM; uniform mat4 uLVP;
  varying vec3 vN; varying vec3 vW; varying vec2 vU; varying vec4 vL;
  void main(){ vec4 w = uM * vec4(aP, 1.0); vW = w.xyz; vN = (uM * vec4(aN, 0.0)).xyz; vU = aU; vL = uLVP * (w + vec4(normalize((uM * vec4(aN, 0.0)).xyz) * 0.012, 0.0)); gl_Position = uPV * w; }`;
  const FS = `precision highp float;
  uniform vec3 uCol; uniform sampler2D uMap; uniform float uUseMap; uniform sampler2D uSh; uniform float uUseSh; uniform float uShTex;
  uniform vec3 uL; uniform vec3 uLC; uniform vec3 uL2; uniform vec3 uL2C; uniform vec3 uSky; uniform vec3 uGnd; uniform vec3 uCam;
  uniform float uRough; uniform float uSpec; uniform float uWrap; uniform float uSss; uniform vec3 uSssC; uniform float uRim; uniform vec3 uRimC;
  uniform vec3 uEm; uniform float uA; uniform float uFlash; uniform float uMetal; uniform float uAniso; uniform float uUnlit; uniform vec3 uCol2; uniform float uTint;
  varying vec3 vN; varying vec3 vW; varying vec2 vU; varying vec4 vL;
  float unpack(vec4 c){ return dot(c, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0)); }
  float shadow(){
    if (uUseSh < 0.5) return 1.0;
    vec3 p = vL.xyz / vL.w * 0.5 + 0.5;
    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
    float s = 0.0, b = 0.0015, t = 1.0 / uShTex;
    for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
      float d = unpack(texture2D(uSh, p.xy + vec2(float(i), float(j)) * t * 1.5));
      s += (p.z - b > d) ? 0.0 : 1.0;
    }
    return s / 9.0;
  }
  void main(){
    vec4 tex = uUseMap > 0.5 ? texture2D(uMap, vU) : vec4(1.0);
    if (tex.a < 0.004) discard;
    if (uUnlit > 0.5) { gl_FragColor = vec4(uCol * tex.rgb, tex.a * uA); return; }
    vec3 alb = uTint > 0.5 ? mix(uCol, uCol2, tex.g) * (tex.r / 0.78) : uCol * tex.rgb;
    vec3 base = pow(alb, vec3(2.2));
    vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(uCam - vW), L = normalize(uL), L2 = normalize(uL2);
    float ndl = dot(n, L);
    float sh = shadow();
    float dif = clamp((ndl + uWrap) / (1.0 + uWrap), 0.0, 1.0) * mix(0.25, 1.0, sh);
    float dif2 = clamp((dot(n, L2) + 0.3) / 1.3, 0.0, 1.0);
    vec3 amb = mix(uGnd, uSky, n.y * 0.5 + 0.5);
    vec3 col = base * (amb + uLC * dif + uL2C * dif2 * 0.6);
    // transluminescence de la peau
    col += base * uSssC * uSss * smoothstep(0.35, -0.2, ndl) * 0.45;
    // reflets
    vec3 h = normalize(L + v);
    float sp = pow(max(dot(n, h), 0.0), mix(160.0, 6.0, uRough)) * uSpec * (1.0 - uRough * 0.6) * sh;
    vec3 spc = mix(vec3(1.0), base * 1.5, uMetal);
    if (uAniso > 0.5) { float bnd = exp(-pow((vU.y - 0.32) * 6.0, 2.0)); sp = bnd * pow(max(dot(n, h), 0.0), 10.0) * uSpec * sh * 0.35; spc = mix(base * 6.0, vec3(1.0), 0.25); }
    col += uLC * spc * sp;
    // reflet d'environnement pour les métaux (ciel / sol)
    vec3 rf = reflect(-v, n);
    vec3 env = mix(uGnd * 0.8, uSky * 2.2 + vec3(0.25), smoothstep(-0.25, 0.5, rf.y)) * (0.6 + 0.4 * pow(1.0 - max(dot(n, v), 0.0), 2.0));
    col += base * env * uMetal * 0.9;
    float r = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    col += pow(uRimC, vec3(2.2)) * r * uRim * (0.4 + 0.6 * clamp(dot(n, -L) + 0.6, 0.0, 1.0));
    col += pow(uEm, vec3(2.2));
    col = mix(col, vec3(2.0), uFlash);
    col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
    col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
    gl_FragColor = vec4(col, tex.a * uA);
  }`;
  const VSD = `attribute vec3 aP; uniform mat4 uLVP; uniform mat4 uM; void main(){ gl_Position = uLVP * uM * vec4(aP, 1.0); }`;
  const FSD = `precision highp float;
  vec4 pack(float d){ vec4 e = vec4(1.0, 255.0, 65025.0, 16581375.0) * d; e = fract(e); e -= e.yzww * vec4(1.0/255.0, 1.0/255.0, 1.0/255.0, 0.0); return e; }
  void main(){ gl_FragColor = pack(gl_FragCoord.z); }`;
  function ortho(l, r, b, t, n, f) { const m = new Float32Array(16); m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n); m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n); m[15] = 1; return m; }
  function mk(gl, vs, fs, un) {
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; un.forEach(n => { u[n] = gl.getUniformLocation(p, n); });
    return { p, u, aP: gl.getAttribLocation(p, 'aP'), aN: gl.getAttribLocation(p, 'aN'), aU: gl.getAttribLocation(p, 'aU') };
  }
  // ajoute le rendu doux à un Renderer G3 existant
  function attach(R, shSize) {
    const gl = R.gl;
    R.ps = mk(gl, VS, FS, ['uPV', 'uM', 'uLVP', 'uCol', 'uMap', 'uUseMap', 'uSh', 'uUseSh', 'uShTex', 'uL', 'uLC', 'uL2', 'uL2C', 'uSky', 'uGnd', 'uCam', 'uRough', 'uSpec', 'uWrap', 'uSss', 'uSssC', 'uRim', 'uRimC', 'uEm', 'uA', 'uFlash', 'uMetal', 'uAniso', 'uUnlit', 'uCol2', 'uTint']);
    R.pd = mk(gl, VSD, FSD, ['uLVP', 'uM']);
    const S = shSize || 2048;
    R.shS = S;
    R.shT = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, R.shT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    R.shF = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, R.shF);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, R.shT, 0);
    const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, S, S);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    R.shOK = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    R.env = { L: V.norm([0.55, 0.95, 0.7]), LC: [1.55, 1.45, 1.35], L2: V.norm([-0.7, 0.3, -0.6]), L2C: [0.5, 0.55, 0.8], sky: [0.4, 0.41, 0.52], gnd: [0.15, 0.13, 0.13], center: [0, 1, 0], radius: 2.2 };
    R.drawSoft = drawSoft;
  }
  function collect(roots) {
    const list = [], trans = [];
    const walk = n => { if (!n.visible) return; n.meshes.forEach(m => (m.mat.alpha < 1 ? trans : list).push([m, n.world, n])); n.kids.forEach(walk); };
    roots.forEach(r => { if (!r.visible) return; r.update(); if (r.skinFn) r.skinFn(); walk(r); });
    return { list, trans };
  }
  function bindGeo(R, P, g, nor) {
    const gl = R.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, g.buf.p); gl.vertexAttribPointer(P.aP, 3, gl.FLOAT, false, 0, 0);
    if (nor) { gl.bindBuffer(gl.ARRAY_BUFFER, g.buf.n); gl.vertexAttribPointer(P.aN, 3, gl.FLOAT, false, 0, 0); gl.bindBuffer(gl.ARRAY_BUFFER, g.buf.u); gl.vertexAttribPointer(P.aU, 2, gl.FLOAT, false, 0, 0); }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.buf.i);
  }
  function drawSoft(roots, opt) {
    const R = this, gl = R.gl, E = R.env;
    const { list, trans } = collect(roots);
    // matrice de la lumière (orthographique centrée sur la zone utile)
    const c = (opt && opt.center) || E.center, rad = (opt && opt.radius) || E.radius;
    const eye = V.add(c, V.mul(E.L, rad * 3));
    const lv = M.look(eye, c, Math.abs(E.L[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0]);
    const lvp = M.mul(ortho(-rad, rad, -rad, rad, rad * 0.5, rad * 6), lv);
    const useSh = R.shOK && !(opt && opt.noShadow);
    if (useSh) {
      const P = R.pd;
      const sc = gl.isEnabled(gl.SCISSOR_TEST); gl.disable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, R.shF); gl.viewport(0, 0, R.shS, R.shS);
      gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uLVP, false, lvp);
      gl.enableVertexAttribArray(P.aP); gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
      list.forEach(([m, w]) => { if (m.mat.noCast) return; const g = R.upload(m.geo); gl.uniformMatrix4fv(P.u.uM, false, w); bindGeo(R, P, g, false); gl.drawElements(gl.TRIANGLES, g.buf.cnt, g.buf.t, 0); });
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); if (sc) gl.enable(gl.SCISSOR_TEST);
      gl.viewport(R.vpx || 0, R.vpy || 0, R.vpw || R.cv.width, R.vph || R.cv.height);
    }
    const P = R.ps;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uPV, false, R.pv); gl.uniformMatrix4fv(P.u.uLVP, false, lvp);
    gl.uniform3fv(P.u.uL, E.L); gl.uniform3fv(P.u.uLC, E.LC); gl.uniform3fv(P.u.uL2, E.L2); gl.uniform3fv(P.u.uL2C, E.L2C);
    gl.uniform3fv(P.u.uSky, E.sky); gl.uniform3fv(P.u.uGnd, E.gnd); gl.uniform3fv(P.u.uCam, R.eye);
    gl.uniform1f(P.u.uUseSh, useSh ? 1 : 0); gl.uniform1f(P.u.uShTex, R.shS);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, R.shT); gl.uniform1i(P.u.uSh, 1);
    gl.enableVertexAttribArray(P.aP); gl.enableVertexAttribArray(P.aN); gl.enableVertexAttribArray(P.aU);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.disable(gl.BLEND);
    const one = (m, w, node) => {
      const mt = m.mat, g = R.upload(m.geo);
      gl.uniformMatrix4fv(P.u.uM, false, w);
      gl.uniform3fv(P.u.uCol, mt.col); gl.uniform1f(P.u.uRough, mt.rough == null ? 0.7 : mt.rough); gl.uniform1f(P.u.uSpec, mt.spec == null ? 0.3 : mt.spec);
      gl.uniform1f(P.u.uWrap, mt.wrap == null ? 0.25 : mt.wrap); gl.uniform1f(P.u.uSss, mt.sss || 0); gl.uniform3fv(P.u.uSssC, mt.sssC || [1, 0.35, 0.25]);
      gl.uniform1f(P.u.uRim, mt.rim == null ? 0.35 : mt.rim); gl.uniform3fv(P.u.uRimC, mt.rimC || [1, 0.8, 0.7]);
      gl.uniform3fv(P.u.uEm, mt.em || [0, 0, 0]); gl.uniform1f(P.u.uA, mt.alpha == null ? 1 : mt.alpha); gl.uniform1f(P.u.uFlash, (node && node.flash) || 0);
      gl.uniform1f(P.u.uMetal, mt.metal || 0); gl.uniform1f(P.u.uAniso, mt.aniso ? 1 : 0); gl.uniform1f(P.u.uUnlit, mt.unlit ? 1 : 0); gl.uniform3fv(P.u.uCol2, mt.col2 || mt.col); gl.uniform1f(P.u.uTint, mt.tint ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, mt.map || R.white); gl.uniform1i(P.u.uMap, 0); gl.uniform1f(P.u.uUseMap, mt.map ? 1 : 0);
      if (mt.twoSide) gl.disable(gl.CULL_FACE);
      if (mt.decal) { gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -2); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); }
      bindGeo(R, P, g, true); gl.drawElements(gl.TRIANGLES, g.buf.cnt, g.buf.t, 0);
      if (mt.decal) { gl.disable(gl.POLYGON_OFFSET_FILL); gl.disable(gl.BLEND); }
      if (mt.twoSide) gl.enable(gl.CULL_FACE);
    };
    list.filter(e => !e[0].mat.decal).forEach(e => one(e[0], e[1], e[2]));
    list.filter(e => e[0].mat.decal).forEach(e => one(e[0], e[1], e[2]));
    if (trans.length) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); trans.forEach(e => one(e[0], e[1], e[2])); gl.depthMask(true); gl.disable(gl.BLEND); }
    gl.disableVertexAttribArray(P.aN); gl.disableVertexAttribArray(P.aU);
    gl.activeTexture(gl.TEXTURE0);
  }
  return { attach };
})();

;

/* ---------- head.js (jeu) ---------- */
/* ===== Tête 3D anime : forme, visage peint, cheveux en mèches ===== */
const HEAD = (function () {
  const { V, grid, tube, ellipsoid, merge, Node, Mesh } = G3;
  const PI = Math.PI;
  const sst = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // forme du crâne et de la mâchoire (sphère unité déformée)
  function shape(p) {
    let x = p[0] * 0.86, y = p[1], z = p[2] * 0.92;
    if (y < 0) {
      const f = Math.min(1, -y), j = f * f;
      x *= 1 - 0.3 * j - 0.06 * f;
      if (z < 0) z *= 1 - 0.48 * f;
      z += 0.14 * sst(0.5, 1, f);            // menton légèrement vers l'avant
      y *= 1 + 0.12 * f;                     // bas du visage un peu allongé
    } else if (z < 0) { z *= 1 + 0.07 * y; }
    if (z > 0) z -= 0.04 * sst(0.3, 0.8, p[2]) * sst(-0.6, 0.2, -Math.abs(p[1]));
    return [x, y, z];
  }
  function at(ph, th, r) { return shape([Math.sin(ph) * Math.sin(th) * r, Math.cos(th) * r, Math.cos(ph) * Math.sin(th) * r]); }
  const headGeo = grid(56, 40, (u, v) => ({ p: at((u - 0.5) * 2 * PI, v * PI, 1), uv: [u, v] }));
  // zone du visage : même surface, UV en projection frontale
  const faceGeo = grid(40, 36, (u, v) => {
    const p = at((u - 0.5) * PI * 1.0, 0.25 * PI + v * 0.75 * PI, 1);
    return { p, uv: [0.5 + p[0] / 2.5, 0.5 - (p[1] + 0.1) / 2.5] };
  });
  const earGeo = ellipsoid(0.13, 0.22, 0.08, 16, 12);

  /* ---------- visage peint ---------- */
  const T = (x, y) => [(0.5 + x / 2.5) * 1024, (0.5 - (y + 0.1) / 2.5) * 1024];
  function faceTex(o) {
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    const g = c.getContext('2d');
    g.lineCap = 'round'; g.lineJoin = 'round';
    const ex = 0.34, ey = -0.12, ew = 0.33, eh = o.eh || 0.165;
    [-1, 1].forEach(sd => eye(g, sd, ex, ey, ew, eh, o));
    // sourcils
    [-1, 1].forEach(sd => {
      const tilt = o.brow || 0; // >0 : sourcils froncés
      const a = T(sd * 0.17, 0.06 - tilt * 0.04), b = T(sd * 0.36, 0.1 + tilt * 0.02), d = T(sd * 0.52, 0.06 + tilt * 0.03);
      g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(b[0], b[1] - 6, d[0], d[1]);
      g.lineWidth = 9; g.strokeStyle = o.browC; g.stroke();
      g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(b[0], b[1] - 6, d[0], d[1]); g.lineWidth = 4; g.strokeStyle = o.browC; g.stroke();
    });
    // nez : petite ombre
    const n1 = T(0.015, -0.36), n2 = T(-0.03, -0.44);
    g.beginPath(); g.moveTo(n1[0], n1[1]); g.lineTo(n2[0], n2[1]); g.lineTo(n2[0] + 14, n2[1] + 2);
    g.lineWidth = 3.5; g.strokeStyle = o.line; g.globalAlpha = 0.55; g.stroke(); g.globalAlpha = 1;
    // bouche
    const m = o.mouth || 'neutral', mc = T(0, -0.66);
    g.lineWidth = 4.5; g.strokeStyle = o.lip;
    g.beginPath();
    if (m === 'smile') { g.moveTo(mc[0] - 36, mc[1] - 4); g.quadraticCurveTo(mc[0], mc[1] + 16, mc[0] + 36, mc[1] - 4); }
    else if (m === 'smirk') { g.moveTo(mc[0] - 30, mc[1] + 2); g.quadraticCurveTo(mc[0] + 8, mc[1] + 8, mc[0] + 34, mc[1] - 8); }
    else if (m === 'firm') { g.moveTo(mc[0] - 30, mc[1]); g.lineTo(mc[0] + 30, mc[1]); }
    else { g.moveTo(mc[0] - 30, mc[1]); g.quadraticCurveTo(mc[0], mc[1] + 6, mc[0] + 30, mc[1]); }
    g.stroke();
    g.globalAlpha = 0.35; g.lineWidth = 3; g.beginPath(); g.moveTo(mc[0] - 14, mc[1] + 20); g.lineTo(mc[0] + 14, mc[1] + 20); g.stroke(); g.globalAlpha = 1;
    if (o.blush) { [-1, 1].forEach(sd => { const b = T(sd * 0.42, -0.36); const gr = g.createRadialGradient(b[0], b[1], 0, b[0], b[1], 46); gr.addColorStop(0, 'rgba(255,120,130,.32)'); gr.addColorStop(1, 'rgba(255,120,130,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(b[0], b[1], 52, 26, 0, 0, PI * 2); g.fill(); }); }
    if (o.scar) { const s1 = T(0.42, -0.2), s2 = T(0.55, -0.42); g.strokeStyle = 'rgba(150,60,55,.75)'; g.lineWidth = 5; g.beginPath(); g.moveTo(s1[0], s1[1]); g.lineTo(s2[0], s2[1]); g.stroke(); g.lineWidth = 3; g.beginPath(); g.moveTo(s1[0] + 8, s1[1] + 34); g.lineTo(s1[0] + 34, s1[1] + 24); g.stroke(); }
    if (o.mark) { // marques élémentaires sur les joues
      g.fillStyle = o.mark;
      [-1, 1].forEach(sd => { const a = T(sd * 0.5, -0.3); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(a[0] + sd * 36, a[1] + 6); g.lineTo(a[0] + sd * 4, a[1] + 14); g.closePath(); g.fill(); g.beginPath(); g.moveTo(a[0] - sd * 2, a[1] + 26); g.lineTo(a[0] + sd * 30, a[1] + 30); g.lineTo(a[0], a[1] + 38); g.closePath(); g.fill(); });
    }
    return c;
  }
  function eye(g, sd, ex, ey, ew, eh, o) {
    // sd = -1 : œil gauche à l'écran (côté intérieur à droite)
    const cx = sd * ex, inner = cx - sd * ew / 2, outer = cx + sd * ew / 2;
    const tilt = o.tilt || 0; // >0 : coin extérieur relevé (regard perçant)
    const I = T(inner, ey - 0.005), O = T(outer, ey + 0.02 + tilt * 0.05), top = T(cx + sd * 0.02, ey + eh * 0.62), bot = T(cx, ey - eh * 0.5);
    const path = () => { g.beginPath(); g.moveTo(I[0], I[1]); g.bezierCurveTo(I[0] + (top[0] - I[0]) * 0.4, top[1], top[0] + (O[0] - top[0]) * 0.5, top[1] - 2, O[0], O[1]); g.bezierCurveTo(O[0] - (O[0] - bot[0]) * 0.2, bot[1], I[0] + (bot[0] - I[0]) * 0.6, bot[1] - 4, I[0], I[1]); g.closePath(); };
    g.save(); path(); g.fillStyle = '#f7f2ec'; g.fill(); g.clip();
    // ombre de la paupière
    g.fillStyle = 'rgba(120,90,110,.28)'; g.fillRect(Math.min(I[0], O[0]) - 10, top[1] - 10, Math.abs(O[0] - I[0]) + 20, (bot[1] - top[1]) * 0.32);
    // iris
    const ic = T(cx + sd * 0.005, ey - eh * 0.02), irx = ew * 0.27 * 410, iry = eh * 0.6 * 410;
    const gr = g.createLinearGradient(0, ic[1] - iry, 0, ic[1] + iry);
    gr.addColorStop(0, o.eyeD); gr.addColorStop(0.45, o.eye); gr.addColorStop(1, o.eyeL);
    g.fillStyle = gr; g.beginPath(); g.ellipse(ic[0], ic[1], irx, iry, 0, 0, PI * 2); g.fill();
    g.lineWidth = 4; g.strokeStyle = o.eyeD; g.stroke();
    g.fillStyle = o.eyeD; g.beginPath(); g.ellipse(ic[0], ic[1] + iry * 0.08, irx * 0.42, iry * 0.5, 0, 0, PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.ellipse(ic[0] - irx * 0.35, ic[1] - iry * 0.4, irx * 0.32, iry * 0.22, -0.4, 0, PI * 2); g.fill();
    g.beginPath(); g.arc(ic[0] + irx * 0.38, ic[1] + iry * 0.42, irx * 0.14, 0, PI * 2); g.fill();
    g.strokeStyle = o.eyeL; g.globalAlpha = 0.6; g.lineWidth = 3; g.beginPath(); g.ellipse(ic[0], ic[1] + iry * 0.1, irx * 0.72, iry * 0.72, 0, 0.2, PI - 0.2); g.stroke(); g.globalAlpha = 1;
    g.restore();
    // cils supérieurs épais avec pointe
    g.beginPath(); g.moveTo(I[0] - sd * 4, I[1] + 4);
    g.bezierCurveTo(I[0] + (top[0] - I[0]) * 0.4, top[1] - 4, top[0] + (O[0] - top[0]) * 0.5, top[1] - 6, O[0] + sd * 22, O[1] - 14 - tilt * 10);
    g.bezierCurveTo(top[0] + (O[0] - top[0]) * 0.55, top[1] + 9, I[0] + (top[0] - I[0]) * 0.45, top[1] + 9, I[0] - sd * 4, I[1] + 4);
    g.fillStyle = o.lash; g.fill();
    // cils inférieurs fins (moitié extérieure)
    g.beginPath(); g.moveTo(O[0] - sd * 2, O[1] + 4); g.quadraticCurveTo(bot[0] + sd * 20, bot[1] + 4, bot[0] - sd * 12, bot[1] + 2);
    g.lineWidth = 3.5; g.strokeStyle = o.lash; g.globalAlpha = 0.75; g.stroke(); g.globalAlpha = 1;
    // pli de la paupière
    g.beginPath(); g.moveTo(I[0] + sd * 14, top[1] - 6); g.quadraticCurveTo(top[0], top[1] - 22, O[0] - sd * 6, O[1] - 26 - tilt * 6);
    g.lineWidth = 2.5; g.strokeStyle = o.line; g.globalAlpha = 0.5; g.stroke(); g.globalAlpha = 1;
  }

  /* ---------- cheveux ---------- */
  // calotte : bord inférieur lisse qui suit la ligne des cheveux
  function capGeo(hl, r) {
    return grid(64, 30, (u, v) => { const ph = (u - 0.5) * 2 * PI; return { p: at(ph, v * hl(Math.abs(ph)), r), uv: [u, v] }; });
  }
  // mèche : racine (ph, th) sur le crâne, direction de style, longueur, largeur, gravité, boucle
  function lock(o) {
    const r0 = 1.02, root = at(o.ph, o.th, r0 * 0.96);
    const nrm = V.norm(at(o.ph, o.th, 1));
    let dir = V.norm(V.add(V.mul(nrm, o.out == null ? 0.6 : o.out), o.dir || [0, -1, 0]));
    const pts = [root], seg = 6, step = o.len / seg;
    let p = root;
    for (let k = 0; k < seg; k++) {
      dir = V.norm(V.add(dir, V.mul([0, -1, 0], o.grav || 0)));
      if (o.curl) dir = V.norm(V.add(dir, V.mul(o.curl, 1 / seg)));
      p = V.add(p, V.mul(dir, step));
      // reste hors du crâne
      const q = [p[0] / 0.84, p[1], p[2] / 0.9]; const d = V.len(q);
      if (d < 1.08 && p[1] > -0.9) p = V.add(p, V.mul(V.norm(q), (1.08 - d) * 0.9));
      pts.push(p);
    }
    const w = o.w || 0.3, flat = o.flat || 0.38;
    return tube(pts, t => { const k = t < 0.2 ? 0.85 + t * 0.75 : Math.pow(1 - (t - 0.2) / 0.8, 0.9); return [w * k + 0.004, w * flat * k + 0.004]; }, 7, nrm);
  }
  // mèche posée sur le crâne : de (ph0, th0) à (ph1, th1) en suivant la surface, puis pend (hang) vers le bas
  function slock(o) {
    const pts = [], n = 6;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      pts.push(at(o.ph0 + (o.ph1 - o.ph0) * t, o.th0 + (o.th1 - o.th0) * t, (o.r0 || 1.06) + ((o.r1 || 1.1) - (o.r0 || 1.06)) * t));
    }
    if (o.hang) {
      const last = pts[pts.length - 1], prev = pts[pts.length - 2];
      let d = V.norm(V.add(V.mul(V.norm(V.sub(last, prev)), 0.4), o.hdir || [0, -1, 0]));
      let p = last; const m = 5;
      for (let k = 1; k <= m; k++) { d = V.norm(V.add(d, [0, -0.25, 0])); p = V.add(p, V.mul(d, o.hang / m)); pts.push(p); }
    }
    const w = o.w || 0.3, flat = o.flat || 0.3, tip = o.tip == null ? 0.25 : o.tip;
    const nrm = V.norm(at(o.ph0, (o.th0 + o.th1) / 2, 1));
    return tube(pts, t => { const k = t < 1 - tip ? 1 - 0.15 * t : Math.pow((1 - t) / tip, 0.85) * 0.85; return [w * k + 0.004, w * flat * k + 0.004]; }, 7, nrm);
  }
  const rnd = s => { let a = s; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; };
  function hairGeo(style, seed) {
    const R = rnd(seed * 7919 + 13), L = [];
    const deg = d => d * PI / 180;
    const back = [0, 0, -1];
    // frange : mèches qui partent du sommet, suivent le front et retombent sur les sourcils
    const bangs = (n, len, spread, grav) => {
      for (let i = 0; i < n; i++) {
        const k = (i + 0.5) / n * 2 - 1, ph = deg(k * spread + (R() - 0.5) * 6);
        const end = 84 + len * 14 * (1 - 0.35 * Math.abs(k)) + (R() - 0.5) * 8 + (i === Math.floor(n / 2) ? 6 : 0);
        L.push(slock({ ph0: ph * 0.45, th0: deg(6 + R() * 6), ph1: ph * (1.05 + R() * 0.15), th1: deg(end), r0: 1.05, r1: 1.11 + 0.03 * (1 - Math.abs(k)), w: 0.34 + R() * 0.07, tip: 0.32 }));
      }
    };
    const sides = (len, grav) => { [-1, 1].forEach(sd => { for (let i = 0; i < 2; i++) L.push(slock({ ph0: sd * deg(50 + i * 18), th0: deg(20 + i * 6), ph1: sd * deg(70 + i * 16), th1: deg(95 + i * 5), r0: 1.05, r1: 1.1, hang: Math.max(0, len - 0.8), hdir: [sd * 0.15, -1, 0.15], w: 0.3, tip: 0.35 })); }); };
    if (style === 'spiky') {
      bangs(6, 0.95, 50, 0.3); sides(0.9, 0.18);
      for (let ring = 0; ring < 3; ring++) for (let i = 0; i < 9; i++) {
        const ph = deg(-150 + i * 37.5 + ring * 12 + (R() - 0.5) * 10), th = deg(22 + ring * 26 + R() * 8);
        const up = ring === 0 ? 0.75 : ring === 1 ? 0.35 : 0.05;
        L.push(lock({ ph, th, len: 0.75 + R() * 0.5 - ring * 0.08, w: 0.38, out: 1.0, dir: V.add(V.mul([Math.sin(ph), 0, Math.cos(ph)], 0.3), V.add(V.mul(back, 0.55), [0, up, 0])), grav: 0.04, flat: 0.45 }));
      }
    } else if (style === 'long') {
      bangs(6, 0.95, 50, 0.3); sides(1.9, 0.35);
      for (let i = 0; i < 15; i++) { const ph = deg(66 + i * 16); L.push(slock({ ph0: ph * 0.9, th0: deg(8 + R() * 10), ph1: ph, th1: deg(118), r0: 1.05, r1: 1.12, hang: 1.6 + R() * 0.7, hdir: [Math.sin(ph) * 0.2, -1, Math.cos(ph) * 0.25], w: 0.4, tip: 0.3 })); }
    } else if (style === 'bob') {
      bangs(6, 0.85, 50, 0.3); sides(1.25, 0.35);
      for (let i = 0; i < 13; i++) { const ph = deg(70 + i * 17.7); L.push(slock({ ph0: ph * 0.9, th0: deg(8 + R() * 10), ph1: ph, th1: deg(116), r0: 1.05, r1: 1.13, hang: 0.45 + R() * 0.15, hdir: [Math.sin(ph) * 0.3, -1, Math.cos(ph) * 0.3], w: 0.42, tip: 0.3 })); }
    } else if (style === 'ponytail') {
      bangs(5, 0.85, 50, 0.25); sides(1.1, 0.3);
      for (let i = 0; i < 10; i++) { const ph = deg(80 + i * 22); L.push(slock({ ph0: ph, th0: deg(112), ph1: PI + (ph - PI) * 0.2, th1: deg(44), r0: 1.06, r1: 1.1, w: 0.42, tip: 0.2 })); }
      for (let i = 0; i < 4; i++) L.push(lock({ ph: PI + deg((i - 1.5) * 9), th: deg(40), len: 2.4 + i * 0.15, w: 0.34, out: 0.4, dir: [0, 0.35, -1], grav: 0.32, flat: 0.5 }));
    } else if (style === 'short') {
      bangs(5, 0.6, 50, 0.15); sides(0.6, 0.15);
      for (let i = 0; i < 16; i++) { const ph = deg(-170 + i * 22.5 + (R() - 0.5) * 8), th = deg(22 + R() * 60); L.push(lock({ ph, th, len: 0.45 + R() * 0.25, w: 0.32, out: 0.8, dir: [0, 0.2, -0.5], grav: 0.1, flat: 0.42 })); }
    } else if (style === 'buns') {
      bangs(6, 0.8, 50, 0.3); sides(1.0, 0.3);
      for (let i = 0; i < 11; i++) { const ph = deg(76 + i * 20.8); L.push(slock({ ph0: ph * 0.9, th0: deg(10 + R() * 10), ph1: ph, th1: deg(112), r0: 1.05, r1: 1.12, hang: 0.25, w: 0.42, tip: 0.3 })); }
    } else if (style === 'hood') {
      bangs(5, 0.8, 46, 0.3); sides(1.0, 0.3);
    }
    return merge(L);
  }
  function hairline(style) {
    return a => { const f = Math.pow(a / PI, 1.1); return 58 * PI / 180 + f * (style === 'short' || style === 'spiky' ? 66 : 76) * PI / 180; };
  }

  /* ---------- assemblage ---------- */
  // look : {hair, hairC, skin, skinSh, eye, eyeD, eyeL, lash, tilt, brow, mouth, blush, scar, mark, acc, accC}
  function build(R3, look, seed) {
    const head = new Node('head');
    const skinMat = { col: look.skin, shade: look.skinSh, rim: 0.45, rimC: look.rim || [1, 0.75, 0.6], out: 0.035 };
    head.meshes.push(new Mesh(headGeo, skinMat));
    const key = JSON.stringify([look.eye, look.eyeD, look.eyeL, look.lash, look.tilt, look.brow, look.mouth, look.blush, look.scar, look.mark, look.browC, look.eh]);
    let ft = R3.tc.get(key);
    if (!ft) {
      const hex = a => '#' + a.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
      ft = R3.texture(faceTex({ eye: hex(look.eye), eyeD: hex(look.eyeD), eyeL: hex(look.eyeL), lash: hex(look.lash), line: hex(look.skinLine || [0.55, 0.36, 0.34]), lip: hex(look.lip || [0.62, 0.32, 0.3]), browC: hex(look.browC || look.lash), tilt: look.tilt, brow: look.brow, mouth: look.mouth, blush: look.blush, scar: look.scar, mark: look.mark ? hex(look.mark) : null, eh: look.eh }));
      R3.tc.set(key, ft);
    }
    head.meshes.push(new Mesh(faceGeo, { col: look.skin, shade: look.skinSh, map: ft, decal: true, rim: 0 }));
    [-1, 1].forEach(sd => { const e = new Node(); e.pos = [sd * 0.8, -0.12, -0.08]; e.rot = [0, sd * 0.25, sd * -0.1]; e.meshes.push(new Mesh(earGeo, skinMat)); head.add(e); });
    const hairMat = { col: look.hairC, shade: look.hairSh || look.hairC.map(v => v * 0.55), rim: 0.8, rimC: look.rim || [1, 0.75, 0.55], out: 0.035, spec: 0.35 };
    const style = look.hair;
    head.meshes.push(new Mesh(capGeo(hairline(style), 1.045), hairMat));
    head.meshes.push(new Mesh(hairGeo(style, seed || 1), hairMat));
    if (style === 'buns') [-1, 1].forEach(sd => { const b = new Node(); b.pos = [sd * 0.62, 0.78, -0.25]; b.meshes.push(new Mesh(ellipsoid(0.36, 0.36, 0.36, 18, 14), hairMat)); head.add(b); });
    if (style === 'ponytail') { const t = new Node(); t.pos = [0, 0.55, -0.98]; t.meshes.push(new Mesh(ellipsoid(0.16, 0.16, 0.12, 12, 10), { col: look.accC || [0.85, 0.2, 0.15], rim: 0.3, out: 0.02 })); head.add(t); }
    if (style === 'hood') {
      const hood = grid(40, 30, (u, v) => ({ p: at((u - 0.5) * 2 * PI, v * PI, 1.28), uv: [u, v] }), { keep: (i, j, nu, nv) => { const ph = Math.abs(((i + 0.5) / nu - 0.5) * 2 * PI); return !(ph < 0.95 && (j + 0.5) / nv > 0.2) && (j + 1) / nv < 0.78; } });
      head.meshes.push(new Mesh(hood, { col: look.accC || [0.12, 0.1, 0.16], shade: [0.5, 0.45, 0.6], rim: 0.6, rimC: look.rim, out: 0.035 }));
    }
    accessory(head, look);
    return head;
  }
  function accessory(head, look) {
    const a = look.acc, c = look.accC || [0.85, 0.2, 0.15];
    const add = (geo, mat, pos, rot) => { const n = new Node(); n.pos = pos || [0, 0, 0]; n.rot = rot || [0, 0, 0]; n.meshes.push(new Mesh(geo, mat)); head.add(n); return n; };
    const M = { col: c, rim: 0.4, out: 0.025, shade: c.map(v => v * 0.6) };
    if (a === 'band') add(G3.lathe([[1.06, 0.22], [1.08, 0.3], [1.06, 0.38]], 40, { sx: 0.86, sz: 0.93 }), M, [0, 0, 0.01]);
    if (a === 'horns') [-1, 1].forEach(sd => add(G3.tube([[0, 0, 0], [sd * 0.12, 0.25, -0.05], [sd * 0.3, 0.45, -0.2], [sd * 0.5, 0.52, -0.42]], t => [0.13 * (1 - t) + 0.01, 0.13 * (1 - t) + 0.01], 8), { col: [0.92, 0.88, 0.8], rim: 0.3, out: 0.025 }, [sd * 0.45, 0.68, 0.05]));
    if (a === 'ears') [-1, 1].forEach(sd => add(G3.tube([[0, 0, 0], [sd * 0.05, 0.3, 0], [sd * 0.08, 0.55, -0.02]], t => [0.28 * (1 - t) + 0.01, 0.07], 6, [0, 0, 1]), { col: look.hairC, rim: 0.6, rimC: look.rim, out: 0.03 }, [sd * 0.55, 0.8, -0.05], [0, 0, sd * -0.35]));
    if (a === 'crown') add(G3.lathe([[0.5, 0], [0.52, 0.18], [0.46, 0.3]], 24), { col: [0.95, 0.75, 0.3], rim: 0.5, spec: 0.8, out: 0.02 }, [0, 0.95, -0.05]);
    if (a === 'halo') add(G3.tube(Array.from({ length: 33 }, (_, i) => [Math.cos(i / 32 * PI * 2) * 0.62, 0, Math.sin(i / 32 * PI * 2) * 0.62]), () => [0.05, 0.05], 6), { col: [1, 0.92, 0.6], em: [0.5, 0.42, 0.2], rim: 0, out: 0 }, [0, 1.35, -0.1], [0.25, 0, 0]);
    if (a === 'mask') add(grid(30, 10, (u, v) => ({ p: at((u - 0.5) * PI * 1.15, (0.6 + v * 0.36) * PI, 1.035), uv: [u, v] })), { col: look.accC || [0.12, 0.1, 0.16], shade: [0.5, 0.45, 0.6], rim: 0.3, out: 0.02 });
    if (a === 'glasses') [-1, 1].forEach(sd => add(G3.tube(Array.from({ length: 25 }, (_, i) => [Math.cos(i / 24 * PI * 2) * 0.17, Math.sin(i / 24 * PI * 2) * 0.12, 0]), () => [0.018, 0.018], 5), { col: [0.15, 0.13, 0.16], rim: 0, out: 0 }, [sd * 0.33, -0.12, 0.86]));
    if (a === 'flower') add(ellipsoid(0.16, 0.16, 0.08, 12, 8), { col: [1, 0.78, 0.86], rim: 0.3, out: 0.02 }, [0.62, 0.55, 0.45], [0, 0.6, 0]);
  }
  return { build, shape, at };
})();

;

/* ---------- chars.js (jeu) ---------- */
/* ===== Corps 3D, tenues, armes et squelette animé ===== */
const CHAR = (function () {
  const { V, lathe, capsule, ellipsoid, tube, merge, Node, Mesh, M } = G3;
  const PI = Math.PI, D = PI / 180;
  const shadeOf = (c, k) => c.map(v => v * (k || 0.58));
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

  /* ---------- géométries partagées ---------- */
  const GEO = {};
  function geo(key, fn) { if (!GEO[key]) GEO[key] = fn(); return GEO[key]; }
  const UA = 0.28, FA = 0.26, TH = 0.43, SH = 0.43; // longueurs des membres

  function body(look) {
    const f = look.body === 'f';
    return {
      pelvis: geo('pelvis' + f, () => lathe(f ? [[0.02, -0.11], [0.13, -0.09], [0.17, -0.02], [0.155, 0.06], [0.12, 0.1]] : [[0.02, -0.11], [0.12, -0.09], [0.15, -0.02], [0.145, 0.06], [0.13, 0.1]], 24, { sz: 0.72 })),
      torso: geo('torso' + f, () => lathe(f ? [[0.125, -0.02], [0.115, 0.08], [0.155, 0.2], [0.165, 0.27], [0.15, 0.34], [0.07, 0.39], [0.02, 0.4]] : [[0.14, -0.02], [0.135, 0.08], [0.18, 0.2], [0.2, 0.29], [0.19, 0.35], [0.09, 0.4], [0.02, 0.41]], 28, { sz: 0.64 })),
      neck: geo('neck', () => capsule([0, -0.02, 0], [0, 0.11, 0], 0.045, 0.042, 10)),
      uarm: geo('uarm' + f, () => capsule([0, 0, 0], [0, -UA, 0], f ? 0.046 : 0.054, f ? 0.04 : 0.046, 12)),
      farm: geo('farm' + f, () => capsule([0, 0, 0], [0, -FA, 0], f ? 0.04 : 0.046, f ? 0.032 : 0.036, 12)),
      hand: geo('hand', () => ellipsoid(0.052, 0.058, 0.046, 14, 10)),
      thigh: geo('thigh' + f, () => capsule([0, 0, 0], [0, -TH, 0], f ? 0.078 : 0.08, 0.056, 14)),
      shin: geo('shin', () => capsule([0, 0, 0], [0, -SH, 0], 0.056, 0.042, 12)),
      foot: geo('foot', () => G3.xformGeo(ellipsoid(0.05, 0.045, 0.11, 14, 10), M.compose([0, -0.02, 0.05], [0, 0, 0], 1)))
    };
  }
  // pièces de tenue
  const OUT = {
    coatTop: () => lathe([[0.16, -0.04], [0.155, 0.08], [0.195, 0.2], [0.215, 0.29], [0.205, 0.35], [0.11, 0.41], [0.08, 0.46]], 28, { sz: 0.68 }),
    coatSkirt: () => lathe([[0.17, 0.06], [0.21, -0.1], [0.29, -0.32], [0.36, -0.52]], 28, { sz: 0.8, phi0: 0.75, phiLen: PI * 2 - 1.5, flip: true }),
    robeSkirt: () => lathe([[0.17, 0.06], [0.24, -0.2], [0.34, -0.55], [0.44, -0.86]], 30, { sz: 0.9, flip: true }),
    giTop: () => lathe([[0.155, -0.04], [0.155, 0.1], [0.2, 0.22], [0.215, 0.3], [0.2, 0.355], [0.09, 0.41]], 28, { sz: 0.68 }),
    belt: () => lathe([[0.155, -0.03], [0.162, 0.0], [0.155, 0.04]], 26, { sz: 0.76 }),
    pants: () => capsule([0, 0, 0], [0, -TH, 0], 0.1, 0.075, 14),
    boot: () => capsule([0, -SH * 0.45, 0], [0, -SH, 0], 0.064, 0.058, 12),
    cuff: () => capsule([0, -FA * 0.55, 0], [0, -FA, 0], 0.05, 0.048, 12),
    sleeveWide: () => lathe([[0.05, 0.0], [0.07, -0.12], [0.11, -0.26]], 18, { flip: true }),
    pad: () => G3.sphere(1, 18, 10, p => [p[0] * 0.1, Math.max(p[1], -0.15) * 0.09, p[2] * 0.11]),
    plate: () => lathe([[0.17, 0.12], [0.2, 0.22], [0.2, 0.3], [0.17, 0.37], [0.1, 0.4]], 26, { sz: 0.75, phi0: -1.3, phiLen: 2.6 }),
    cape: () => G3.grid(10, 12, (u, v) => { const a = (u - 0.5) * 2.2; return { p: [Math.sin(a) * (0.2 + v * 0.14), 0.38 - v * 1.15, -Math.cos(a) * (0.13 + v * 0.1) - v * 0.12], uv: [u, v] }; }),
    scarf: () => lathe([[0.075, 0.0], [0.09, 0.03], [0.09, 0.07], [0.075, 0.1]], 22, { sz: 0.9 }),
    collar: () => lathe([[0.075, 0.0], [0.095, 0.06], [0.11, 0.12]], 22, { sz: 0.85, phi0: 0.7, phiLen: PI * 2 - 1.4 })
  };
  const WEAP = {
    katana: () => merge([
      G3.xformGeo(G3.capsule([0, 0, 0], [0, 0.9, 0], 0.018, 0.006, 6, 0.3), M.compose([0, 0.06, 0], [0, 0, 0], 1)),
      capsule([0, -0.14, 0], [0, 0.04, 0], 0.022, 0.022, 8),
      G3.xformGeo(ellipsoid(0.06, 0.012, 0.05, 14, 6), M.compose([0, 0.05, 0], [0, 0, 0], 1))
    ]),
    staff: () => merge([capsule([0, -0.7, 0], [0, 0.7, 0], 0.022, 0.022, 8), G3.xformGeo(ellipsoid(0.07, 0.07, 0.07, 14, 10), M.compose([0, 0.78, 0], [0, 0, 0], 1))]),
    lance: () => merge([capsule([0, -0.6, 0], [0, 0.8, 0], 0.02, 0.02, 8), G3.xformGeo(capsule([0, 0, 0], [0, 0.26, 0], 0.045, 0.004, 6, 0.3), M.compose([0, 0.8, 0], [0, 0, 0], 1))])
  };

  /* ---------- assemblage du personnage ---------- */
  function build(R3, look, seed) {
    const B = body(look);
    const skin = { col: look.skin, shade: look.skinSh, rim: 0.4, rimC: look.rim, out: 0.012 };
    const main = { col: look.main, shade: shadeOf(look.main, 0.6), rim: 0.55, rimC: look.rim, out: 0.012 };
    const sec = { col: look.sec, shade: shadeOf(look.sec, 0.6), rim: 0.5, rimC: look.rim, out: 0.012 };
    const acc = { col: look.acc3, shade: shadeOf(look.acc3, 0.55), rim: 0.6, rimC: look.rim, out: 0.01, spec: 0.3 };
    const dark = { col: look.dark || [0.17, 0.15, 0.2], shade: [0.62, 0.58, 0.72], rim: 0.55, rimC: look.rim, out: 0.012 };
    const pants = { col: look.pants || look.dark || [0.2, 0.18, 0.24], shade: shadeOf(look.pants || [0.2, 0.18, 0.24], 0.6), rim: 0.5, rimC: look.rim, out: 0.012 };
    const metal = { col: look.metal || [0.55, 0.56, 0.62], shade: [0.45, 0.45, 0.55], rim: 0.7, rimC: look.rim, out: 0.012, spec: 0.8 };
    const J = {};
    const node = (name, parent, pos) => { const n = new Node(name); n.pos = pos || [0, 0, 0]; if (parent) parent.add(n); J[name] = n; return n; };
    const m = (n, g, mat) => { n.meshes.push(new Mesh(g, mat)); };
    const root = node('root', null);
    const hips = node('hips', root, [0, 0.95, 0]);
    const spine = node('spine', hips, [0, 0.06, 0]);
    const chest = node('chest', spine, [0, 0.0, 0]);
    const neck = node('neck', chest, [0, 0.39, 0.0]);
    const headN = node('head', neck, [0, 0.13, 0.01]);
    const hd = HEAD.build(R3, look, seed); hd.s = 0.112; hd.pos = [0, 0.1, 0.0]; headN.add(hd);
    const sw = look.body === 'f' ? 0.18 : 0.215; const shL = node('shL', chest, [sw, 0.33, -0.01]), shR = node('shR', chest, [-sw, 0.33, -0.01]);
    const elL = node('elL', shL, [0, -UA, 0]), elR = node('elR', shR, [0, -UA, 0]);
    const haL = node('haL', elL, [0, -FA, 0]), haR = node('haR', elR, [0, -FA, 0]);
    const thL = node('thL', hips, [0.095, -0.06, 0]), thR = node('thR', hips, [-0.095, -0.06, 0]);
    const knL = node('knL', thL, [0, -TH, 0]), knR = node('knR', thR, [0, -TH, 0]);
    const ftL = node('ftL', knL, [0, -SH, 0]), ftR = node('ftR', knR, [0, -SH, 0]);
    // corps de base
    m(hips, B.pelvis, look.outfit === 'gi' || look.outfit === 'armor' ? sec : dark);
    m(chest, B.torso, skin);
    m(neck, B.neck, skin);
    [shL, shR].forEach(n => m(n, B.uarm, look.sleeves === 'none' ? skin : main));
    [elL, elR].forEach(n => m(n, B.farm, look.sleeves === 'long' ? main : skin));
    [haL, haR].forEach(n => m(n, B.hand, look.gloves ? dark : skin));
    [thL, thR].forEach(n => m(n, look.outfit === 'gi' ? geo('pants', OUT.pants) : B.thigh, look.outfit === 'gi' ? sec : pants));
    [knL, knR].forEach(n => { m(n, B.shin, look.outfit === 'gi' ? sec : pants); m(n, geo('boot', OUT.boot), look.bootC ? { ...dark, col: look.bootC, shade: shadeOf(look.bootC) } : dark); });
    [ftL, ftR].forEach(n => m(n, B.foot, look.bootC ? { ...dark, col: look.bootC, shade: shadeOf(look.bootC) } : dark));
    // tenue
    const o = look.outfit;
    if (o === 'coat') {
      m(chest, geo('coatTop', OUT.coatTop), main); m(hips, geo('coatSkirt', OUT.coatSkirt), { ...main, twoSide: true });
      m(chest, geo('collar', OUT.collar), sec); m(hips, geo('belt', OUT.belt), acc);
      [elL, elR].forEach(n => m(n, geo('cuff', OUT.cuff), sec));
    } else if (o === 'gi') {
      m(chest, geo('giTop', OUT.giTop), main); m(hips, geo('belt', OUT.belt), acc);
      [elL, elR].forEach(n => m(n, geo('cuff', OUT.cuff), acc));
    } else if (o === 'armor') {
      m(chest, geo('giTop', OUT.giTop), main); m(chest, geo('plate', OUT.plate), metal); m(hips, geo('belt', OUT.belt), acc);
      [shL, shR].forEach((n, k) => { const p = node('pad' + k, n, [0, 0.01, 0]); m(p, geo('pad', OUT.pad), metal); });
      [elL, elR].forEach(n => m(n, geo('cuff', OUT.cuff), metal));
      m(hips, geo('coatSkirt', OUT.coatSkirt), { ...sec, twoSide: true });
    } else if (o === 'robe') {
      m(chest, geo('coatTop', OUT.coatTop), main); m(hips, geo('robeSkirt', OUT.robeSkirt), { ...main, twoSide: true });
      m(hips, geo('belt', OUT.belt), acc); m(chest, geo('collar', OUT.collar), sec);
      [elL, elR].forEach(n => m(n, geo('sleeveWide', OUT.sleeveWide), main));
    } else if (o === 'cloak') {
      m(chest, geo('giTop', OUT.giTop), main); m(hips, geo('belt', OUT.belt), acc);
      m(chest, geo('scarfN', () => G3.xformGeo(OUT.scarf(), M.compose([0, 0.36, 0], [0, 0, 0], 1))), sec);
      const cp = node('cape', chest, [0, 0, -0.02]); m(cp, geo('cape', OUT.cape), { ...sec, twoSide: true });
      [elL, elR].forEach(n => m(n, geo('cuff', OUT.cuff), sec));
    }
    if (look.cape && o !== 'cloak') { const cp = node('cape', chest, [0, 0, -0.03]); m(cp, geo('cape', OUT.cape), { ...acc, twoSide: true, out: 0 }); }
    // arme
    if (look.weapon && WEAP[look.weapon]) {
      const w = node('weapon', haR, [0, -0.02, 0.0]);
      w.rot = [PI / 2, 0, 0];
      m(w, geo('w' + look.weapon, WEAP[look.weapon]), look.weapon === 'katana' ? { ...metal, col: [0.85, 0.87, 0.92] } : { ...acc, col: look.acc3 });
    }
    const ch = { root, J, look, pose: null };
    setPose(ch, POSES.idle);
    return ch;
  }

  /* ---------- poses (degrés) ---------- */
  // champs : y (décalage du bassin), hips, spine, chest, neck, head, shL, elL, shR, elR, thL, knL, thR, knR, ftL, ftR, w (arme)
  const Z = [0, 0, 0];
  const P = (o) => Object.assign({ y: 0, hips: Z, spine: Z, chest: Z, neck: Z, head: Z, shL: [0, 0, 8], elL: [-10, 0, 0], shR: [0, 0, -8], elR: [-10, 0, 0], thL: [0, 0, 3], knL: [5, 0, 0], thR: [0, 0, -3], knR: [5, 0, 0], ftL: Z, ftR: Z, w: [90, 0, 0] }, o);
  const POSES = {
    stand: P({}),
    idle: P({ y: -0.05, hips: [0, -20, 0], spine: [6, 8, 0], chest: [4, 10, 0], neck: [-4, 2, 0], head: [-4, 0, 0],
      shL: [-38, 0, 22], elL: [-92, 0, 0], shR: [-28, 0, -26], elR: [-108, 0, 0],
      thL: [-24, 0, 8], knL: [28, 0, 0], ftL: [-4, 0, 0], thR: [14, 0, -10], knR: [22, 0, 0], ftR: [-8, 0, 0], w: [70, 0, 0] }),
    run: P({ y: -0.04, spine: [18, 0, 0], chest: [6, 0, 0], head: [-14, 0, 0], shL: [-10, 0, 14], elL: [-70, 0, 0], shR: [-10, 0, -14], elR: [-70, 0, 0], thL: [-10, 0, 4], knL: [30, 0, 0], thR: [-10, 0, -4], knR: [30, 0, 0], w: [40, 0, 0] }),
    dash: P({ y: -0.08, spine: [32, 0, 0], chest: [10, 0, 0], head: [-26, 0, 0], shL: [30, 0, 24], elL: [-20, 0, 0], shR: [34, 0, -24], elR: [-20, 0, 0], thL: [-50, 0, 6], knL: [70, 0, 0], thR: [20, 0, -6], knR: [40, 0, 0], w: [-30, 0, 0] }),
    jabW: P({ y: -0.06, hips: [0, -30, 0], spine: [8, 10, 0], chest: [4, 14, 0], head: [-6, 0, 0], shL: [-40, 0, 20], elL: [-120, 0, 0], shR: [-20, 0, -30], elR: [-115, 0, 0], thL: [-26, 0, 8], knL: [30, 0, 0], thR: [16, 0, -10], knR: [24, 0, 0], w: [70, 0, 0] }),
    jab: P({ y: -0.07, hips: [0, -10, 0], spine: [12, -18, 0], chest: [6, -20, 0], neck: [0, 20, 0], head: [-6, 18, 0], shL: [-90, 0, 4], elL: [-6, 0, 0], shR: [-30, 0, -28], elR: [-110, 0, 0], thL: [-34, 0, 8], knL: [30, 0, 0], thR: [18, 0, -10], knR: [20, 0, 0], w: [70, 0, 0] }),
    crossW: P({ y: -0.06, hips: [0, -34, 0], spine: [8, -16, 0], chest: [4, -20, 0], head: [-6, 26, 0], shL: [-50, 0, 24], elL: [-110, 0, 0], shR: [10, 0, -40], elR: [-100, 0, 0], thL: [-26, 0, 8], knL: [30, 0, 0], thR: [16, 0, -10], knR: [24, 0, 0], w: [120, 0, 0] }),
    cross: P({ y: -0.08, hips: [0, 24, 0], spine: [14, 22, 0], chest: [6, 24, 0], neck: [0, -20, 0], head: [-6, -20, 0], shL: [-30, 0, 30], elL: [-115, 0, 0], shR: [-92, 0, -2], elR: [-4, 0, 0], thL: [-36, 0, 8], knL: [32, 0, 0], thR: [26, 0, -8], knR: [10, 0, 0], ftR: [20, 0, 0], w: [10, 0, 0] }),
    kickW: P({ y: -0.02, hips: [0, 30, 0], spine: [-6, 20, 10], chest: [0, 10, 0], head: [-4, -24, 0], shL: [-30, 0, 46], elL: [-80, 0, 0], shR: [-10, 0, -50], elR: [-80, 0, 0], thL: [-10, 0, 6], knL: [14, 0, 0], thR: [-60, 0, -30], knR: [100, 0, 0], w: [60, 0, 0] }),
    kick: P({ y: 0.0, hips: [0, 40, 0], spine: [-14, 30, 16], chest: [-4, 10, 0], head: [-4, -30, 0], shL: [10, 0, 60], elL: [-40, 0, 0], shR: [20, 0, -60], elR: [-40, 0, 0], thL: [-4, 0, 4], knL: [10, 0, 0], thR: [-96, 0, -24], knR: [6, 0, 0], ftR: [30, 0, 0], w: [40, 0, 0] }),
    blastW: P({ y: -0.08, hips: [0, -30, 0], spine: [4, -10, 0], chest: [0, -20, 0], head: [-6, 30, 0], shL: [10, 0, 20], elL: [-100, 0, 0], shR: [20, 0, -20], elR: [-100, 0, 0], thL: [-30, 0, 10], knL: [34, 0, 0], thR: [20, 0, -10], knR: [24, 0, 0] }),
    blast: P({ y: -0.08, hips: [0, -6, 0], spine: [10, 0, 0], chest: [2, 0, 0], head: [-8, 0, 0], shL: [-88, 0, -6], elL: [-4, 0, 0], shR: [-88, 0, 6], elR: [-4, 0, 0], thL: [-34, 0, 10], knL: [30, 0, 0], thR: [22, 0, -10], knR: [20, 0, 0] }),
    charge: P({ y: -0.14, hips: [0, -20, 0], spine: [16, -10, 0], chest: [6, -10, 0], head: [-14, 20, 0], shL: [30, 0, 30], elL: [-90, 0, 0], shR: [36, 0, -20], elR: [-100, 0, 0], thL: [-40, 0, 14], knL: [50, 0, 0], thR: [30, 0, -14], knR: [40, 0, 0] }),
    cast: P({ y: -0.04, spine: [-4, 0, 0], head: [-14, 0, 0], shL: [-170, 0, 10], elL: [-10, 0, 0], shR: [-170, 0, -10], elR: [-10, 0, 0], thL: [-18, 0, 8], knL: [16, 0, 0], thR: [12, 0, -8], knR: [12, 0, 0], w: [180, 0, 0] }),
    slashW: P({ y: -0.04, hips: [0, -30, 0], spine: [-4, -16, 0], chest: [-4, -20, 0], head: [-6, 30, 0], shL: [-30, 0, 30], elL: [-80, 0, 0], shR: [-150, 0, -40], elR: [-40, 0, 0], thL: [-26, 0, 8], knL: [24, 0, 0], thR: [16, 0, -10], knR: [20, 0, 0], w: [200, 0, 0] }),
    slash: P({ y: -0.1, hips: [0, 26, 0], spine: [22, 20, 0], chest: [8, 20, 0], head: [-10, -26, 0], shL: [-10, 0, 40], elL: [-60, 0, 0], shR: [-60, 0, 30], elR: [-10, 0, 0], thL: [-44, 0, 8], knL: [40, 0, 0], thR: [30, 0, -10], knR: [14, 0, 0], w: [10, 0, 0] }),
    guard: P({ y: -0.08, spine: [8, 0, 0], head: [6, 0, 0], shL: [-70, 0, -20], elL: [-110, 0, 0], shR: [-70, 0, 20], elR: [-110, 0, 0], thL: [-20, 0, 10], knL: [26, 0, 0], thR: [18, 0, -10], knR: [24, 0, 0], w: [160, 0, 0] }),
    hit: P({ y: -0.04, spine: [-22, 10, 0], chest: [-10, 0, 0], head: [18, -10, 0], shL: [30, 0, 30], elL: [-40, 0, 0], shR: [24, 0, -36], elR: [-30, 0, 0], thL: [-10, 0, 8], knL: [20, 0, 0], thR: [24, 0, -8], knR: [10, 0, 0] }),
    down: P({ y: -0.85, hips: [-82, 0, 0], spine: [-6, 0, 0], head: [10, 20, 0], shL: [-150, 0, 30], elL: [-20, 0, 0], shR: [-150, 0, -30], elR: [-20, 0, 0], thL: [-14, 0, 10], knL: [20, 0, 0], thR: [-6, 0, -10], knR: [30, 0, 0] }),
    rise: P({ y: -0.4, spine: [40, 0, 0], head: [-20, 0, 0], shL: [-20, 0, 30], elL: [-40, 0, 0], shR: [-20, 0, -30], elR: [-40, 0, 0], thL: [-90, 0, 10], knL: [120, 0, 0], thR: [-20, 0, -10], knR: [100, 0, 0] }),
    win: P({ y: 0, spine: [-4, 0, 0], head: [-10, -10, 0], shL: [0, 0, 10], elL: [-20, 0, 0], shR: [-170, 0, -6], elR: [-20, 0, 0], thL: [-6, 0, 6], knL: [4, 0, 0], thR: [4, 0, -6], knR: [4, 0, 0], w: [180, 0, 0] }),
    hover: P({ y: 0.1, spine: [10, 0, 0], head: [-10, 0, 0], shL: [10, 0, 20], elL: [-30, 0, 0], shR: [10, 0, -20], elR: [-30, 0, 0], thL: [-20, 0, 6], knL: [50, 0, 0], thR: [-6, 0, -6], knR: [70, 0, 0] })
  };
  const KEYS = ['hips', 'spine', 'chest', 'neck', 'head', 'shL', 'elL', 'shR', 'elR', 'thL', 'knL', 'thR', 'knR', 'ftL', 'ftR'];
  function blend(a, b, t) {
    const o = { y: a.y + (b.y - a.y) * t, w: mix(a.w, b.w, t) };
    KEYS.forEach(k => { o[k] = mix(a[k], b[k], t); });
    return o;
  }
  function setPose(ch, p) {
    ch.pose = p;
    const J = ch.J;
    J.hips.pos[1] = 0.95 + p.y;
    KEYS.forEach(k => { const n = J[k]; if (n) n.rot = [p[k][0] * D, p[k][1] * D, p[k][2] * D]; });
    if (J.weapon) J.weapon.rot = [p.w[0] * D, p.w[1] * D, p.w[2] * D];
  }
  // course : cycle procédural
  function runPose(ph, dir) {
    const p = blend(POSES.run, POSES.run, 0), s = Math.sin(ph), c = Math.cos(ph);
    p.thL = [-10 - 42 * s * dir, 0, 4]; p.knL = [30 + 40 * Math.max(0, c), 0, 0];
    p.thR = [-10 + 42 * s * dir, 0, -4]; p.knR = [30 + 40 * Math.max(0, -c), 0, 0];
    p.shL = [-10 + 36 * s * dir, 0, 14]; p.shR = [-10 - 36 * s * dir, 0, -14];
    p.y = -0.04 + Math.abs(c) * 0.03; p.spine = [18 * dir, 0, 0];
    return p;
  }
  function idlePose(t) {
    const p = blend(POSES.idle, POSES.idle, 0), b = Math.sin(t * 2.2);
    p.y += b * 0.008; p.spine = [p.spine[0] + b * 1.5, p.spine[1], 0]; p.shL = [p.shL[0] + b * 3, 0, p.shL[2]]; p.shR = [p.shR[0] - b * 3, 0, p.shR[2]];
    return p;
  }
  // points du monde utiles (mains, tête, pieds)
  function wp(ch, j, local) { return ch.J[j].wpos(local); }
  return { build, POSES, blend, setPose, runPose, idlePose, wp };
})();

;

/* ---------- heroes.js (jeu) ---------- */
/* 52 héros : [id, nom, titre, élément, rôle, rareté, corps, coiffure, cheveux, accessoire, peau, arme, techniques, ultime, type d'ultime, quête, fin] */
const HEROES_RAW = [["taro","Taro","Poing de braise","feu","att",0,"m","spiky","#e8452c","band",1,null,["Poing de braise:rush","Salve ardente:volley","Éruption:nova"],"Coup de braise","ubeam","Cherche le dojo où son père a appris à se battre.","Le dojo était en ruines. Taro l'a reconstruit, pierre par pierre."],
["mina","Mina","Flamme douce","feu","soin",0,"f","bob","#ff8a5c","flower",0,null,["Flamme apaisante:heal","Étincelles douces:volley","Voile de chaleur:barrier"],"Chaleur du foyer","uheal","Cherche une fleur qui ne pousse que dans la lave.","Elle l'a trouvée au bord d'un volcan et la cultive pour soigner son village."],
["gorou","Gorou","Mur de cendres","feu","def",0,"m","short","#5a2a22","scar",2,null,["Rempart de cendres:barrier","Charge du rempart:rush","Séisme de braise:quake"],"Rempart brûlant","unova","Cherche de quoi réparer l'armure de son maître.","Il a forgé une armure neuve avec le métal de l'ancienne."],
["pyra","Pyra","Étincelle","feu","sab",0,"f","ponytail","#ffb03a",null,0,null,["Piège de cendres:trap","Vol d'étincelle:drain","Pluie de flammèches:volley"],"Pluie de cendres","umeteor","Cherche qui a volé sa lanterne magique.","C'était un renard. Ils sont devenus inséparables."],
["akio","Akio","Lame ardente","feu","att",1,"m","ponytail","#2a1a1a","band",1,"katana",["Taille incandescente:rush","Croissant de braise:quake","Garde des cendres:counter"],"Taille incandescente","ubarrage","Cherche le forgeron qui a brisé sa première lame.","Le forgeron était son grand-père. Il lui a appris à forger la sienne."],
["rin","Rin","Renarde rouge","feu","sab",1,"f","buns","#ff6b3d","ears",0,null,["Feu follet:blink","Queue de feu:trap","Brasier rusé:volley"],"Vol de flamme","umeteor","Cherche à reprendre le titre qu'on lui a volé en tournoi.","Elle l'a repris en revanche, devant toute l'arène."],
["bram","Bram","Bouclier volcan","feu","def",1,"m","short","#3b2a20","horns",3,null,["Carapace de magma:barrier","Coulée de lave:quake","Riposte volcanique:counter"],"Carapace de magma","unova","Cherche à protéger la montagne où il est né.","La montagne s'est réveillée. Elle le reconnaît comme son gardien."],
["kaen","Kaen","Dragon écarlate","feu","att",2,"m","spiky","#d42b2b","horns",1,null,["Griffe du dragon:rush","Souffle écarlate:beam","Chute du dragon:meteor"],"Souffle du dragon","ubeam","Cherche le dernier œuf de dragon de son clan.","L'œuf a éclos dans ses mains. Le petit dragon le suit partout."],
["seika","Seïka","Phénix","feu","soin",2,"f","long","#ffb347","flower",0,"staff",["Plume de vie:heal","Ailes de feu:volley","Renouveau:barrier"],"Renaissance","uheal","Cherche une raison de se relever après chaque défaite.","Elle a compris : ce sont les autres qu'elle relève qui la font renaître."],
["ignar","Ignar","Roi des cendres","feu","att",3,"m","spiky","#1d1214","crown",2,null,["Sceptre de cendres:blink","Rayon royal:beam","Couronne de flammes:nova"],"Couronne infernale","ubarrage","Cherche le trône de feu volé à sa famille.","Il l'a retrouvé, puis l'a laissé vide. Il préfère se battre aux côtés des siens."],
["mio","Mio","Goutte claire","eau","soin",0,"f","bob","#7ec8ff",null,0,null,["Rosée:heal","Gouttes vives:volley","Bulle protectrice:barrier"],"Pluie fine","uheal","Cherche la source qui alimente toutes les rivières.","La source était sous sa propre maison depuis toujours."],
["kai","Kai","Vague","eau","att",0,"m","spiky","#1f6fd1",null,1,"katana",["Vague fendante:rush","Jet de marée:beam","Tourbillon:nova"],"Déferlante","ubeam","Cherche la vague parfaite pour prouver sa force.","Il l'a surfée une seule fois. Personne ne l'a cru, sauf sa sœur."],
["shio","Shio","Récif","eau","def",0,"m","short","#2bb3a3","glasses",2,null,["Mur de corail:barrier","Ressac:quake","Contre-courant:counter"],"Barrière de corail","unova","Cherche à reconstruire le récif détruit par une tempête.","Le récif repousse. Les poissons sont revenus en premier."],
["nori","Nori","Brume","eau","sab",0,"m","hood","#3d4b6b","mask",1,null,["Brume glacée:trap","Pas de brume:blink","Grêle:volley"],"Brouillard glacé","umeteor","Cherche son ombre, disparue dans le brouillard.","Son ombre l'attendait de l'autre côté du lac."],
["aiko","Aïko","Source vive","eau","soin",1,"f","ponytail","#5fb8ff","flower",0,"staff",["Source claire:heal","Pluie de lumière:volley","Bouclier d'onde:barrier"],"Élan de la source","uheal","Cherche à guérir la rivière empoisonnée de sa ville.","La rivière coule claire. Les enfants s'y baignent à nouveau."],
["kiri","Kiri","Marée noire","eau","sab",1,"m","long","#0c2a4a","scar",1,null,["Filet des marées:trap","Morsure du ressac:drain","Orage marin:meteor"],"Ressac","umeteor","Cherche le navire pirate qui a coulé son port.","Le navire s'était échoué. Kiri a sauvé l'équipage, qui reconstruit le port avec lui."],
["isao","Isao","Harpon","eau","att",1,"m","short","#1a3f66","band",2,"lance",["Harpon:rush","Lance d'écume:beam","Plongeon:meteor"],"Lancer des abysses","ubarrage","Cherche le monstre marin qui a mordu son bateau.","Le monstre était blessé. Isao lui a retiré un hameçon géant."],
["ondine","Ondine","Gardienne des abysses","eau","def",2,"f","long","#9fe3ff",null,0,null,["Dôme des abysses:barrier","Pression des fonds:quake","Reflet:counter"],"Dôme des profondeurs","unova","Cherche la perle qui garde la mer calme.","La perle, c'était elle. Tant qu'elle veille, la mer dort."],
["suiren","Suïren","Lotus gelé","eau","sab",2,"f","buns","#d6f1ff","flower",0,null,["Lotus de givre:trap","Pétales gelés:volley","Floraison:nova"],"Floraison de givre","umeteor","Cherche à dégeler son lac natal, figé depuis cent ans.","Le lac a fondu au printemps. Son village s'est réveillé avec lui."],
["mizuha","Mizuha","Reine des marées","eau","soin",3,"f","long","#2f7fe0","crown",1,"staff",["Marée haute:heal","Vague royale:beam","Égide des flots:barrier"],"Grande marée","uheal","Cherche sa sœur jumelle, emportée par la marée.","Sa sœur règne sur l'océan d'en face. Elles s'écrivent par les vagues."],
["rai","Raï","Éclair","foudre","att",0,"m","spiky","#ffe14d",null,1,null,["Éclair fulgurant:blink","Décharge:volley","Coup de tonnerre:nova"],"Décharge","ubeam","Cherche à courir plus vite que la foudre.","Il a perdu la course, mais il a gagné un rival : l'éclair lui-même."],
["volt","Volt","Court-circuit","foudre","sab",0,"m","short","#f2c200","glasses",0,null,["Champ statique:trap","Court-circuit:drain","Arc électrique:volley"],"Surtension","umeteor","Cherche la pièce qui manque à son robot.","Il l'a trouvée dans une vieille décharge. Son robot parle enfin."],
["ohm","Ohm","Paratonnerre","foudre","def",0,"m","short","#6b5a2a","band",2,null,["Paratonnerre:barrier","Charge électrique:rush","Riposte statique:counter"],"Champ isolant","unova","Cherche à protéger sa tour pendant la grande tempête.","La tour a tenu. Il a dormi trois jours d'affilée."],
["lumi","Lumi","Étincelle de vie","foudre","soin",0,"f","buns","#fff27a",null,0,null,["Étincelle de vie:heal","Lucioles:volley","Halo:barrier"],"Recharge","uheal","Cherche la lumière qui manque à sa ville la nuit.","Elle a appris aux habitants à allumer les lanternes ensemble."],
["jinto","Jinto","Tonnerre","foudre","att",1,"m","spiky","#c9a400","scar",1,"lance",["Frappe du tonnerre:rush","Lance de foudre:beam","Orage:meteor"],"Frappe du tonnerre","ubarrage","Cherche le maître qui fait gronder sa montagne.","Le maître, c'était le ciel. Jinto a appris à l'écouter."],
["hikari","Hikari","Aurore","foudre","soin",1,"f","bob","#ffe9a8","flower",0,"staff",["Aube:heal","Rayons:beam","Couronne de lumière:barrier"],"Aube électrique","uheal","Cherche à voir l'aurore depuis le plus haut sommet.","Elle l'a vue. Elle dit qu'elle a la couleur des amis."],
["neko","Neko","Chat d'orage","foudre","sab",1,"m","ponytail","#3a3a3a","ears",1,null,["Griffes statiques:drain","Bond félin:blink","Tempête de griffes:volley"],"Griffe statique","umeteor","Cherche ses neuf vies, perdues une à une.","Il en a retrouvé une : celle qu'il vit avec son équipe."],
["raijo","Raijo","Lance foudre","foudre","att",2,"m","long","#ffd000","band",2,"lance",["Javelot céleste:rush","Percée:beam","Foudre divine:meteor"],"Javelot céleste","ubeam","Cherche la lance tombée du ciel la nuit de sa naissance.","La lance l'a choisie. Elle ne pèse rien entre ses mains."],
["tetsu","Tetsu","Armure tonnerre","foudre","def",2,"m","short","#2e2e3a","horns",3,null,["Armure chargée:barrier","Coup de bouclier:rush","Tonnerre de fer:nova"],"Armure chargée","unova","Cherche l'armure légendaire de son clan.","L'armure était rouillée. Il l'a rechargée d'éclairs."],
["raimei","Raimei","Seigneur des orages","foudre","sab",3,"m","spiky","#fff5b0","crown",1,null,["Cage d'éclairs:trap","Foudre noire:beam","Jugement:meteor"],"Jugement des orages","umeteor","Cherche l'orage qui a effacé sa mémoire.","Il s'est souvenu de tout. Il a choisi de ne garder que le meilleur."],
["iwa","Iwa","Roc","terre","def",0,"m","short","#6b4a2b",null,2,null,["Peau de pierre:barrier","Coup de roc:rush","Éboulement:quake"],"Peau de pierre","unova","Cherche le rocher qu'aucun géant n'a pu soulever.","Il ne l'a pas soulevé. Il s'est assis dessus, et le rocher a souri."],
["daichi","Daichi","Poing de pierre","terre","att",0,"m","spiky","#3d6b2b","band",1,null,["Poing de pierre:rush","Fissure:quake","Météore de roche:meteor"],"Écrasement","ubarrage","Cherche à devenir assez fort pour fendre une montagne.","Il a fendu un caillou. C'est un début, dit son maître."],
["mousse","Mousse","Pousse verte","terre","soin",0,"f","buns","#8ed16b","flower",0,null,["Bourgeon:heal","Graines:volley","Racines:trap"],"Bourgeon","uheal","Cherche la graine du tout premier arbre.","Elle l'a plantée. Dans mille ans, il fera de l'ombre à tout le monde."],
["grav","Grav","Sable mouvant","terre","sab",0,"m","hood","#c9a46b","mask",2,null,["Sable mouvant:trap","Tourbillon de sable:blink","Ensablement:volley"],"Enlisement","umeteor","Cherche une oasis disparue des cartes.","L'oasis se déplaçait. Il voyage avec elle maintenant."],
["bodo","Bodo","Colosse","terre","def",1,"m","short","#4a3a2a","scar",3,null,["Muraille:barrier","Charge du colosse:rush","Contre de pierre:counter"],"Muraille vivante","unova","Cherche à repasser la porte de son ancienne maison.","Il a agrandi la porte. Sa mère a rigolé pendant une heure."],
["koji","Kôji","Séisme","terre","att",1,"m","spiky","#5a7a2a","horns",1,null,["Séisme:quake","Pic rocheux:rush","Écrasement:meteor"],"Faille sismique","ubeam","Cherche l'origine des tremblements sous son village.","Un géant dormait dessous. Kôji lui chante une berceuse chaque soir."],
["hana","Hana","Fleur de roche","terre","soin",1,"f","ponytail","#e48bb0","flower",1,null,["Jardin de pierre:heal","Pétales:volley","Ronces:trap"],"Jardin de pierre","uheal","Cherche à faire fleurir le désert.","Une fleur a poussé. Puis cent. Le désert porte maintenant son nom."],
["takeru","Takeru","Faille","terre","sab",2,"m","long","#2b2b1f","scar",2,null,["Faille:quake","Effondrement:drain","Prison de roc:trap"],"Effondrement","umeteor","Cherche le passage secret sous les montagnes.","Le passage menait chez un ami qu'il croyait perdu."],
["kenga","Kenga","Croc de jade","terre","att",2,"m","spiky","#2fa86b","horns",1,null,["Croc vif:blink","Morsure de jade:rush","Hurlement:nova"],"Morsure de jade","ubarrage","Cherche le loup de jade qui l'a élevé.","Le loup l'attendait. Il a vieilli, et Kenga veille sur lui."],
["tsuchi","Tsuchi","Mont éternel","terre","def",3,"m","short","#e8e2d0","crown",3,null,["Montagne sacrée:barrier","Pas du titan:quake","Rempart éternel:counter"],"Montagne sacrée","unova","Cherche à protéger la terre pour mille ans encore.","Il a appris à transmettre. Ses élèves veilleront après lui."],
["kuro","Kuro","Ombre","ombre","sab",0,"m","hood","#1b1730","mask",1,null,["Prise d'ombre:trap","Pas d'ombre:blink","Lames d'ombre:volley"],"Prise d'ombre","umeteor","Cherche à sortir de l'ombre de son grand frère.","Son frère était fier de lui depuis le début. Il ne l'avait jamais dit."],
["yoru","Yoru","Nuit","ombre","att",0,"m","long","#2a2448",null,0,"katana",["Lame nocturne:rush","Croissant de nuit:beam","Nuit noire:nova"],"Lame nocturne","ubeam","Cherche une étoile qui ne s'éteint jamais.","Elle l'a trouvée dans les yeux de sa petite sœur."],
["shin","Shin","Voile noir","ombre","def",0,"m","bob","#3a2f5a","glasses",1,null,["Voile protecteur:barrier","Ombre portée:quake","Miroir noir:counter"],"Voile protecteur","unova","Cherche son vrai nom, oublié dans un rêve.","Son nom était écrit sous son lit, de sa propre main d'enfant."],
["luna","Luna","Lune pâle","ombre","soin",0,"f","long","#e6e0ff","flower",0,"staff",["Clair de lune:heal","Éclats lunaires:volley","Halo pâle:barrier"],"Clair de lune","uheal","Cherche à toucher la lune.","Elle a touché son reflet dans un lac. Elle dit que ça compte."],
["ren","Ren","Lame silencieuse","ombre","att",1,"m","hood","#141020","mask",2,"katana",["Disparition:blink","Coup silencieux:rush","Mille lames:volley"],"Coup silencieux","ubarrage","Cherche à rester invisible pour toujours.","Il a choisi d'être vu par ceux qui comptent."],
["mayu","Mayu","Cauchemar","ombre","sab",1,"f","buns","#7a3fbf","horns",0,null,["Mauvais rêve:trap","Dévoreur de rêves:drain","Cauchemar:nova"],"Mauvais rêve","umeteor","Cherche à faire un beau rêve, rien qu'une nuit.","Elle a rêvé d'un banquet avec toute son équipe. Elle s'est réveillée en souriant."],
["ayame","Ayame","Chuchoteuse","ombre","soin",1,"f","ponytail","#5b3d8a","flower",1,"staff",["Murmure apaisant:heal","Chuchotements:volley","Voile de nuit:barrier"],"Murmure apaisant","uheal","Cherche à comprendre ce que murmurent les ombres.","Les ombres disaient merci. Personne ne les avait jamais écoutées."],
["kurai","Kurai","Faucheur","ombre","att",2,"m","hood","#0f0c18","horns",2,"lance",["Moisson d'ombre:drain","Faux spectrale:rush","Âmes errantes:volley"],"Moisson d'ombre","ubeam","Cherche à libérer les lucioles prisonnières de sa faux.","Les lucioles volent autour de lui. Elles ne le quittent plus."],
["shiki","Shiki","Marionnettiste","ombre","sab",2,"f","long","#c9c0e8","glasses",0,null,["Fils du destin:trap","Marionnette:blink","Ballet macabre:volley"],"Fils du destin","umeteor","Cherche à couper les fils qui la contrôlent.","Elle les a coupés. Maintenant, c'est elle qui choisit ses pas."],
["kokuyo","Kokuyô","Empereur d'obsidienne","ombre","att",3,"m","spiky","#0b0a12","crown",2,null,["Lance d'obsidienne:blink","Éclipse:beam","Trône noir:meteor"],"Éclipse d'obsidienne","ubarrage","Cherche à chasser l'éclipse qui dure depuis son enfance.","Le soleil est revenu. Il a pleuré, et personne ne s'est moqué."],
["seren","Seren","L'Étoile perdue","prisme","att",4,"f","long","#ffffff","halo",0,"staff",["Étoile filante:blink","Constellation:volley","Lumière céleste:nova"],"Pluie d'étoiles","ubeam","Cherche les cinq éléments pour rallumer son étoile.","Les cinq éléments étaient ses amis. Son étoile brille au-dessus de l'arène."],
["kairo","Kairo","Gardien du temps","prisme","sab",4,"m","short","#9be7ff","halo",1,null,["Arrêt du temps:trap","Écho temporel:blink","Faille du temps:beam"],"Arrêt du temps","umeteor","Cherche la seconde où tout a basculé.","Il l'a trouvée et ne l'a pas changée. Sans elle, il n'aurait pas rencontré les siens."]];

;

/* ---------- heroes16.js (jeu) ---------- */
/* v16 : 47 nouveaux héros (total 99). Même format que heroes.js. Ajoutés à la fin : les 52 premiers gardent leur numéro. */
const HEROES_BASE_N = HEROES_RAW.length;
HEROES_RAW.push(
// ---- FEU ----
["zarok","Zarok","Seigneur des brasiers","feu","att",3,"m","short","#ff7a1a",null,2,null,["Poing de l'éfrit:rush","Colonne de feu:beam","Tempête de braises:meteor"],"Mille soleils","ubarrage","Cherche la lampe où on l'a enfermé mille ans.","Il l'a brisée. Plus personne n'y sera jamais enfermé."],
["leo","Léo","Crinière solaire","feu","att",2,"m","spiky","#ffb020",null,1,null,["Griffe solaire:rush","Rugissement:nova","Bond du lion:meteor"],"Rugissement du zénith","ubeam","Cherche sa meute, dispersée par la sécheresse.","La meute est revenue avec la pluie. Il marche en tête."],
["brazo","Brazo","Cœur de lave","feu","def",2,"m","short","#2a1612",null,3,null,["Croûte de basalte:barrier","Coulée ardente:quake","Retour de flamme:counter"],"Éruption","unova","Cherche le volcan d'où il est sorti.","Le volcan dort. Brazo veille dessus, comme sur un parent."],
["magda","Magda","La Fournaise","feu","def",1,"f","buns","#c4521c",null,2,null,["Porte du four:barrier","Coup de piston:rush","Jet de vapeur:counter"],"Haut-fourneau","unova","Cherche du charbon qui ne s'éteint jamais.","Elle en a trouvé au fond d'une mine. Elle le partage avec le village."],
["cendre","Cendre","Lanterne errante","feu","sab",1,"m","short","#ffcf7a",null,0,null,["Lueur trompeuse:trap","Langue de feu:drain","Feux follets:volley"],"Nuit des lanternes","umeteor","Cherche la fête où on l'a oubliée, allumée.","Il a trouvé mieux : des amis qui ne l'éteignent jamais."],
["pompa","Pompa","Gardien des champs","feu","sab",1,"m","short","#d9a441",null,1,null,["Botte de paille:trap","Nuée de corbeaux:volley","Pas de l'épouvantail:blink"],"Moisson ardente","umeteor","Cherche le champ qu'il devait garder.","Le champ a brûlé, puis refleuri. Il le garde toujours."],
["fumi","Fumi","Petite flamme","feu","soin",0,"f","bob","#ffd98a",null,0,null,["Chaleur douce:heal","Étincelles:volley","Cire protectrice:barrier"],"Veillée","uheal","Cherche quelqu'un à éclairer.","Elle éclaire maintenant toute une équipe."],
["tika","Tika","Voix du volcan","feu","soin",0,"m","spiky","#3a1c14",null,2,null,["Chant du cratère:heal","Fumée tiède:barrier","Pierres chaudes:volley"],"Danse du volcan","uheal","Cherche le chant que le volcan a perdu.","Le volcan chantait faux. Tika lui a appris la mesure."],
// ---- EAU ----
["abyssa","Abyssa","Lueur des abysses","eau","sab",3,"f","long","#101a3a",null,1,null,["Leurre:trap","Morsure des fonds:drain","Pression noire:meteor"],"Gueule de l'abîme","umeteor","Cherche ce qui brille au fond de la fosse.","C'était sa propre lumière, reflétée. Elle n'a plus peur du noir."],
["borg","Borg","Roi des neiges","eau","def",2,"m","short","#eef6ff",null,0,null,["Mur de neige:barrier","Avalanche:quake","Étreinte glacée:counter"],"Blizzard","unova","Cherche le sommet où il ne neige plus.","Il y a planté son camp, et la neige est revenue."],
["frimas","Frimas","Lame de givre","eau","att",2,"m","short","#bfe8ff",null,0,"katana",["Entaille gelée:rush","Rayon polaire:beam","Chute de stalactites:meteor"],"Hiver éternel","ubarrage","Cherche l'armure qui ne fond pas.","Il la portait déjà. Elle était faite de son propre froid."],
["koa","Koa","Saut d'étang","eau","sab",1,"m","short","#3fbf5f",null,1,null,["Langue éclair:drain","Bond du nénuphar:blink","Pluie de têtards:volley"],"Mousson","umeteor","Cherche l'étang le plus calme du monde.","Il l'a trouvé. Il y fait des ricochets tous les soirs."],
["karka","Karka","Pinces de marée","eau","att",1,"m","short","#e0562c",null,2,null,["Pince broyeuse:rush","Marche de côté:quake","Jet d'écume:beam"],"Grande pince","ubarrage","Cherche une carapace à sa taille.","Trop grand pour toutes. Il s'en est forgé une."],
["narval","Narval","Corne des glaces","eau","soin",1,"m","long","#9fc4d8",null,0,"lance",["Chant du large:heal","Percée de corne:beam","Banquise:barrier"],"Aurore polaire","uheal","Cherche la banquise où est née sa mère.","Elle a fondu. Il en protège une autre, plus au nord."],
["pingo","Pingo","Petit empereur","eau","def",0,"m","short","#1a2230",null,0,null,["Glissade:rush","Mur de glace:barrier","Coup de bec:counter"],"Parade de la colonie","unova","Cherche son œuf, roulé au bas de la falaise.","L'œuf a éclos en bas. Le poussin l'attendait."],
["axo","Axo","Sourire des sources","eau","soin",0,"f","bob","#ffb6c9",null,0,null,["Repousse:heal","Bulles roses:volley","Écume douce:barrier"],"Source de jouvence","uheal","Cherche pourquoi elle guérit si vite.","Peu importe : elle guérit les autres aussi vite."],
// ---- FOUDRE ----
["ryujin","Ryûjin","Dragon des nuées","foudre","sab",3,"m","long","#2f6fd0",null,1,null,["Souffle statique:trap","Vol d'orage:drain","Pluie d'éclairs:meteor"],"Colère du ciel","umeteor","Cherche la perle qui commande à la pluie.","Il l'a rendue à la mer. La pluie tombe quand elle veut."],
["tesla","Tesla","Sabre chargé","foudre","att",2,"m","short","#c8d2e0",null,0,"katana",["Coupe ionique:rush","Arc tranchant:beam","Surcharge:nova"],"Mille volts","ubarrage","Cherche qui l'a construit.","Personne ne sait. Il a choisi lui-même à qui obéir : à personne."],
["stratos","Stratos","Œil du cyclone","foudre","def",2,"m","short","#e8ecf4",null,1,null,["Mur de nuages:barrier","Pas du titan:quake","Regard foudroyant:counter"],"Œil de la tempête","unova","Cherche un ciel assez grand pour lui.","Il s'est assis sur la plus haute montagne. Ça ira."],
["zephyr","Zéphyr","Souffle des cimes","foudre","soin",1,"m","ponytail","#f4f7ff",null,1,null,["Brise:heal","Nuage porteur:barrier","Grêlons:volley"],"Vent du renouveau","uheal","Cherche la lampe de son cousin Zarok.","Trop tard, elle était cassée. Tant mieux."],
["magno","Magno","Pôle nord","foudre","def",1,"m","short","#b0342c",null,2,null,["Champ magnétique:barrier","Attraction:rush","Répulsion:counter"],"Inversion des pôles","unova","Cherche son pôle sud.","C'était sa sœur. Depuis, ils ne se quittent plus."],
["hoot","Hoot","Veilleur de nuit","foudre","soin",1,"m","short","#8a6a3a",null,1,"staff",["Sagesse:heal","Plumes statiques:volley","Aile protectrice:barrier"],"Nuit blanche","uheal","Cherche le dernier livre de la grande bibliothèque.","Il n'était pas écrit. Hoot a commencé la première page."],
["fuse","Fuse","Queue d'éclair","foudre","sab",0,"m","spiky","#ffe680",null,0,null,["Morsure vive:drain","Zigzag:blink","Étincelles:volley"],"Court-jus","umeteor","Cherche l'orage où il est né.","Il en naît un chaque été. Il les suit tous."],
["gong","Gong","Ventre tambour","foudre","att",0,"m","short","#7a5a3a",null,1,null,["Coup de ventre:rush","Onde de tambour:nova","Feuille volante:volley"],"Grand tambour","ubeam","Cherche le rythme qui fait danser le tonnerre.","Il l'a trouvé en riant. Le tonnerre rit avec lui."],
// ---- TERRE ----
["jade","Jade","Sentinelle de jade","terre","att",3,"m","ponytail","#1f5c46",null,1,"lance",["Charge de la garde:rush","Lance impériale:beam","Mille soldats:meteor"],"Armée d'argile","ubarrage","Cherche l'empereur qu'il gardait.","Parti depuis mille ans. Jade garde maintenant les vivants."],
["bront","Bront","Corne de granit","terre","def",2,"m","short","#8a8f96",null,2,null,["Cuir épais:barrier","Charge:rush","Coup de corne:counter"],"Ruée","unova","Cherche un mur qu'il ne peut pas traverser.","Il n'en a pas trouvé. Il construit des ponts, à la place."],
["sylvan","Sylvan","Flûte des bois","terre","sab",2,"m","spiky","#6a4526",null,1,null,["Air envoûtant:trap","Ruade:rush","Feuilles tranchantes:volley"],"Bal de la forêt","umeteor","Cherche l'air que jouait son grand-père.","Il l'a retrouvé en sifflant sans y penser."],
["mamut","Mamut","Mémoire des glaces","terre","def",1,"m","short","#6b4a30",null,2,null,["Défenses:counter","Pas lourd:quake","Laine épaisse:barrier"],"Marche du troupeau","unova","Cherche le chemin que suivait son troupeau.","Le chemin est sous la glace. Il en trace un nouveau."],
["sirocco","Sirocco","Voile des sables","terre","sab",1,"m","hood","#d8c9a0",null,1,null,["Bandelettes:trap","Souffle sec:drain","Tempête de sable:volley"],"Malédiction du désert","umeteor","Cherche son nom, effacé de sa tombe.","Il s'en est choisi un nouveau. Il lui va mieux."],
["gemma","Gemma","Cœur de géode","terre","soin",1,"f","long","#b48cff",null,0,"staff",["Éclat pur:heal","Prisme:beam","Paroi de quartz:barrier"],"Mille facettes","uheal","Cherche la pierre qui manque à son cœur.","Il ne manquait rien. Elle brillait déjà entière."],
["champi","Champi","Chapeau moussu","terre","soin",0,"m","short","#e8dcc0",null,0,null,["Spores de vie:heal","Poussière dorée:volley","Chapeau abri:barrier"],"Rond de sorcière","uheal","Cherche un coin d'ombre bien humide.","Il a trouvé toute une forêt. Il y invite ses amis."],
["spino","Spino","Fleur du désert","terre","att",0,"m","short","#3f9a4a",null,1,null,["Coup d'épines:rush","Salve de piquants:volley","Floraison explosive:nova"],"Mille épines","ubeam","Cherche de l'eau. Juste un peu.","Il a trouvé une oasis. Il y fleurit une fois par an."],
// ---- OMBRE ----
["erebos","Erebos","Dragon d'os","ombre","def",3,"m","short","#e8e2d0",null,0,null,["Cage thoracique:barrier","Queue d'os:quake","Mâchoire:counter"],"Réveil du dragon","unova","Cherche les os qui lui manquent.","Il les a laissés où ils étaient. On n'a pas besoin d'être entier pour être fort."],
["noct","Noct","Hurlement","ombre","att",2,"m","spiky","#4a4e5c",null,1,null,["Griffes de lune:rush","Hurlement:nova","Traque:meteor"],"Pleine lune","ubarrage","Cherche à ne plus avoir peur de la lune.","Il lui hurle dessus pour rire, maintenant."],
["nyx","Nyx","Regard de pierre","ombre","sab",2,"f","long","#3f8a5a",null,1,null,["Regard figeant:trap","Morsure de vipère:drain","Nid de serpents:volley"],"Mille regards","umeteor","Cherche quelqu'un qui ose la regarder en face.","Son équipe le fait tous les jours. Personne ne s'est changé en pierre."],
["onyx","Onyx","Pas de velours","ombre","att",1,"f","short","#16141c",null,3,null,["Coup de patte:rush","Bond silencieux:quake","Griffes noires:counter"],"Chasse nocturne","ubarrage","Cherche une proie digne d'elle.","Elle a trouvé des rivaux. C'est plus amusant."],
["corvus","Corvus","Docteur des brumes","ombre","soin",1,"m","short","#1a1a20",null,0,"staff",["Remède amer:heal","Fumigation:barrier","Fioles:volley"],"Grande cure","uheal","Cherche le remède à la brume noire.","Il fallait seulement ouvrir les fenêtres."],
["gloom","Gloom","Flaque de nuit","ombre","def",1,"m","short","#5a2f8a",null,0,null,["Corps mou:barrier","Engloutir:counter","Vague gluante:quake"],"Marée noire","unova","Cherche une forme qui lui plaise.","Il en change tous les jours. Aujourd'hui : héros."],
["vespera","Vespera","Aile du soir","ombre","soin",0,"f","bob","#5a3a6a",null,0,null,["Écho apaisant:heal","Ultrasons:volley","Aile repliée:barrier"],"Berceuse du crépuscule","uheal","Cherche une grotte où dormir la tête en bas.","Elle dort très bien dans le dortoir de l'équipe. À l'envers."],
["mimi","Mimi","Coffre gourmand","ombre","sab",0,"m","short","#7a4a22",null,1,null,["Faux trésor:trap","Coup de langue:drain","Pluie de pièces:volley"],"Jackpot","umeteor","Cherche le trésor qu'on a mis dans sa tête.","Il l'a mangé sans faire exprès. Il était très bon."],
// ---- PRISME ----
["astra","Astra","Licorne des étoiles","prisme","soin",4,"f","long","#f6e8ff",null,0,"staff",["Corne de lumière:heal","Rayon d'étoile:beam","Voile lacté:barrier"],"Nuit des vœux","uheal","Cherche l'étoile qui exauce les vœux.","Elle n'existe pas. Astra exauce ceux qu'elle peut, elle-même."],
["nebula","Nebula","Enfant de la galaxie","prisme","def",4,"m","short","#2a1f6a",null,3,null,["Champ d'étoiles:barrier","Trou noir:counter","Onde stellaire:quake"],"Naissance d'une étoile","unova","Cherche le bord de l'univers.","Il n'y en a pas. Il s'est arrêté ici : c'est joli."],
["zenith","Zénith","Porteur des six lames","prisme","att",4,"m","long","#fff3c4",null,0,"katana",["Lame de l'aube:rush","Six lames:beam","Jugement du zénith:meteor"],"Constellation des lames","ubarrage","Cherche la septième lame.","C'était lui. Les six autres le savaient depuis le début."],
["prisma","Prisma","Cristal aux sept couleurs","prisme","att",3,"f","buns","#ffffff",null,0,null,["Éclat rouge:rush","Rayon arc-en-ciel:beam","Pluie de cristaux:meteor"],"Spectre total","ubeam","Cherche sa huitième couleur.","Elle l'a inventée. Personne ne sait la nommer."],
["iris","Iris","Ailes de lumière","prisme","sab",3,"f","bob","#ffc2e8",null,0,null,["Poussière d'ailes:trap","Battement:blink","Nuée irisée:volley"],"Métamorphose","umeteor","Cherche le jardin où elle était chenille.","Il est toujours là. Elle y pond des arcs-en-ciel."],
["lumen","Lumen","Roue aux cent yeux","prisme","soin",3,"m","short","#1fa890",null,1,null,["Parade:heal","Regard de la roue:beam","Éventail:barrier"],"Grande parade","uheal","Cherche quelqu'un de plus beau que lui.","Il a trouvé des amis. Il dit que ça compte."],
["sphinx","Sphinx","Gardienne des énigmes","prisme","def",3,"f","long","#1a1430",null,2,null,["Énigme:counter","Patte de pierre:quake","Sable du temps:barrier"],"Dernière énigme","unova","Cherche une énigme qu'elle ne sait pas résoudre.","« Pourquoi rester seule ? » Elle a mis mille ans à répondre."]
);

;

/* ---------- data3.js (jeu) ---------- */
/* ===== Données : 52 héros, techniques, équipement, chapitres, coffres ===== */
const EL = {
  feu:    { nom: 'Feu',    c: '#ff6a3d', rgb: [1, 0.42, 0.24], fx: [[1, 0.95, 0.75], [1, 0.62, 0.22], [1, 0.3, 0.1]], eye: [1, 0.42, 0.16], rim: [1, 0.58, 0.32], status: 'burn',
            mains: [[0.62, 0.12, 0.1], [0.2, 0.16, 0.2], [0.85, 0.4, 0.14]], secs: [[0.18, 0.13, 0.15], [0.85, 0.66, 0.3], [0.95, 0.88, 0.8]] },
  eau:    { nom: 'Eau',    c: '#4aa8ff', rgb: [0.3, 0.66, 1], fx: [[0.85, 0.97, 1], [0.4, 0.75, 1], [0.12, 0.4, 0.95]], eye: [0.25, 0.6, 1], rim: [0.5, 0.82, 1], status: 'slow',
            mains: [[0.12, 0.3, 0.62], [0.88, 0.92, 0.97], [0.1, 0.18, 0.32]], secs: [[0.4, 0.75, 0.9], [0.92, 0.92, 0.96], [0.15, 0.22, 0.4]] },
  foudre: { nom: 'Foudre', c: '#f2c94c', rgb: [0.95, 0.8, 0.3], fx: [[1, 1, 0.9], [1, 0.9, 0.4], [0.75, 0.6, 1]], eye: [1, 0.8, 0.2], rim: [1, 0.92, 0.45], status: 'stun',
            mains: [[0.95, 0.76, 0.22], [0.2, 0.2, 0.25], [0.32, 0.26, 0.52]], secs: [[0.16, 0.16, 0.22], [0.95, 0.85, 0.42], [0.92, 0.92, 0.95]] },
  terre:  { nom: 'Terre',  c: '#5cc98a', rgb: [0.36, 0.79, 0.54], fx: [[0.95, 1, 0.85], [0.55, 0.9, 0.45], [0.55, 0.4, 0.2]], eye: [0.35, 0.8, 0.4], rim: [0.65, 1, 0.6], status: 'armor',
            mains: [[0.25, 0.45, 0.26], [0.5, 0.38, 0.24], [0.32, 0.29, 0.21]], secs: [[0.75, 0.6, 0.35], [0.2, 0.3, 0.18], [0.85, 0.82, 0.7]] },
  ombre:  { nom: 'Ombre',  c: '#a77bff', rgb: [0.65, 0.48, 1], fx: [[0.95, 0.9, 1], [0.7, 0.5, 1], [0.35, 0.12, 0.7]], eye: [0.72, 0.45, 1], rim: [0.75, 0.55, 1], status: 'drain',
            mains: [[0.14, 0.11, 0.2], [0.35, 0.2, 0.55], [0.09, 0.08, 0.11]], secs: [[0.55, 0.36, 0.85], [0.2, 0.18, 0.25], [0.75, 0.7, 0.85]] },
  prisme: { nom: 'Prisme', c: '#ff8ad8', rgb: [1, 0.55, 0.85], fx: [[1, 1, 1], [1, 0.7, 0.95], [0.5, 0.75, 1]], eye: [1, 0.45, 0.85], rim: [1, 0.78, 0.95], status: 'all',
            mains: [[0.95, 0.93, 0.98]], secs: [[0.95, 0.75, 0.35]] }
};
const RAR = [
  { nom: 'Commun', c: '#9ca3af', m: 1, stars: 1, unlock: 10 }, { nom: 'Rare', c: '#4ea3ff', m: 1.1, stars: 2, unlock: 20 },
  { nom: 'Épique', c: '#b07cff', m: 1.22, stars: 3, unlock: 40 }, { nom: 'Légendaire', c: '#e2b45a', m: 1.36, stars: 4, unlock: 80 },
  { nom: 'Mythique', c: '#ff5d8f', m: 1.5, stars: 5, unlock: 120 }
];
const ROLE = {
  att: { nom: 'Attaquant', base: { pv: 4800, atq: 130, def: 55, vit: 106, crit: 10, cdmg: 55, mai: 40 }, outfit: ['coat', 'gi'] },
  def: { nom: 'Défenseur', base: { pv: 6200, atq: 102, def: 85, vit: 96, crit: 5, cdmg: 50, mai: 35 }, outfit: ['armor'] },
  soin: { nom: 'Soigneur', base: { pv: 5300, atq: 106, def: 64, vit: 100, crit: 6, cdmg: 50, mai: 62 }, outfit: ['robe'] },
  sab: { nom: 'Saboteur', base: { pv: 5000, atq: 116, def: 58, vit: 112, crit: 8, cdmg: 55, mai: 50 }, outfit: ['cloak'] }
};
const STAT_DEFS = [
  { k: 'pv', nom: 'Points de vie', court: 'PV', desc: 'Les dégâts encaissables avant de tomber.' },
  { k: 'atq', nom: 'Attaque', court: 'ATQ', desc: 'La base de tous les dégâts infligés.' },
  { k: 'def', nom: 'Défense', court: 'DÉF', desc: 'Réduit les dégâts reçus.' },
  { k: 'vit', nom: 'Vitesse', court: 'VIT', desc: 'Déplacements, enchaînements et recharge du ki.' },
  { k: 'crit', nom: 'Taux critique', court: 'CRIT', pct: true, desc: "Chance qu'un coup soit critique." },
  { k: 'cdmg', nom: 'Dégâts critiques', court: 'DGT CRIT', pct: true, desc: 'Bonus des coups critiques.' },
  { k: 'mai', nom: 'Maîtrise élémentaire', court: 'MAÎ', desc: 'Renforce les techniques, les ultimes et les effets élémentaires.' }
];
const KINDS = {
  rush:    { nom: 'Charge', cost: 30, cd: 5, dmg: 1.7, d: "Fonce sur l'ennemi et le frappe de plein fouet" },
  blink:   { nom: 'Téléportation', cost: 30, cd: 6, dmg: 1.6, d: "Disparaît et réapparaît dans le dos de l'ennemi pour frapper" },
  beam:    { nom: 'Rayon', cost: 40, cd: 7, dmg: 2.6, d: "Charge puis libère un rayon continu. Esquivable en se déplaçant sur le côté" },
  volley:  { nom: 'Salve', cost: 30, cd: 5, dmg: 1.9, d: 'Tire cinq projectiles à tête chercheuse' },
  nova:    { nom: 'Explosion', cost: 35, cd: 7, dmg: 2.0, d: 'Explosion autour de soi qui repousse' },
  quake:   { nom: 'Onde', cost: 30, cd: 6, dmg: 1.7, d: "Onde de choc au sol qui file vers l'ennemi" },
  meteor:  { nom: 'Frappe céleste', cost: 40, cd: 8, dmg: 2.5, d: "Une frappe tombe du ciel sur la position de l'ennemi après un court délai" },
  counter: { nom: 'Contre', cost: 20, cd: 8, dmg: 2.3, d: "Posture de garde. Si l'ennemi frappe, riposte dans son dos" },
  heal:    { nom: 'Soin', cost: 40, cd: 13, heal: 0.13, d: 'Soigne 13 % des PV max' },
  barrier: { nom: 'Barrière', cost: 30, cd: 11, shield: 0.15, d: 'Bouclier qui absorbe 15 % des PV max pendant 6 s' },
  trap:    { nom: 'Piège', cost: 30, cd: 7, dmg: 1.4, d: "Piège sous l'ennemi : dégâts et immobilisation s'il ne bouge pas à temps" },
  drain:   { nom: 'Absorption', cost: 25, cd: 6, dmg: 1.3, d: 'Frappe qui vole du ki et rend des PV' },
  // techniques secrètes (4e technique, débloquée au niveau 5)
  cyclone: { nom: 'Tourbillon', cost: 35, cd: 7, dmg: 2.1, d: "Fonce et tourbillonne : quatre coups circulaires puis un coup final qui projette" },
  uppercut:{ nom: 'Envol', cost: 30, cd: 6, dmg: 1.9, d: "Glisse sous la garde et envoie l'ennemi en l'air d'un coup ascendant" },
  lance:   { nom: 'Lance', cost: 30, cd: 6, dmg: 2.0, d: "Projette une lance de ki très rapide qui traverse l'arène" },
  tempete: { nom: 'Tempête', cost: 45, cd: 10, dmg: 2.6, d: "Trois frappes tombent du ciel l'une après l'autre sur l'ennemi" },
  rafale:  { nom: 'Rafale', cost: 35, cd: 7, dmg: 2.2, d: "Enchaînement éclair de six coups au corps à corps" },
  eveil:   { nom: 'Éveil', cost: 40, cd: 16, buff: 0.3, d: "Libère son énergie : +30 % de dégâts pendant 6 s" }
};
const T4_LVL = 5;
const T4_BY_ROLE = { att: ['rafale', 'cyclone', 'uppercut'], def: ['uppercut', 'eveil', 'cyclone'], soin: ['tempete', 'lance', 'eveil'], sab: ['lance', 'rafale', 'tempete'] };
const T4_SUF = { feu: 'de braise', eau: 'des marées', foudre: 'de foudre', terre: 'de roc', ombre: "d'ombre", prisme: 'de prisme' };
const ULTK = {
  ubeam: { d: "Rayon gigantesque qui suit l'ennemi", dmg: 6.0 },
  ubarrage: { d: "Déluge de coups puis explosion finale", dmg: 6.2 },
  umeteor: { d: "Sphère géante lancée du ciel sur l'ennemi", dmg: 6.0 },
  unova: { d: 'Explosion colossale et bouclier', dmg: 5.2 },
  uheal: { d: 'Soigne 15 % des PV puis explose', dmg: 4.6 }
};
const STATUS = { burn: 'Brûlure : dégâts sur 4 s', slow: 'Ralentissement : 2,5 s', stun: 'Paralysie : 0,6 s', armor: 'Brise-armure : défense -30 % pendant 5 s', drain: 'Vol de ki et de jauge ultime', all: 'Brûlure et ralentissement' };
const ULT_RENAME = { taro: 'Mille poings de braise', mina: 'Foyer éternel', gorou: 'Forteresse de cendres', iwa: 'Cœur de montagne', yoru: 'Nuit sans fin', kai: 'Raz-de-marée', rai: 'Mille éclairs', daichi: 'Poing du continent', luna: 'Pleine lune', mio: 'Déluge de vie' };

const hex2 = h => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const SKIN = [[[0.98, 0.88, 0.8], [0.86, 0.66, 0.64]], [[0.95, 0.8, 0.68], [0.8, 0.58, 0.52]], [[0.8, 0.6, 0.46], [0.62, 0.42, 0.36]], [[0.58, 0.4, 0.3], [0.44, 0.28, 0.24]]];
const HEROES = HEROES_RAW.map((a, i) => {
  const [id, name, title, el, role, r, body, hair, hairHex, acc, skinI, weapon, techs, ult, ultK, quest, end] = a;
  const E = EL[el];
  const hc = hex2(hairHex);
  const eye = E.eye;
  const look = {
    body, hair, hairC: hc.map(v => Math.max(0.05, v)), hairSh: hc.map(v => v * 0.5 + 0.02),
    skin: SKIN[skinI][0], skinSh: SKIN[skinI][1], eye, eyeD: eye.map(v => v * 0.35), eyeL: eye.map(v => Math.min(1, v * 0.5 + 0.55)), lash: [0.08, 0.04, 0.06],
    browC: hc.map(v => v * 0.5), rim: E.rim,
    tilt: role === 'att' ? 0.55 : role === 'sab' ? 0.7 : role === 'def' ? 0.25 : -0.1,
    brow: role === 'att' ? 0.55 : role === 'def' ? 0.45 : role === 'sab' ? 0.2 : -0.25,
    mouth: role === 'soin' ? 'smile' : role === 'sab' ? 'smirk' : i % 3 === 0 ? 'smirk' : 'firm',
    blush: body === 'f' && role !== 'sab', eh: body === 'f' ? 0.175 : 0.16,
    scar: acc === 'scar', acc: acc === 'scar' ? null : acc, accC: E.secs[0],
    outfit: ROLE[role].outfit[i % ROLE[role].outfit.length],
    main: E.mains[i % E.mains.length], sec: E.secs[(i + 1) % E.secs.length], acc3: E.rgb, pants: E.mains[(i + 2) % E.mains.length].map(v => v * 0.6),
    sleeves: role === 'att' && i % 2 ? 'none' : 'long', gloves: role !== 'soin', cape: r >= 3, weapon,
    mark: role === 'sab' ? E.rgb : null
  };
  if (look.mark) look.mark = E.rgb;
  if (r === 4) { look.cape = true; } // pas d'auréole (symbole religieux), même sur les anciens modèles
  const tk = techs.map((s, k) => { const [n, kind] = s.split(':'); return { k: 't' + (k + 1), nom: n, kind }; });
  { const k4 = T4_BY_ROLE[role][i % 3]; tk.push({ k: 't4', nom: KINDS[k4].nom + ' ' + (T4_SUF[el] || ''), kind: k4, lvl: T4_LVL }); }
  return { id, idx: i, name, title, el, role, r, look, techs: tk, ult: { nom: ULT_RENAME[id] || ult, kind: ultK }, quest, end, weapon };
});
const HBY = {}; HEROES.forEach(h => { HBY[h.id] = h; });

/* ---- stats ---- */
const MAX_LVL = 40, MAX_STARS = 7;
function xpNeed(l) { return 100 + 50 * (l - 1); }
function starCost(s) { return [0, 10, 20, 40, 60, 90, 120, 160][s] || 999; }
function heroBase(h, lvl, stars) {
  const b = ROLE[h.role].base, rm = RAR[h.r].m, sm = 1 + 0.08 * (stars - RAR[h.r].stars), g = 1 + 0.045 * (lvl - 1);
  return {
    pv: Math.round(b.pv * rm * sm * g), atq: Math.round(b.atq * rm * sm * g), def: Math.round(b.def * rm * sm * (1 + 0.04 * (lvl - 1))),
    vit: Math.round(b.vit + (lvl - 1) * 0.3 + h.r), crit: b.crit + h.r, cdmg: b.cdmg + h.r * 5, mai: Math.round(b.mai * rm * sm * (1 + 0.035 * (lvl - 1)))
  };
}

/* ---- équipement (repris du prototype) ---- */
const SLOTS = { arme: 'Arme', armure: 'Armure', relique: 'Relique' };
const G_RAR = [{ nom: 'Commun', c: '#9ca3af' }, { nom: 'Rare', c: '#4ea3ff' }, { nom: 'Épique', c: '#b07cff' }, { nom: 'Légendaire', c: '#e2b45a' }];
const G_NAMES = {
  arme: [['Lame de braise', 'Gantelets usés', 'Bâton de chêne'], ['Sabre du forgeron', 'Poings de fer', 'Lance des marées'], ["Katana d'obsidienne", 'Griffes de foudre', 'Sceptre de jade'], ['Lame du phénix', 'Poings du titan', 'Lance céleste']],
  armure: [['Haori cendré', 'Tunique de voyage', 'Gilet de cuir'], ['Plastron de magma', 'Kimono renforcé', 'Cotte des abysses'], ['Manteau de flammes', 'Armure de jade', 'Voile de nuit'], ['Manteau du dragon', 'Armure céleste', "Habit de l'éclipse"]],
  relique: [['Talisman ardent', 'Perle de rosée', 'Pierre de rune'], ['Œil de braise', 'Amulette de foudre', 'Sceau de terre'], ['Sceau du volcan', 'Cœur des marées', "Masque d'ombre"], ['Plume de phénix', 'Étoile prisme', 'Œil du temps']]
};
const MAINV = { atq: [18, 30, 46, 66], pv: [540, 900, 1380, 1980], crit: [3, 5, 7.5, 10], cdmg: [8, 13, 20, 28], mai: [16, 26, 40, 56] };
const SUBV = { atq: [6, 8, 12, 16], def: [5, 7, 10, 14], pv: [180, 240, 360, 510], vit: [2, 3, 4, 6], crit: [1.5, 2.5, 3.5, 5], cdmg: [4, 5, 7, 10], mai: [10, 12, 18, 24] };
const MAX_UP = [4, 6, 8, 10];
let _iid = 1;
function makeItem(slot, r) {
  const main = slot === 'arme' ? 'atq' : slot === 'armure' ? 'pv' : ['crit', 'cdmg', 'mai'][Math.floor(Math.random() * 3)];
  const pool = Object.keys(SUBV).filter(k => k !== main), subs = [];
  for (let i = 0; i < r; i++) {
    const k = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    const v = SUBV[k][r] * (0.8 + Math.random() * 0.4);
    subs.push({ k, v: k === 'crit' || k === 'cdmg' ? Math.round(v * 10) / 10 : Math.round(v) });
  }
  const names = G_NAMES[slot][r];
  return { id: 'i' + Date.now().toString(36) + (_iid++) + Math.floor(Math.random() * 1000), slot, r, up: 0, name: names[Math.floor(Math.random() * names.length)], main, subs, fresh: true };
}
function mainVal(it) { const v = MAINV[it.main][it.r] * (1 + 0.1 * it.up); return it.main === 'crit' || it.main === 'cdmg' ? Math.round(v * 10) / 10 : Math.round(v); }
function upCost(it) { return { ec: 6 * (it.up + 1) * (it.r + 1), pc: 50 * (it.up + 1) * (it.r + 1) }; }
function recycleVal(it) { return 5 * (it.r + 1) * (it.r + 1) + it.up * 4; }
function techMult(l) { return 1 + 0.12 * (l - 1); }
function techCost(l) { return { parch: l, pc: 150 * l }; }
function statsOf(h, hs, items) {
  const s = heroBase(h, hs.lvl, hs.stars);
  (items || []).forEach(it => { if (!it) return; s[it.main] += mainVal(it); it.subs.forEach(x => { s[x.k] += x.v; }); });
  STAT_DEFS.forEach(d => { s[d.k] = d.pct ? Math.round(s[d.k] * 10) / 10 : Math.round(s[d.k]); });
  return s;
}
function powerOf(s, tech) {
  const t = tech ? Object.values(tech).reduce((a, b) => a + b, 0) : 4;
  return Math.round(s.pv * 0.04 + s.atq * 3.2 + s.def * 2.4 + (s.vit - 100) * 6 + s.crit * 9 + s.cdmg * 2.2 + s.mai * 1.6 + t * 25);
}

/* ---- chapitres : un par élément, 6 étapes chacun ---- */
const CH_NAMES = { feu: 'Le Sentier des cendres', eau: 'La Mer de verre', foudre: 'Les Pics d’orage', terre: 'Les Racines du monde', ombre: 'La Nuit sans lune' };
const CHAPTERS = ['feu', 'eau', 'foudre', 'terre', 'ombre'].map((el, ci) => {
  const pool = HEROES.filter(h => h.el === el && h.idx < HEROES_BASE_N).sort((a, b) => a.r - b.r);   // l'Histoire garde ses adversaires d'origine
  const picks = [pool[0], pool[1], pool[2], pool[4], pool[7], pool[9]];
  return { el, nom: CH_NAMES[el], stages: picks.map((h, si) => {
    const n = ci * 6 + si;
    return { key: el + (si + 1), ch: ci, si, foe: h.id, lvl: Math.max(1, Math.round(1 + n * 1.25) - (si === 5 ? 3 : 0)), boss: si === 5, ai: Math.min(1, 0.12 + n * 0.03),
      xp: 60 + n * 14, pc: 120 + n * 28, ec: 8 + n * 2, frag: si === 5 ? 15 : 8 };
  }) };
});
const STAGES = []; CHAPTERS.forEach(c => c.stages.forEach(s => STAGES.push(s)));
function aiParams(k) { return { agg: 0.35 + k * 0.35, react: 0.06 + k * 0.4, skill: 0.25 + k * 0.4, combo: 0.4 + k * 0.5, think: 0.42 - k * 0.18, ult: 0.5 + k * 0.4 }; }

/* ---- coffre toutes les 20 minutes ---- */
const CHEST_EVERY = 20 * 60 * 1000;
function pickW(w) { const t = w.reduce((a, b) => a + b, 0); let r = Math.random() * t; for (let i = 0; i < w.length; i++) { if (r < w[i]) return i; r -= w[i]; } return 0; }
function rollChest(P) {
  const out = [];
  const slots = Object.keys(SLOTS);
  out.push({ type: 'item', it: makeItem(slots[Math.floor(Math.random() * 3)], pickW([50, 35, 12, 3])) });
  out.push({ type: 'ec', n: 20 + Math.floor(Math.random() * 21) });
  out.push({ type: 'parch', n: 1 + (Math.random() < 0.35 ? 1 : 0) });
  // fragments de héros
  for (let k = 0; k < 2; k++) {
    const r = pickW([55, 28, 12, 4.5, 0.5]);
    const pool = HEROES.filter(h => h.r === r);
    const h = pool[Math.floor(Math.random() * pool.length)];
    out.push({ type: 'frag', id: h.id, n: [6, 5, 4, 3, 2][r] + Math.floor(Math.random() * 4) });
  }
  // héros complet (rare)
  if (Math.random() < 0.1) {
    const locked = HEROES.filter(h => !P.heroes[h.id]);
    if (locked.length) { const w = locked.map(h => [40, 25, 10, 3, 0.5][h.r]); out.push({ type: 'hero', id: locked[pickW(w)].id }); }
  }
  return out;
}

;

/* ---------- hq2.js (jeu) ---------- */
/* ===== Personnages haute qualité (52 héros) : anatomie, tête réaliste, tenues en couches, animation fluide ===== */
const HQ = (function () {
  const { V, M, grid, tube, merge, xformGeo, Node, Mesh } = G3;
  const PI = Math.PI, D = PI / 180;
  const sst = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- outils de géométrie ---------- */
  // profil interpolé : rows = [[y, rx, rzf, rzb, cz], ...] du haut vers le bas
  function prof(rows) {
    return t => {
      t = Math.max(0, Math.min(1, t));
      const k = t * (rows.length - 1), i = Math.min(rows.length - 2, Math.floor(k)), f = k - i;
      const a = rows[i], b = rows[i + 1], s = f * f * (3 - 2 * f), m = (x, y) => x + (y - x) * s;
      return { y: m(a[0], b[0]), rx: m(a[1], b[1]), rzf: m(a[2], b[2]), rzb: m(a[3], b[3]), cz: m(a[4] || 0, b[4] || 0) };
    };
  }
  // loft vertical : anneaux horizontaux ; open = [demi-ouverture avant en radians en haut, en bas]
  function loft(rows, nu, nv, opt) {
    opt = opt || {};
    const f = prof(rows), grow = opt.grow || 0, open = opt.open;
    return grid(nu, nv, (u, v) => {
      const r = f(v);
      let ph;
      if (open) { const o = lerp(open[0], open[1], v); ph = o + u * (PI * 2 - 2 * o); } else ph = u * PI * 2;
      const s = Math.sin(ph), c = Math.cos(ph), rz = (c > 0 ? r.rzf : r.rzb) + grow;
      const fold = opt.folds ? opt.folds * Math.sin(ph * opt.foldN + v * 2) * v : 0;
      return { p: [s * (r.rx + grow + fold), r.y, r.cz + c * (rz + fold)], uv: [u, v] };
    });
  }
  const limb = (rows, nu, nv, grow) => loft(rows.map(r => [r[0], r[1], r[1] * (r[2] || 1), r[1] * (r[2] || 1), r[3] || 0]), nu || 18, nv || 16, { grow });
  // boîte arrondie (superellipsoïde)
  function rbox(sx, sy, sz, e, nu, nv) {
    const sg = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);
    return grid(nu || 20, nv || 14, (u, v) => {
      const ph = (u - 0.5) * PI * 2, th = v * PI, ct = Math.cos(th), st = Math.sin(th);
      return { p: [sg(Math.sin(ph), e) * sg(st, e) * sx, sg(ct, e) * sy, sg(Math.cos(ph), e) * sg(st, e) * sz], uv: [u, v] };
    });
  }
  const at = (g, pos, rot, s) => xformGeo(g, M.compose(pos || [0, 0, 0], rot || [0, 0, 0], s || 1));
  // ruban (bande) le long d'un chemin, largeur w, orienté par une normale
  function band(path, w, up) { return tube(path, () => [w, 0.004], 4, up); }
  // panneau de tissu : grille entre une ligne haute et une ligne basse, avec plis
  function panel(top, bot, nu, nv, folds) {
    return grid(nu, nv, (u, v) => {
      const k = u * (top.length - 1), i = Math.min(top.length - 2, Math.floor(k)), f = k - i;
      const a = V.lerp(top[i], top[i + 1], f), b = V.lerp(bot[i], bot[i + 1], f);
      const p = V.lerp(a, b, v), n = V.norm([p[0], 0, p[2]]);
      const fo = (folds || 0) * Math.sin(u * PI * 3) * v;
      return { p: V.add(p, V.mul(n, fo)), uv: [u, v] };
    });
  }
  /* ---------- textures peintes ---------- */
  const TX = {};
  // cou : ombre douce sous le menton (plus sombre devant, s'efface vers le col)
  function neckTex() {
    const [c, g] = canvas(64, 64), im = g.createImageData(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const v = y / 63, u = x / 63, fr = 0.5 + 0.5 * Math.cos(u * PI * 2), sh = (1 - sst(0.5, 0.95, v)) * (0.3 + 0.2 * fr), i = (y * 64 + x) * 4;
      im.data[i] = 255 * (1 - sh * 0.75); im.data[i + 1] = 255 * (1 - sh); im.data[i + 2] = 255 * (1 - sh * 0.95); im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0); return c;
  }
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
  const css = a => `rgb(${a.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255)).join(',')})`;
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // tissu : grain, liserés en haut/bas, coutures
  function fabric(base, o) {
    o = o || {};
    const [c, g] = canvas(512, 512);
    g.fillStyle = css(base); g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${0.02 + rnd() * 0.03})`; g.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 3, 1 + rnd() * 3); }
    g.globalAlpha = 0.06; g.strokeStyle = '#000';
    for (let y = 0; y < 512; y += 3) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
    // armure sergée (fines diagonales) : le tissu a du grain
    g.globalAlpha = 0.05; g.strokeStyle = '#fff'; g.lineWidth = 1.2;
    for (let x = -512; x < 512; x += 6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 512, 512); g.stroke(); }
    g.globalAlpha = 0.035; g.strokeStyle = '#000';
    for (let x = -509; x < 512; x += 6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 512, 512); g.stroke(); }
    g.globalAlpha = 1; g.lineWidth = 1;
    // ombrage des bords (occlusion)
    const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, 'rgba(0,0,0,.25)'); gr.addColorStop(0.08, 'rgba(0,0,0,0)'); gr.addColorStop(0.92, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.3)');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
    c._mask = [];
    if (o.trim) [o.trimTop !== false ? 0 : null, o.trimBot !== false ? 1 : null].forEach(e => {
      if (e == null) return;
      const y = e ? 512 - (o.tw || 26) : 0, h = o.tw || 26; c._mask.push([y, h]);
      g.fillStyle = css(o.trim); g.fillRect(0, y, 512, h);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, y + (e ? 2 : h - 4), 512, 2);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y + (e ? h - 3 : 1), 512, 2);
      // surpiqûre le long de la bordure
      g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 1.6; g.setLineDash([7, 5]);
      const sy = e ? y - 6 : y + h + 6; g.beginPath(); g.moveTo(0, sy); g.lineTo(512, sy); g.stroke(); g.setLineDash([]); g.lineWidth = 1;
      if (o.motif) { g.strokeStyle = css(o.trim.map(v => v * 0.55)); g.lineWidth = 2; for (let x = 0; x < 512; x += 22) { g.beginPath(); g.moveTo(x, y + h / 2); g.lineTo(x + 11, y + 5); g.lineTo(x + 22, y + h / 2); g.lineTo(x + 11, y + h - 5); g.closePath(); g.stroke(); } }
    });
    if (o.wrinkles) o.wrinkles.forEach(([y0, y1, n]) => {
      for (let i = 0; i < n; i++) {
        const y = (y0 + (y1 - y0) * (i + 0.5) / n) * 512, amp = 6 + rnd() * 8, ph = rnd() * 6;
        for (let k = 0; k < 2; k++) {
          g.strokeStyle = k ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.28)'; g.lineWidth = k ? 3 : 7; g.beginPath();
          for (let x = 0; x <= 512; x += 8) { const yy = y + Math.sin(x / 512 * PI * 4 + ph) * amp + (k ? -5 : 0); x ? g.lineTo(x, yy) : g.moveTo(x, yy); }
          g.stroke();
        }
      }
    });
    if (o.seams) { g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.setLineDash([6, 5]); [0.25, 0.75].forEach(x => { g.beginPath(); g.moveTo(x * 512, 0); g.lineTo(x * 512, 512); g.stroke(); }); g.setLineDash([]); }
    return c;
  }
  function leather(base) {
    const [c, g] = canvas(256, 256);
    g.fillStyle = css(base); g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${0.04 + rnd() * 0.08})`; g.beginPath(); g.arc(rnd() * 256, rnd() * 256, rnd() * 2.2, 0, PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(255,230,190,.45)'; g.lineWidth = 1.5; g.setLineDash([5, 4]);
    [10, 246].forEach(y => { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }); g.setLineDash([]);
    const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(255,255,255,.08)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.25)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    return c;
  }
  function metal(base) {
    const [c, g] = canvas(256, 256);
    g.fillStyle = css(base); g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 300; i++) { g.strokeStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${0.05 + rnd() * 0.06})`; const y = rnd() * 256; g.beginPath(); g.moveTo(0, y); g.lineTo(256, y + (rnd() - 0.5) * 6); g.stroke(); }
    return c;
  }
  function wrapTex(cord, under) {
    const [c, g] = canvas(256, 256);
    g.fillStyle = css(under); g.fillRect(0, 0, 256, 256);
    g.fillStyle = css(cord);
    for (let y = -32; y < 288; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y + 26); g.lineTo(256, y); g.lineTo(256, y + 12); g.lineTo(128, y + 38); g.lineTo(0, y + 12); g.closePath(); g.fill(); g.beginPath(); g.moveTo(0, y + 26); g.lineTo(128, y); g.lineTo(256, y + 26); g.lineTo(256, y + 38); g.lineTo(128, y + 12); g.lineTo(0, y + 38); g.closePath(); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.12)'; for (let y = 0; y < 256; y += 32) g.fillRect(0, y + 4, 256, 2);
    return c;
  }
  function bladeTex() {
    const [c, g] = canvas(64, 512);
    const gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, '#7d828c'); gr.addColorStop(0.45, '#c9cdd4'); gr.addColorStop(0.5, '#eef1f4'); gr.addColorStop(1, '#a9aeb7');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 512);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(40, 0);
    for (let y = 0; y <= 512; y += 16) g.lineTo(44 + Math.sin(y * 0.09) * 5, y);
    g.lineTo(64, 512); g.lineTo(64, 0); g.closePath(); g.fill();
    return c;
  }
  function hairTex(root, tip) {
    const [c, g] = canvas(128, 256);
    const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, css(root)); gr.addColorStop(0.55, css(V.lerp(root, tip, 0.45))); gr.addColorStop(1, css(tip));
    g.fillStyle = gr; g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 160; i++) { const x = rnd() * 128; g.strokeStyle = `rgba(${rnd() < 0.5 ? '255,235,220' : '0,0,0'},${0.025 + rnd() * 0.045})`; g.lineWidth = 0.5 + rnd() * 1.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (rnd() - 0.5) * 4, 256); g.stroke(); }
    // bords des mèches plus sombres (volume)
    for (let x = 0; x < 128; x++) { const k = Math.pow(Math.abs(Math.cos(x / 128 * PI * 2)), 6) * 0.22; g.fillStyle = `rgba(0,0,0,${k})`; g.fillRect(x, 0, 1, 256); }
    return c;
  }
  // emblème runique brodé (dos du manteau)
  function emblem(col, glow) {
    const [c, g] = canvas(512, 512); g.translate(256, 256);
    g.strokeStyle = css(col); g.fillStyle = css(col); g.lineCap = 'round';
    g.shadowColor = css(glow); g.shadowBlur = 10;
    g.lineWidth = 10; g.beginPath(); g.arc(0, 0, 200, 0, PI * 2); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 176, 0, PI * 2); g.stroke();
    for (let i = 0; i < 12; i++) { g.save(); g.rotate(i * PI / 6); g.fillRect(-3, -196, 6, 18); g.restore(); }
    g.lineWidth = 7; g.beginPath(); g.arc(0, 0, 112, 0, PI * 2); g.stroke();
    for (let i = 0; i < 8; i++) { g.save(); g.rotate(i * PI / 4 + PI / 8); g.beginPath(); g.moveTo(-14, -122); g.lineTo(0, -166); g.lineTo(14, -122); g.closePath(); g.fill(); g.restore(); }
    // flamme stylisée au centre
    g.beginPath(); g.moveTo(0, -78); g.bezierCurveTo(48, -20, 46, 40, 0, 64); g.bezierCurveTo(-46, 40, -48, -20, 0, -78); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.moveTo(0, -20); g.bezierCurveTo(22, 10, 20, 36, 0, 48); g.bezierCurveTo(-20, 36, -22, 10, 0, -20); g.fill();
    return c;
  }
  function tex(R, key, fn) { const k = R.id + key; if (!TX[k]) TX[k] = R.texture(fn(), true); return TX[k]; }
  // texture neutre partagée : R = détail (gris 0,78 = couleur de base), G = masque du liseré ; teintée dans le shader
  function tinted(c) {
    const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height), a = d.data, W = c.width, k = W / 512;
    const mk = new Uint8Array(c.height); (c._mask || []).forEach(([y, h]) => { for (let i = Math.floor(y * k); i < Math.min(c.height, Math.ceil((y + h) * k)); i++) mk[i] = 255; });
    for (let i = 0; i < a.length; i += 4) { const l = a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11; a[i] = l; a[i + 1] = mk[(i >> 2) / W | 0]; a[i + 2] = 0; }
    g.putImageData(d, 0, 0); return c;
  }

  /* ---------- visage peint haute définition ---------- */
  const T = (x, y) => [(0.5 + x / 2.5) * 1024, (0.5 - (y + 0.1) / 2.5) * 1024];
  function faceHQ(o) {
    const [c, g] = canvas(512, 512); g.scale(0.5, 0.5);
    g.lineCap = 'round'; g.lineJoin = 'round';
    // ombre portée de la frange sur le front (style anime 3D) : bord en pointes, dégradé doux
    {
      const T0 = T(0, 0.66)[1], T1 = T(0, 0.02)[1], g2 = g.createLinearGradient(0, T0, 0, T1);
      g2.addColorStop(0, 'rgba(140,62,64,.36)'); g2.addColorStop(0.6, 'rgba(140,62,64,.2)'); g2.addColorStop(1, 'rgba(140,62,64,0)');
      g.fillStyle = g2; g.fillRect(0, T0, 1024, T1 - T0);
      [-1, 1].forEach(sd => { const t = T(sd * 0.86, -0.15), rg = g.createRadialGradient(t[0], t[1], 6, t[0], t[1], 120); rg.addColorStop(0, 'rgba(140,62,64,.28)'); rg.addColorStop(1, 'rgba(140,62,64,0)'); g.fillStyle = rg; g.beginPath(); g.ellipse(t[0], t[1], 70, 150, 0, 0, PI * 2); g.fill(); });
      const ch = T(0, -0.98), cg = g.createRadialGradient(ch[0], ch[1] + 30, 10, ch[0], ch[1] + 30, 170); cg.addColorStop(0, 'rgba(150,70,70,.22)'); cg.addColorStop(1, 'rgba(150,70,70,0)'); g.fillStyle = cg; g.beginPath(); g.ellipse(ch[0], ch[1] + 30, 200, 90, 0, 0, PI * 2); g.fill();
    }
    // fard à paupières et ombres douces
    [-1, 1].forEach(sd => {
      const e = T(sd * 0.34, -0.08), gr = g.createRadialGradient(e[0], e[1], 4, e[0], e[1], 90);
      gr.addColorStop(0, css(o.shadow || [0.45, 0.2, 0.25]).replace('rgb', 'rgba').replace(')', ',.16)')); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(e[0], e[1] - 8, 80, 44, 0, 0, PI * 2); g.fill();
    });
    [-1, 1].forEach(sd => eye(g, sd, o));
    // sourcils : trait plein effilé
    [-1, 1].forEach(sd => {
      const a = T(sd * 0.14, 0.045 - o.brow * 0.035), b = T(sd * 0.33, 0.12), c = T(sd * 0.54, 0.07 + o.brow * 0.02);
      g.fillStyle = css(o.browC); g.beginPath(); g.moveTo(a[0], a[1] + 9);
      g.quadraticCurveTo(b[0], b[1] - 4, c[0], c[1]); g.quadraticCurveTo(b[0], b[1] - 16, a[0] + sd * 2, a[1] - 7); g.closePath(); g.fill();
    });
    // nez
    const nt = T(0, -0.43);
    let gr = g.createRadialGradient(nt[0] - 18, nt[1] - 6, 2, nt[0] - 18, nt[1] - 6, 40); gr.addColorStop(0, 'rgba(150,80,70,.32)'); gr.addColorStop(1, 'rgba(150,80,70,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(nt[0] - 18, nt[1] - 10, 22, 46, 0, 0, PI * 2); g.fill();
    g.strokeStyle = 'rgba(120,60,55,.55)'; g.lineWidth = 3; g.beginPath(); g.moveTo(nt[0] - 18, nt[1] + 8); g.quadraticCurveTo(nt[0], nt[1] + 16, nt[0] + 16, nt[1] + 8); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(nt[0] + 2, nt[1] - 4, 6, 4, 0, 0, PI * 2); g.fill();
    // lèvres
    const m = T(0, -0.66);
    g.fillStyle = css(o.lip); g.globalAlpha = 0.85;
    g.beginPath(); g.moveTo(m[0] - 44, m[1]); g.quadraticCurveTo(m[0] - 18, m[1] - 12, m[0], m[1] - 6); g.quadraticCurveTo(m[0] + 18, m[1] - 12, m[0] + 44, m[1]); g.quadraticCurveTo(m[0], m[1] + 4, m[0] - 44, m[1]); g.fill();
    g.beginPath(); g.moveTo(m[0] - 38, m[1] + 2); g.quadraticCurveTo(m[0], m[1] + 26, m[0] + 38, m[1] + 2); g.quadraticCurveTo(m[0], m[1] + 6, m[0] - 38, m[1] + 2); g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = css(o.lip.map(v => v * 0.45)); g.lineWidth = 4.6; g.beginPath(); g.moveTo(m[0] - 46, m[1] - 1); g.quadraticCurveTo(m[0], m[1] + (o.smile || 0) * 10 + 4, m[0] + 46, m[1] - 1 - (o.smirk || 0) * 8); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.ellipse(m[0] + 6, m[1] + 13, 14, 3.5, 0, 0, PI * 2); g.fill();
    // joues
    [-1, 1].forEach(sd => { const b = T(sd * 0.44, -0.38); const rg = g.createRadialGradient(b[0], b[1], 0, b[0], b[1], 70); rg.addColorStop(0, `rgba(230,110,110,${o.blush || 0.14})`); rg.addColorStop(1, 'rgba(230,110,110,0)'); g.fillStyle = rg; g.beginPath(); g.ellipse(b[0], b[1], 80, 46, 0, 0, PI * 2); g.fill(); });
    // contour de la mâchoire : ombre douce le long de la ligne du visage (seulement en bas)
    {
      const [c2, g2] = canvas(1024, 1024), ct = T(0, -0.32), rg = g2.createRadialGradient(ct[0], ct[1], 0.5 * 409.6, ct[0], ct[1], 0.86 * 409.6);
      rg.addColorStop(0, 'rgba(150,70,68,0)'); rg.addColorStop(0.55, 'rgba(150,70,68,.12)'); rg.addColorStop(1, 'rgba(150,70,68,.3)');
      g2.fillStyle = rg; g2.fillRect(0, 0, 1024, 1024);
      const lg = g2.createLinearGradient(0, T(0, -0.25)[1], 0, T(0, -0.6)[1]); lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,1)');
      g2.globalCompositeOperation = 'destination-in'; g2.fillStyle = lg; g2.fillRect(0, 0, 1024, 1024);
      g.drawImage(c2, 0, 0);
    }
    // narines et ombre sous la lèvre
    [-1, 1].forEach(sd => { const n = T(sd * 0.04, -0.462); g.fillStyle = 'rgba(115,52,48,.42)'; g.beginPath(); g.ellipse(n[0], n[1], 6, 3.2, sd * 0.35, 0, PI * 2); g.fill(); });
    { const u = T(0, -0.755), rg = g.createRadialGradient(u[0], u[1], 2, u[0], u[1], 34); rg.addColorStop(0, 'rgba(150,72,70,.22)'); rg.addColorStop(1, 'rgba(150,72,70,0)'); g.fillStyle = rg; g.beginPath(); g.ellipse(u[0], u[1], 40, 16, 0, 0, PI * 2); g.fill(); }
    if (o.scar) { const s1 = T(0.4, -0.18), s2 = T(0.56, -0.44); g.strokeStyle = 'rgba(160,70,65,.6)'; g.lineWidth = 5; g.beginPath(); g.moveTo(s1[0], s1[1]); g.lineTo(s2[0], s2[1]); g.stroke(); }
    if (o.mark) { g.fillStyle = css(o.mark); g.globalAlpha = 0.85; [-1, 1].forEach(sd => { const a = T(sd * 0.5, -0.3); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(a[0] + sd * 40, a[1] + 8); g.lineTo(a[0] + sd * 4, a[1] + 16); g.closePath(); g.fill(); }); g.globalAlpha = 1; }
    return c;
  }
  function eye(g, sd, o) {
    const ex = 0.35, ey = -0.14, ew = 0.36, eh = o.eh || 0.2, tilt = o.tilt || 0;
    const cx = sd * ex, inner = cx - sd * ew / 2, outer = cx + sd * ew / 2;
    const I = T(inner, ey - 0.01), O = T(outer, ey + 0.025 + tilt * 0.05), top = T(cx + sd * 0.02, ey + eh * 0.6), bot = T(cx, ey - eh * 0.48);
    const shape = () => { g.beginPath(); g.moveTo(I[0], I[1]); g.bezierCurveTo(I[0] + (top[0] - I[0]) * 0.35, top[1] + 2, top[0] + (O[0] - top[0]) * 0.55, top[1] - 2, O[0], O[1]); g.bezierCurveTo(O[0] - (O[0] - bot[0]) * 0.25, bot[1] + 2, I[0] + (bot[0] - I[0]) * 0.55, bot[1] - 2, I[0], I[1]); g.closePath(); };
    g.save(); shape();
    const sc = g.createLinearGradient(0, top[1], 0, bot[1]); sc.addColorStop(0, '#d8cdc8'); sc.addColorStop(0.35, '#f6f1ec'); sc.addColorStop(1, '#efe6e2');
    g.fillStyle = sc; g.fill(); g.clip();
    const ic = T(cx + sd * 0.004, ey - eh * 0.04), irx = ew * 0.25 * 410, iry = eh * 0.58 * 410;
    const ig = g.createRadialGradient(ic[0], ic[1] + iry * 0.25, 2, ic[0], ic[1], iry * 1.05);
    ig.addColorStop(0, css(o.eyeL)); ig.addColorStop(0.45, css(o.eye)); ig.addColorStop(0.85, css(o.eyeD)); ig.addColorStop(1, '#1a0d10');
    g.fillStyle = ig; g.beginPath(); g.ellipse(ic[0], ic[1], irx, iry, 0, 0, PI * 2); g.fill();
    g.strokeStyle = css(o.eyeL); g.globalAlpha = 0.35; g.lineWidth = 1.4;
    for (let a = 0; a < PI * 2; a += 0.22) { g.beginPath(); g.moveTo(ic[0] + Math.cos(a) * irx * 0.35, ic[1] + Math.sin(a) * iry * 0.35); g.lineTo(ic[0] + Math.cos(a) * irx * 0.9, ic[1] + Math.sin(a) * iry * 0.9); g.stroke(); }
    g.globalAlpha = 1;
    g.strokeStyle = css(o.eyeD.map(v => v * 0.45)); g.lineWidth = 3.4; g.beginPath(); g.ellipse(ic[0], ic[1], irx * 0.97, iry * 0.98, 0, 0, PI * 2); g.stroke();
    g.save(); g.beginPath(); g.ellipse(ic[0], ic[1], irx * 0.94, iry * 0.95, 0, 0, PI * 2); g.clip();
    const cr = g.createRadialGradient(ic[0], ic[1] + iry * 0.85, 2, ic[0], ic[1] + iry * 0.85, iry * 0.75); cr.addColorStop(0, css(o.eyeL.map(v => Math.min(1, v * 1.1 + 0.1)))); cr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.75; g.fillStyle = cr; g.fillRect(ic[0] - irx, ic[1], irx * 2, iry); g.globalAlpha = 1; g.restore();
    const pg = g.createRadialGradient(ic[0], ic[1] + iry * 0.05, 1, ic[0], ic[1] + iry * 0.05, iry * 0.45); pg.addColorStop(0, '#0c0507'); pg.addColorStop(0.75, '#140a0c'); pg.addColorStop(1, 'rgba(20,10,12,0)');
    g.fillStyle = pg; g.beginPath(); g.ellipse(ic[0], ic[1] + iry * 0.05, irx * 0.42, iry * 0.48, 0, 0, PI * 2); g.fill();
    // ombre de la paupière sur l'œil
    const lg = g.createLinearGradient(0, top[1] - 4, 0, top[1] + iry * 0.9); lg.addColorStop(0, 'rgba(40,20,30,.55)'); lg.addColorStop(1, 'rgba(40,20,30,0)'); g.fillStyle = lg; g.fillRect(Math.min(I[0], O[0]) - 10, top[1] - 10, Math.abs(O[0] - I[0]) + 20, iry * 1.2);
    g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.ellipse(ic[0] - irx * 0.32, ic[1] - iry * 0.38, irx * 0.24, iry * 0.17, -0.5, 0, PI * 2); g.fill();
    g.globalAlpha = 0.7; g.beginPath(); g.arc(ic[0] + irx * 0.34, ic[1] + iry * 0.38, irx * 0.1, 0, PI * 2); g.fill();
    g.globalAlpha = 0.9; g.beginPath(); g.arc(ic[0] - irx * 0.05, ic[1] - iry * 0.58, irx * 0.07, 0, PI * 2); g.fill(); g.globalAlpha = 1;
    g.restore();
    { const u = T(cx, ey - eh * 0.62), ug = g.createRadialGradient(u[0], u[1], 2, u[0], u[1], 60); ug.addColorStop(0, 'rgba(225,120,120,.2)'); ug.addColorStop(1, 'rgba(225,120,120,0)'); g.fillStyle = ug; g.beginPath(); g.ellipse(u[0], u[1], 66, 22, 0, 0, PI * 2); g.fill(); }
    // trait de paupière supérieure + aile
    g.fillStyle = css(o.lash);
    g.beginPath(); g.moveTo(I[0] - sd * 2, I[1] + 4);
    g.bezierCurveTo(I[0] + (top[0] - I[0]) * 0.35, top[1] - 7, top[0] + (O[0] - top[0]) * 0.55, top[1] - 11, O[0] + sd * 22, O[1] - 14 - tilt * 8);
    g.bezierCurveTo(top[0] + (O[0] - top[0]) * 0.6, top[1] + 8, I[0] + (top[0] - I[0]) * 0.4, top[1] + 7, I[0] - sd * 2, I[1] + 4);
    g.fill();
    // cils individuels
    g.strokeStyle = css(o.lash); g.lineWidth = 2.4;
    for (let i = 0; i < 7; i++) {
      const t = 0.45 + i * 0.08, x = lerp(top[0], O[0], t), y = lerp(top[1], O[1], t) - 4 * (1 - t);
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + sd * 6, y - 10, x + sd * (10 + i * 1.5), y - 12 - i); g.stroke();
    }
    // paupière inférieure
    g.globalAlpha = 0.65; g.lineWidth = 2.6; g.beginPath(); g.moveTo(O[0] - sd * 4, O[1] + 6); g.quadraticCurveTo(bot[0] + sd * 22, bot[1] + 5, bot[0] - sd * 16, bot[1] + 2); g.stroke();
    for (let i = 0; i < 3; i++) { const x = lerp(bot[0], O[0], 0.35 + i * 0.2), y = lerp(bot[1], O[1], 0.35 + i * 0.2) + 5; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + sd * 4, y + 7); g.stroke(); }
    g.globalAlpha = 0.45; g.strokeStyle = 'rgba(120,70,70,1)'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(I[0] + sd * 16, top[1] - 8); g.quadraticCurveTo(top[0], top[1] - 24, O[0] - sd * 6, O[1] - 26 - tilt * 6); g.stroke();
    g.globalAlpha = 1;
  }


  /* ---------- textures supplémentaires ---------- */
  function bandage(base) {
    const [c, g] = canvas(256, 256);
    g.fillStyle = css(base); g.fillRect(0, 0, 256, 256);
    for (let y = -40; y < 300; y += 26) { g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, y); g.lineTo(256, y + 22); g.stroke(); g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, y + 4); g.lineTo(256, y + 26); g.stroke(); }
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.05})`; g.fillRect(rnd() * 256, rnd() * 256, 2, 1); }
    return c;
  }
  function wood(base) {
    const [c, g] = canvas(128, 512);
    g.fillStyle = css(base); g.fillRect(0, 0, 128, 512);
    for (let i = 0; i < 40; i++) { const x = rnd() * 128; g.strokeStyle = `rgba(0,0,0,${0.08 + rnd() * 0.12})`; g.lineWidth = 1 + rnd() * 2; g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= 512; y += 32) g.lineTo(x + Math.sin(y * 0.02 + i) * 4, y); g.stroke(); }
    return c;
  }
  // emblèmes neutres par élément (aucun symbole religieux)
  function emblemEl(el, col, glow) {
    const [c, g] = canvas(512, 512); g.translate(256, 256);
    g.strokeStyle = css(col); g.fillStyle = css(col); g.lineCap = 'round'; g.lineJoin = 'round';
    g.shadowColor = css(glow); g.shadowBlur = 10;
    g.lineWidth = 10; g.beginPath(); g.arc(0, 0, 200, 0, PI * 2); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 176, 0, PI * 2); g.stroke();
    for (let i = 0; i < 12; i++) { g.save(); g.rotate(i * PI / 6); g.fillRect(-3, -196, 6, 18); g.restore(); }
    g.lineWidth = 7; g.beginPath(); g.arc(0, 0, 112, 0, PI * 2); g.stroke();
    for (let i = 0; i < 8; i++) { g.save(); g.rotate(i * PI / 4 + PI / 8); g.beginPath(); g.moveTo(-14, -122); g.lineTo(0, -166); g.lineTo(14, -122); g.closePath(); g.fill(); g.restore(); }
    g.lineWidth = 12;
    if (el === 'feu') { g.beginPath(); g.moveTo(0, -78); g.bezierCurveTo(48, -20, 46, 40, 0, 64); g.bezierCurveTo(-46, 40, -48, -20, 0, -78); g.fill(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.moveTo(0, -20); g.bezierCurveTo(22, 10, 20, 36, 0, 48); g.bezierCurveTo(-20, 36, -22, 10, 0, -20); g.fill(); }
    else if (el === 'eau') { [-30, 6, 42].forEach(y => { g.beginPath(); g.moveTo(-70, y); g.bezierCurveTo(-40, y - 26, -12, y - 26, 0, y); g.bezierCurveTo(12, y + 26, 40, y + 26, 70, y); g.stroke(); }); }
    else if (el === 'foudre') { g.beginPath(); g.moveTo(18, -82); g.lineTo(-34, 6); g.lineTo(2, 6); g.lineTo(-18, 82); g.lineTo(38, -12); g.lineTo(2, -12); g.closePath(); g.fill(); }
    else if (el === 'terre') { g.beginPath(); g.moveTo(-76, 56); g.lineTo(-20, -40); g.lineTo(10, 6); g.lineTo(32, -26); g.lineTo(78, 56); g.closePath(); g.fill(); }
    else if (el === 'ombre') { g.beginPath(); g.arc(0, 0, 70, 0, PI * 2); g.fill(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(28, -18, 62, 0, PI * 2); g.fill(); }
    else { for (let i = 0; i < 4; i++) { g.save(); g.rotate(i * PI / 2); g.beginPath(); g.moveTo(0, -84); g.lineTo(16, -16); g.lineTo(0, 0); g.lineTo(-16, -16); g.closePath(); g.fill(); g.restore(); } }
    return c;
  }
  function hornTex(base, tip) {
    const [c, g] = canvas(64, 256);
    const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, css(base)); gr.addColorStop(1, css(tip)); g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
    for (let y = 8; y < 200; y += 14) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, y, 64, 4); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, y + 4, 64, 2); }
    return c;
  }

  /* ---------- tête réaliste : crâne arrondi, mâchoire douce ---------- */
  function headShape(p) {
    let x = p[0] * 0.87, y = p[1], z = p[2] * 0.96;
    if (y < 0) {
      const t = Math.min(1, -y), hr = Math.hypot(p[0], p[2]), u = hr > 1e-4 ? p[2] / hr : 0;   // u : 1 devant, 0 côté, -1 derrière
      // mâchoire : sur les côtés et derrière, le bas du crâne remonte jusqu'à l'angle de la mâchoire (~ -0.6) ;
      // devant, la ligne descend en diagonale jusqu'au menton (~ -0.98)
      const t0 = 0.42, E = 0.18 + 0.9 * Math.pow(sst(-0.05, 0.97, u), 1.6);
      if (t > t0) { const d = t - t0; y = -(t0 + d / Math.cbrt(1 + Math.pow(d / E, 3))) * (y / -t); }
      const ty = Math.min(1, -y);
      x *= 1 - 0.14 * ty * ty;                                                           // léger affinement général
      x *= 1 - 0.34 * sst(0.55, 1, ty) * sst(0.1, 1, u);                                   // menton plus étroit que la mâchoire
      if (p[2] > 0) {
        x *= 1 + 0.02 * Math.exp(-Math.pow((ty - 0.35) / 0.2, 2)) * p[2];                 // pommettes
        const dh = Math.hypot((Math.abs(p[0]) - 0.46) / 0.16, (ty - 0.55) / 0.14);
        x *= 1 - 0.03 * Math.exp(-dh * dh);                                                 // joue légèrement creusée sous la pommette
      }
      if (z < 0) z *= 1 - 0.55 * t; else z *= 1 - 0.12 * ty * ty;
      z += 0.06 * sst(0.7, 1, ty) * Math.max(0, u) * Math.max(0, p[2]);                    // menton qui avance
      // dessous de la mâchoire bien net (le cou commence sous le menton, pas au milieu de la joue)
      if (u < 0.6) z -= 0.08 * sst(0.45, 0.65, ty) * sst(0.6, -0.2, u) * Math.max(0, 1 - Math.abs(p[0]) * 1.3);
    } else if (z < 0) z *= 1 + 0.06 * y;                                                // occiput
    if (p[2] > 0.2) {
      const dn = Math.hypot(p[0] / 0.1, (p[1] + 0.42) / 0.19);
      z += 0.07 * Math.exp(-dn * dn * 1.5) * sst(0.6, 0.95, p[2]);                      // nez
      const dr = Math.hypot(p[0] / 0.035, (p[1] + 0.3) / 0.2);
      z += 0.012 * Math.exp(-dr * dr) * sst(0.7, 0.95, p[2]);                            // arête du nez
      const db = Math.hypot((Math.abs(p[0]) - 0.32) / 0.25, (p[1] - 0.04) / 0.08);
      z += 0.016 * Math.exp(-db * db) * sst(0.5, 0.9, p[2]);                            // arcades
      const de = Math.hypot((Math.abs(p[0]) - 0.35) / 0.17, (p[1] + 0.15) / 0.1);
      z -= 0.018 * Math.exp(-de * de) * sst(0.5, 0.9, p[2]);                            // orbites
      const dc = Math.hypot((Math.abs(p[0]) - 0.46) / 0.2, (p[1] + 0.28) / 0.13);
      z += 0.014 * Math.exp(-dc * dc) * sst(0.3, 0.8, p[2]);                            // pommettes
      const dl = Math.hypot(p[0] / 0.15, (p[1] + 0.66) / 0.05);
      z += 0.012 * Math.exp(-dl * dl) * sst(0.6, 0.95, p[2]);                           // lèvres
      const ds = Math.hypot(p[0] / 0.16, (p[1] + 0.76) / 0.04);
      z -= 0.01 * Math.exp(-ds * ds) * sst(0.6, 0.95, p[2]);                            // creux sous la lèvre
    }
    return [x, y, z];
  }
  const dirOf = (ph, th) => [Math.sin(ph) * Math.sin(th), Math.cos(th), Math.cos(ph) * Math.sin(th)];
  const atH = (ph, th, r) => headShape(V.mul(dirOf(ph, th), r));
  let _headGeo = null, _faceGeo = null, _earGeo = null;
  const headGeo = () => _headGeo || (_headGeo = grid(64, 48, (u, v) => ({ p: atH((u - 0.5) * 2 * PI, v * PI, 1), uv: [u, v] })));
  const faceGeo = () => _faceGeo || (_faceGeo = grid(52, 44, (u, v) => { const p = atH((u - 0.5) * PI * 1.0, 0.25 * PI + v * 0.75 * PI, 1); return { p, uv: [0.5 + p[0] / 2.5, 0.5 - (p[1] + 0.1) / 2.5] }; }));
  const earGeo = () => _earGeo || (_earGeo = merge([G3.ellipsoid(0.12, 0.2, 0.06, 14, 12), at(G3.ellipsoid(0.07, 0.12, 0.03, 10, 8), [0.0, -0.01, 0.035])]));

  /* ---------- cheveux : mèches qui suivent le crâne puis tombent ---------- */
  function strand(o) {
    const pts = [], n = o.n || 10, a = o.a, b = o.b;
    for (let k = 0; k <= n; k++) { const t = k / n, d = V.norm(V.lerp(a, b, t)), r = o.r0 + (o.r1 - o.r0) * t + (o.bulge || 0) * Math.sin(PI * t); pts.push(headShape(V.mul(d, r))); }
    if (o.hang) {
      const last = pts[pts.length - 1], prev = pts[pts.length - 2];
      let d = V.norm(V.add(V.mul(V.norm(V.sub(last, prev)), o.keep == null ? 0.6 : o.keep), V.norm(o.hdir || [0, -1, 0])));
      let p = last; const m = o.hn || 8, bend = o.hbend || [0, -0.22, 0];
      for (let k = 1; k <= m; k++) { d = V.norm(V.add(d, bend)); p = V.add(p, V.mul(d, o.hang / m)); pts.push(p); }
    }
    const w = o.w || 0.3, flat = o.flat || 0.45, tip = o.tip == null ? 0.35 : o.tip;
    // racine affinée : le bout ouvert du tube reste sous la calotte (plus de « trous » sombres au sommet)
    const rt = o.root == null ? 0.12 : o.root;
    return tube(pts, t => { let k = t < 1 - tip ? 1 - 0.18 * t : Math.pow(Math.max(0, (1 - t) / tip), 0.85) * 0.82; if (rt > 0) k *= 0.3 + 0.7 * sst(0, rt, t); return [w * k + 0.005, w * flat * k + 0.005]; }, 8, o.up || V.norm(V.lerp(a, b, 0.5)));
  }
  // pointe (cheveux en épis)
  function spike(o) {
    const root = atH(o.ph, o.th, 0.9), nrm = V.norm(dirOf(o.ph, o.th));
    let dir = V.norm(V.add(V.mul(nrm, o.out), o.dir)); const pts = [root]; let p = root;
    for (let k = 0; k < 7; k++) { dir = V.norm(V.add(dir, [0, -(o.grav || 0), 0])); p = V.add(p, V.mul(dir, o.len / 7)); pts.push(p); }
    return tube(pts, t => { const k = t < 0.2 ? 0.45 + t * 2.75 : Math.pow(1 - (t - 0.2) / 0.8, 0.9); return [o.w * k + 0.005, o.w * o.flat * k + 0.005]; }, 8, nrm);
  }
  const capGeo = (hl, r) => grid(64, 30, (u, v) => { const ph = (u - 0.5) * 2 * PI; return { p: atH(ph, v * hl(Math.abs(ph)), r || 1.04), uv: [u * 3, 0.32 + v * 0.5] }; });
  const PAT = [0.2, 1, 0.55, 0.85, 0.3, 0.95, 0.5, 0.75, 0.25, 0.9, 0.6, 0.4];
  // renvoie { main: [géos], back: [géos] (balancement), extra: {...}, hl: ligne d'implantation }
  function hairSet(style, sd, f) {
    let s = sd * 7919 + 17; const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const L = [], B = [], deg = d => d * D, CW = dirOf(PI, deg(30));
    const bangs = (n, len, spread, r1, part, wm) => {
      for (let i = 0; i < n; i++) {
        const k = (i + 0.5) / n * 2 - 1, side = Math.abs(k), ph = deg(k * spread + (part || 0) + (R() - 0.5) * 5);
        const end = 70 + len * (12 + 22 * PAT[(i + sd) % PAT.length]) * (0.85 + side * 0.35) + (R() - 0.5) * 4;
        L.push(strand({ a: dirOf(ph * 0.35 + deg(part || 0) * 0.5, deg(14 + R() * 8)), b: dirOf(ph * (1.08 + R() * 0.12) + k * deg(4), deg(end)), r0: 1.035, r1: (r1 || 1.09) + 0.025 * (1 - side), bulge: 0.03, w: (0.22 + R() * 0.08 + side * 0.05) * (wm || 1), flat: 0.42, tip: 0.45 }));
      }
    };
    const frame = (hang, fwd, w) => [-1, 1].forEach(g => L.push(strand({ a: dirOf(g * deg(28), deg(22)), b: dirOf(g * deg(68), deg(100)), r0: 1.05, r1: 1.1, hang: hang + (g > 0 ? 0.08 : 0), hdir: [g * 0.06, -1, fwd], hbend: [0, -0.15, 0], w: w || 0.3, flat: 0.5, tip: 0.4 })));
    // couche depuis le sommet (épi) vers les côtés et l'arrière
    let lastCrown = null;
    const crown = (n, thEnd, hang, o) => {
      o = o || {};
      lastCrown = [thEnd, hang, o];
      for (let i = 0; i < n; i++) {
        const k = (i + 0.5 + (o.phase || 0)) / n, ph = deg(52 + k * 256) + (R() - 0.5) * 0.06, back = Math.max(0, -Math.cos(ph));
        const out = V.norm([Math.sin(ph), 0, Math.cos(ph)]);
        const hg = typeof hang === 'function' ? hang(ph, back) : hang;
        const ro = o.rOff || 0;
        const st = strand({ a: V.norm(V.lerp(CW, dirOf(ph, deg(40)), 0.2)), b: dirOf(ph, deg(thEnd + back * (o.backExtra || 10) + (R() - 0.5) * 6)), r0: 1.035 + ro, r1: 1.07 + ro, bulge: 0.07 + R() * 0.03,
          hang: hg, hdir: V.add([0, -1, 0], V.mul(out, o.flare == null ? 0.25 : o.flare)), hbend: V.add([0, -0.18, 0], V.mul(out, o.curl || 0)), w: (o.w || 0.42) + R() * 0.06, flat: 0.45, tip: o.tip || 0.35 });
        (o.toBack && back > 0.25 ? B : L).push(st);
      }
    };
    const nape = (n, th) => { for (let i = 0; i < n; i++) { const ph = PI + deg(-48 + i * (96 / Math.max(1, n - 1))); L.push(strand({ a: dirOf(ph, deg(98)), b: dirOf(ph + deg((R() - 0.5) * 6), deg(th + (i % 2) * 6 + R() * 4)), r0: 1.04, r1: 1.06, w: 0.22, flat: 0.45, tip: 0.55 })); } };
    const tufts = n => { for (let i = 0; i < n; i++) { const ph = deg(-40 + i * 80 / Math.max(1, n - 1) + (R() - 0.5) * 10); L.push(strand({ a: CW, b: dirOf(ph, deg(16 + R() * 10)), r0: 1.04, r1: 1.1, bulge: 0.16 + R() * 0.06, w: 0.36, flat: 0.5, tip: 0.5 })); } };
    let hl = a => 56 * D + Math.pow(a / PI, 1.1) * 66 * D;
    const extra = {};
    if (style === 'ponytail') {
      const tieD = dirOf(PI, deg(62));
      for (let i = 0; i < 15; i++) { const k = i / 14, ph = deg(-150 + k * 300) + (R() - 0.5) * 0.08, th = deg(26 + 22 * Math.pow(Math.abs(Math.sin(ph)), 1.5));
        L.push(strand({ a: dirOf(ph, th), b: V.norm(V.add(tieD, [(k - 0.5) * 0.25, (R() - 0.5) * 0.1, 0])), r0: 1.035, r1: 1.07, bulge: 0.06 + 0.04 * Math.sin(k * PI), w: 0.36, flat: 0.45, tip: 0.05 })); }
      for (let i = 0; i < 12; i++) { const k = i / 11, ph = deg(95 + k * 170); L.push(strand({ a: dirOf(ph, deg(112)), b: V.norm(V.add(tieD, [(k - 0.5) * 0.3, -0.05, 0])), r0: 1.04, r1: 1.07, bulge: 0.03, w: 0.42, flat: 0.45, tip: 0.05 })); }
      bangs(7, 0.85, 50, 1.1, -6); bangs(4, 0.5, 36, 1.13, -12); nape(7, 128);
      [-1, 1].forEach(g => L.push(strand({ a: dirOf(g * deg(28), deg(22)), b: dirOf(g * deg(66), deg(102)), r0: 1.05, r1: 1.1, hang: 0.75 + (g > 0 ? 0.1 : 0), hdir: [g * 0.05, -1, 0.35], w: 0.3, flat: 0.5, tip: 0.4 })));
      [-1, 1].forEach(g => L.push(strand({ a: dirOf(g * deg(60), deg(40)), b: dirOf(g * deg(82), deg(100)), r0: 1.05, r1: 1.09, hang: 0.3, hdir: [g * 0.2, -1, -0.1], w: 0.28, flat: 0.5, tip: 0.45 })));
      hl = a => 56 * D + Math.pow(a / PI, 1.1) * 74 * D;
      // queue de cheval (nœud séparé pour le balancement)
      let ss = 3 + sd; const RR = () => { ss = (ss * 16807) % 2147483647; return ss / 2147483647; };
      const tail = []; for (let i = 0; i < 16; i++) { const a = (i / 16) * PI * 2 + RR() * 0.3, r = i % 2 ? 0.1 : 0.16, L2 = (f ? 3.0 : 2.6) + RR() * 0.9, sx = Math.cos(a), sy = Math.sin(a);
        tail.push(tube([[sx * r * 0.6, sy * r * 0.5, 0.02], [sx * r * 1.6, 0.05 + sy * r * 1.2, -0.4], [sx * r * 2.0, -0.6 + sy * r, -0.75], [sx * r * 1.6 + sx * 0.08, -L2 * 0.6, -0.78 + sy * 0.1], [sx * r * 1.2 + sx * 0.22 * RR(), -L2, -0.6 + sy * 0.15]], t => [0.2 * (1 - t * 0.75) + 0.008, 0.12 * (1 - t * 0.7) + 0.008], 8, [sx, sy, 0])); }
      tail.push(at(G3.ellipsoid(0.2, 0.18, 0.16, 14, 10), [0, 0, 0.02]));   // nœud plein au centre de l'attache
      extra.tail = { pos: [0, 0.48, -1.0], rot: [0.5, 0, 0], geo: merge(tail), tie: at(G3.lathe([[0.17, 0.08], [0.2, 0], [0.17, -0.08]], 20), [0, 0, 0], [PI / 2, 0, 0]) };
    } else if (style === 'short') {
      bangs(7, 0.72, 52, 1.09, -8); frame(0.12, 0.25, 0.28);
      crown(16, 100, (ph, b) => 0.06 + b * 0.08, { flare: 0.5, w: 0.42, backExtra: 12 }); nape(6, 124); tufts(3);
    } else if (style === 'spiky') {
      bangs(6, 0.68, 50, 1.1, -4, 1.12); frame(0.1, 0.3, 0.3);
      crown(12, 98, 0.05, { flare: 0.6, w: 0.44 }); nape(5, 120);
      for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 7; i++) {
        const ph = deg(-140 + i * 46 + ring * 20 + (R() - 0.5) * 10), th = deg(30 + ring * 28 + R() * 6);
        const back = V.norm([Math.sin(ph) * 0.5, 0, -1]);
        L.push(spike({ ph, th, len: 0.55 + R() * 0.3 - ring * 0.08, w: 0.3, out: 0.55, dir: V.add(V.mul(back, 0.85), [0, ring === 0 ? 0.45 : 0.1, 0]), grav: 0.06, flat: 0.42 }));
      }
      for (let i = 0; i < 5; i++) { const ph = deg(-28 + i * 14 + (R() - 0.5) * 6); L.push(spike({ ph, th: deg(18 + R() * 6), len: 0.5 + R() * 0.2, w: 0.28, out: 0.5, dir: [Math.sin(ph) * 0.3, 0.5, 0.6], grav: 0.12, flat: 0.42 })); }
    } else if (style === 'bob') {
      bangs(10, 0.98, 58, 1.1, 0, 0.95); bangs(5, 0.7, 40, 1.13, 4);
      crown(18, 108, (ph, b) => 0.5 - b * 0.12, { flare: 0.12, curl: -0.07, w: 0.42, tip: 0.3 }); frame(0.6, 0.25, 0.32);
      hl = a => 56 * D + Math.pow(a / PI, 1.1) * 72 * D;
    } else if (style === 'long') {
      bangs(9, 0.95, 54, 1.1, -5); bangs(4, 0.62, 36, 1.13, -9);
      crown(18, 108, (ph, b) => 0.9 + b * (f ? 1.2 : 0.8) + R() * 0.3, { flare: 0.22, w: 0.46, tip: 0.3, toBack: true });
      [-1, 1].forEach(g => { for (let i = 0; i < 2; i++) L.push(strand({ a: dirOf(g * deg(34 + i * 14), deg(24)), b: dirOf(g * deg(70 + i * 12), deg(100)), r0: 1.05, r1: 1.1, hang: (f ? 1.35 : 1.0) + i * 0.15, hdir: [g * 0.12, -1, 0.42], hbend: [0, -0.12, 0.02], w: 0.32, flat: 0.5, tip: 0.35 })); });
      hl = a => 56 * D + Math.pow(a / PI, 1.1) * 72 * D;
    } else if (style === 'buns') {
      bangs(8, 0.82, 52, 1.1, -4); frame(0.5, 0.3, 0.28);
      crown(16, 106, 0.1, { flare: 0.25, w: 0.42 }); nape(6, 124);
      const buns = [];
      [-1, 1].forEach(g => {
        const c = V.mul(dirOf(g * deg(55), deg(36)), 1.12), nrm = V.norm(c), pts = [];
        const t1 = V.norm(V.cross(nrm, [0, 0, 1])), t2 = V.cross(nrm, t1);
        for (let k = 0; k <= 60; k++) { const t = k / 60, a = t * PI * 6, rr = 0.3 * Math.sin(PI * (0.08 + t * 0.84)) + 0.04, h = (t - 0.5) * 0.32; pts.push(V.add(V.add(c, V.mul(nrm, h * 0.9 + 0.08)), V.add(V.mul(t1, Math.cos(a) * rr), V.mul(t2, Math.sin(a) * rr)))); }
        buns.push(tube(pts, t => [0.13, 0.085], 8, nrm));
        buns.push(at(G3.ellipsoid(0.27, 0.27, 0.27, 16, 12), V.add(c, V.mul(nrm, 0.06))));
        for (let i = 0; i < 2; i++) buns.push(strand({ a: dirOf(g * deg(58 + i * 8), deg(48)), b: dirOf(g * deg(80 + i * 6), deg(70)), r0: 1.2, r1: 1.15, hang: 0.7 + i * 0.25, hdir: [g * 0.3, -1, -0.2], w: 0.24, flat: 0.5, tip: 0.4 }));
      });
      extra.buns = merge(buns);
    } else if (style === 'hood') {
      bangs(7, 0.85, 50, 1.08, -6); frame(0.65, 0.35, 0.3);
      [-1, 1].forEach(g => { for (let i = 0; i < 2; i++) L.push(strand({ a: dirOf(g * deg(80 + i * 12), deg(50)), b: dirOf(g * deg(92 + i * 10), deg(104)), r0: 1.05, r1: 1.1, hang: 0.35 + i * 0.12, hdir: [g * 0.2, -1, 0.15], w: 0.3, flat: 0.5, tip: 0.4 })); });
    }
    /* ---- détails : mèches fines par-dessus, épi rebelle (ahoge), mèches folles ---- */
    if (style !== 'hood') {
      // fines mèches de frange, entre les grosses : séparation plus naturelle
      const nb = style === 'spiky' ? 4 : 6, shortB = style === 'short' || style === 'spiky';
      for (let i = 0; i < nb; i++) {
        const k = ((i + 0.2 + R() * 0.6) / nb) * 2 - 1, side = Math.abs(k), ph = deg(k * 46 + (R() - 0.5) * 6 - 4);
        const end = 74 + (shortB ? 12 : 20) * (0.7 + R() * 0.6) * (0.9 + side * 0.5);
        L.push(strand({ a: dirOf(ph * 0.4, deg(16 + R() * 8)), b: dirOf(ph * 1.12, deg(end)), r0: 1.05, r1: 1.115 + 0.02 * (1 - side), bulge: 0.04, w: 0.1 + R() * 0.05, flat: 0.55, tip: 0.6 }));
      }
      // couche fine sur le dessus et l'arrière (décalée d'une demi-mèche)
      if (lastCrown) { const [te, hg, o] = lastCrown; crown(style === 'long' ? 12 : 10, te - 4, hg, Object.assign({}, o, { w: 0.17, rOff: 0.03, tip: 0.55, phase: 0.5 })); }
      if (style === 'ponytail') {
        const tieD = dirOf(PI, deg(62));
        for (let i = 0; i < 9; i++) { const k = (i + 0.5) / 9, ph = deg(-140 + k * 280), th = deg(28 + 20 * Math.pow(Math.abs(Math.sin(ph)), 1.5));
          L.push(strand({ a: dirOf(ph, th), b: V.norm(V.add(tieD, [(k - 0.5) * 0.2, 0, 0])), r0: 1.06, r1: 1.09, bulge: 0.07 + 0.04 * Math.sin(k * PI), w: 0.15, flat: 0.5, tip: 0.05 })); }
      }
      // mèches folles aux tempes
      [-1, 1].forEach(g => { if (R() < 0.75) L.push(strand({ a: dirOf(g * deg(36 + R() * 8), deg(28)), b: dirOf(g * deg(72 + R() * 6), deg(94)), r0: 1.07, r1: 1.13, hang: 0.18 + R() * 0.25, hdir: [g * 0.35, -1, 0.3], hbend: [g * 0.05, -0.1, 0], w: 0.075, flat: 0.6, tip: 0.7 })); });
      // épi rebelle sur le dessus (un héros sur deux, toujours le même)
      if (style !== 'buns' && R() < 0.55) {
        const ph0 = deg((R() - 0.5) * 34), base = atH(ph0, deg(10 + R() * 8), 1.05), up = V.norm(dirOf(ph0, deg(6)));
        const fw = V.norm([Math.sin(ph0) * 0.4, 0, 1]), h = 0.3 + R() * 0.14, pts = [];
        for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push(V.add(base, V.add(V.mul(up, h * Math.sin(t * PI * 0.78)), V.mul(fw, 0.26 * (1 - Math.cos(t * PI * 0.62)))))); }
        L.push(tube(pts, t => { const k = t < 0.25 ? 1 : Math.pow(Math.max(0, 1 - (t - 0.25) / 0.75), 0.9); return [0.1 * k + 0.006, 0.05 * k + 0.004]; }, 8, [1, 0, 0]));
      }
    }
    return { main: L, back: B, extra, hl };
  }
  // capuche (tissu, ouverture sur le visage, tombe sur les épaules)
  function hoodGeo() {
    // capuche en tissu : ouverture arrondie qui épouse le visage, plis, pointe à l'arrière, tombe sur la nuque et les épaules
    const thA = 0.6, thEnd = 2.62, phO = th => 0.9 * sst(thA - 0.04, thA + 0.48, th) + 0.85 * sst(1.85, thEnd, th);
    const P = (ph, th, e, dr) => {
      const back = Math.max(0, -Math.cos(ph)), side = Math.abs(Math.sin(ph));
      let r = 1.27 + 0.1 * sst(1.6, 2.4, th) + (dr || 0);
      r += 0.3 * sst(2.0, thEnd, th) * (0.45 + 0.55 * back);                                         // le tissu s'évase sur la nuque
      r += (0.04 * Math.sin(ph * 7 + th * 2.2) + 0.022 * Math.sin(ph * 12.5 - th * 3.1 + 1)) * sst(0.6, 1.5, th) * (0.3 + back);   // plis
      r -= 0.15 * e * (0.3 + 0.7 * sst(thA + 0.2, thA + 0.65, th));                                                                                    // le bord se resserre autour du visage
      const p = V.mul(dirOf(ph, th), r);
      if (p[1] > 0.2 && p[2] < 0) p[2] -= 0.26 * sst(0.2, 1.1, p[1]) * sst(0, -1, p[2]);               // pointe à l'arrière
      return headShape(p);
    };
    const edge = (u, th) => Math.max(sst(0.1, 0, u), sst(0.9, 1, u)) * sst(thA - 0.3, thA, th) * (1 - 0.6 * sst(1.9, thEnd, th));
    const shell = grid(64, 34, (u, v) => { const th = v * thEnd, o = phO(th), ph = o + u * (2 * PI - 2 * o); return { p: P(ph, th, edge(u, th)), uv: [u * 2, v] }; });
    // ourlet roulé tout autour de l'ouverture
    const hem = [];
    for (let k = 0; k <= 60; k++) { const sg = k / 30 - 1, th = thA - 0.04 + (thEnd - thA + 0.04) * Math.pow(Math.abs(sg), 1.1); hem.push(P(sg < 0 ? -phO(th) : phO(th), th, edge(0, th), 0.01)); }
    return { shell, hem: tube(hem, () => [0.07, 0.05], 8) };
  }

  /* ---------- accessoires de tête (unités de tête) ---------- */
  function accessory(a, P, push) {
    if (a === 'flower') {
      const n = { name: 'acc', pos: V.mul(dirOf(-1.15, 1.05), 1.14), rot: [0, -1.15, 1.35] };
      for (let i = 0; i < 6; i++) { const r = i / 6 * PI * 2; push(n, 'petal', at(G3.ellipsoid(0.2, 0.045, 0.11, 12, 8), [Math.cos(r) * 0.17, 0.02, Math.sin(r) * 0.17], [0, -r, 0.3])); }
      push(n, 'petalC', at(G3.ellipsoid(0.08, 0.06, 0.08, 10, 8), [0, 0.05, 0]));
      [-0.5, 0.9].forEach(r => push(n, 'leaf', at(G3.ellipsoid(0.2, 0.02, 0.08, 10, 6), [Math.cos(r) * 0.32, -0.03, Math.sin(r) * 0.32], [0, -r, 0.15])));
    } else if (a === 'ears') {
      [-1, 1].forEach(g => {
        const n = { name: 'acc', pos: V.mul(dirOf(g * 0.72, 0.52), 1.02), rot: [-0.15, 0, -g * 0.42] };
        push(n, 'hair', G3.lathe([[0.0, 0.62], [0.08, 0.5], [0.2, 0.28], [0.27, 0.08], [0.25, 0.0]], 18, { sz: 0.45 }));
        push(n, 'earIn', at(G3.lathe([[0.0, 0.52], [0.06, 0.42], [0.15, 0.24], [0.19, 0.06]], 14, { sz: 0.2 }), [0, 0.02, 0.06]));
      });
    } else if (a === 'horns') {
      [-1, 1].forEach(g => {
        const n = { name: 'acc', pos: V.mul(dirOf(g * 0.55, 0.5), 0.98), rot: [0, 0, 0] };
        const pts = [[0, 0, 0], [g * 0.1, 0.22, -0.04], [g * 0.24, 0.44, -0.18], [g * 0.42, 0.56, -0.38], [g * 0.58, 0.56, -0.58]];
        push(n, 'horn', tube(pts, t => { const k = (1 - t * 0.92) * (1 + 0.06 * Math.sin(t * 40)); return [0.13 * k + 0.01, 0.12 * k + 0.01]; }, 10));
      });
    } else if (a === 'crown') {
      const n = { name: 'acc', pos: [0, 0.62, 0.05], rot: [0.18, 0, 0] };
      push(n, 'gold', G3.lathe([[0.74, 0.04], [0.76, 0.0], [0.74, -0.04]], 40, { sx: 1.0, sz: 1.08 }));
      for (let i = -2; i <= 2; i++) { const r = i * 0.32, h = i === 0 ? 0.32 : 0.2 - Math.abs(i) * 0.03; push(n, 'gold', at(G3.lathe([[0.0, h], [0.05, h * 0.5], [0.06, 0]], 8, { sz: 0.4 }), [Math.sin(r) * 0.76, 0.02, Math.cos(r) * 0.8], [0, r, 0])); }
      push(n, 'gem', at(G3.ellipsoid(0.07, 0.09, 0.04, 12, 10), [0, 0.06, 0.84]));
    } else if (a === 'glasses') {
      const n = { name: 'acc', pos: [0, 0, 0], rot: [0, 0, 0] };
      [-1, 1].forEach(g => {
        const c = [g * 0.35, -0.14, 0.94];
        push(n, 'frame', tube(Array.from({ length: 25 }, (_, i) => V.add(c, [Math.cos(i / 24 * PI * 2) * 0.18, Math.sin(i / 24 * PI * 2) * 0.13, 0])), () => [0.016, 0.016], 5));
        push(n, 'lens', at(G3.ellipsoid(0.18, 0.13, 0.01, 16, 6), c));
        push(n, 'frame', tube([V.add(c, [g * 0.18, 0.02, 0]), [g * 0.8, -0.05, 0.45], [g * 0.86, -0.08, -0.05]], () => [0.014, 0.014], 5));
      });
      push(n, 'frame', tube([[-0.17, -0.1, 0.98], [0, -0.06, 1.03], [0.17, -0.1, 0.98]], () => [0.014, 0.014], 5));
    } else if (a === 'mask') {
      const n = { name: 'acc', pos: [0, 0, 0], rot: [0, 0, 0] };
      push(n, 'mask', grid(30, 12, (u, v) => ({ p: atH((u - 0.5) * PI * 1.25, (0.6 + v * 0.38) * PI, 1.05 + 0.03 * Math.sin(v * PI)), uv: [u, v] })));
    } else if (a === 'halo') {
      const n = { name: 'acc', pos: [0, 1.38, -0.12], rot: [0.28, 0, 0] };
      push(n, 'halo', tube(Array.from({ length: 41 }, (_, i) => [Math.cos(i / 40 * PI * 2) * 0.62, 0, Math.sin(i / 40 * PI * 2) * 0.62]), () => [0.045, 0.02], 6));
    } else if (a === 'band') {
      const n = { name: 'acc', pos: [0, 0.02, 0], rot: [0.22, 0, 0] };
      push(n, 'band', grid(56, 4, (u, v) => { const ph = (u - 0.5) * 2 * PI, y = 0.42 - v * 0.17; const d = V.norm([Math.sin(ph), y * 0.9, Math.cos(ph)]); const p = headShape(d); const r = Math.hypot(p[0], p[2]), k = (r + 0.11) / r; return { p: [p[0] * k, y + 0.04, p[2] * k], uv: [u * 6, v] }; }));
      push(n, 'band', at(G3.ellipsoid(0.12, 0.1, 0.08, 12, 10), [0, 0.38, -0.98]));
      [-1, 1].forEach(g => push(n, 'band', tube([[g * 0.04, 0.36, -1.0], [g * 0.2, 0.18, -1.25], [g * 0.3, -0.25, -1.45], [g * 0.26, -0.75, -1.55], [g * 0.34, -1.1, -1.5]], t => [0.13 * (1 - t * 0.25), 0.012], 6, [0, 0, 1])));
    }
  }

  /* ---------- mains ---------- */
  function hand(curl, thumbIn) {
    const parts = [at(rbox(0.04, 0.045, 0.016, 0.45, 16, 12), [0, -0.045, 0])];
    const fx = [-0.027, -0.009, 0.009, 0.027], fl = [[0.026, 0.02, 0.017], [0.03, 0.022, 0.018], [0.029, 0.021, 0.017], [0.022, 0.016, 0.014]];
    fx.forEach((x, i) => {
      let p = [x, -0.088, 0.002], ang = 0; const pts = [p];
      fl[i].forEach((l, k) => { ang += curl * (k === 0 ? 0.9 : 1.1); p = V.add(p, [0, -Math.cos(ang) * l, Math.sin(ang) * l]); pts.push(p); });
      parts.push(tube(pts, t => [0.0105 - t * 0.002, 0.0095 - t * 0.002], 8, [0, 0, 1]));
      parts.push(at(G3.ellipsoid(0.0095, 0.0095, 0.0095, 8, 6), pts[pts.length - 1]));
    });
    const tb = [[-0.04, -0.03, 0.012], [-0.052, -0.055, 0.025 + thumbIn * 0.01], [-0.05 + thumbIn * 0.02, -0.075, 0.04 + thumbIn * 0.012]];
    parts.push(tube(tb, t => [0.013 - t * 0.003, 0.012 - t * 0.003], 8, [0, 0, 1]));
    parts.push(at(G3.ellipsoid(0.011, 0.011, 0.011, 8, 6), tb[2]));
    return merge(parts);
  }

  /* ---------- corps et tenues (structure partagée entre héros) ---------- */
  const UA = 0.28, FA = 0.26, TH = 0.43, SH = 0.43;
  const TRM = [[0.42, 0.055, 0.05, 0.055], [0.36, 0.165, 0.09, 0.1], [0.31, 0.2, 0.115, 0.11], [0.24, 0.19, 0.13, 0.11], [0.16, 0.17, 0.12, 0.105], [0.08, 0.15, 0.105, 0.1], [0.0, 0.145, 0.1, 0.1], [-0.04, 0.145, 0.1, 0.1]];
  const TRF = [[0.42, 0.05, 0.045, 0.05], [0.36, 0.14, 0.08, 0.09], [0.31, 0.165, 0.108, 0.1], [0.24, 0.158, 0.13, 0.1], [0.16, 0.128, 0.105, 0.092], [0.08, 0.115, 0.09, 0.088], [0.0, 0.138, 0.098, 0.1], [-0.04, 0.15, 0.1, 0.105]];
  const grow = (rows, g) => rows.map(r => [r[0], r[1] + g, r[2] + g, r[3] + g, r[4] || 0]);
  // grille qui épouse le torse entre deux angles (ph0..ph1) et deux hauteurs (t0..t1 du profil)
  function onTorso(rows, g, ph0, ph1, t0, t1, nu, nv, uvSwap) {
    const pf = prof(rows);
    return grid(nu || 8, nv || 12, (u, v) => {
      const r = pf(lerp(t0, t1, v)), ph = typeof ph0 === 'function' ? lerp(ph0(v), ph1(v), u) : lerp(ph0, ph1, u), sn = Math.sin(ph), cs = Math.cos(ph);
      return { p: [sn * (r.rx + g), r.y, r.cz + cs * ((cs > 0 ? r.rzf : r.rzb) + g)], uv: uvSwap ? [v, u] : [u, v] };
    });
  }
  // pans (manteau, robe, jupe d'armure) : 4 panneaux qui suivent les cuisses
  function skirt(N, put, slot, len, o) {
    o = o || {};
    const rt = o.rt || [0.175, 0.13], fl = o.flare == null ? 0.085 : o.flare, y0 = o.y0 == null ? 0.03 : o.y0, g = o.grow || 0, fo = o.folds == null ? 0.018 : o.folds;
    [['tFL', 0.1 - (o.overlap || 0), 1.3], ['tFR', -1.3, -0.1 + (o.overlap || 0)], ['tBL', 1.3, 2.6], ['tBR', -2.6, -1.3]].forEach(([name, a0, a1], i) => {
      N(name, 'hips', [0, -0.02, 0]);
      const top = [], bot = [], dz = (i === 0 ? 0.002 : 0);
      for (let k = 0; k <= 6; k++) { const a = a0 + (a1 - a0) * k / 6; top.push([Math.sin(a) * (rt[0] + g + dz), y0, Math.cos(a) * (rt[1] + g + dz)]); bot.push([Math.sin(a) * (rt[0] + fl + g + dz), y0 - len, Math.cos(a) * (rt[1] + fl * 0.85 + g + dz)]); }
      put(name, slot, panel(top, bot, 14, Math.max(8, Math.round(len * 22)), fo));
    });
  }
  function pauldron(N, put, side, name) {
    N(name, side > 0 ? 'shL' : 'shR', [side * 0.012, 0.025, 0], [0, 0, -side * 0.32]);
    const shell = (rx, ry, rz) => grid(22, 9, (u, v) => { const ph = (u - 0.5) * 2 * PI, th = v * 1.72; return { p: [Math.sin(ph) * Math.sin(th) * rx, Math.cos(th) * ry, Math.cos(ph) * Math.sin(th) * rz], uv: [u, v] }; });
    [0, 1, 2].forEach(k => {
      put(name, 'steel', at(shell(0.082 + k * 0.009, 0.05, 0.088 + k * 0.008), [side * (0.004 + k * 0.012), -k * 0.032, 0]));
      put(name, 'gold', at(G3.lathe([[0.083 + k * 0.009, 0.004], [0.086 + k * 0.009, 0], [0.083 + k * 0.009, -0.004]], 28, { sz: (0.088 + k * 0.008) / (0.083 + k * 0.009) }), [side * (0.004 + k * 0.012), -k * 0.032 - 0.05 * Math.cos(1.72) + 0.002, 0]));
      [-0.5, 0, 0.5].forEach(a => put(name, 'gold', at(G3.ellipsoid(0.0065, 0.0065, 0.0065, 8, 6), [side * (0.004 + k * 0.012 + Math.sin(PI / 2 + a) * (0.08 + k * 0.009)), -k * 0.032 + 0.006, Math.cos(PI / 2 + a) * (0.085 + k * 0.008)])));
    });
  }
  function bodyParts(N, put, k) {
    const f = k.body === 'f', TR = f ? TRF : TRM, o = k.outfit, sc = f ? 0.9 : 1;
    // squelette (mêmes noms que le jeu)
    N('root', null); N('hips', 'root', [0, 0.95, 0]); N('spine', 'hips', [0, 0.06, 0]); N('chest', 'spine', [0, 0, 0]);
    N('neck', 'chest', [0, 0.39, 0]); N('head', 'neck', [0, 0.13, 0.01]);
    const sw = f ? 0.18 : 0.215;
    N('shL', 'chest', [sw, 0.33, -0.01]); N('shR', 'chest', [-sw, 0.33, -0.01]);
    N('elL', 'shL', [0, -UA, 0]); N('elR', 'shR', [0, -UA, 0]); N('haL', 'elL', [0, -FA, 0]); N('haR', 'elR', [0, -FA, 0]);
    N('thL', 'hips', [0.095, -0.06, 0]); N('thR', 'hips', [-0.095, -0.06, 0]);
    N('knL', 'thL', [0, -TH, 0]); N('knR', 'thR', [0, -TH, 0]); N('ftL', 'knL', [0, -SH, 0]); N('ftR', 'knR', [0, -SH, 0]);
    const both = (a, b, fn) => { fn(a); fn(b); };
    // base : cou, maillot, bassin
    put('neck', 'neck', limb([[0.12, 0.042 * sc], [0.06, 0.046 * sc], [0.0, 0.052 * sc]], 16, 8));
    put('chest', 'shirt', loft(TR, 28, 20));
    put('hips', 'pants', loft([[0.06, 0.145, 0.1, 0.105], [0.0, f ? 0.17 : 0.155, 0.105, 0.12], [-0.07, f ? 0.165 : 0.15, 0.1, 0.115], [-0.12, 0.09, 0.07, 0.08], [-0.14, 0.02, 0.02, 0.02]], 26, 12));
    // bras
    const bare = k.sleeves === 'none' && o === 'gi';
    const ua = limb([[0.075, 0.012], [0.06, 0.04], [0.035, 0.06], [0.0, 0.064], [-0.06, 0.06], [-0.14, 0.053], [-0.24, 0.048], [-UA, 0.047]].map(r => [r[0], r[1] * sc]), 20, 18);
    const fa = limb([[0.03, 0.044], [0.0, 0.05], [-0.06, 0.05, 0.92], [-0.16, 0.044, 0.88], [-FA + 0.03, 0.04, 0.85], [-FA + 0.01, 0.038, 0.85]].map(r => [r[0], r[1] * sc, r[2]]), 18, 14);
    const uaS = limb([[0.07, 0.01], [0.055, 0.035], [0.03, 0.052], [0.0, 0.056], [-0.07, 0.052], [-0.15, 0.045], [-0.24, 0.04], [-UA, 0.039]].map(r => [r[0], r[1] * sc]), 20, 18);
    const faS = limb([[0.02, 0.04], [-0.05, 0.044, 0.92], [-0.15, 0.038, 0.86], [-FA + 0.03, 0.031, 0.8], [-FA, 0.03, 0.8]].map(r => [r[0], r[1] * sc, r[2]]), 18, 14);
    both('shL', 'shR', n => put(n, bare ? 'skin' : 'sleeve', bare ? uaS : ua));
    both('elL', 'elR', n => { put(n, bare ? 'skin' : 'sleeve', G3.ellipsoid(0.047 * sc, 0.047 * sc, 0.047 * sc, 12, 10)); put(n, bare ? 'skin' : 'sleeveF', bare ? faS : fa); });
    // mains
    const fist = !k.weapon;
    const hs = o === 'gi' && k.gloves ? 'wrap' : (k.gloves ? 'glove' : 'skin');
    put('haR', hs, at(hand(fist ? 1.5 : 1.35, 1), [0, 0, 0], [0, 0, 0], sc > 0.95 ? 1 : 0.94));
    put('haL', hs, at(hand(fist ? 1.45 : 0.75, fist ? 1 : 0.3), [0, 0, 0], [0, 0, 0], sc > 0.95 ? 1 : 0.94));
    // jambes
    const th = limb([[0.0, f ? 0.097 : 0.092], [-0.1, f ? 0.09 : 0.088], [-0.3, 0.07], [-TH + 0.02, 0.06], [-TH, 0.058]], 20, 14);
    const sh = limb([[0.0, 0.058], [-0.1, 0.062], [-0.25, 0.05], [-SH + 0.04, 0.042], [-SH, 0.04]], 18, 14);
    both('thL', 'thR', n => put(n, 'pants', o === 'gi' ? limb([[0.0, 0.1], [-0.12, 0.1], [-0.3, 0.088], [-TH, 0.07]], 20, 12) : th));
    both('knL', 'knR', n => { put(n, 'pants', G3.ellipsoid(0.06, 0.06, 0.06, 12, 10)); put(n, 'pants', sh); });
    // bottes (ou bandes + sandales pour le gi)
    if (o === 'gi') {
      both('knL', 'knR', n => { put(n, 'wrap', limb([[-0.04, 0.066], [-0.12, 0.066], [-0.28, 0.054], [-SH + 0.02, 0.046], [-SH - 0.01, 0.048]], 18, 10, 0.003)); });
      both('ftL', 'ftR', n => { put(n, 'boot', loft([[0.0, 0.05, 0.048, 0.048, 0.0], [-0.03, 0.054, 0.07, 0.048, 0.02], [-0.055, 0.05, 0.125, 0.052, 0.03], [-0.068, 0.048, 0.13, 0.052, 0.03]], 18, 8)); put(n, 'sole', at(rbox(0.054, 0.01, 0.12, 0.3, 14, 8), [0, -0.074, 0.035])); });
    } else {
      const tall = o !== 'robe';
      both('knL', 'knR', n => {
        put(n, 'boot', limb(tall ? [[-0.08, 0.066], [-0.1, 0.07], [-0.25, 0.058], [-SH + 0.03, 0.054], [-SH - 0.01, 0.056]] : [[-0.3, 0.05], [-SH + 0.03, 0.054], [-SH - 0.01, 0.056]], 20, 12, 0.004));
        if (tall) { put(n, 'boot', limb([[-0.06, 0.074], [-0.085, 0.078], [-0.1, 0.072]], 20, 4)); [-0.2, -0.32].forEach(y => { put(n, 'leather', limb([[y + 0.008, 0.064], [y - 0.008, 0.064]], 18, 2)); put(n, 'gold', at(rbox(0.016, 0.014, 0.006, 0.4, 10, 8), [0.045, y, 0.04], [0, 0.85, 0])); }); }
      });
      both('ftL', 'ftR', n => { put(n, 'boot', loft([[0.0, 0.055, 0.05, 0.05, 0.0], [-0.03, 0.058, 0.075, 0.05, 0.02], [-0.055, 0.052, 0.13, 0.055, 0.03], [-0.07, 0.05, 0.135, 0.055, 0.03]], 20, 10)); put(n, 'sole', at(rbox(0.056, 0.012, 0.125, 0.3, 16, 8), [0, -0.075, 0.035])); });
    }
    const belt = (slot, y0, y1, gr) => put('hips', slot, loft([[y0, 0.158 + gr, 0.113 + gr, 0.118 + gr], [y1, 0.162 + gr, 0.117 + gr, 0.122 + gr]], 30, 3));
    const pf = prof(TR.slice(1));
    /* --- manteau long --- */
    if (o === 'coat') {
      const cg = 0.022;
      put('chest', 'main', loft(grow(TR.slice(1), cg), 30, 18, { open: [0.42, 0.62] }));
      put('chest', 'mainT', loft([[0.47, 0.07, 0.068, 0.072], [0.42, 0.075, 0.07, 0.078], [0.38, 0.1, 0.09, 0.1]], 24, 6, { open: [0.35, 0.5] }));
      [-1, 1].forEach(s => put('chest', 'lining', grid(4, 16, (u, v) => {
        const vv = v * 0.82, r = pf(vv), oo = lerp(0.42, 0.62, vv), w = lerp(0.55, 0.06, Math.pow(v, 0.7)), ph = s > 0 ? oo + u * w : PI * 2 - oo - (1 - u) * w;
        const sn = Math.sin(ph), cs = Math.cos(ph), rz = (cs > 0 ? r.rzf : r.rzb) + cg + 0.007;
        return { p: [sn * (r.rx + cg + 0.007), r.y, cs * rz], uv: [u, v] };
      })));
      [0.3, 0.24, 0.18, 0.12].forEach(y => put('chest', 'gold', at(rbox(0.016, 0.007, 0.006, 0.4, 10, 6), [0, y, pf((0.36 - y) / 0.4).rzf + 0.004])));
      put('chest', 'emblem', onTorso(TR.slice(1), cg + 0.003, PI - 0.575, PI + 0.575, 0.08, 0.5, 14, 14));
      both('elL', 'elR', n => { put(n, 'mainT', limb([[-0.15, 0.052], [-0.2, 0.056], [-0.23, 0.054]], 18, 4)); put(n, 'leather', limb([[-0.06, 0.05, 0.9], [-0.12, 0.052, 0.9], [-0.15, 0.05, 0.9]], 16, 6)); [-0.08, -0.125].forEach(y => put(n, 'gold', limb([[y + 0.006, 0.054, 0.92], [y - 0.006, 0.054, 0.92]], 16, 2))); });
      skirt(N, put, 'mainT', 0.62);
      pauldron(N, put, 1, 'padL');
      belt('leather', 0.075, 0.03, 0);
    }
    /* --- tenue d'arts martiaux --- */
    if (o === 'gi') {
      const g = 0.016, ov = v => 0.52 * Math.max(0, 1 - v / 0.6);
      put('chest', 'main', grid(30, 18, (u, v) => { const r = pf(v), oo = ov(v), ph = oo + u * (PI * 2 - 2 * oo), sn = Math.sin(ph), cs = Math.cos(ph); return { p: [sn * (r.rx + g), r.y, cs * ((cs > 0 ? r.rzf : r.rzb) + g)], uv: [u, v] }; }));
      [-1, 1].forEach(s => put('chest', 'secT', onTorso(TR.slice(1), g + 0.005, v => s > 0 ? ov(v) : -ov(v) - 0.2 * (1 - v * 0.7), v => s > 0 ? ov(v) + 0.2 * (1 - v * 0.7) : -ov(v), 0, 0.62, 3, 14, true)));
      put('chest', 'secT', loft([[0.43, 0.066, 0.062, 0.068], [0.38, 0.09, 0.085, 0.095]], 24, 4, { open: [0.5, 0.6] }));
      if (bare) both('shL', 'shR', n => put(n, 'secT', limb([[0.06, 0.05], [0.0, 0.064], [-0.04, 0.062]], 18, 4)));
      else both('elL', 'elR', n => { put(n, 'secT', loft([[-0.07, 0.056, 0.056, 0.056], [-0.11, 0.07, 0.07, 0.07], [-0.13, 0.072, 0.072, 0.072]], 20, 4)); });
      both('elL', 'elR', n => put(n, 'wrap', limb([[-0.12, 0.044], [-0.2, 0.039], [-FA + 0.01, 0.035]], 16, 6, 0.004)));
      put('hips', 'accent', loft([[0.12, 0.165, 0.12, 0.125], [0.03, 0.17, 0.125, 0.13]], 30, 4));
      put('hips', 'accent', at(rbox(0.04, 0.03, 0.025, 0.4, 12, 10), [0.05, 0.075, 0.13], [0, 0.4, 0.2]));
      [0, 1].forEach(i => put('hips', 'accent', tube([[0.05 + i * 0.02, 0.06, 0.14], [0.07 + i * 0.03, -0.06, 0.15], [0.06 + i * 0.05, -0.22 - i * 0.04, 0.14]], t => [0.03 * (1 - t * 0.25), 0.007], 6, [0, 0, 1])));
    }
    /* --- armure de défenseur --- */
    if (o === 'armor') {
      put('chest', 'main', loft(grow(TR.slice(1), 0.014), 30, 16));
      put('chest', 'steel', loft(grow([[0.39, 0.15, 0.085, 0.095], [0.36, 0.175, 0.1, 0.105], [0.31, 0.205, 0.125, 0.115], [0.24, 0.195, 0.14, 0.115], [0.16, 0.175, 0.128, 0.11], [0.1, 0.16, 0.115, 0.105]], 0.034), 30, 12));
      [[0.39, 0.385], [0.1, 0.095]].forEach(([a, b], i) => { const r = i ? [0.16, 0.115, 0.105] : [0.15, 0.085, 0.095]; put('chest', 'gold', loft([[a + 0.008, r[0] + 0.036, r[1] + 0.036, r[2] + 0.036], [b - 0.008, r[0] + 0.038, r[1] + 0.038, r[2] + 0.038]], 30, 2)); });
      put('chest', 'steel', tube([[0, 0.38, 0.122], [0, 0.31, 0.162], [0, 0.24, 0.177], [0, 0.16, 0.165], [0, 0.1, 0.152]], () => [0.012, 0.01], 6));
      [0.07, 0.03, -0.01].forEach((y, i) => put('chest', 'steel', loft([[y + 0.024, 0.16 - i * 0.004, 0.122, 0.118], [y - 0.018, 0.165 - i * 0.004, 0.128, 0.122]], 28, 3)));
      put('chest', 'steel', loft([[0.47, 0.072, 0.07, 0.074], [0.42, 0.085, 0.08, 0.088], [0.39, 0.12, 0.1, 0.11]], 24, 4));
      // médaillon élémentaire au centre du plastron
      put('chest', 'gold', at(G3.lathe([[0.0, 0.006], [0.03, 0.006], [0.036, 0.0], [0.03, -0.004], [0.0, -0.004]], 24), [0, 0.275, 0.183], [PI / 2 - 0.25, 0, 0]));
      put('chest', 'gem', at(G3.ellipsoid(0.016, 0.016, 0.009, 12, 8), [0, 0.276, 0.19], [-0.25, 0, 0]));
      for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; put('chest', 'gold', at(G3.ellipsoid(0.005, 0.005, 0.004, 6, 4), [Math.cos(a) * 0.044, 0.275 + Math.sin(a) * 0.044 * 0.97, 0.181 - Math.sin(a) * 0.011])); }
      pauldron(N, put, 1, 'padL'); pauldron(N, put, -1, 'padR');
      skirt(N, put, 'secT', 0.46, { flare: 0.07 });
      ['tFL', 'tFR', 'tBL', 'tBR'].forEach((name, i) => { const a0 = [0.12, -1.28, 1.32, -2.58][i], a1 = [1.28, -0.12, 2.58, -1.32][i]; const top = [], bot = []; for (let q = 0; q <= 4; q++) { const a = a0 + (a1 - a0) * q / 4; top.push([Math.sin(a) * 0.195, 0.04, Math.cos(a) * 0.15]); bot.push([Math.sin(a) * 0.235, -0.24, Math.cos(a) * 0.19]); } put(name, 'steel', panel(top, bot, 10, 6, 0)); const e = bot.map(p => [p[0] * 1.01, p[1] + 0.012, p[2] * 1.01]); put(name, 'gold', panel(e, bot.map(p => [p[0] * 1.012, p[1], p[2] * 1.012]), 10, 1, 0)); });
      both('elL', 'elR', n => { put(n, 'steel', limb([[-0.04, 0.054, 0.92], [-0.1, 0.056, 0.9], [-0.2, 0.05, 0.86], [-0.23, 0.052, 0.86]], 18, 6)); [-0.045, -0.225].forEach(y => put(n, 'gold', limb([[y + 0.006, 0.058, 0.92], [y - 0.006, 0.058, 0.92]], 16, 2))); });
      both('haL', 'haR', n => { put(n, 'steel', at(rbox(0.042, 0.035, 0.012, 0.4, 12, 8), [0, -0.05, 0.016])); put(n, 'gold', at(rbox(0.044, 0.006, 0.014, 0.4, 12, 6), [0, -0.085, 0.017])); });
      both('knL', 'knR', n => { put(n, 'steel', at(G3.ellipsoid(0.075, 0.06, 0.06, 16, 10), [0, 0, 0.022])); put(n, 'steel', onTorso([[-0.06, 0.07, 0.07, 0.07], [-0.32, 0.06, 0.06, 0.06]], 0.012, -1.1, 1.1, 0, 1, 12, 8)); });
      belt('leather', 0.075, 0.03, 0.03);
    }
    /* --- robe de soigneur --- */
    if (o === 'robe') {
      put('chest', 'main', loft(grow(TR.slice(1), 0.016), 30, 16));
      put('chest', 'secT', onTorso(TR.slice(1), 0.021, -0.17, 0.17, 0, 1, 4, 14, true));
      [0.32, 0.25, 0.18, 0.11].forEach(y => put('chest', 'gold', at(G3.ellipsoid(0.011, 0.011, 0.006, 8, 6), [0, y, pf((0.36 - y) / 0.4).rzf + 0.024])));
      put('chest', 'secT', loft([[0.475, 0.064, 0.062, 0.066], [0.4, 0.08, 0.078, 0.084]], 24, 4, { open: [0.18, 0.18] }));
      both('elL', 'elR', n => put(n, 'mainT', G3.lathe([[0.05, -0.02], [0.07, -0.1], [0.1, -0.2], [0.115, -0.25]], 22)));
      both('elL', 'elR', n => put(n, 'gold', limb([[-0.215, 0.034], [-0.235, 0.034]], 14, 2)));
      skirt(N, put, 'mainT', 0.84, { flare: 0.11, overlap: 0.06, folds: 0.022 });
      put('hips', 'accent', loft([[0.11, 0.165, 0.122, 0.127], [0.03, 0.168, 0.125, 0.13]], 30, 4));
      [-1, 1].forEach(s => { put('hips', 'accent', at(G3.ellipsoid(0.05, 0.035, 0.02, 12, 8), [s * 0.04, 0.07, -0.135], [0, 0, s * 0.5])); put('hips', 'accent', tube([[s * 0.01, 0.06, -0.135], [s * 0.04, -0.1, -0.15], [s * 0.05, -0.3, -0.16]], t => [0.028 * (1 - t * 0.3), 0.006], 6, [0, 0, 1])); });
      [-1, 1].forEach(s => put('chest', 'accentT', onTorso(TR.slice(1), 0.024, s > 0 ? 0.32 : -0.5, s > 0 ? 0.5 : -0.32, 0, 0.9, 3, 14, true)));
    }
    /* --- tenue furtive (cape courte, écharpe, sangles) --- */
    if (o === 'cloak') {
      put('chest', 'main', loft(grow(TR.slice(1), 0.012), 30, 16));
      [-1, 1].forEach(s => { const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12, a = lerp(s * 0.85, -s * 0.55, t), y = lerp(0.37, 0.05, t), r = pf((0.36 - y) / 0.4); pts.push([Math.sin(a) * (r.rx + 0.02), y, Math.cos(a) * (r.rzf + 0.02)]); } put('chest', 'leather', tube(pts, () => [0.016, 0.005], 6)); });
      put('chest', 'gold', at(G3.lathe([[0.022, 0.005], [0.026, 0], [0.022, -0.005]], 16), [0, 0.2, pf(0.4).rzf + 0.024], [PI / 2, 0, 0]));
      // patte de boutonnage décalée, brandebourgs et poche de poitrine
      put('chest', 'secT', onTorso(TR.slice(1), 0.016, 0.1, 0.22, 0.02, 0.92, 3, 14, true));
      [0.31, 0.24, 0.17, 0.1].forEach(y => { const r = pf((0.36 - y) / 0.4), a = 0.16; put('chest', 'gold', at(G3.ellipsoid(0.008, 0.008, 0.005, 8, 6), [Math.sin(a) * (r.rx + 0.02), y, Math.cos(a) * (r.rzf + 0.02)])); });
      { const y = 0.27, a = -0.42, r = pf((0.36 - y) / 0.4); put('chest', 'secT', at(rbox(0.036, 0.016, 0.006, 0.35, 12, 6), [Math.sin(a) * (r.rx + 0.016), y, Math.cos(a) * (r.rzf + 0.016)], [0, a, 0])); }
      [0, 1].forEach(i => put('chest', 'sec', at(G3.lathe([[0.075, 0.025], [0.1, 0], [0.075, -0.025]], 24, { sz: 0.92 }), [0, 0.425 - i * 0.04, 0.0], [0.15 - i * 0.1, 0, 0])));
      N('scarf', 'chest', [0.02, 0.42, -0.09]);
      put('scarf', 'sec', tube([[0, 0, 0], [0.04, -0.06, -0.06], [0.07, -0.25, -0.12], [0.06, -0.48, -0.14], [0.09, -0.62, -0.12]], t => [0.05 * (1 - t * 0.3), 0.008], 6, [0, 0, 1]));
      N('cape', 'chest', [0, 0.38, -0.02]);
      const jag = u => 0.035 * Math.abs(Math.sin(u * PI * 7)) + 0.015 * Math.sin(u * 23);
      put('cape', 'cloakC', grid(20, 10, (u, v) => { const a = (u - 0.5) * 3.6, rr = 0.2 + v * 0.07; return { p: [-Math.sin(a) * rr, -v * (0.36 + jag(u)) + 0.02 * Math.cos(a), -Math.cos(a) * (0.13 + v * 0.05) - 0.01], uv: [u, v] }; }));
      put('cape', 'capeIn', grid(20, 10, (u, v) => { const a = (u - 0.5) * 3.6, rr = 0.196 + v * 0.07; return { p: [-Math.sin(a) * rr, -v * (0.36 + jag(u)) + 0.02 * Math.cos(a), -Math.cos(a) * (0.126 + v * 0.05) - 0.01], uv: [u, v] }; }, { flip: true }));
      both('elL', 'elR', n => put(n, 'wrap', limb([[-0.1, 0.047], [-0.2, 0.042], [-FA + 0.01, 0.039]], 16, 6, 0.003)));
      both('knL', 'knR', n => put(n, 'leather', at(G3.ellipsoid(0.066, 0.06, 0.045, 14, 10), [0, -0.01, 0.03])));
      belt('leather', 0.07, 0.035, 0);
      [[0.16, 0.0, 0.04, 0.9], [-0.15, 0.01, 0.06, -0.9]].forEach(([x, y, z, r]) => { put('hips', 'leather', at(rbox(0.034, 0.04, 0.02, 0.35, 12, 8), [x, y, z], [0, r, 0])); put('hips', 'gold', at(G3.ellipsoid(0.007, 0.007, 0.005, 8, 6), [x * 1.13, y + 0.02, z * 1.5], [0, r, 0])); });
      [-1, 1].forEach(s => { put('hips', 'leather', at(G3.capsule([0, -0.12, 0], [0, 0.0, 0], 0.016, 0.012, 8), [s * 0.07, 0.02, -0.14], [0, 0, s * 0.5])); put('hips', 'steel', at(G3.capsule([0, 0.0, 0], [0, 0.06, 0], 0.01, 0.01, 6), [s * 0.07, 0.02, -0.14], [0, 0, s * 0.5])); });
    }
    if (o !== 'coat' && o !== 'gi') { if (o === 'robe') put('hips', 'gold', at(rbox(0.028, 0.026, 0.008, 0.35, 12, 8), [0, 0.07, 0.133])); else put('hips', 'gold', at(rbox(0.03, 0.026, 0.008, 0.35, 12, 8), [0, 0.052, 0.13 + (o === 'armor' ? 0.03 : 0)])); }
    if (o === 'coat') {
      put('hips', 'gold', at(rbox(0.035, 0.03, 0.01, 0.35, 14, 10), [0, 0.052, 0.124])); put('hips', 'gem', at(rbox(0.018, 0.014, 0.012, 0.4, 10, 8), [0, 0.052, 0.13]));
      N('pouch', 'hips', [0.15, 0.0, 0.06], [0, 0.9, 0]);
      put('pouch', 'leather', at(rbox(0.04, 0.045, 0.022, 0.35, 14, 10), [0, -0.01, 0.02])); put('pouch', 'leather', at(rbox(0.042, 0.02, 0.024, 0.35, 14, 8), [0, 0.03, 0.02])); put('pouch', 'gold', at(G3.ellipsoid(0.008, 0.008, 0.006, 8, 6), [0, 0.018, 0.046]));
      put('hips', 'accent', loft([[0.11, 0.16, 0.115, 0.12], [0.075, 0.163, 0.118, 0.123]], 30, 3, { grow: 0.004 }));
      put('hips', 'accent', at(G3.ellipsoid(0.032, 0.028, 0.022, 12, 10), [-0.155, 0.092, 0.075], [0, -0.9, 0]));
      [[-0.16, 0.08, 0.32], [-0.14, 0.1, 0.25]].forEach(([x, z, L], i) => put('hips', 'accent', tube([[x, 0.085, z], [x - 0.02, 0.0, z + 0.015], [x - 0.012 - i * 0.025, -L * 0.6, z + 0.02], [x - 0.02 - i * 0.04, -L, z + 0.01]], t => [0.03 * (1 - t * 0.3), 0.007], 6, [1, 0, -0.6])));
    }
    /* --- grande cape (héros légendaires et mythiques) --- */
    if (k.cape && o !== 'cloak') {
      N('cape', 'chest', [0, 0.37, -0.1]);
      const cp = (u, v, inner, off) => { const a = (u - 0.5) * 2.3, rr = (inner ? 0.196 : 0.2) + v * 0.16, fold = 0.025 * Math.sin(u * PI * 5) * v; return [Math.sin(a) * rr, -v * 1.05, -Math.cos(a) * (0.05 + v * 0.06) + 0.06 - v * 0.14 - fold + (inner ? 0.004 : 0) - (off || 0)]; };
      const cg = (inner) => grid(18, 22, (u, v) => ({ p: cp(u, v, inner), uv: [u, v] }), inner ? {} : { flip: true });
      put('cape', 'capeOut', cg(false)); put('cape', 'capeIn', cg(true));
      put('cape', 'emblem', grid(10, 10, (u, v) => ({ p: cp(0.32 + u * 0.36, 0.1 + v * 0.3, false, 0.004), uv: [u, v] }), { flip: true }));
      [-1, 1].forEach(s => { put('chest', 'gold', at(G3.lathe([[0.03, 0.006], [0.034, 0], [0.03, -0.006]], 18), [s * 0.13, 0.37, 0.09], [PI / 2 - 0.3, 0, 0])); put('chest', 'gem', at(G3.ellipsoid(0.016, 0.016, 0.01, 10, 8), [s * 0.13, 0.372, 0.1])); });
      put('chest', 'gold', tube([[-0.12, 0.36, 0.1], [0, 0.33, 0.13], [0.12, 0.36, 0.1]], () => [0.004, 0.004], 5));
    }
    /* --- armes --- */
    if (k.weapon) N('weapon', 'haR', [0, -0.05, 0], [PI / 2, 0, 0]);
    if (k.weapon === 'katana') {
      const blade = []; for (let i = 0; i <= 14; i++) { const t = i / 14; blade.push([0, 0.08 + t * 0.86, -Math.pow(t, 2) * 0.035]); }
      put('weapon', 'blade', tube(blade, t => [0.016 * (1 - Math.pow(t, 6) * 0.85) + 0.002, 0.004], 6, [0, 0, 1]));
      put('weapon', 'gold', at(G3.lathe([[0.04, 0.005], [0.045, 0], [0.04, -0.005]], 24), [0, 0.055, 0]));
      put('weapon', 'gold', G3.capsule([0, 0.06, 0], [0, 0.08, 0], 0.014, 0.014, 8));
      put('weapon', 'ito', G3.capsule([0, -0.18, 0], [0, 0.055, 0], 0.019, 0.019, 10));
      put('weapon', 'gold', at(G3.ellipsoid(0.021, 0.014, 0.021, 10, 8), [0, -0.19, 0]));
      N('saya', 'hips', [0.17, 0.02, 0.0], [0.15, 0, 0.55]);
      const sp = []; for (let i = 0; i <= 10; i++) { const t = i / 10; sp.push([0, -t * 0.9, -Math.pow(t, 2) * 0.04 - 0.02]); }
      put('saya', 'saya', tube(sp, t => [0.024 * (1 - t * 0.2), 0.012], 10, [0, 0, 1]));
      [0.0, -0.1, -0.88].forEach(y => put('saya', 'gold', at(G3.lathe([[0.027, 0.012], [0.029, 0], [0.027, -0.012]], 16, { sz: 0.55 }), [0, y, -0.02 - (y < -0.5 ? 0.035 : 0)])));
    } else if (k.weapon === 'staff') {
      put('weapon', 'wood', G3.capsule([0, -0.72, 0], [0, 0.72, 0], 0.017, 0.017, 10));
      [-0.68, -0.2, 0.25, 0.66].forEach(y => put('weapon', 'gold', at(G3.lathe([[0.021, 0.012], [0.025, 0], [0.021, -0.012]], 16), [0, y, 0])));
      put('weapon', 'gold', G3.lathe([[0.018, 0.7], [0.03, 0.74], [0.024, 0.78]], 16));
      const ring = []; for (let i = 0; i <= 40; i++) { const a = -PI * 0.15 + i / 40 * PI * 1.3; ring.push([Math.cos(a) * 0.11, 0.9 + Math.sin(a) * 0.11, 0]); }
      put('weapon', 'gold', tube(ring.reverse().map(p => [p[0], p[1], p[2]]), t => [0.012 * (0.6 + 0.4 * Math.sin(t * PI)), 0.01], 6));
      put('weapon', 'gold', tube([[0, 0.76, 0], [0.06, 0.8, 0], [0.1, 0.84, 0]], () => [0.009, 0.009], 6));
      put('weapon', 'gem', G3.lathe([[0.0, 0.99], [0.045, 0.92], [0.05, 0.9], [0.0, 0.81]], 8));
    } else if (k.weapon === 'lance') {
      put('weapon', 'wood', G3.capsule([0, -0.62, 0], [0, 0.82, 0], 0.016, 0.016, 10));
      const wr = []; for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * PI * 24; wr.push([Math.cos(a) * 0.018, -0.25 + t * 0.5, Math.sin(a) * 0.018]); }
      put('weapon', 'leather', tube(wr, () => [0.005, 0.005], 4));
      put('weapon', 'gold', G3.lathe([[0.02, 0.8], [0.03, 0.84], [0.026, 0.9]], 16));
      put('weapon', 'gold', at(rbox(0.09, 0.012, 0.012, 0.5, 14, 6), [0, 0.88, 0]));
      [-1, 1].forEach(s => put('weapon', 'gold', at(G3.lathe([[0.0, 0.05], [0.018, 0.0], [0.0, -0.03]], 8), [s * 0.09, 0.9, 0], [0, 0, -s * 0.6])));
      put('weapon', 'blade', G3.lathe([[0.0, 1.28], [0.025, 1.18], [0.045, 1.04], [0.03, 0.94], [0.02, 0.9]], 4, { sz: 0.25 }));
      for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; put('weapon', 'accent', tube([[Math.cos(a) * 0.012, 0.85, Math.sin(a) * 0.012], [Math.cos(a) * 0.03, 0.76, Math.sin(a) * 0.03], [Math.cos(a) * 0.04, 0.66, Math.sin(a) * 0.04]], t => [0.012 * (1 - t * 0.6), 0.006], 4)); }
    } else {
      // poings : protège-poignets dorés pour les soigneurs
      if (o === 'robe') both('elL', 'elR', n => put(n, 'gold', limb([[-FA + 0.03, 0.034], [-FA + 0.012, 0.034]], 14, 2)));
    }
  }
  function headParts(N, put, k, seed) {
    const f = k.body === 'f';
    N('hd', 'head', [0, 0.088, 0.008], [0, 0, 0], f ? 0.118 : 0.122);
    put('hd', 'skin', headGeo()); put('hd', 'face', faceGeo());
    [-1, 1].forEach((s, i) => { N('ear' + i, 'hd', [s * 0.84, -0.13, -0.1], [0, s * 0.3, -s * 0.12]); put('ear' + i, 'skin', earGeo()); });
    const H = hairSet(k.hair, seed, f);
    put('hd', 'hairCap', capGeo(H.hl, 1.04));
    put('hd', 'hair', merge(H.main));
    if (H.back.length) { N('hb', 'hd', [0, -0.55, -0.85]); put('hb', 'hair', at(merge(H.back), [0, 0.55, 0.85])); }
    if (H.extra.tail) { const t = H.extra.tail; N('tail', 'hd', t.pos, t.rot); put('tail', 'hair', t.geo); put('tail', 'tie', t.tie); }
    if (H.extra.buns) put('hd', 'hair', H.extra.buns);
    if (k.hair === 'hood') { const hg = hoodGeo(); put('hd', 'hood', hg.shell); put('hd', 'hoodHem', hg.hem); }
    let ai = 0;
    const ids = new Map();
    accessory(k.acc, null, (desc, slot, geo) => { if (!ids.has(desc)) { const nm = 'acc' + (ai++); ids.set(desc, nm); N(nm, 'hd', desc.pos, desc.rot); } put(ids.get(desc), slot, geo); });
  }

  /* ---------- structures en cache (géométrie partagée) ---------- */
  const STRUCT = new Map();
  function makeStruct(key, fn) {
    if (STRUCT.has(key)) return STRUCT.get(key);
    const nodes = [], parts = new Map();
    const N = (name, parent, pos, rot, s) => { nodes.push({ name, parent, pos: pos || [0, 0, 0], rot: rot || [0, 0, 0], s: s || 1 }); return name; };
    const put = (node, slot, geo) => { const k = node + '|' + slot; if (!parts.has(k)) parts.set(k, []); parts.get(k).push(geo); };
    fn(N, put);
    const P = []; parts.forEach((gs, k) => { const [node, slot] = k.split('|'); P.push({ node, slot, geo: gs.length === 1 ? gs[0] : merge(gs) }); });
    const st = { nodes, parts: P }; STRUCT.set(key, st); return st;
  }

  /* ---------- matériaux (couleurs du héros, textures partagées teintées) ---------- */
  const MATS = new Map(), REF = new Map();
  const NB = [0.78, 0.78, 0.78], NT = [0.92, 0.92, 0.92];
  function matsKey(R, L) { return R.id + JSON.stringify(L); }
  function mats(R, L) {
    const key = matsKey(R, L);
    if (MATS.has(key)) return MATS.get(key);
    const own = [], J = a => a.map(v => v.toFixed(3)).join();
    const TT = (k, fn) => tex(R, 'N' + k, () => tinted(fn()));
    const OWN = (k, fn) => { own.push(R.id + k); return tex(R, k, fn); };
    const rim = L.rim;
    const fab = (col, o, extra) => Object.assign({ col, col2: L.trim, tint: true, rough: 0.8, spec: 0.12, wrap: 0.3, rim: 0.3, rimC: rim, map: TT('fab' + JSON.stringify(o || {}), () => fabric(NB, o && o.trim ? Object.assign({}, o, { trim: NT }) : o)) }, extra || {});
    const tr = (o) => Object.assign({ trim: 1 }, o);
    const F = {
      skin: () => ({ col: L.skin, rough: 0.55, spec: 0.2, wrap: 0.45, sss: 0.6, sssC: [1, 0.35, 0.28], rim: 0.25, rimC: rim }),
      neck: () => Object.assign({}, get('skin'), { map: tex(R, 'neckSh', neckTex) }),   // ombre portée du menton sur le cou
      face: () => ({ col: [1, 1, 1], rough: 0.55, spec: 0.2, wrap: 0.45, sss: 0.6, sssC: [1, 0.35, 0.28], rim: 0.25, rimC: rim, decal: true, map: OWN('faceHQ2' + JSON.stringify([L.eye, L.eyeD, L.eyeL, L.lash, L.tilt, L.brow, L.lip, L.eh, L.scar, L.mark, L.smirk, L.smile, L.blush, L.browC]), () => faceHQ(L)) }),
      hair: () => ({ col: [1, 1, 1], rough: 0.4, spec: 0.8, wrap: 0.3, rim: 0.3, rimC: rim, aniso: true, twoSide: true, map: OWN('hair' + J(L.hairRoot) + J(L.hairTip), () => hairTex(L.hairRoot, L.hairTip)) }),
      hairCap: () => Object.assign({}, get('hair'), { col: [0.58, 0.56, 0.58], aniso: false, twoSide: false }),
      hairIn: () => Object.assign({}, get('hair'), { col: [0.68, 0.66, 0.68], aniso: false }),
      main: () => fab(L.main, null, { twoSide: true }),
      mainT: () => fab(L.main, tr({ trimTop: false, motif: true, tw: 30 }), { twoSide: true }),
      sleeve: () => fab(L.main, { wrinkles: [[0.62, 0.95, 3]] }),
      sleeveF: () => fab(L.main, { wrinkles: [[0.0, 0.3, 2]] }),
      sec: () => fab(L.sec, null, { twoSide: true }),
      secT: () => fab(L.sec, tr({ tw: 18 }), { twoSide: true }),
      lining: () => fab(L.lining, null, { twoSide: true }),
      shirt: () => fab(L.shirt),
      pants: () => fab(L.pants, { seams: true }),
      accent: () => fab(L.accent, tr({ tw: 14 }), { twoSide: true }),
      accentT: () => fab(L.accent, tr({ motif: true, tw: 40 }), { twoSide: true }),
      band: () => fab(L.accent, tr({ tw: 40 }), { twoSide: true }),
      capeOut: () => fab(L.cape, tr({ motif: true, trimTop: false, tw: 26 })),
      capeIn: () => fab(L.capeIn),
      cloakC: () => fab(L.hood, tr({ trimTop: false, tw: 16 })),
      hood: () => fab(L.hood, tr({ tw: 20 }), { twoSide: true, spec: 0.06, rim: 0.18 }),
      hoodHem: () => fab(mul(L.hood, 0.72), { wrinkles: [[0, 1, 6]] }, { spec: 0.08 }),
      mask: () => fab(L.maskC),
      wrap: () => ({ col: L.wrapC, tint: true, rough: 0.85, spec: 0.05, wrap: 0.35, rim: 0.25, rimC: rim, map: TT('wrap', () => bandage(NB)) }),
      leather: () => ({ col: L.leather, tint: true, rough: 0.5, spec: 0.35, wrap: 0.2, rim: 0.3, rimC: rim, map: TT('lea', () => leather(NB)) }),
      boot: () => ({ col: L.boot, tint: true, rough: 0.45, spec: 0.4, wrap: 0.2, rim: 0.3, rimC: rim, map: TT('lea', () => leather(NB)) }),
      glove: () => ({ col: L.glove, tint: true, rough: 0.5, spec: 0.3, wrap: 0.25, rim: 0.3, rimC: rim, map: TT('lea', () => leather(NB)) }),
      sole: () => ({ col: [0.08, 0.06, 0.05], rough: 0.8, spec: 0.1, wrap: 0.2, rim: 0.2 }),
      gold: () => ({ col: L.gold, rough: 0.3, spec: 1, metal: 1, wrap: 0.1, rim: 0.4, rimC: [1, 0.9, 0.7] }),
      tie: () => get('gold'),
      steel: () => ({ col: L.steel, tint: true, rough: 0.35, spec: 0.9, metal: 0.8, wrap: 0.1, rim: 0.45, rimC: rim, map: TT('stl', () => metal(NB)) }),
      gem: () => ({ col: L.gemC, rough: 0.2, spec: 1.2, wrap: 0.3, rim: 0.6, rimC: rim, em: L.gemC.map(v => v * 0.55) }),
      blade: () => ({ col: [0.5, 0.52, 0.57], rough: 0.18, spec: 1.0, metal: 1, wrap: 0.1, rim: 0.3, rimC: rim, map: tex(R, 'blade', bladeTex) }),
      ito: () => ({ col: [1, 1, 1], rough: 0.6, spec: 0.3, wrap: 0.3, rim: 0.3, map: OWN('ito' + J(L.accent), () => wrapTex([0.1, 0.08, 0.09], L.accent.map(v => v * 0.9 + 0.1))) }),
      saya: () => ({ col: L.saya || [0.07, 0.05, 0.06], rough: 0.2, spec: 1.0, wrap: 0.2, rim: 0.5, rimC: rim }),
      wood: () => ({ col: L.woodC, tint: true, rough: 0.55, spec: 0.3, wrap: 0.25, rim: 0.3, rimC: rim, map: TT('wood', () => wood(NB)) }),
      emblem: () => ({ col: L.trim, col2: L.trim, tint: true, rough: 0.35, spec: 0.8, metal: 0.6, wrap: 0.2, rim: 0, decal: true, noCast: true, map: TT('emb' + L.el, () => emblemEl(L.el, NT, [1, 1, 1])) }),
      petal: () => ({ col: L.petal, rough: 0.6, spec: 0.2, wrap: 0.5, sss: 0.5, sssC: L.petal, rim: 0.3, rimC: [1, 1, 1], twoSide: true }),
      petalC: () => ({ col: [1, 0.85, 0.35], rough: 0.6, spec: 0.2, wrap: 0.4, rim: 0.2 }),
      leaf: () => ({ col: [0.25, 0.55, 0.3], rough: 0.6, spec: 0.2, wrap: 0.4, rim: 0.2, twoSide: true }),
      earIn: () => ({ col: [0.95, 0.7, 0.72], rough: 0.7, spec: 0.1, wrap: 0.5, sss: 0.5, rim: 0.2 }),
      horn: () => ({ col: L.hornC, tint: true, rough: 0.45, spec: 0.5, wrap: 0.2, rim: 0.4, rimC: rim, map: TT('horn', () => hornTex(NB, NB.map(v => v * 0.35))) }),
      frame: () => ({ col: [0.12, 0.1, 0.12], rough: 0.3, spec: 0.8, metal: 0.5, wrap: 0.2, rim: 0.2 }),
      lens: () => ({ col: [0.85, 0.92, 1], rough: 0.05, spec: 1.5, wrap: 0.2, rim: 0.6, rimC: [1, 1, 1], alpha: 0.22, noCast: true }),
      halo: () => ({ col: [1, 0.92, 0.6], rough: 0.3, spec: 0.5, wrap: 1, rim: 0, em: [0.95, 0.85, 0.5], noCast: true })
    };
    const C = {};
    function get(slot) { if (!(slot in C)) C[slot] = F[slot] ? F[slot]() : null; return C[slot]; }
    const M = { get, own, key };
    MATS.set(key, M); return M;
  }
  const ref = (k, d) => { const n = (REF.get(k) || 0) + d; if (n <= 0) REF.delete(k); else REF.set(k, n); return n; };
  // libère la mémoire graphique propre à un héros (tête, visage, cheveux) quand plus personne ne l'utilise
  function dispose(R, ch) {
    if (!ch || ch.disposed) return; ch.disposed = true;
    if (ch.vrm) { if (ch.hq) dispose(R, ch.hq); return; }
    const gl = R.gl;
    if (ref(ch.hk, -1) <= 0) { const st = STRUCT.get(ch.hk); if (st) st.parts.forEach(p => { const b = p.geo[R.id]; if (b) { ['p', 'n', 'u', 'i'].forEach(k => gl.deleteBuffer(b.buf[k])); delete p.geo[R.id]; } }); STRUCT.delete(ch.hk); }
    if (ref(ch.mk, -1) <= 0) { const M = MATS.get(ch.mk); if (M) M.own.forEach(k => { if (TX[k]) { gl.deleteTexture(TX[k]); delete TX[k]; } }); MATS.delete(ch.mk); }
  }

  /* ---------- construction d'un héros ---------- */
  function build(R, look, seed) {
    seed = seed || 1;
    const bk = JSON.stringify(['b', look.body, look.outfit, look.weapon || null, look.sleeves, !!look.gloves, !!look.cape]);
    const hk = JSON.stringify(['h', look.body, look.hair, look.acc || null, seed]);
    const bs = makeStruct(bk, (N, put) => bodyParts(N, put, look));
    const hs = makeStruct(hk, (N, put) => headParts(N, put, look, seed));
    const M = mats(R, look);
    ref(hk, 1); ref(M.key, 1);
    const J = {};
    [bs, hs].forEach(st => st.nodes.forEach(d => { const n = new Node(d.name); n.pos = d.pos.slice(); n.rot = d.rot.slice(); n.s = d.s; if (d.parent) J[d.parent].add(n); J[d.name] = n; }));
    [bs, hs].forEach(st => st.parts.forEach(p => { const m = M.get(p.slot); if (m) { const mm = new Mesh(p.geo, m); mm.slot = p.slot; J[p.node].meshes.push(mm); } }));
    const swing = [];
    const sw = (name, kf, ks, ky, idle) => { if (J[name]) swing.push({ n: J[name], base: J[name].rot.slice(), kf, ks, ky, idle: idle || 0, x: [0, 0, 0], v: [0, 0, 0] }); };
    sw('tail', 0.16, 0.12, -0.05, 0.05); sw('hb', 0.07, 0.06, -0.02, 0.02); sw('cape', 0.14, 0.1, -0.04, 0.03); sw('scarf', 0.2, 0.14, -0.06, 0.06);
    const ch = { root: J.root, J, look, swing, hk, mk: M.key, tails: ['tFL', 'tFR', 'tBL', 'tBR'].map(n => J[n]).filter(Boolean), t: 0 };
    setPose(ch, CHAR.POSES.idle);
    return ch;
  }
  // pose + pans de vêtement ; dt optionnel : mouvement secondaire (cheveux, cape)
  function setPose(ch, p, dt) {
    CHAR.setPose(ch, p);
    const L = ch.J.thL.rot[0], Rr = ch.J.thR.rot[0], sp = ch.sec ? ch.sec.vf || 0 : 0;
    ch.tails.forEach(t => {
      const front = t.name[1] === 'F', leg = t.name[2] === 'L' ? L : Rr;
      t.rot = [front ? Math.max(-0.95, Math.min(0, leg) * 0.8) : Math.min(0.9, Math.max(0, leg) * 0.7) + 0.06 + Math.min(0.5, Math.max(0, sp) * 0.06), 0, 0];
    });
    if (dt) animate(ch, dt);
  }
  // ressort amorti pour les éléments souples
  function animate(ch, dt) {
    const r = ch.root, S = ch.sec || (ch.sec = { prev: r.pos.slice(), yaw: r.rot[1], vf: 0, vs: 0, yr: 0 });
    dt = Math.min(dt, 0.05); ch.t += dt;
    const vx = (r.pos[0] - S.prev[0]) / dt, vz = (r.pos[2] - S.prev[2]) / dt; S.prev = r.pos.slice();
    let dy = r.rot[1] - S.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); S.yaw = r.rot[1];
    const c = Math.cos(r.rot[1]), s = Math.sin(r.rot[1]), vf = vx * s + vz * c, vs = vx * c - vz * s, k = 1 - Math.exp(-dt * 10);
    S.vf += (Math.max(-8, Math.min(8, vf)) - S.vf) * k; S.vs += (Math.max(-8, Math.min(8, vs)) - S.vs) * k; S.yr += (dy / dt - S.yr) * k;
    const steps = Math.max(1, Math.ceil(dt / 0.012)), h = dt / steps;
    ch.swing.forEach(w => {
      const tgt = [Math.min(1.2, Math.max(-0.3, S.vf * w.kf)) + Math.sin(ch.t * 1.7) * w.idle, S.yr * w.ky, -S.vs * w.ks + Math.sin(ch.t * 1.3) * w.idle * 0.6];
      for (let q = 0; q < steps; q++) for (let i = 0; i < 3; i++) { w.v[i] += (55 * (tgt[i] - w.x[i]) - 8 * w.v[i]) * h; w.x[i] += w.v[i] * h; }
      w.n.rot = [w.base[0] + w.x[0], w.base[1] + w.x[1], w.base[2] + w.x[2]];
    });
  }
  // interpolation par ressorts critiques : mouvements souples, sans à-coups
  const KEYS = ['hips', 'spine', 'chest', 'neck', 'head', 'shL', 'elL', 'shR', 'elR', 'thL', 'knL', 'thR', 'knR', 'ftL', 'ftR', 'w'];
  function springPose(st, target, dt, w) {
    if (!st.spose) st.spose = CHAR.blend(target, target, 0);
    if (!st.pv) st.pv = {};
    const P = st.spose, Vv = st.pv, e = Math.exp(-w * dt);
    const step = (x, v, t) => { const a = x - t, b = v + w * a; return [t + (a + b * dt) * e, (b - w * (a + b * dt)) * e]; };
    KEYS.forEach(k => { const vv = Vv[k] || (Vv[k] = [0, 0, 0]), x = P[k], t = target[k] || x; for (let i = 0; i < 3; i++) { const r = step(x[i], vv[i], t[i]); x[i] = r[0]; vv[i] = r[1]; } });
    const r = step(P.y, Vv.y || 0, target.y); P.y = r[0]; Vv.y = r[1];
    return P;
  }
  // course plus naturelle : genoux, pieds, balancier des bras, rotation du buste
  function runPose(ph, dir, side) {
    const p = CHAR.blend(CHAR.POSES.idle, CHAR.POSES.idle, 0), s = Math.sin(ph), c = Math.cos(ph), s2 = Math.sin(ph * 2);
    dir = dir || 1;
    p.thL = [-12 - 40 * s * dir, 0, 4]; p.knL = [18 + 55 * Math.max(0, c) + 10 * Math.max(0, -s * dir), 0, 0]; p.ftL = [-10 * c, 0, 0];
    p.thR = [-12 + 40 * s * dir, 0, -4]; p.knR = [18 + 55 * Math.max(0, -c) + 10 * Math.max(0, s * dir), 0, 0]; p.ftR = [10 * c, 0, 0];
    p.shL = [-6 + 34 * s * dir, 0, 12]; p.elL = [-55 - 15 * Math.max(0, s), 0, 0]; p.shR = [-6 - 34 * s * dir, 0, -12]; p.elR = [-55 - 15 * Math.max(0, -s), 0, 0];
    p.y = -0.035 + Math.abs(s2) * 0.0 + (1 - Math.abs(c)) * -0.0 + Math.abs(c) * 0.028;
    p.hips = [0, 10 * s * dir, 0]; p.spine = [14 * dir, -6 * s * dir, 0]; p.chest = [0, -6 * s * dir, 0]; p.head = [-8 * dir, 4 * s * dir, 0];
    if (side) { p.hips = [0, -side * 28, 0]; p.spine = [8, side * 10, -side * 6]; }
    return p;
  }
  function idlePose(t) {
    const p = CHAR.idlePose(t), b = Math.sin(t * 1.9), b2 = Math.sin(t * 0.7);
    p.y += b * 0.004; p.chest = [p.chest[0] + b * 1.2, p.chest[1] + b2 * 2, 0]; p.head = [p.head[0] - b * 1, p.head[1] + b2 * 3, 0]; p.hips = [p.hips[0], p.hips[1] + b2 * 2, b2 * 1.2];
    return p;
  }
  // pose de présentation (vitrine)
  function showPose(t) {
    const p = CHAR.blend(CHAR.POSES.idle, CHAR.POSES.idle, 0), b = Math.sin((t || 0) * 1.8);
    Object.assign(p, { y: -0.015 + b * 0.004, hips: [0, -10, 0], spine: [2 + b, 4, 0], chest: [-2 + b * 0.8, 8, 0], neck: [0, -4, 0], head: [-3, -8, 0],
      shL: [-6 + b * 1.5, 0, 12], elL: [-16, 0, 0], shR: [-14 - b * 1.5, 0, -14], elR: [-34, 0, 0],
      thL: [-6, 0, 5], knL: [8, 0, 0], ftL: [-2, 0, 0], thR: [5, 0, -7], knR: [6, 0, 0], ftR: [-10, 0, 0], w: [150, 0, 0] });
    return p;
  }

  /* ---------- tenues des 52 héros (à partir des données du jeu) ---------- */
  const mul = (a, k) => a.map((v, i) => Math.max(0, Math.min(1, v * (Array.isArray(k) ? k[i] : k))));
  const mix3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const lum = a => a[0] * 0.3 + a[1] * 0.59 + a[2] * 0.11;
  function lookFrom(h) {
    const L = h.look, E = EL[h.el], r = h.r;
    const gold = [0.86, 0.66, 0.32], silver = [0.8, 0.82, 0.88];
    const main = L.main, sec = L.sec, dk = lum(main) < 0.3;
    const trim = r >= 2 ? (h.el === 'eau' || h.el === 'ombre' ? silver : gold) : mix3(sec, [1, 1, 1], 0.25);
    const accent = mul(E.rgb, 0.62);
    const hc = L.hairC;
    const o = {
      id: h.id, el: h.el, body: L.body, skin: mul(L.skin, [0.94, 0.86, 0.84]), rim: E.rim,
      hair: L.hair, hairRoot: mul(hc, 0.62), hairTip: mix3(mul(hc, 1.12), E.rgb, lum(hc) > 0.6 ? 0.05 : 0.14),
      eye: L.eye, eyeD: L.eyeD, eyeL: L.eyeL, lash: [0.08, 0.04, 0.05], browC: mul(hc, 0.55), lip: L.body === 'f' ? [0.82, 0.45, 0.45] : [0.75, 0.45, 0.42],
      tilt: L.tilt, brow: L.brow, eh: L.body === 'f' ? 0.21 : 0.195, smile: L.mouth === 'smile' ? 1 : 0, smirk: L.mouth === 'smirk' ? 0.5 : 0, blush: L.blush ? 0.16 : 0.08,
      scar: L.scar, mark: L.mark, acc: L.acc, outfit: L.outfit, sleeves: L.sleeves, gloves: L.gloves, cape: L.cape, weapon: L.weapon || null,
      main, sec, trim, gold: trim === silver ? [0.78, 0.8, 0.86] : gold, accent, lining: mul(accent, 0.85),
      shirt: dk ? mix3(main, [0.25, 0.23, 0.28], 0.5) : mul(main, 0.35), pants: L.pants || mul(main, 0.5),
      leather: [0.34, 0.2, 0.11], boot: dk ? [0.1, 0.09, 0.09] : mul(sec, 0.45), glove: mul(main, 0.45).map(v => Math.max(0.06, v)), steel: h.role === 'def' ? mix3([0.36, 0.37, 0.42], E.rgb, 0.08) : [0.32, 0.32, 0.36],
      cape: r >= 4 ? mix3(accent, [0.1, 0.08, 0.1], 0.3) : sec, capeIn: mul(main, 0.8), hood: mix3(sec, [0.08, 0.07, 0.1], 0.45), maskC: [0.12, 0.11, 0.14],
      wrapC: [0.78, 0.74, 0.66], woodC: h.el === 'terre' ? [0.42, 0.28, 0.16] : [0.2, 0.15, 0.13], gemC: E.rgb, petal: h.el === 'prisme' ? [1, 0.75, 0.9] : mix3([1, 0.85, 0.9], E.rgb, 0.35),
      hornC: h.el === 'ombre' ? [0.3, 0.24, 0.36] : [0.92, 0.88, 0.8]
    };
    if (h.id === 'akio') Object.assign(o, LOOKS.akio);
    return o;
  }
  const LOOKS = {
    akio: { skin: [0.9, 0.69, 0.57], rim: [1, 0.62, 0.4], hair: 'ponytail', hairRoot: [0.09, 0.04, 0.06], hairTip: [0.36, 0.07, 0.07],
      eye: [1, 0.42, 0.16], eyeD: [0.42, 0.05, 0.03], eyeL: [1, 0.85, 0.55], browC: [0.12, 0.05, 0.06], lip: [0.75, 0.42, 0.4], tilt: 0.6, brow: 0.6, eh: 0.2, smirk: 0.4, blush: 0.1,
      acc: 'band', outfit: 'coat', cape: false, main: [0.16, 0.13, 0.18], lining: [0.46, 0.06, 0.06], trim: [0.85, 0.65, 0.3], gold: [0.86, 0.66, 0.32], shirt: [0.17, 0.15, 0.19], pants: [0.1, 0.09, 0.11], leather: [0.32, 0.18, 0.1], boot: [0.12, 0.09, 0.08], steel: [0.3, 0.3, 0.34], glove: [0.1, 0.08, 0.08], accent: [0.48, 0.07, 0.07], weapon: 'katana' }
  };
  const cache = new Map();
  const lookOf = h => { if (!cache.has(h.id)) cache.set(h.id, lookFrom(h)); return cache.get(h.id); };
  // personnages VRoid quand les modèles sont chargés (sinon l'ancien modèle fabriqué par le code)
  const buildAny = (R, look, seed) => { const hq = build(R, look, seed); if (typeof VRMC !== 'undefined' && VRMC.isReady()) { const c = VRMC.build(R, look, hq); c.hq = hq; return c; } return hq; };
  return { faceHQ, build: buildAny, dispose, setPose, animate, springPose, runPose, idlePose, showPose, lookOf, LOOKS, headShape };
})();

;

/* ---------- vrm.js (jeu) ---------- */
/* ===================== PERSONNAGES VRoid (modèles 3D libres CC0) =====================
   Les modèles sont convertis à l'avance (vrmtools/conv.py) : géométrie par matériau + poids vers les 17 articulations
   du squelette du jeu. Ici : chargement, couleurs propres à chaque héros, et « skinning » sur le processeur à chaque image.
   Le personnage obtenu a la même forme que ceux du jeu (root, J, poses) : combat, menus et animations marchent sans changement. */
const VRMC = (function () {
  const M = G3.M, BASE = window.__VRM_BASE || 'models/', D = {}, NAMES = ['male', 'female'];
  let ROOT = BASE;
  let ready = false, loading = null;
  const PR = { done: 0, tot: NAMES.length * 2, fail: false };   // progression réelle du chargement (fichiers reçus / fichiers attendus)
  function load() {
    if (loading) return loading;
    // les fichiers sont dans « models/ » ; si on les a mis à la racine du site (envoi depuis un téléphone), on les cherche là
    const get0 = (f, kind) => fetch(BASE + f).then(r => { if (!r.ok) throw 0; return r[kind](); }).catch(() => fetch(f).then(r => { if (!r.ok) throw new Error(f); ROOT = ''; return r[kind](); }));
    const get = (f, kind) => get0(f, kind).then(v => { PR.done++; return v; });
    loading = Promise.all(NAMES.map(async n => {
      // le binaire est en .bin (site) ; dans l'aperçu Claude il est servi en .bin.json (base64)
      const [meta, bin] = await Promise.all([get(n + '.json', 'json'), get(n + '.bin', 'arrayBuffer').catch(() => get(n + '.bin.json', 'json').then(o => { const s = atob(o.b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }))]);
      const files = new Set(); meta.mats.forEach(m => { if (m.tex) files.add(m.tex); if (m.tint) files.add(m.tint); });
      PR.tot += files.size;
      const imgs = {};
      await Promise.all([...files].map(f => new Promise(res => { const im = new Image(); im.onload = () => { imgs[f] = im; PR.done++; res(); }; im.onerror = () => { PR.done++; res(); }; im.src = ROOT + f; })));
      meta.Ji = {}; meta.J.forEach((j, i) => { meta.Ji[j.n] = i; });
      D[n] = { meta, bin, imgs, tex: new Map() };
    })).then(() => { ready = true; PR.done = PR.tot; return true; }).catch(e => { console.warn('Modèles VRoid indisponibles', e); PR.fail = true; return false; });
    return loading;
  }
  // quel modèle pour quel héros : garçons -> « male », filles -> « avf » (cheveux complets) ou « female »
  function modelFor(look) { if (look.body !== 'f') return 'male'; if (look.race) return 'female'; /* héros redessinés : coiffure et pièces de tête posées par le jeu */ return 'female'; }
  const hashId = s => { let h = 0; for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
  function texOf(R, d, f) { const k = R.id + f; if (!d.tex.has(k) && d.imgs[f]) d.tex.set(k, R.texture(d.imgs[f])); return d.tex.get(k); }
  const mix = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t), mulc = (a, k) => a.map(v => Math.min(1, v * k));
  function matFor(R, d, m, look) {
    const o = { col: m.col.slice(), map: m.tex ? texOf(R, d, m.tex) : null, rough: 0.85, spec: 0.06, wrap: 0.55, rim: 0.3, rimC: look.rim || [0.6, 0.8, 1] };
    if (m.kind === 'SKIN') { o.sss = 0.22; o.sssC = [1, 0.45, 0.35]; o.wrap = 0.7; if (look.skin) o.col = mix([1, 1, 1], mulc(look.skin, 1.12), 0.35); if (look.skinCol) { o.col = look.skinCol.slice(); o.sssC = look.skinCol.map(v => v * 0.8); } }
    // v16 : la tenue d'origine devient une peau (créatures), une combinaison unie ou du métal — plus d'uniforme
    if (m.kind === 'CLOTH' && look.suit) {
      const nm = m.name, sk = look.suit === 'skin';
      o.col = (sk ? look.skinCol : /Shoes/.test(nm) ? look.bootC : /Bottoms/.test(nm) ? (look.pants || look.sec) : look.main).slice(); o.map = null;
      if (look.suit === 'metal') { o.spec = 0.6; o.rough = 0.35; } else if (sk) { o.wrap = 0.7; }
      if (m.two) o.twoSide = true; return o;
    }
    if (m.kind === 'FACE' || m.kind === 'EYE') { o.unlit = true; o.noCast = true; o.decal = m.blend >= 2 || m.kind === 'EYE'; }
    if (m.kind === 'HAIR') { o.aniso = true; o.spec = 0.35; o.rough = 0.45; }
    if (m.tint) {
      const nm = m.name;
      let c1 = null, c2 = null;
      if (m.kind === 'HAIR') { c1 = look.hairRoot; c2 = look.hairTip; }
      else if (/EyeIris/.test(nm)) { c1 = mulc(look.eye || [0.4, 0.6, 1], 0.8); c2 = mix(look.eye || [0.4, 0.6, 1], [1, 1, 1], 0.45); }
      else if (/Tops|Onepi/.test(nm)) { c1 = look.main; c2 = mix(look.main, look.sec || look.main, 0.6); }
      else if (/Bottoms/.test(nm)) { c1 = look.pants || look.sec; c2 = mix(look.pants || look.sec, [1, 1, 1], 0.2); }
      if (c1) { o.tint = true; o.map = texOf(R, d, m.tint); o.col = mulc(c1, 1.05); o.col2 = mulc(c2, 1.1); }
    }
    if (m.blend >= 2 && !o.decal) o.alpha = 0.999;
    if (m.two) o.twoSide = true;
    return o;
  }
  function build(R, look, hq) {
    const name = modelFor(look), d = D[name], meta = d.meta, bin = d.bin;
    const root = new G3.Node('root'), J = {};
    meta.J.forEach(j => { const n = new G3.Node(j.n), pp = j.p ? meta.J[meta.Ji[j.p]].pos : [0, 0, 0]; n.pos = j.pos.map((v, i) => v - pp[i]); (j.p ? J[j.p] : root).add(n); J[j.n] = n; });
    const C = meta.J.map(j => new Float32Array(meta.C[j.n]));
    const parts = meta.prims.filter(p => !(look.race && /Accessory_Tie/.test(meta.mats[p.mat].name))).map(p => {
      const n = p.n, src = {
        pos: new Float32Array(bin, p.pos, n * 3), nor: new Float32Array(bin, p.nor, n * 3), j: new Uint8Array(bin, p.j, n * 4), w: new Uint8Array(bin, p.w, n * 4)
      };
      const geo = { pos: new Float32Array(src.pos), nor: new Float32Array(src.nor), uv: new Float32Array(bin, p.uv, n * 2), idx: p.i32 ? new Uint32Array(bin, p.idx, p.ni) : new Uint16Array(bin, p.idx, p.ni) };
      const mt = matFor(R, d, meta.mats[p.mat], look);
      const mesh = new G3.Mesh(geo, mt); mesh.q = meta.mats[p.mat].q;
      return { geo, src, mesh, n, kind: meta.mats[p.mat].kind, mname: meta.mats[p.mat].name };
    });
    // cheveux : les modèles de base n'ont qu'un casque de cheveux ; on leur pose la coiffure propre à chaque héros
    const graft = name !== 'avf' && hq && hq.J.hd;
    parts.slice().sort((a, b) => a.mesh.q - b.mesh.q).forEach(pt => { if (!(graft && pt.kind === 'HAIR')) root.meshes.push(pt.mesh); });
    const swing = [];
    if (graft) {
      const hd = hq.J.hd, box = () => ({ a: [1e9, 1e9, 1e9], b: [-1e9, -1e9, -1e9] }), grow = (B, x, y, z) => { B.a[0] = Math.min(B.a[0], x); B.a[1] = Math.min(B.a[1], y); B.a[2] = Math.min(B.a[2], z); B.b[0] = Math.max(B.b[0], x); B.b[1] = Math.max(B.b[1], y); B.b[2] = Math.max(B.b[2], z); };
      // tête de l'ancien modèle (repère de la tête) et tête VRoid (repère de l'articulation « head »)
      const hb = box(), skin = hd.meshes.find(m => m.slot === 'skin');
      if (skin) { const P = skin.geo.pos; for (let i = 0; i < P.length; i += 3) grow(hb, hd.pos[0] + P[i] * hd.s, hd.pos[1] + P[i + 1] * hd.s, hd.pos[2] + P[i + 2] * hd.s); }
      const vb = box(), hp = meta.J[meta.Ji.head].pos;
      parts.filter(pt => /Face_00_SKIN/.test(pt.mname)).forEach(pt => { const P = pt.src.pos; for (let i = 0; i < P.length; i += 3) if (P[i + 1] > hp[1] - 0.02) grow(vb, P[i] - hp[0], P[i + 1] - hp[1], P[i + 2] - hp[2]); });
      if (skin && vb.b[0] > vb.a[0]) {
        const sc = (vb.b[0] - vb.a[0]) / (hb.b[0] - hb.a[0]) * 1.04;
        const W = new G3.Node('hairfit'); W.s = sc;
        W.pos = [(vb.a[0] + vb.b[0]) / 2 - sc * (hb.a[0] + hb.b[0]) / 2, vb.b[1] - sc * hb.b[1] + 0.004, (vb.a[2] + vb.b[2]) / 2 - sc * (hb.a[2] + hb.b[2]) / 2 - 0.004];
        const keep = /^(hairCap|hair|tie|hood|hoodHem)$/;
        // pas d'auréole (symbole religieux) ; les autres accessoires restent
        const prune = n => { n.meshes = n.meshes.filter(m => m.slot !== 'halo' && (keep.test(m.slot) || /^acc/.test(n.name))); n.kids = n.kids.filter(k => !/^ear/.test(k.name)); n.kids.forEach(prune); };
        prune(hd); hd.rot = [0, 0, 0];
        W.add(hd); J.head.add(W);
        (hq.swing || []).forEach(w => { let n = w.n, ok = false; const inHd = x => { if (x === hd) return true; return x.kids.some(inHd); }; if (inHd(hd) && (function f(x) { if (x === w.n) return true; return x.kids.some(f); })(hd)) ok = true; if (ok) swing.push(w); });
      }
    }
    const S = meta.J.map(() => new Float32Array(16)), RW = {};
    const order = meta.J.map(j => j.n);
    root.skinFn = function () {
      // matrices articulation -> espace du personnage (sans la position dans le monde)
      for (let i = 0; i < order.length; i++) {
        const nm = order[i], nd = J[nm], pj = meta.J[i].p, loc = M.compose(nd.pos, nd.rot, nd.s);
        RW[nm] = pj ? M.mul(RW[pj], loc) : loc;
        const r = M.mul(RW[nm], C[i]); S[i].set(r);
      }
      const gl = R.gl;
      parts.forEach(pt => {
        const { pos: P0, nor: N0, j: JJ, w: WW } = pt.src, P = pt.geo.pos, N = pt.geo.nor;
        for (let v = 0, o3 = 0, o4 = 0; v < pt.n; v++, o3 += 3, o4 += 4) {
          const x = P0[o3], y = P0[o3 + 1], z = P0[o3 + 2], nx = N0[o3], ny = N0[o3 + 1], nz = N0[o3 + 2];
          let px = 0, py = 0, pz = 0, qx = 0, qy = 0, qz = 0;
          for (let k = 0; k < 4; k++) {
            const wt = WW[o4 + k]; if (!wt) continue; const w = wt / 255, m = S[JJ[o4 + k]];
            px += w * (m[0] * x + m[4] * y + m[8] * z + m[12]); py += w * (m[1] * x + m[5] * y + m[9] * z + m[13]); pz += w * (m[2] * x + m[6] * y + m[10] * z + m[14]);
            qx += w * (m[0] * nx + m[4] * ny + m[8] * nz); qy += w * (m[1] * nx + m[5] * ny + m[9] * nz); qz += w * (m[2] * nx + m[6] * ny + m[10] * nz);
          }
          P[o3] = px; P[o3 + 1] = py; P[o3 + 2] = pz; N[o3] = qx; N[o3 + 1] = qy; N[o3 + 2] = qz;
        }
        const g = R.upload(pt.geo);
        gl.bindBuffer(gl.ARRAY_BUFFER, g.buf.p); gl.bufferSubData(gl.ARRAY_BUFFER, 0, P);
        gl.bindBuffer(gl.ARRAY_BUFFER, g.buf.n); gl.bufferSubData(gl.ARRAY_BUFFER, 0, N);
      });
    };
    // l'arme du héros (même que l'ancien modèle) passe dans la main droite
    if (hq && hq.J.weapon) { const w = hq.J.weapon; J.haR.add(w); J.weapon = w; w.pos = [0, -0.07, 0.02]; }
    const ch = { root, J, look, swing, tails: [], vrm: name, t: 0 };
    return ch;
  }
  return { load, build, isReady: () => ready, modelFor, prog: () => PR };
})();

;

/* ---------- race15.js (jeu) ---------- */
/* ===================== v15 : 10 HÉROS FANTASTIQUES (aucun humain) =====================
   Les 10 héros les plus rares deviennent des créatures : couleur de peau, proportions, et pièces ajoutées
   au squelette (cornes, oreilles, barbe, ailes, queue, chapeau, cristaux…). Marche avec les modèles VRoid et avec les modèles de secours. */
const RACES = {
  ignar:  { nom: 'Démon de braise', skin: [0.86, 0.3, 0.24], hair: [0.1, 0.05, 0.06], eye: [1, 0.85, 0.2], main: [0.13, 0.09, 0.1], sec: [0.75, 0.52, 0.2], pants: [0.1, 0.07, 0.08], s: 1.06, js: { shL: 1.12, shR: 1.12 }, parts: ['hornsBig', 'tailSpade', 'wingsBat', 'pauldrons', 'collar'] },
  mizuha: { nom: 'Ondine', skin: [0.5, 0.86, 1], hair: [0.1, 0.5, 0.62], eye: [0.5, 1, 0.9], main: [0.1, 0.34, 0.46], sec: [0.75, 0.95, 0.95], pants: [0.08, 0.25, 0.36], s: 1, parts: ['finEars', 'coral', 'robe', 'pearls'] },
  raimei: { nom: 'Dragonide d\'orage', skin: [0.62, 0.54, 0.95], hair: [0.95, 0.9, 0.5], eye: [1, 0.95, 0.3], main: [0.2, 0.16, 0.34], sec: [0.9, 0.78, 0.3], pants: [0.14, 0.12, 0.24], s: 1.05, parts: ['hornsBack', 'tailDragon', 'wingsDragon', 'crest', 'pauldrons'] },
  tsuchi: { nom: 'Nain des montagnes', skin: [1, 0.78, 0.62], hair: [0.72, 0.36, 0.12], eye: [0.5, 0.9, 0.5], main: [0.3, 0.2, 0.12], sec: [0.62, 0.62, 0.66], pants: [0.2, 0.14, 0.1], s: 0.76, js: { chest: 1.24, head: 1.1 }, parts: ['beard', 'helmet', 'pauldrons', 'plate', 'belt'] },
  kokuyo: { nom: 'Liche', skin: [0.74, 0.84, 0.76], hair: [0.86, 0.9, 0.86], eye: [0.4, 1, 0.5], main: [0.09, 0.07, 0.13], sec: [0.36, 0.2, 0.5], pants: [0.07, 0.06, 0.1], s: 1.04, js: { head: 0.96 }, parts: ['crownSpikes', 'robe', 'cape', 'collar', 'orbs'] },
  seren:  { nom: 'Elfe céleste', skin: [1, 0.9, 0.98], hair: [0.96, 0.92, 1], eye: [0.85, 0.6, 1], main: [0.56, 0.48, 0.86], sec: [1, 0.85, 0.5], pants: [0.4, 0.34, 0.62], s: 1.03, robeC: [0.5, 0.42, 0.78], parts: ['elfEars', 'circlet', 'wingsFairy', 'robe', 'pearls'] },
  kairo:  { nom: 'Mage astral', skin: [0.4, 0.5, 1], hair: [0.75, 0.9, 1], eye: [1, 0.9, 0.5], main: [0.14, 0.12, 0.36], sec: [0.95, 0.8, 0.4], pants: [0.1, 0.09, 0.26], s: 1, parts: ['elfEarsShort', 'wizardHat', 'robe', 'orbs', 'collar'] },
  kenga:  { nom: 'Orc', skin: [0.5, 0.82, 0.4], hair: [0.08, 0.07, 0.06], eye: [1, 0.5, 0.2], main: [0.28, 0.2, 0.12], sec: [0.5, 0.5, 0.52], pants: [0.2, 0.15, 0.1], s: 1.1, js: { shL: 1.2, shR: 1.2, head: 0.94 }, parts: ['tusks', 'elfEarsShort', 'pauldronSpike', 'plate', 'belt'] },
  shiki:  { nom: 'Sorcière gobeline', skin: [0.62, 0.9, 0.45], hair: [0.3, 0.12, 0.4], eye: [1, 0.9, 0.3], main: [0.2, 0.1, 0.28], sec: [0.9, 0.6, 0.2], pants: [0.14, 0.08, 0.2], s: 0.72, js: { head: 1.32 }, parts: ['goblinEars', 'wizardHat', 'robe', 'belt'] },
  tetsu:  { nom: 'Golem de foudre', skin: [0.5, 0.56, 0.7], hair: [0.3, 0.33, 0.42], eye: [1, 0.95, 0.4], main: [0.3, 0.33, 0.42], sec: [0.95, 0.85, 0.3], pants: [0.24, 0.26, 0.34], s: 1.14, js: { shL: 1.22, shR: 1.22, head: 0.86, chest: 1.06 }, plate: [0.36, 0.4, 0.52], parts: ['crystalsHead', 'crystalsBack', 'pauldronRock', 'plate', 'belt'] }
};
const raceOf = id => RACES[id] || null;
let RACE_API = null;   // outils de fabrication partagés avec design16.js
(function () {
  const { ellipsoid: EL3, tube, lathe, merge, xformGeo, grid, Node, Mesh, M } = G3, PI = Math.PI;
  const at = (g, pos, rot, s) => xformGeo(g, M.compose(pos || [0, 0, 0], rot || [0, 0, 0], s || 1));
  const hp = (ph, th, r) => [Math.sin(ph) * Math.sin(th) * r, Math.cos(th) * r, Math.cos(ph) * Math.sin(th) * r];   // point sur la tête (rayon 1)
  const mt = (col, o) => Object.assign({ col, rough: 0.7, spec: 0.12, wrap: 0.5, rim: 0.35, rimC: [1, 0.9, 0.8] }, o || {});
  const dk = (c, k) => c.map(v => v * k);
  const cone = (r, h, n) => lathe([[r, 0], [r * 0.62, h * 0.4], [r * 0.25, h * 0.78], [0.004, h]], n || 10);
  const spike = (path, r0, n) => tube(path, t => { const k = 1 - t * 0.94; return [r0 * k + 0.004, r0 * k * 0.9 + 0.004]; }, n || 9);
  const metal = c => mt(c, { rough: 0.35, spec: 0.6 }), glow = c => mt(c, { unlit: true, noCast: true });
  function addTo(parent, name, geo, mat, pos, rot) { const n = new Node(name); if (pos) n.pos = pos; if (rot) n.rot = rot; n.meshes.push(new Mesh(geo, mat)); parent.add(n); return n; }

  // chaque pièce : (ch, J, hd, R, L) — J = articulations du corps (mètres), hd = tête (rayon 1), R = fiche de race, L = couleurs du héros
  const PARTS = {
    hornsBig(ch, J, hd) { [-1, 1].forEach(g => addTo(hd, 'acc_horn', spike([[0, 0, 0], [g * 0.22, 0.3, 0.02], [g * 0.5, 0.62, -0.06], [g * 0.56, 1.02, -0.02], [g * 0.4, 1.32, 0.1]], 0.2, 10), mt([0.12, 0.09, 0.1], { spec: 0.4, rough: 0.4 }), hp(g * 0.75, 0.62, 0.93))); },
    hornsBack(ch, J, hd, R) { [-1, 1].forEach(g => addTo(hd, 'acc_horn', spike([[0, 0, 0], [g * 0.1, 0.24, -0.2], [g * 0.2, 0.42, -0.55], [g * 0.26, 0.5, -0.95], [g * 0.3, 0.42, -1.3]], 0.17, 10), mt([0.94, 0.88, 0.6], { spec: 0.4 }), hp(g * 0.6, 0.5, 0.95))); },
    crest(ch, J, hd, R) { for (let i = 0; i < 5; i++) addTo(hd, 'acc_crest', at(cone(0.09, 0.42 - i * 0.04, 6), [0, 0, 0], [-0.5 - i * 0.42, 0, 0]), mt(dk(R.skin, 0.55)), hp(0, 0.12 + i * 0.36, 1.0).map((v, k) => (k === 2 ? -Math.abs(v) * (i ? 1 : -0.3) : v))); },
    tusks(ch, J, hd) { [-1, 1].forEach(g => addTo(hd, 'acc_tusk', spike([[0, 0, 0], [g * 0.03, 0.12, 0.05], [g * 0.02, 0.3, 0.03]], 0.07, 7), mt([0.96, 0.93, 0.82], { spec: 0.3 }), hp(g * 0.34, 2.02, 0.93))); },
    elfEars(ch, J, hd, R) { [-1, 1].forEach(g => addTo(hd, 'acc_ear', tube([[0, 0, 0], [g * 0.4, 0.14, -0.08], [g * 0.82, 0.4, -0.2], [g * 1.25, 0.8, -0.3]], t => [0.2 * (1 - t * 0.9) + 0.01, 0.06 * (1 - t * 0.8) + 0.008], 8), mt(R.skin.map(v => Math.min(1, v * 0.95)), { sss: 0.2 }), hp(g * 1.5, 1.62, 0.9))); },
    elfEarsShort(ch, J, hd, R) { [-1, 1].forEach(g => addTo(hd, 'acc_ear', tube([[0, 0, 0], [g * 0.24, 0.1, -0.06], [g * 0.5, 0.3, -0.16]], t => [0.19 * (1 - t * 0.9) + 0.01, 0.06 * (1 - t * 0.8) + 0.008], 8), mt(dk(R.skin, 0.92)), hp(g * 1.5, 1.62, 0.9))); },
    goblinEars(ch, J, hd, R) { [-1, 1].forEach(g => addTo(hd, 'acc_ear', tube([[0, 0, 0], [g * 0.4, 0.06, -0.04], [g * 0.85, 0.1, -0.12], [g * 1.3, 0.02, -0.2]], t => [0.3 * Math.sin((0.25 + t * 0.75) * PI) * (1 - t * 0.5) + 0.01, 0.05], 8), mt(dk(R.skin, 0.92)), hp(g * 1.5, 1.55, 0.88))); },
    finEars(ch, J, hd, R) { [-1, 1].forEach(g => { const n = new Node('acc_fin'); n.pos = hp(g * 1.5, 1.55, 0.9); n.rot = [0, g * 0.5, 0]; hd.add(n);
      for (let i = 0; i < 4; i++) n.meshes.push(new Mesh(at(EL3(0.03, 0.42 - i * 0.05, 0.11, 8, 6), [g * (0.12 + i * 0.06), 0.2 - i * 0.16, -0.05], [0, 0, -g * (0.5 + i * 0.42)]), mt([0.35, 0.95, 0.9], { twoSide: true, sss: 0.3 }))); }); },
    coral(ch, J, hd) { for (let i = 0; i < 7; i++) { const a = (i - 3) * 0.42, h = 0.5 - Math.abs(i - 3) * 0.08; addTo(hd, 'acc_coral', merge([spike([[0, 0, 0], [0.02, h * 0.5, 0], [-0.03, h, 0.02]], 0.07, 6), at(spike([[0, 0, 0], [0.1, 0.16, 0]], 0.045, 5), [0.01, h * 0.45, 0])]), mt(i % 2 ? [1, 0.5, 0.55] : [1, 0.82, 0.7], { spec: 0.4 }), hp(a, 0.72, 0.98)); } },
    pearls(ch, J) { for (let i = 0; i < 9; i++) { const a = (i - 4) * 0.26; addTo(J.chest, 'r_pearl', EL3(0.022, 0.022, 0.022, 8, 6), metal([0.95, 0.98, 1]), [Math.sin(a) * 0.12, 0.2 - Math.cos(a) * 0.07, 0.07 + Math.cos(a) * 0.05]); } },
    circlet(ch, J, hd) { addTo(hd, 'acc_gem', EL3(0.1, 0.15, 0.06, 8, 6), glow([0.85, 0.7, 1]), hp(0, 1.0, 1.04)); [-1, 1].forEach(g => [0, 1, 2].forEach(i => addTo(hd, 'acc_leaf', at(EL3(0.05, 0.2 - i * 0.03, 0.03, 8, 6), [0, 0, 0], [0, 0, -g * (0.9 + i * 0.3)]), metal([1, 0.85, 0.45]), hp(g * (0.42 + i * 0.3), 1.02 - i * 0.05, 1.05)))); },
    beard(ch, J, hd, R, L) { const c = L.hairRoot || R.hair, m = mt(c.map(v => Math.min(1, v * 1.25)), { rough: 0.9 });
      addTo(hd, 'acc_beard', merge([at(EL3(0.72, 0.62, 0.42, 16, 12), [0, -0.78, 0.5]), at(EL3(0.5, 0.75, 0.34, 14, 12), [0, -1.5, 0.52]), at(EL3(0.3, 0.2, 0.2, 10, 8), [-0.32, -0.3, 0.86]), at(EL3(0.3, 0.2, 0.2, 10, 8), [0.32, -0.3, 0.86])]), m);
      [-1, 1].forEach(g => addTo(hd, 'acc_braid', merge([0, 1, 2, 3].map(i => at(EL3(0.12 - i * 0.012, 0.14, 0.12 - i * 0.012, 8, 6), [g * 0.36, -1.7 - i * 0.24, 0.56]))), m));
      addTo(hd, 'acc_ring', at(lathe([[0.1, 0], [0.13, 0.05], [0.1, 0.1]], 10), [0, -2.2, 0.5]), metal([0.9, 0.72, 0.3])); },
    helmet(ch, J, hd) { addTo(hd, 'acc_helm', lathe([[0.02, 1.16], [0.5, 1.08], [0.9, 0.8], [1.1, 0.42], [1.14, 0.22], [1.2, 0.2]], 22), metal([0.5, 0.5, 0.55]));
      addTo(hd, 'acc_nose', at(EL3(0.09, 0.34, 0.06, 8, 6), [0, 0.02, 1.1]), metal([0.72, 0.58, 0.26]));
      [-1, 1].forEach(g => addTo(hd, 'acc_horn', spike([[0, 0, 0], [g * 0.3, 0.1, 0], [g * 0.5, 0.4, 0.02], [g * 0.46, 0.72, 0.04]], 0.16, 9), mt([0.93, 0.9, 0.8], { spec: 0.3 }), hp(g * 1.5, 1.2, 1.08))); },
    wizardHat(ch, J, hd, R) { const c = R.main.map(v => Math.min(1, v * 1.5 + 0.03));
      addTo(hd, 'acc_hat', lathe([[0.01, 2.5], [0.1, 2.05], [0.3, 1.5], [0.62, 1.0], [0.96, 0.62], [1.02, 0.52], [1.75, 0.42], [1.8, 0.37], [1.0, 0.44]], 26), mt(c, { rough: 0.9, twoSide: true }), [0, 0.1, -0.05], [-0.16, 0, 0.06]);
      addTo(hd, 'acc_hatb', lathe([[1.0, 0.56], [1.05, 0.66], [0.94, 0.78]], 24), metal(R.sec), [0, 0.1, -0.05], [-0.16, 0, 0.06]);
      addTo(hd, 'acc_star', EL3(0.12, 0.12, 0.05, 8, 6), glow([1, 0.9, 0.5]), [0, 0.86, 0.98]); },
    crownSpikes(ch, J, hd) { for (let i = 0; i < 9; i++) { const a = i / 9 * PI * 2; addTo(hd, 'acc_cs', at(cone(0.1, i % 2 ? 0.5 : 0.82, 6), [0, 0, 0], [Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3]), metal([0.2, 0.18, 0.26]), [Math.sin(a) * 0.93, 0.5, Math.cos(a) * 0.93]); }
      addTo(hd, 'acc_cr', lathe([[0.98, 0.42], [1.04, 0.5], [0.98, 0.6]], 24), metal([0.2, 0.18, 0.26])); addTo(hd, 'acc_gem', EL3(0.1, 0.14, 0.06, 8, 6), glow([0.4, 1, 0.5]), [0, 0.52, 1.02]); },
    crystalsHead(ch, J, hd) { [[0, 0.1, 0.9, 0], [0.7, 0.5, 0.6, 0.5], [-0.7, 0.5, 0.6, -0.5], [0.3, 0.7, 0.5, 0.2], [-0.35, 0.72, 0.45, -0.25]].forEach(([ph, th, h, rz]) => addTo(hd, 'acc_cry', at(cone(0.2, h, 5), [0, -0.1, 0], [-0.3, 0, -rz]), glow([1, 0.92, 0.4]), hp(ph, th, 0.95))); },
    crystalsBack(ch, J) { [[0, 0.16, 0.34, 0], [0.12, 0.08, 0.26, 0.5], [-0.12, 0.08, 0.26, -0.5], [0.07, -0.06, 0.2, 0.3], [-0.07, -0.06, 0.2, -0.3]].forEach(([x, y, h, rz]) => addTo(J.chest, 'r_cry', at(cone(0.055, h, 5), [0, 0, 0], [-1.0, 0, -rz]), glow([1, 0.9, 0.35]), [x, y, -0.1])); },
    pauldrons(ch, J, hd, R) { [['shL', 1], ['shR', -1]].forEach(([k, g]) => addTo(J[k], 'r_pld', merge([EL3(0.105, 0.075, 0.1, 12, 8), at(EL3(0.085, 0.05, 0.085, 10, 6), [g * 0.03, -0.05, 0])]), metal(R.sec), [g * 0.03, 0.035, 0], [0, 0, -g * 0.35])); },
    pauldronSpike(ch, J, hd, R) { PARTS.pauldrons(ch, J, hd, R); [['shL', 1], ['shR', -1]].forEach(([k, g]) => [0, 1, 2].forEach(i => addTo(J[k], 'r_spk', at(cone(0.028, 0.13, 6), [0, 0, 0], [(i - 1) * 0.6, 0, -g * 0.5]), mt([0.94, 0.9, 0.8]), [g * 0.05, 0.09, (i - 1) * 0.06]))); },
    pauldronRock(ch, J) { [['shL', 1], ['shR', -1]].forEach(([k, g]) => { addTo(J[k], 'r_rock', merge([EL3(0.14, 0.11, 0.13, 7, 5), at(EL3(0.09, 0.08, 0.09, 6, 4), [g * 0.06, 0.07, 0.03])]), mt([0.36, 0.4, 0.52], { rough: 0.95 }), [g * 0.04, 0.04, 0]); addTo(J[k], 'r_cry', at(cone(0.04, 0.2, 5), [0, 0, 0], [0, 0, -g * 0.5]), glow([1, 0.9, 0.35]), [g * 0.08, 0.12, 0]); }); },
    plate(ch, J, hd, R) { addTo(J.chest, 'r_plate', at(EL3(0.158, 0.135, 0.06, 14, 10), [0, 0.07, 0.062]), R.plate ? mt(R.plate, { rough: 0.9 }) : metal(dk(R.sec, 0.62))); addTo(J.chest, 'r_gem', EL3(0.03, 0.04, 0.02, 8, 6), glow(R.eye), [0, 0.09, 0.14]); },
    belt(ch, J, hd, R) { addTo(J.hips, 'r_belt', lathe([[0.155, -0.02], [0.165, 0.02], [0.155, 0.06]], 20, { sz: 0.78 }), mt([0.28, 0.17, 0.09], { rough: 0.8 }), [0, 0.02, 0]); addTo(J.hips, 'r_buck', at(EL3(0.045, 0.04, 0.018, 8, 6), [0, 0.04, 0.125]), metal([0.9, 0.72, 0.3])); },
    collar(ch, J, hd, R) { addTo(J.chest, 'r_col', lathe([[0.1, 0.0], [0.15, 0.03], [0.17, 0.1], [0.13, 0.2], [0.1, 0.21]], 18, { sz: 0.85 }), mt(dk(R.main, 0.8).map(v => v + 0.03), { twoSide: true, rough: 0.9 }), [0, 0.15, -0.01], [0.12, 0, 0]); },
    robe(ch, J, hd, R, L) { const c = R.robeC || R.main.map(v => Math.min(1, v * 1.25 + 0.02)), fem = L && L.body === 'f';
      addTo(J.hips, 'r_robe', lathe(fem ? [[0.15, 0.1], [0.22, -0.02], [0.262, -0.2], [0.27, -0.45], [0.28, -0.7], [0.29, -0.78], [0.27, -0.76]] : [[0.15, 0.05], [0.17, -0.12], [0.2, -0.42], [0.245, -0.7], [0.26, -0.78], [0.24, -0.76]], 22, { sz: fem ? 0.95 : 0.85 }), mt(dk(c, 0.75), { rough: 0.95, twoSide: true, rim: 0.15 }));
      addTo(J.hips, 'r_robeh', lathe(fem ? [[0.282, -0.72], [0.298, -0.76], [0.282, -0.8]] : [[0.252, -0.72], [0.268, -0.76], [0.252, -0.8]], 22, { sz: fem ? 0.95 : 0.85 }), metal(dk(R.sec, 0.8))); },
    cape(ch, J, hd, R) { const g = grid(8, 8, (u, v) => { const x = (u - 0.5) * (0.36 + v * 0.3); return { p: [x, -v * 0.95, -0.02 - v * 0.16 - Math.cos(u * PI * 4) * 0.012 * v + x * x * 0.5] }; });
      const n = addTo(J.chest, 'r_cape', g, mt(dk(R.sec, 0.7), { twoSide: true, rough: 0.95 }), [0, 0.2, -0.1]); ch.swing.push({ n, base: n.rot.slice(), kf: 0.14, ks: 0.1, ky: -0.04, idle: 0.03, x: [0, 0, 0], v: [0, 0, 0] }); },
    tail(ch, J, R, path, r0, col, tip) { const n = addTo(J.hips, 'r_tail', tube(path, t => { const k = 1 - t * 0.85; return [r0 * k + 0.008, r0 * k + 0.008]; }, 9), mt(col), [0, -0.03, -0.08]);
      if (tip) n.meshes.push(new Mesh(at(tip, path[path.length - 1], [-1.2, 0, 0]), mt(dk(col, 0.6))));
      ch.swing.push({ n, base: [0, 0, 0], kf: 0.12, ks: 0.16, ky: -0.06, idle: 0.07, x: [0, 0, 0], v: [0, 0, 0] }); },
    tailSpade(ch, J, hd, R) { PARTS.tail(ch, J, R, [[0, 0, 0], [0, -0.16, -0.2], [0, -0.3, -0.44], [0, -0.26, -0.68], [0, -0.1, -0.84]], 0.04, dk(R.skin, 0.85), at(cone(0.07, 0.16, 4), [0, 0, 0], [0, 0, 0])); },
    tailDragon(ch, J, hd, R) { PARTS.tail(ch, J, R, [[0, 0, 0], [0, -0.2, -0.22], [0, -0.48, -0.46], [0, -0.66, -0.76], [0, -0.7, -1.05]], 0.085, dk(R.skin, 0.8)); },
    wing(ch, J, col, span, o) { [-1, 1].forEach(g => {
      const geo = grid(10, 5, (u, v) => { const a = 1.25 - u * 1.9, sc = 1 - 0.22 * Math.abs(Math.sin(u * PI * (o.fing || 3))), r = v * span * sc * (0.55 + 0.45 * Math.sin((0.15 + u * 0.7) * PI)); return { p: [g * (0.03 + Math.cos(a) * r * 0.95), Math.sin(a) * r, -r * 0.42 - 0.02] }; });
      const n = addTo(J.chest, 'r_wing', geo, mt(col, Object.assign({ twoSide: true, rough: 0.8 }, o.mat || {})), [g * 0.06, 0.14, -0.1]);
      [0.15, 0.5, 0.85].slice(0, o.bones == null ? 3 : o.bones).forEach(u => { const a = 1.25 - u * 1.9, r = span * 0.98 * (0.55 + 0.45 * Math.sin((0.15 + u * 0.7) * PI)); n.meshes.push(new Mesh(spike([[g * 0.03, 0, -0.02], [g * (0.03 + Math.cos(a) * r * 0.5), Math.sin(a) * r * 0.5, -r * 0.2], [g * (0.03 + Math.cos(a) * r * 0.95), Math.sin(a) * r, -r * 0.42 - 0.02]], 0.018, 6), mt(dk(col, 0.55)))); });
      ch.swing.push({ n, base: [0, 0, 0], kf: 0.05, ks: 0.05, ky: -0.03, idle: o.flap || 0.05, x: [0, 0, 0], v: [0, 0, 0] }); }); },
    wingsBat(ch, J, hd, R) { PARTS.wing(ch, J, dk(R.skin, 0.5), 0.62, { fing: 3 }); },
    wingsDragon(ch, J, hd, R) { PARTS.wing(ch, J, dk(R.skin, 0.42), 0.74, { fing: 4 }); },
    wingsFairy(ch, J) { [-1, 1].forEach(g => [[0.62, 0.9, 0.5], [0.42, -0.35, 0.36]].forEach(([len, ang, w], i) => {
      const n = addTo(J.chest, 'r_fw', at(EL3(len * 0.5, w * 0.5 * 0.55, 0.006, 14, 8), [g * len * 0.5, 0, 0]), mt(i ? [0.8, 0.9, 1] : [1, 0.86, 1], { unlit: true, noCast: true, twoSide: true, alpha: 0.62 }), [g * 0.05, 0.15, -0.11], [0, g * 0.55, g * ang]);
      ch.swing.push({ n, base: n.rot.slice(), kf: 0.04, ks: 0.04, ky: -0.02, idle: 0.16, x: [0, 0, 0], v: [0, 0, 0] }); })); },
    orbs(ch, J, hd, R) { const n = new Node('r_orbs'); n.pos = [0, 0.16, 0]; J.chest.add(n); for (let i = 0; i < 3; i++) { const a = i / 3 * PI * 2; n.meshes.push(new Mesh(at(EL3(0.04, 0.04, 0.04, 10, 8), [Math.cos(a) * 0.44, (i - 1) * 0.12, Math.sin(a) * 0.44]), glow(R.eye))); } (ch.spin = ch.spin || []).push(n); }
  };
  RACE_API = { PARTS, addTo, at, hp, mt, dk, cone, spike, metal, glow, P16: {} };
  function applyRace(ch, look) {
    const R = RACES[look.race]; if (!R || ch.raced) return ch; ch.raced = true;
    const J = ch.J, hd = (ch.hq || ch).J.hd;
    ch.raceS = R.s || 1; ch.root.s = (typeof ch.root.s === 'number' ? ch.root.s : 1) * ch.raceS;
    Object.keys(R.js || {}).forEach(k => { if (J[k]) J[k].s = (typeof J[k].s === 'number' ? J[k].s : 1) * R.js[k]; });
    R.parts.forEach(p => { try { if (PARTS[p] && (hd || !/^(horns|crest|tusks|elf|goblin|fin|coral|circlet|beard|helmet|wizard|crown|crystalsHead)/.test(p))) PARTS[p](ch, J, hd, R, look); } catch (e) { console.warn('race', p, e); } });
    // v16 : pièces paramétrées (design16.js) ; crâne nu si la tête est couverte ou remplacée
    const hx = (ch.hq || ch).J.hd;
    if (R.bald && hx) { const strip = n => { n.meshes = n.meshes.filter(m => !/^(hair|tie|hairCap|hood|hoodHem)$/.test(m.slot || '')); n.kids.forEach(strip); }; strip(hx); }
    const ctx = { ch, J, hd, R, L: look };
    (R.p || []).forEach(a => { const f = RACE_API.P16[a[0]]; try { if (f) f.apply(null, [ctx].concat(a.slice(1))); else console.warn('race pièce inconnue', a[0]); } catch (e) { console.warn('race', look.race, a[0], e.message); } });
    return ch;
  }
  // couleurs du héros : peau, cheveux, yeux et tenue de la race
  const _lookOf = HQ.lookOf;
  HQ.lookOf = function (h) {
    const L = _lookOf(h), R = RACES[h.id];
    if (R && !L.race) Object.assign(L, { race: h.id, skinCol: R.skin, skin: R.skin, hairRoot: dk(R.hair, 0.7), hairTip: R.hair.map(v => Math.min(1, v * 1.15)), browC: dk(R.hair, 0.6), eye: R.eye, eyeL: R.eye.map(v => Math.min(1, v * 1.2)), eyeD: dk(R.eye, 0.4), main: R.main, sec: R.sec, pants: R.pants, shirt: dk(R.main, 0.7), acc: null, cape: false, rim: R.eye, suit: R.suit || 'flat', bootC: R.boot || dk(R.main, 0.45), hair: R.hairStyle || L.hair, scar: false, mark: null });
    return L;
  };
  const _build = HQ.build;
  HQ.build = function (R, look, seed) { const ch = _build(R, look, seed); return look && look.race ? applyRace(ch, look) : ch; };
  const _setPose = HQ.setPose;
  HQ.setPose = function (ch, p, dt) { _setPose(ch, p, dt); if (ch.spin && dt) ch.spin.forEach(n => { n.rot[1] += dt * 1.6; }); };
})();

;

/* ---------- design16.js (jeu) ---------- */
/* ===================== v16 : 99 HÉROS, 99 CRÉATURES DIFFÉRENTES =====================
   Chaque héros a son espèce, sa peau, ses proportions et ses pièces (tête, dos, queue, tenue).
   La tenue d'origine des modèles n'est plus visible : elle devient peau, combinaison unie ou métal (voir vrm.js > look.suit).
   P16 = pièces paramétrées ; RACES (race15.js) reçoit ici les 89 fiches qui manquaient. */
(function () {
  const { ellipsoid: E, tube, lathe, merge, xformGeo, grid, capsule, Node, Mesh, M } = G3, PI = Math.PI;
  const { PARTS, addTo: add, at, hp, mt, dk, cone, spike, metal, glow, P16 } = RACE_API;
  const hx = h => { const n = parseInt(String(h).slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
  const RB = ['#ff5a5a', '#ffb02a', '#ffe14d', '#5ad06a', '#3ab0ff', '#8a5aff', '#ff7ae0'];
  const C = (h, i) => (h === 'rainbow' ? hx(RB[(i || 0) % RB.length]) : Array.isArray(h) ? h : hx(h));
  const S = f => [-1, 1].forEach(f);
  const fcone = (w, h, sz, n) => lathe([[w, 0], [w * 0.72, h * 0.4], [w * 0.32, h * 0.8], [0.008, h]], n || 8, { sz: sz || 0.3 });
  const fin = (w, h) => lathe([[w, 0], [w * 0.8, h * 0.35], [w * 0.4, h * 0.75], [0.008, h]], 8, { sx: 0.12 });
  const ring = (r, t, n) => lathe([[r, -t], [r + t, 0], [r, t], [r - t, 0], [r, -t]], n || 16);
  const blobs = L => merge(L.map(([x, y, z, r, ry]) => at(E(r, ry || r, r, 9, 7), [x, y, z])));
  const cloth = (c, o) => mt(c, Object.assign({ rough: 0.95, twoSide: true, rim: 0.15 }, o || {}));
  const glass = (c, a) => mt(c, { unlit: true, noCast: true, twoSide: true, alpha: a || 0.55 });
  const shiny = c => mt(c, { spec: 0.9, rough: 0.15, rim: 0.9 });
  const mixc = (x, y, t) => x.map((v, i) => v * (1 - t) + y[i] * t);
  const bone = [0.93, 0.9, 0.82], dark = [0.08, 0.07, 0.09], white = [1, 1, 1];
  const sw = (c, n, idle, kf) => c.ch.swing.push({ n, base: n.rot.slice(), kf: kf || 0.1, ks: 0.1, ky: -0.04, idle: idle || 0.05, x: [0, 0, 0], v: [0, 0, 0] });
  const spin = (c, n) => (c.ch.spin = c.ch.spin || []).push(n);
  const jn = (c, k) => c.J[k];
  const H = f => function (c) { if (c.hd) f.apply(null, arguments); };   // pièce de tête : seulement si la tête existe

  /* ================= TÊTE (repère de la tête : rayon 1, face vers +z) ================= */
  P16.horns = H((c, kind, col, k, fx) => {
    const hd = c.hd, m = fx === 'glow' ? glow(C(col || '#fff0c0')) : mt(C(col || '#ede6cc'), { spec: 0.35, rough: 0.45 }); k = k || 1;
    if (kind === 'uni') { add(hd, 'acc_horn', spike([[0, 0, 0], [0, 0.5 * k, 0.14], [0, 1.0 * k, 0.24], [0, 1.45 * k, 0.3]], 0.13, 10), m, hp(0, 0.72, 0.95)); return; }
    if (kind === 'antler') { S(g => add(hd, 'acc_horn', merge([spike([[0, 0, 0], [g * 0.2, 0.4, 0], [g * 0.45, 0.8, -0.05], [g * 0.5, 1.25, 0]], 0.09, 8), at(spike([[0, 0, 0], [g * 0.3, 0.25, 0.1]], 0.06, 6), [g * 0.2, 0.4, 0]), at(spike([[0, 0, 0], [g * 0.32, 0.22, -0.1]], 0.055, 6), [g * 0.42, 0.75, -0.04]), at(spike([[0, 0, 0], [-g * 0.15, 0.3, 0.05]], 0.05, 6), [g * 0.33, 0.6, 0])]), m, hp(g * 0.6, 0.5, 0.93))); return; }
    if (kind === 'magnet') { S(g => { const p = hp(g * 1.2, 0.85, 0.95); add(hd, 'acc_horn', tube([[0, 0, 0], [g * 0.3, 0.2, 0], [g * 0.4, 0.6, 0], [g * 0.25, 1.0, 0]], () => [0.14, 0.14], 8), m, p); add(hd, 'acc_horn', at(E(0.16, 0.14, 0.16, 8, 6), [g * 0.25, 1.05, 0]), metal(C(k === 1 ? '#e8e8f0' : k)), p); }); return; }
    const K = { ram: g => [[0, 0, 0], [g * 0.35, 0.25, -0.1], [g * 0.62, 0.05, -0.3], [g * 0.56, -0.32, -0.25], [g * 0.36, -0.42, 0.02], [g * 0.3, -0.2, 0.22]], bull: g => [[0, 0, 0], [g * 0.45, 0.02, 0], [g * 0.82, 0.22, 0.05], [g * 0.92, 0.65, 0.1]],
      small: g => [[0, 0, 0], [g * 0.05, 0.2, 0.02], [g * 0.08, 0.38, 0.06]], oni: g => [[0, 0, 0], [g * 0.08, 0.32, 0.05], [g * 0.04, 0.66, 0.14]], long: g => [[0, 0, 0], [g * 0.15, 0.5, -0.1], [g * 0.22, 1.0, -0.3], [g * 0.12, 1.5, -0.36]] }[kind];
    const side = kind === 'bull' || kind === 'ram', r0 = kind === 'small' ? 0.11 : kind === 'ram' ? 0.2 : 0.16;
    S(g => add(hd, 'acc_horn', spike(K(g), r0, 10), m, hp(g * (side ? 1.3 : 0.6), side ? 1.0 : 0.55, 0.93)));
  });
  P16.ears = H((c, kind, col, inner) => {
    const hd = c.hd, m = mt(C(col || c.R.skin)), mi = mt(C(inner || '#ffc0d0'));
    const tri = (w, h, th, ph, rz) => S(g => { const p = hp(g * ph, th, 0.92); add(hd, 'acc_ear', at(fcone(w, h, 0.34), [0, 0, 0], [0, 0, -g * rz]), m, p); add(hd, 'acc_ear', at(fcone(w * 0.55, h * 0.7, 0.2), [0, 0.03, 0.07], [0, 0, -g * rz]), mi, p); });
    if (kind === 'fox') tri(0.34, 0.78, 0.62, 0.62, 0.22); else if (kind === 'cat') tri(0.3, 0.5, 0.62, 0.68, 0.3); else if (kind === 'wolf') tri(0.27, 0.66, 0.6, 0.6, 0.15); else if (kind === 'bat') tri(0.36, 0.95, 0.75, 0.85, 0.5); else if (kind === 'feather') tri(0.13, 0.55, 0.55, 0.7, 0.45);
    else if (kind === 'bunny') S(g => { const p = hp(g * 0.42, 0.42, 0.9); add(hd, 'acc_ear', at(E(0.15, 0.62, 0.08, 10, 8), [g * 0.08, 0.55, 0], [0, 0, -g * 0.14]), m, p); add(hd, 'acc_ear', at(E(0.08, 0.46, 0.03, 8, 6), [g * 0.08, 0.55, 0.07], [0, 0, -g * 0.14]), mi, p); });
    else if (kind === 'flap') S(g => add(hd, 'acc_ear', at(E(0.55, 0.65, 0.07, 12, 8), [g * 0.45, -0.1, 0], [0, -g * 0.35, 0]), m, hp(g * 1.5, 1.45, 0.9)));
    else S(g => { const p = hp(g * 0.78, 0.68, 0.98); add(hd, 'acc_ear', E(0.26, 0.26, 0.1, 10, 8), m, p); add(hd, 'acc_ear', at(E(0.15, 0.15, 0.05, 8, 6), [0, 0, 0.07]), mi, p); });
  });
  P16.muzzle = H((c, kind, col, c2, k) => {
    const hd = c.hd, m = mt(C(col || c.R.skin)); k = k || 1;
    const beast = s => { add(hd, 'acc_muz', at(E(0.4 * s, 0.32 * s, 0.42 * s, 12, 9), [0, -0.36, 0.8]), m); add(hd, 'acc_nose', at(E(0.12, 0.085, 0.07, 8, 6), [0, -0.25, 0.8 + 0.42 * s]), mt(C(c2 || '#1a1210'), { spec: 0.5 })); };
    if (kind === 'beast') beast(k);
    else if (kind === 'snout') { add(hd, 'acc_muz', at(E(0.3, 0.24, 0.55, 12, 9), [0, -0.38, 0.95]), m); S(g => add(hd, 'acc_nose', at(E(0.04, 0.04, 0.04, 6, 5), [g * 0.1, -0.27, 1.47]), mt(dark))); }
    else if (kind === 'beak') add(hd, 'acc_muz', at(cone(0.21, 0.62 * (typeof c2 === 'number' ? c2 : k), 8), [0, -0.3, 0.86], [PI / 2, 0, 0]), mt(C(col), { spec: 0.4 }));
    else if (kind === 'beakS') add(hd, 'acc_muz', at(E(0.3, 0.2, 0.3, 10, 8), [0, -0.4, 0.86]), m);
    else if (kind === 'beakLong') { add(hd, 'acc_mask', at(E(0.86, 0.78, 0.3, 14, 10), [0, 0.0, 0.76]), m); add(hd, 'acc_muz', at(cone(0.27, 1.15, 10), [0, -0.2, 0.9], [PI / 2 + 0.16, 0, 0]), m); S(g => add(hd, 'acc_lens', at(E(0.2, 0.2, 0.06, 10, 8), [g * 0.36, 0.14, 1.02]), glow(C(c2 || '#3affb0')))); }
    else if (kind === 'rhino') { beast(1.12); add(hd, 'acc_horn', spike([[0, 0, 0], [0, 0.3, 0.14], [0, 0.62, 0.14]], 0.15, 9), mt(C(c2 || '#e8e0d0'), { spec: 0.4 }), [0, -0.2, 1.2]); add(hd, 'acc_horn', spike([[0, 0, 0], [0, 0.22, 0.05]], 0.1, 8), mt(C(c2 || '#e8e0d0')), [0, 0.1, 1.02]); }
    else if (kind === 'trunk') { add(hd, 'acc_muz', tube([[0, -0.25, 0.9], [0, -0.7, 1.25], [0, -1.3, 1.3], [0, -1.75, 1.1], [0, -1.9, 0.88]], t => [0.2 - t * 0.1, 0.2 - t * 0.1], 9), m); S(g => add(hd, 'acc_tusk', spike([[g * 0.3, -0.55, 0.85], [g * 0.5, -1.0, 1.2], [g * 0.56, -0.9, 1.7], [g * 0.45, -0.55, 1.95]], 0.09, 8), mt(C(c2 || '#f4ecd8'), { spec: 0.4 }))); }
    else if (kind === 'nose') add(hd, 'acc_nose', at(E(0.2 * k, 0.24 * k, 0.24 * k, 10, 8), [0, -0.15, 1.0]), m);
    else if (kind === 'seahorse') add(hd, 'acc_muz', tube([[0, -0.3, 0.85], [0, -0.4, 1.4], [0, -0.42, 1.85]], t => [0.2 - t * 0.09, 0.2 - t * 0.09], 9), m);
  });
  P16.hat = H((c, kind, col, c2) => {
    const hd = c.hd, m = cloth(C(col)), P = [0, 0.1, -0.05], Rr = [-0.12, 0, 0.04];
    if (kind === 'kasa') add(hd, 'acc_hat', lathe([[0.02, 1.5], [0.9, 0.98], [1.72, 0.55], [1.74, 0.5], [0.9, 0.9]], 22), m, P, Rr);
    else if (kind === 'gnome') { add(hd, 'acc_hat', lathe([[0.01, 2.7], [0.22, 2.0], [0.58, 1.25], [0.98, 0.62], [1.06, 0.45], [0.96, 0.4]], 22), m, P, [-0.3, 0, 0.1]); add(hd, 'acc_hat', lathe([[1.0, 0.44], [1.1, 0.54], [1.0, 0.64]], 22), mt(C(c2 || '#ffe14d')), P, [-0.3, 0, 0.1]); }
    else if (kind === 'straw') add(hd, 'acc_hat', lathe([[0.02, 1.3], [0.6, 1.24], [0.86, 0.98], [0.9, 0.56], [1.75, 0.46], [1.77, 0.4], [0.9, 0.5]], 22), m, P, Rr);
    else if (kind === 'plague') add(hd, 'acc_hat', lathe([[0.02, 1.55], [0.72, 1.55], [0.84, 1.42], [0.88, 0.56], [1.65, 0.46], [1.67, 0.4], [0.88, 0.5]], 22), m, P, Rr);
    else if (kind === 'topknot') { add(hd, 'acc_knot', at(E(0.22, 0.3, 0.22, 10, 8), [0, 1.2, -0.12]), mt(C(col))); add(hd, 'acc_knot', lathe([[0.2, 0.96], [0.24, 1.0], [0.2, 1.04]], 12), metal(C(c2 || '#e8d48a')), [0, 0, -0.12]); }
  });
  P16.helm = H((c, kind, col, c2, c3) => {
    const hd = c.hd, m = metal(C(col || '#8a8f96')), g2 = glow(C(c2 || c.R.eye));
    if (kind === 'full') { add(hd, 'acc_helm', lathe([[0.02, 1.32], [0.6, 1.24], [1.06, 0.92], [1.26, 0.3], [1.26, -0.6], [1.06, -1.0], [0.9, -1.06]], 24), m); add(hd, 'acc_vis', at(E(0.78, 0.065, 0.2, 12, 6), [0, 0.06, 1.13]), g2); add(hd, 'acc_vis', at(E(0.05, 0.42, 0.12, 6, 8), [0, -0.4, 1.2]), mt(dark));
      add(hd, 'acc_plume', tube([[0, 1.25, 0.2], [0, 1.75, -0.1], [0, 1.6, -0.8], [0, 1.0, -1.25]], t => [0.1 + Math.sin(t * PI) * 0.12, 0.16 + Math.sin(t * PI) * 0.2], 8), cloth(C(c3 || '#c8321e'))); }
    else if (kind === 'kabuto') { add(hd, 'acc_helm', lathe([[0.02, 1.24], [0.6, 1.16], [1.0, 0.86], [1.2, 0.42], [1.24, 0.32]], 24), m); add(hd, 'acc_helm', lathe([[1.2, 0.36], [1.5, -0.2], [1.62, -0.34], [1.56, -0.36]], 20, { phi0: PI * 0.5, phiLen: PI }), m);
      S(g => add(hd, 'acc_crest', spike([[0, 0, 0], [g * 0.4, 0.3, 0], [g * 0.62, 0.8, 0], [g * 0.46, 1.25, 0]], 0.075, 8), metal(C(c2 || '#c9a03a')), [0, 0.72, 1.02])); add(hd, 'acc_crest', at(E(0.1, 0.1, 0.05, 8, 6), [0, 0.72, 1.06]), metal(C(c2 || '#c9a03a'))); }
    else if (kind === 'robotdome') { add(hd, 'acc_helm', E(1.3, 1.3, 1.3, 20, 14), m); add(hd, 'acc_vis', lathe([[1.31, -0.08], [1.34, 0.08], [1.31, 0.24]], 18, { phi0: -PI * 0.36, phiLen: PI * 0.72 }), g2); S(g => add(hd, 'acc_bolt', at(E(0.16, 0.16, 0.1, 8, 6), [g * 1.28, 0, 0], [0, g * PI / 2, 0]), metal(dk(C(col), 0.6)))); add(hd, 'acc_ant', capsule([0, 1.25, 0], [0, 1.7, 0], 0.03, 0.03, 6), metal(dk(C(col), 0.6))); add(hd, 'acc_ant', at(E(0.09, 0.09, 0.09, 8, 6), [0, 1.75, 0]), g2); }
    else if (kind === 'sack') { add(hd, 'acc_helm', E(1.26, 1.36, 1.26, 18, 12), cloth(C(col), { twoSide: false })); S(g => add(hd, 'acc_eye', at(E(0.17, 0.2, 0.06, 8, 6), [g * 0.38, 0.12, 1.2]), mt(dark))); for (let i = 0; i < 5; i++) add(hd, 'acc_st', at(E(0.03, 0.12, 0.03, 5, 4), [(i - 2) * 0.17, -0.45 + Math.abs(i - 2) * 0.05, 1.16]), mt(dark)); add(hd, 'acc_rope', lathe([[0.86, -1.0], [0.96, -0.92], [0.86, -0.84]], 16), mt([0.5, 0.36, 0.2])); }
    else if (kind === 'lantern') { add(hd, 'acc_helm', lathe([[0.5, 1.5], [1.1, 1.3], [1.32, 1.0], [1.22, 0.9], [1.38, 0.6], [1.26, 0.5], [1.4, 0.2], [1.28, 0.1], [1.4, -0.2], [1.26, -0.3], [1.34, -0.6], [1.1, -0.9], [0.5, -1.1]], 22, { sub: 2 }), glow(C(col || '#ffcf7a'))); [1.5, -1.12].forEach(y => add(hd, 'acc_cap', lathe([[0.02, y + 0.1], [0.56, y + 0.1], [0.6, y], [0.56, y - 0.1], [0.02, y - 0.1]], 16, { sub: 1 }), mt(C(c2 || '#1a1010'))));
      add(hd, 'acc_eye', at(E(0.36, 0.36, 0.1, 12, 8), [0, 0.42, 1.34]), mt(white, { unlit: true })); add(hd, 'acc_eye', at(E(0.16, 0.2, 0.06, 8, 6), [0, 0.42, 1.43]), mt(dark, { unlit: true })); add(hd, 'acc_tongue', tube([[0, -0.42, 1.25], [0, -0.75, 1.5], [0, -1.2, 1.45]], t => [0.2 - t * 0.06, 0.06], 7), mt([0.86, 0.18, 0.22])); }
    else if (kind === 'chest') { const wood = mt(C(col), { rough: 0.8 }), box = (r, y0, y1) => at(lathe([[0.01, y1], [r, y1], [r, y0], [0.01, y0]], 4, { sub: 1 }), [0, 0, 0], [0, PI / 4, 0]);
      add(hd, 'acc_helm', box(1.8, -1.0, 0.2), wood); add(hd, 'acc_lid', at(box(1.8, 0, 0.5), [0, 0.42, -0.25], [-0.32, 0, 0]), wood); [-1.0, 0.16].forEach(y => add(hd, 'acc_band', box(1.84, y, y + 0.1), metal(C(c2 || '#e8c040')))); add(hd, 'acc_lock', at(E(0.16, 0.2, 0.08, 8, 6), [0, -0.3, 1.3]), metal(C(c2 || '#e8c040')));
      for (let i = 0; i < 7; i++) add(hd, 'acc_tooth', at(cone(0.09, 0.26, 4), [(i - 3) * 0.33, 0.2, 1.2]), mt(white)); S(g => add(hd, 'acc_eye', at(E(0.14, 0.14, 0.08, 8, 6), [g * 0.42, 0.52, 0.9]), glow(C(c3 || '#ff3a5a')))); add(hd, 'acc_in', at(E(1.1, 0.3, 1.0, 10, 6), [0, 0.3, 0]), mt(dark, { unlit: true })); }
    else if (kind === 'skull') { const b = mt(C(col || '#e8e4d8'), { rough: 0.6 }); add(hd, 'acc_helm', at(E(1.06, 1.12, 1.08, 18, 12), [0, 0.06, 0.02]), b); S(g => { add(hd, 'acc_eye', at(E(0.25, 0.29, 0.1, 10, 8), [g * 0.36, 0.1, 1.02]), mt(dark, { unlit: true })); add(hd, 'acc_eye', at(E(0.08, 0.08, 0.05, 6, 5), [g * 0.36, 0.1, 1.1]), g2); }); add(hd, 'acc_nose', at(E(0.08, 0.13, 0.05, 6, 5), [0, -0.28, 1.08]), mt(dark, { unlit: true })); add(hd, 'acc_jaw', at(E(0.62, 0.34, 0.5, 12, 8), [0, -0.82, 0.48]), b); for (let i = 0; i < 6; i++) add(hd, 'acc_tooth', at(E(0.055, 0.1, 0.04, 5, 4), [(i - 2.5) * 0.14, -0.66, 0.98 - Math.abs(i - 2.5) * 0.03]), mt(dark, { unlit: true })); }
    else if (kind === 'mask') { add(hd, 'acc_helm', at(E(0.86, 1.3, 0.2, 14, 12), [0, 0.12, 1.02]), mt(C(col), { rough: 0.7 })); S(g => { add(hd, 'acc_eye', at(E(0.2, 0.1, 0.06, 8, 6), [g * 0.36, 0.2, 1.2], [0, 0, g * 0.25]), g2); add(hd, 'acc_paint', at(E(0.07, 0.36, 0.03, 6, 6), [g * 0.5, -0.4, 1.17]), mt(C(c3 || '#ffffff'), { unlit: true })); }); add(hd, 'acc_mouth', at(E(0.3, 0.09, 0.05, 8, 6), [0, -0.7, 1.16]), mt(dark, { unlit: true })); add(hd, 'acc_paint', at(E(0.08, 0.3, 0.03, 6, 6), [0, 0.95, 1.15]), mt(C(c3 || '#ffffff'), { unlit: true })); }
    else if (kind === 'bone') { const b = mt(C(col || '#e8e2d0'), { rough: 0.6 }); add(hd, 'acc_helm', at(E(1.2, 0.78, 1.25, 16, 10), [0, 0.8, 0.1]), b); add(hd, 'acc_helm', at(E(0.52, 0.3, 0.75, 12, 8), [0, 0.52, 1.3]), b); S(g => { add(hd, 'acc_horn', spike([[0, 0, 0], [g * 0.2, 0.3, -0.5], [g * 0.3, 0.5, -1.1], [g * 0.2, 0.9, -1.6]], 0.2, 9), b, [g * 0.7, 1.1, -0.3]); add(hd, 'acc_eye', at(E(0.2, 0.16, 0.12, 8, 6), [g * 0.52, 0.7, 1.02]), mt(dark, { unlit: true })); add(hd, 'acc_eye', at(E(0.08, 0.08, 0.06, 6, 5), [g * 0.52, 0.7, 1.1]), g2); for (let i = 0; i < 4; i++) add(hd, 'acc_tooth', at(cone(0.06, 0.2, 4), [g * (0.42 - i * 0.03), 0.34, 1.0 + i * 0.26], [PI, 0, 0]), b); }); }
    else if (kind === 'nemes') { add(hd, 'acc_helm', lathe([[0.2, 1.26], [0.9, 1.12], [1.22, 0.62], [1.32, -0.2], [1.52, -1.25], [1.46, -1.3]], 22, { phi0: PI * 0.3, phiLen: PI * 1.4 }), cloth(C(col))); add(hd, 'acc_band', lathe([[1.04, 0.5], [1.1, 0.6], [1.04, 0.7]], 22), metal(C(c2 || '#2a5ab0'))); add(hd, 'acc_gem', at(E(0.1, 0.16, 0.08, 8, 6), [0, 0.72, 1.06]), glow(C(c.R.eye)));
      for (let i = 0; i < 4; i++) add(hd, 'acc_stripe', lathe([[1.27 + i * 0.05, 0.2 - i * 0.36], [1.31 + i * 0.05, 0.14 - i * 0.36], [1.29 + i * 0.05, 0.06 - i * 0.36]], 20, { phi0: PI * 0.3, phiLen: PI * 1.4 }), cloth(C(c2 || '#2a5ab0'))); }
    else if (kind === 'winged') { add(hd, 'acc_helm', lathe([[1.04, 0.3], [1.11, 0.46], [1.04, 0.62]], 24), m); add(hd, 'acc_helm', at(E(0.07, 0.3, 0.05, 6, 6), [0, 0.1, 1.06]), m); S(g => [0, 1, 2].forEach(i => add(hd, 'acc_wing', at(E(0.07, 0.46 - i * 0.09, 0.17, 8, 8), [g * 0.12, 0.42 - i * 0.02, -0.02 - i * 0.14], [0, 0, -g * (0.25 + i * 0.3)]), mt(C(c2 || '#ffffff')), [g * 1.02, 0.5, 0]))); }
    else if (kind === 'mushroom') { add(hd, 'acc_helm', lathe([[0.02, 1.95], [0.9, 1.8], [1.72, 1.24], [2.02, 0.72], [1.92, 0.5], [1.0, 0.6], [0.6, 0.72]], 24), mt(C(col), { rough: 0.6, spec: 0.25 })); [[0, 1.93, 0, 0.3], [0.9, 1.6, 0.5, 0.26], [-0.8, 1.62, 0.6, 0.22], [0.3, 1.5, -1.1, 0.26], [-1.1, 1.3, -0.6, 0.24], [1.3, 1.2, -0.4, 0.2], [-0.2, 1.36, 1.3, 0.2]].forEach(([x, y, z, r]) => add(hd, 'acc_spot', at(E(r, r * 0.4, r, 8, 5), [x, y, z]), mt(C(c2 || '#ffffff')))); }
    else if (kind === 'jelly') { add(hd, 'acc_helm', lathe([[0.02, 1.65], [0.8, 1.55], [1.36, 1.04], [1.52, 0.42], [1.42, 0.2]], 22), glass(C(col), 0.6)); const L = []; for (let i = 0; i < 9; i++) { const a = i / 9 * PI * 2, x = Math.sin(a) * 1.3, z = Math.cos(a) * 1.3; if (z > 0.7) continue; L.push(tube([[x, 0.3, z], [x * 1.1, -0.4, z * 1.1], [x * 0.95, -1.1, z * 0.95], [x * 1.08, -1.8, z * 1.08]], t => [0.07 - t * 0.04, 0.07 - t * 0.04], 5)); } add(hd, 'acc_tent', merge(L), glow(C(c2 || col))); }
    else if (kind === 'hood') add(hd, 'acc_helm', lathe([[0.02, 1.36], [0.72, 1.28], [1.18, 0.82], [1.28, 0.1], [1.22, -0.7], [1.02, -1.12]], 22, { phi0: PI * 0.2, phiLen: PI * 1.6 }), cloth(C(col)));
    else if (kind === 'cobra') { add(hd, 'acc_helm', lathe([[0.3, 1.32], [1.2, 1.02], [1.72, 0.3], [1.5, -0.6], [0.8, -1.32]], 20, { phi0: PI * 0.5, phiLen: PI, sz: 0.5 }), mt(C(col), { twoSide: true })); S(g => add(hd, 'acc_spot', at(E(0.2, 0.26, 0.04, 8, 6), [g * 1.1, 0.3, -0.08]), mt(C(c2 || '#e8d060'), { unlit: true }))); }
    else if (kind === 'dome') add(hd, 'acc_helm', at(E(1.34, 1.3, 1.34, 20, 14), [0, 0.1, 0]), glass(C(col), 0.5));
    else if (kind === 'pyramid') { add(hd, 'acc_helm', at(lathe([[0.01, 2.3], [2.0, -1.0], [0.01, -1.0]], 3, { sub: 1 }), [0, 0, 0], [0, PI, 0]), glass([0.92, 0.95, 1], 0.4)); for (let i = 0; i < 3; i++) { const a = PI + i * PI * 2 / 3; add(hd, 'acc_edge', capsule([0, 2.3, 0], [Math.sin(a) * 2.0, -1.0, Math.cos(a) * 2.0], 0.035, 0.035, 5), glow(C('rainbow', i * 2))); } }
  });
  P16.crown = H((c, kind, a, b, k) => {
    const hd = c.hd;
    if (kind === 'flame') { const s = k || 1, fl = (r, h) => lathe([[r * 0.8, 0], [r, h * 0.25], [r * 0.6, h * 0.62], [0.01, h]], 8), P = [[0, 0, 1.25], [0.5, 0.25, 0.9], [-0.5, 0.2, 0.95], [0.25, -0.45, 0.85], [-0.3, -0.4, 0.8], [0.0, 0.55, 0.7], [0.7, -0.2, 0.6], [-0.72, -0.15, 0.62]];
      add(hd, 'acc_flame', merge(P.map(([x, z, h]) => at(fl(0.36 * s, h * 1.1 * s), [x * 0.8, 0.72, z * 0.8 - 0.05]))), glow(C(a))); add(hd, 'acc_flame', merge(P.map(([x, z, h]) => at(fl(0.2 * s, h * 0.75 * s), [x * 0.8, 0.76, z * 0.8 - 0.05]))), glow(C(b || '#ffe27a'))); }
    else if (kind === 'leaf') { const L = []; for (let i = 0; i < 11; i++) { const an = i / 11 * PI * 2; L.push(at(at(fcone(0.17, 0.55, 0.25), [0, 0, 1.0], [0.55, 0, 0]), [0, 0.42, 0], [0, an, 0])); } add(hd, 'acc_leaf', merge(L), mt(C(a))); }
    else if (kind === 'flower') { const fl = s => merge([0, 1, 2, 3, 4].map(i => at(at(E(0.1 * s, 0.035 * s, 0.17 * s, 8, 6), [0, 0, 0.17 * s]), [0, 0, 0], [0, i * PI * 2 / 5, 0]))), big = k === 'big', pos = b === 1 || big ? [[0.62, 1.0, 0.3]] : [hp(0.9, 0.82, 1.03), hp(-0.9, 0.82, 1.03), hp(0, 0.46, 1.03)];
      pos.forEach(p => { add(hd, 'acc_flower', at(fl(big ? 2.6 : 1.2), [0, 0, 0], [PI / 2 - 0.5, 0, 0]), mt(C(a)), p); add(hd, 'acc_flower', E(big ? 0.2 : 0.09, big ? 0.2 : 0.09, big ? 0.2 : 0.09, 8, 6), mt([1, 0.85, 0.3]), [p[0], p[1] + 0.03, p[2] + 0.05]); }); }
    else if (kind === 'ice' || kind === 'crystal') { const n = 7; for (let i = 0; i < n; i++) { const an = (i - 3) * 0.42, h = 0.95 - Math.abs(i - 3) * 0.17; add(hd, 'acc_ice', at(cone(0.17, h, 5), [0, -0.12, 0], [-0.28, 0, -an * 0.5]), kind === 'ice' ? shiny(C(a, i)) : glow(C(a, i)), hp(an, 0.74, 0.97)); } }
    else if (kind === 'tiara') { add(hd, 'acc_tiara', lathe([[1.03, 0.44], [1.08, 0.5], [1.03, 0.56]], 18, { phi0: -PI * 0.42, phiLen: PI * 0.84 }), metal(C(a))); add(hd, 'acc_gem', at(E(0.1, 0.16, 0.07, 8, 6), [0, 0.6, 1.02]), glow(C(b || c.R.eye))); S(g => add(hd, 'acc_gem', at(E(0.06, 0.09, 0.05, 6, 5), [g * 0.42, 0.56, 0.95]), glow(C(b || c.R.eye)))); }
    else if (kind === 'feather') { for (let i = 0; i < 5; i++) add(hd, 'acc_feather', at(E(0.08, 0.5 - Math.abs(i - 2) * 0.07, 0.17, 8, 8), [0, 0.45, 0], [-0.5, 0, -(i - 2) * 0.34]), mt(C(a, i)), [0, 0.86, -0.35]); }
    else if (kind === 'snakes') { const L = [], Hh = []; for (let i = 0; i < 10; i++) { const p = hp(i / 10 * PI * 2 + 0.3, 0.55 + (i % 3) * 0.22, 0.95), q = p.map(v => v * 1.45), r = p.map(v => v * 1.85), e = p.map(v => v * 2.0); q[1] += 0.25; r[1] += 0.1 + (i % 2) * 0.3; e[1] += -0.15 + (i % 2) * 0.35; L.push(tube([p, q, r, e], t => [0.1 - t * 0.04, 0.1 - t * 0.04], 6)); Hh.push(at(E(0.11, 0.08, 0.11, 6, 5), e)); } add(hd, 'acc_snake', merge(L), mt(C(a))); add(hd, 'acc_snake', merge(Hh), mt(dk(C(a), 0.7))); }
    else if (kind === 'gills') S(g => [0, 1, 2].forEach(i => add(hd, 'acc_gill', tube([[0, 0, 0], [g * 0.35, 0.2 - i * 0.22, -0.05], [g * 0.75, 0.42 - i * 0.42, -0.12]], t => [0.09 - t * 0.06, 0.09 - t * 0.06], 6), mt(C(a)), hp(g * 1.5, 1.35 + i * 0.16, 0.92))));
    else if (kind === 'eyes') [[0.2, 0.46, 0.94], [-0.2, 0.46, 0.94], [0.45, 0.4, 0.84], [-0.45, 0.4, 0.84]].forEach(p => add(hd, 'acc_eye', at(E(0.075, 0.075, 0.05, 6, 5), p), glow(C(a))));
    else if (kind === 'eyesGlow') S(g => add(hd, 'acc_eye', at(E(0.2, 0.12, 0.07, 8, 6), [g * 0.37, 0.07, 0.93], [0, 0, g * 0.12]), glow(C(a))));
    else if (kind === 'stalk') { const frog = a === 'frog', col = mt(C(b || c.R.skin)); S(g => { const p = frog ? [g * 0.5, 0.88, 0.42] : [g * 0.42, 1.5, 0.55]; if (!frog) add(hd, 'acc_stalk', capsule([g * 0.34, 0.85, 0.45], p, 0.06, 0.05, 6), col); add(hd, 'acc_eye', at(E(frog ? 0.34 : 0.17, frog ? 0.34 : 0.17, frog ? 0.34 : 0.17, 10, 8), p), frog ? col : mt(white, { unlit: true })); if (frog) add(hd, 'acc_eye', at(E(0.22, 0.22, 0.1, 8, 6), [p[0], p[1] + 0.03, p[2] + 0.27]), mt(white, { unlit: true })); add(hd, 'acc_eye', at(E(0.09, 0.11, 0.06, 6, 5), [p[0], p[1] + (frog ? 0.03 : 0), p[2] + (frog ? 0.35 : 0.14)]), mt(dark, { unlit: true })); }); }
    else if (kind === 'lure') { add(hd, 'acc_lure', tube([[0, 0.85, 0.5], [0, 1.55, 0.7], [0, 1.75, 1.25], [0, 1.45, 1.6]], () => [0.035, 0.035], 6), mt(dk(c.R.skin, 0.8))); add(hd, 'acc_lure', at(E(0.15, 0.15, 0.15, 10, 8), [0, 1.42, 1.62]), glow(C(a))); }
    else if (kind === 'antenna') S(g => { const col = C(b || '#3a2a1a'); add(hd, 'acc_ant', tube(a === 'curl' ? [[g * 0.25, 0.9, 0.3], [g * 0.45, 1.5, 0.45], [g * 0.75, 1.8, 0.5], [g * 0.9, 1.6, 0.5], [g * 0.78, 1.48, 0.5]] : [[g * 0.25, 0.9, 0.3], [g * 0.4, 1.5, 0.42], [g * 0.52, 1.92, 0.62]], () => [0.03, 0.03], 5), mt(a === 'ball' ? dk(col, 0.5) : col)); if (a === 'ball') add(hd, 'acc_ant', at(E(0.1, 0.1, 0.1, 8, 6), [g * 0.52, 1.95, 0.63]), glow(col)); if (a === 'feather') add(hd, 'acc_ant', at(E(0.14, 0.42, 0.03, 8, 8), [g * 0.46, 1.5, 0.48], [0.3, 0, -g * 0.3]), mt(col)); });
    else if (kind === 'whiskers') S(g => add(hd, 'acc_whisk', tube([[g * 0.2, -0.36, 0.95], [g * 0.7, -0.3, 0.9], [g * 1.3, -0.1, 0.4], [g * 1.6, 0.3, -0.3]], t => [0.04 - t * 0.028, 0.04 - t * 0.028], 5), mt(C(a))));
    else if (kind === 'mane') { const L = []; for (let i = 0; i < 16; i++) { const an = i / 16 * PI * 2; L.push([Math.sin(an) * 1.18, Math.cos(an) * 1.18 + 0.05, -0.18 + (i % 2) * 0.12, 0.42]); } for (let i = 0; i < 9; i++) { const an = i / 9 * PI * 2; L.push([Math.sin(an) * 0.8, 0.2 + Math.cos(an) * 0.8, -0.8, 0.45]); } add(hd, 'acc_mane', blobs(L), mt(C(a), { rough: 1 })); }
    else if (kind === 'cyclops') { add(hd, 'acc_eye', at(E(0.46, 0.44, 0.2, 14, 10), [0, 0.1, 0.9]), mt(white, { unlit: true })); add(hd, 'acc_eye', at(E(0.25, 0.25, 0.1, 10, 8), [0, 0.1, 1.06]), glow(C(a))); add(hd, 'acc_eye', at(E(0.11, 0.11, 0.06, 8, 6), [0, 0.1, 1.14]), mt(dark, { unlit: true })); add(hd, 'acc_brow', at(E(0.52, 0.1, 0.14, 10, 6), [0, 0.56, 0.9]), mt(dk(c.R.skin, 0.7))); }
    else if (kind === 'goggles') { const y = k === 'eyes' ? 0.1 : 0.55, z = k === 'eyes' ? 0.96 : 0.92; S(g => { add(hd, 'acc_gog', at(ring(0.22, 0.045, 12), [g * 0.34, y, z], [PI / 2, 0, 0]), metal(C(a))); add(hd, 'acc_gog', at(E(0.2, 0.2, 0.05, 10, 6), [g * 0.34, y, z + 0.01]), glow(C(b || '#7fffff'))); }); add(hd, 'acc_gog', lathe([[1.02, y - 0.07], [1.05, y], [1.02, y + 0.07]], 20), mt([0.2, 0.14, 0.1])); }
    else if (kind === 'visor') add(hd, 'acc_vis', lathe([[1.0, 0.0], [1.06, 0.1], [1.0, 0.2]], 18, { phi0: -PI * 0.4, phiLen: PI * 0.8 }), glow(C(a)));
    else if (kind === 'fin') add(hd, 'acc_fin', at(fin(0.36, 0.95), [0, 0.72, -0.25], [-0.55, 0, 0]), mt(C(a)));
    else if (kind === 'drop') add(hd, 'acc_drop', lathe([[0.01, 2.3], [0.14, 1.95], [0.46, 1.5], [0.72, 1.12], [0.62, 0.94], [0.3, 0.9]], 16), shiny(C(a)));
    else if (kind === 'mantle') add(hd, 'acc_mantle', at(E(0.95, 1.05, 1.15, 16, 12), [0, 0.65, -0.7]), mt(C(a)));
    else if (kind === 'rocks') add(hd, 'acc_rock', merge([[0, 1.0, 0, 0.5], [0.5, 0.85, -0.2, 0.36], [-0.5, 0.8, 0.1, 0.34], [0.1, 0.9, -0.6, 0.4]].map(([x, y, z, r]) => at(E(r, r * 0.8, r, 6, 4), [x, y, z]))), mt(C(a), { rough: 0.95 }));
    else if (kind === 'nosering') add(hd, 'acc_ring', at(ring(0.11, 0.025, 10), [0, -0.43, 1.2], [PI / 2, 0, 0]), metal(C(a)));
    else if (kind === 'brow') S(g => add(hd, 'acc_brow', at(E(0.34, 0.08, 0.1, 8, 6), [g * 0.42, 0.42, 0.86], [0, 0, g * 0.5]), mt(C(a))));
    else if (kind === 'patches') S(g => add(hd, 'acc_patch', at(E(0.3, 0.24, 0.08, 8, 6), [g * 0.38, 0.08, 0.9], [0, 0, -g * 0.4]), mt(C(a))));
    else if (kind === 'shards') { const n = new Node('acc_shards'); n.pos = [0, 1.55, 0]; hd.add(n); const L = []; for (let i = 0; i < 8; i++) { const an = i / 8 * PI * 2; L.push(at(cone(0.09, 0.42 - (i % 2) * 0.14, 4), [Math.sin(an) * 0.78, 0, Math.cos(an) * 0.78])); } n.meshes.push(new Mesh(merge(L), glow(C(a)))); spin(c, n); }
  });
  P16.face = H((c, kind, a) => {
    const hd = c.hd;
    if (kind === 'fangs') S(g => add(hd, 'acc_fang', at(cone(0.045, 0.2 * (typeof a === 'number' ? a : 1), 5), [g * 0.17, -0.5, 0.9], [PI, 0, 0]), mt(white)));
    else if (kind === 'cloudbeard') add(hd, 'acc_beard', blobs([[0, -0.98, 0.7, 0.32], [0.42, -0.82, 0.6, 0.29], [-0.42, -0.82, 0.6, 0.29], [0.72, -0.5, 0.42, 0.26], [-0.72, -0.5, 0.42, 0.26], [0, -1.36, 0.6, 0.26], [0.3, -1.2, 0.5, 0.22], [-0.3, -1.2, 0.5, 0.22]]), mt(C(a), { rough: 1, rim: 0.6 }));
    else if (kind === 'tentaclebeard') { const L = []; for (let i = 0; i < 5; i++) { const x = (i - 2) * 0.2; L.push(tube([[x, -0.6, 0.85], [x * 1.2, -1.1, 1.0], [x * 1.5, -1.6, 0.85], [x * 1.3, -1.95, 0.95]], t => [0.1 - t * 0.06, 0.1 - t * 0.06], 6)); } add(hd, 'acc_beard', merge(L), mt(C(a))); }
  });

  /* ================= CORPS (repère des articulations, en mètres) ================= */
  const cuirass = () => lathe([[0.06, 0.25], [0.15, 0.21], [0.178, 0.1], [0.168, -0.02], [0.142, -0.12], [0.13, -0.145]], 18, { sz: 0.74 });
  P16.torso = (c, kind, a, b) => {
    const J = c.J.chest; if (!J) return;
    if (kind === 'cuirass') add(J, 'r_cuir', cuirass(), metal(C(a)));
    else if (kind === 'lamellar') { add(J, 'r_cuir', cuirass(), mt(C(a), { rough: 0.7 })); [0.16, 0.07, -0.02, -0.1].forEach(y => add(J, 'r_band', lathe([[0.176, y + 0.02], [0.186, y], [0.176, y - 0.02]], 18, { sz: 0.74 }), metal(C(b || '#e8d48a')))); }
    else if (kind === 'poncho') add(J, 'r_poncho', lathe([[0.07, 0.25], [0.2, 0.17], [0.33, -0.02], [0.38, -0.2], [0.36, -0.22]], 20, { sz: 0.8 }), cloth(C(a)));
    else if (kind === 'fur' || kind === 'cloudcollar') { const L = []; for (let i = 0; i < 12; i++) { const an = i / 12 * PI * 2; L.push([Math.sin(an) * 0.17, 0.2 + (i % 2) * 0.015, Math.cos(an) * 0.11, kind === 'fur' ? 0.075 : 0.09]); } add(J, 'r_fur', blobs(L), mt(C(a || '#ffffff'), { rough: 1, rim: 0.5 })); }
    else if (kind === 'scarf') { add(J, 'r_scarf', lathe([[0.085, 0.2], [0.125, 0.245], [0.085, 0.29]], 16, { sz: 0.85 }), cloth(C(a))); const n = add(J, 'r_scarft', grid(3, 6, (u, v) => ({ p: [(u - 0.5) * 0.1, -v * 0.5, -v * 0.1 - Math.sin(v * 6) * 0.01] })), cloth(C(a)), [0.05, 0.24, -0.1]); sw(c, n, 0.06, 0.2); }
    else if (kind === 'ribs') { const L = []; S(g => [0.2, 0.13, 0.06, -0.01].forEach((y, i) => L.push(tube([[0, y, -0.1], [g * 0.17, y - 0.02, 0], [g * (0.12 - i * 0.01), y - 0.04, 0.125], [g * 0.02, y - 0.03, 0.15]], () => [0.013, 0.013], 5)))); L.push(capsule([0, 0.2, 0.15], [0, -0.05, 0.145], 0.018, 0.014, 6)); add(J, 'r_ribs', merge(L), mt(C(a || '#e8e2d0'), { rough: 0.6 })); }
    else if (kind === 'furnace') { add(J, 'r_furn', at(E(0.125, 0.115, 0.05, 12, 8), [0, 0.0, 0.115]), mt(dark)); add(J, 'r_furn', at(E(0.1, 0.09, 0.05, 10, 8), [0, 0.0, 0.128]), glow(C(a))); add(J, 'r_furn', merge([-0.05, 0, 0.05].map(x => capsule([x, -0.08, 0.175], [x, 0.08, 0.175], 0.009, 0.009, 5))), mt(dark)); }
    else if (kind === 'drum') { add(J, 'r_drum', at(E(0.145, 0.15, 0.07, 14, 10), [0, -0.03, 0.105]), mt(C(a))); add(J, 'r_drum', at(ring(0.1, 0.008, 14), [0, -0.03, 0.172], [PI / 2, 0, 0]), mt([0.5, 0.3, 0.16])); }
    else if (kind === 'core') { add(J, 'r_core', at(E(0.045, 0.045, 0.03, 10, 8), [0, 0.1, 0.132]), glow(C(a))); add(J, 'r_core', at(ring(0.058, 0.01, 12), [0, 0.1, 0.13], [PI / 2, 0, 0]), metal([0.3, 0.3, 0.34])); }
    else if (kind === 'petalCollar') { const s = b || 1, L = []; for (let i = 0; i < 9; i++) L.push(at(at(E(0.05 * s, 0.014, 0.12 * s, 8, 5), [0, -0.035, 0.13 * s], [0.32, 0, 0]), [0, 0.215, 0], [0, i / 9 * PI * 2, 0])); add(J, 'r_petal', merge(L), mt(C(a), { twoSide: true })); }
    else if (kind === 'apron') add(J, 'r_apron', grid(3, 5, (u, v) => ({ p: [(u - 0.5) * (0.2 + v * 0.06), 0.16 - v * 0.72, 0.135 + Math.sin(v * PI) * 0.03] })), cloth(C(a)));
    else if (kind === 'necklace') { const L = []; for (let i = 0; i < 9; i++) { const an = (i - 4) * 0.27; L.push(at(cone(0.017, 0.055, 5), [Math.sin(an) * 0.125, 0.2 - Math.cos(an) * 0.075, 0.07 + Math.cos(an) * 0.055], [PI, 0, 0])); } add(J, 'r_neck', merge(L), mt(C(a), { spec: 0.4 })); }
    else if (kind === 'belly') { const s = b || 1; add(J, 'r_belly', at(E(0.118 * s, 0.185 * s, 0.07 * s, 12, 10), [0, -0.01, 0.075]), mt(C(a))); }
    else if (kind === 'jabot') add(J, 'r_jabot', merge([at(E(0.065, 0.05, 0.04, 8, 6), [0, 0.17, 0.125]), at(E(0.05, 0.05, 0.035, 8, 6), [0, 0.11, 0.135]), at(E(0.035, 0.04, 0.03, 8, 6), [0, 0.06, 0.135])]), mt(C(a)));
  };
  P16.back = (c, kind, a, b) => {
    const J = c.J.chest, Hp = c.J.hips; if (!J) return;
    if (kind === 'shell') { add(J, 'r_shell', at(E(0.215, 0.255, 0.125, 16, 12), [0, 0.03, -0.125]), mt(C(a), { spec: 0.3, rough: 0.5 })); add(J, 'r_shell', merge([[0, 0.05, 0.075], [0.1, 0.14, 0.055], [-0.1, 0.14, 0.055], [0.1, -0.06, 0.055], [-0.1, -0.06, 0.055], [0, 0.2, 0.05], [0, -0.12, 0.05]].map(([x, y, r]) => at(E(r, r, 0.035, 8, 5), [x, y, -0.235 + Math.abs(x) * 0.25 + Math.abs(y - 0.03) * 0.12]))), mt(C(b || a))); }
    else if (kind === 'tank') { S(g => add(J, 'r_tank', capsule([g * 0.075, -0.08, -0.155], [g * 0.075, 0.2, -0.155], 0.058, 0.058, 10), metal(C(a)))); S(g => add(J, 'r_tank', at(E(0.04, 0.02, 0.04, 8, 5), [g * 0.075, 0.262, -0.155]), glow(C(b || '#ffe14d')))); }
    else if (kind === 'fin') add(J, 'r_fin', at(fin(0.13, 0.32), [0, 0.1, -0.1], [-1.05, 0, 0]), mt(C(a)));
    else if (kind === 'spikes') { add(J, 'r_spk', merge([0, 1, 2, 3].map(i => at(cone(0.035, 0.15 - i * 0.015, 5), [0, 0.24 - i * 0.095, -0.1], [-1.25, 0, 0]))), mt(C(a))); if (Hp) add(Hp, 'r_spk', at(cone(0.03, 0.1, 5), [0, 0.06, -0.1], [-1.3, 0, 0]), mt(C(a))); }
    else if (kind === 'drums') { const n = new Node('r_drums'); n.pos = [0, 0.2, -0.2]; J.add(n); const D = [], G = [], P = []; for (let i = 0; i < 7; i++) { const an = (i - 3) * 0.52, p = [Math.sin(an) * 0.4, Math.cos(an) * 0.4 - 0.05, 0]; P.push(p); D.push(at(E(0.085, 0.085, 0.03, 12, 6), p)); G.push(at(E(0.035, 0.035, 0.034, 8, 5), p)); } n.meshes.push(new Mesh(merge(D), mt(C(a)))); n.meshes.push(new Mesh(merge(G), glow(C(b || '#ffe14d')))); n.meshes.push(new Mesh(tube(P, () => [0.012, 0.012], 5), metal([0.3, 0.26, 0.2]))); sw(c, n, 0.02, 0.04); }
    else if (kind === 'blades') { const n = new Node('r_blades'); n.pos = [0, 0.2, -0.22]; J.add(n); const L = []; for (let i = 0; i < 6; i++) L.push(at(at(fcone(0.04, 0.62, 0.18, 4), [0, 0.2, 0]), [0, 0, 0], [0, 0, -(i - 2.5) * 0.44])); n.meshes.push(new Mesh(merge(L), glow(C(a)))); sw(c, n, 0.03, 0.04); }
    else if (kind === 'legs') S(g => [0, 1].forEach(k => add(J, 'r_leg', tube([[g * 0.04, 0.12 - k * 0.1, -0.1], [g * 0.42, 0.44 - k * 0.2, -0.26], [g * 0.72, 0.06 - k * 0.25, -0.16], [g * 0.8, -0.46 - k * 0.2, -0.05]], t => [0.032 - t * 0.022, 0.032 - t * 0.022], 6), mt(C(a), { spec: 0.4 }))));
    else if (kind === 'tentacles') { if (!Hp) return; S(g => { const n = add(Hp, 'r_tent', merge([tube([[g * 0.1, 0, -0.08], [g * 0.35, -0.25, -0.2], [g * 0.55, -0.55, -0.1], [g * 0.6, -0.75, 0.1], [g * 0.5, -0.8, 0.2]], t => [0.06 - t * 0.045, 0.06 - t * 0.045], 7), tube([[g * 0.06, 0, -0.1], [g * 0.2, -0.3, -0.35], [g * 0.25, -0.65, -0.45], [g * 0.15, -0.85, -0.35]], t => [0.06 - t * 0.045, 0.06 - t * 0.045], 7)]), mt(C(a))); sw(c, n, 0.05, 0.08); }); }
    else if (kind === 'chimney') S(g => { add(J, 'r_chim', capsule([g * 0.07, 0.0, -0.14], [g * 0.1, 0.44, -0.21], 0.036, 0.046, 8), metal(C(a))); add(J, 'r_chim', at(E(0.04, 0.016, 0.04, 8, 5), [g * 0.1, 0.485, -0.21]), glow(C(b || '#ff8a1a'))); });
    else if (kind === 'rod') { add(J, 'r_rod', capsule([0, -0.1, -0.13], [0, 0.62, -0.17], 0.012, 0.01, 6), metal(C(a))); add(J, 'r_rod', at(E(0.045, 0.045, 0.045, 8, 6), [0, 0.65, -0.17]), glow(C(b || '#ffe14d'))); [0.4, 0.5].forEach(y => add(J, 'r_rod', at(ring(0.035, 0.008, 10), [0, y, -0.165]), glow(C(b || '#ffe14d')))); }
    else if (kind === 'bonewings') S(g => { const n = add(J, 'r_bw', merge([spike([[0, 0, 0], [g * 0.3, 0.35, -0.15], [g * 0.62, 0.5, -0.25]], 0.026, 6), spike([[0, 0, 0], [g * 0.5, 0.1, -0.2], [g * 0.8, -0.05, -0.3]], 0.024, 6), spike([[0, 0, 0], [g * 0.35, -0.15, -0.15], [g * 0.55, -0.5, -0.25]], 0.022, 6), spike([[g * 0.3, 0.35, -0.15], [g * 0.45, 0.1, -0.2], [g * 0.35, -0.15, -0.15]], 0.014, 5)]), mt(C(a || '#e8e2d0'), { rough: 0.6 }), [g * 0.06, 0.14, -0.1]); sw(c, n, 0.04, 0.05); });
    else if (kind === 'abdomen') { if (!Hp) return; add(Hp, 'r_abd', at(E(0.17, 0.17, 0.25, 14, 10), [0, 0.03, -0.3]), mt(C(a), { spec: 0.4 })); add(Hp, 'r_abd', at(E(0.05, 0.07, 0.03, 8, 6), [0, 0.15, -0.44], [-0.6, 0, 0]), glow(C(b || '#ff3a8a'))); }
    else if (kind === 'shardsOrbit') { const n = new Node('r_orbit'); n.pos = [0, 0.1, 0]; J.add(n); const L = []; for (let i = 0; i < 6; i++) { const an = i / 6 * PI * 2; L.push(at(cone(0.035, 0.13, 4), [Math.cos(an) * 0.46, (i % 3 - 1) * 0.12, Math.sin(an) * 0.46], [i, i * 2, 0.4])); } n.meshes.push(new Mesh(merge(L), b === 'glow' ? glow(C(a)) : shiny(C(a)))); spin(c, n); }
    else if (kind === 'crystals') [[0, 0.16, 0.34, 0], [0.12, 0.08, 0.26, 0.5], [-0.12, 0.08, 0.26, -0.5], [0.07, -0.06, 0.2, 0.3], [-0.07, -0.06, 0.2, -0.3]].forEach(([x, y, h, rz], i) => add(J, 'r_cry', at(cone(0.055, h, 5), [0, 0, 0], [-1.0, 0, -rz]), glow(C(a, i)), [x, y, -0.1]));
  };
  P16.wings = (c, kind, a, b, k) => {
    const J = c.J.chest; if (!J) return;
    if (kind === 'feather') { const sp = k || 0.8, col = C(a), tipC = b ? C(b) : dk(col, 0.72); S(g => { const n = new Node('r_wing'); n.pos = [g * 0.05, 0.16, -0.115]; n.rot = [0, g * 0.5, 0]; J.add(n); const A = [], B = [], Cv = [];
        for (let i = 0; i < 9; i++) { const an = 0.75 - i * 0.27, l = sp * (1 - i * 0.055), f = at(at(E(l * 0.5, 0.05 + i * 0.004, 0.007, 10, 6), [g * l * 0.5, 0, 0]), [0, 0, -i * 0.004], [0, 0, g * an]); (i % 2 ? B : A).push(f); }
        for (let i = 0; i < 7; i++) { const an = 0.65 - i * 0.3, l = sp * 0.5; Cv.push(at(at(E(l * 0.5, 0.055, 0.012, 8, 6), [g * l * 0.5, 0, 0]), [0, 0, 0.012], [0, 0, g * an])); }
        Cv.push(at(E(0.07, 0.09, 0.03, 8, 6), [g * 0.03, 0, 0.01]));
        n.meshes.push(new Mesh(merge(A), mt(col, { twoSide: true, rough: 0.8 }))); n.meshes.push(new Mesh(merge(B), mt(tipC, { twoSide: true, rough: 0.8 }))); n.meshes.push(new Mesh(merge(Cv), mt(mixc(col, [1, 1, 1], 0.25), { twoSide: true, rough: 0.8 }))); sw(c, n, 0.07, 0.05); }); }
    else if (kind === 'batS') PARTS.wing(c.ch, c.J, C(a), 0.42, { fing: 3 });
    else if (kind === 'insect') S(g => [[0.72, 0.55, 0.2], [0.56, 0.05, 0.16]].forEach(([len, ang, w], i) => { const n = add(J, 'r_iw', at(E(len * 0.5, w * 0.5, 0.005, 14, 8), [g * len * 0.5, 0, 0]), glass(C(a), 0.5), [g * 0.04, 0.15, -0.11], [0, g * 0.75, g * ang]); sw(c, n, 0.2, 0.04); }));
    else S(g => { const moth = kind === 'moth', n = new Node('r_bfly'); n.pos = [g * 0.03, 0.13, -0.115]; n.rot = [0, g * 0.45, 0]; J.add(n); const k2 = moth ? 0.85 : 1.1;
      n.meshes.push(new Mesh(merge([at(E(0.3 * k2, 0.25 * k2, 0.006, 14, 10), [g * 0.3 * k2, 0.12 * k2, 0], [0, 0, g * 0.5]), at(E(0.2 * k2, 0.2 * k2, 0.006, 12, 8), [g * 0.22 * k2, -0.2 * k2, 0], [0, 0, -g * 0.3])]), mt(C(a), { twoSide: true, unlit: !moth, noCast: true })));
      n.meshes.push(new Mesh(merge([at(E(0.1 * k2, 0.1 * k2, 0.009, 10, 6), [g * 0.36 * k2, 0.17 * k2, 0]), at(E(0.07 * k2, 0.07 * k2, 0.009, 8, 6), [g * 0.24 * k2, -0.22 * k2, 0])]), mt(C(b), { twoSide: true, unlit: true, noCast: true })));
      if (k) n.meshes.push(new Mesh(merge([at(E(0.045, 0.045, 0.011, 8, 5), [g * 0.36 * k2, 0.17 * k2, 0]), at(E(0.05, 0.05, 0.009, 8, 5), [g * 0.52 * k2, 0.3 * k2, 0])]), mt(C(k), { twoSide: true, unlit: true, noCast: true }))); sw(c, n, 0.16, 0.04); });
  };
  P16.tail = (c, kind, a, b, k, x) => {
    const J = c.J.hips; if (!J) return;
    const one = (geo, mat, rz) => { const n = add(J, 'r_tail', geo, mat, [0, 0, -0.06], [0, 0, rz || 0]); sw(c, n, 0.07, 0.14); return n; };
    if (kind === 'fox') { const n = a || 1; for (let i = 0; i < n; i++) { const t = one(blobs([[0, -0.02, -0.08, 0.065], [0, 0.03, -0.2, 0.095], [0, 0.11, -0.34, 0.115], [0, 0.2, -0.47, 0.105]]), mt(C(b), { rough: 1 }), (i - (n - 1) / 2) * 0.55); t.meshes.push(new Mesh(at(E(0.075, 0.075, 0.09, 9, 7), [0, 0.28, -0.57]), mt(C(k || '#ffffff'), { rough: 1 }))); } }
    else if (kind === 'cat') { const n = a || 1; for (let i = 0; i < n; i++) one(tube([[0, 0, -0.04], [0, -0.1, -0.26], [0, -0.05, -0.46], [0, 0.15, -0.56], [0, 0.3, -0.5]], t => [0.03 - t * 0.008, 0.03 - t * 0.008], 6), mt(C(b)), (i - (n - 1) / 2) * 0.5); }
    else if (kind === 'fish') { const t = one(tube([[0, 0, -0.04], [0, -0.15, -0.24], [0, -0.35, -0.38], [0, -0.5, -0.55]], t => [0.085 - t * 0.055, 0.085 - t * 0.055], 8), mt(C(a))); S(g => t.meshes.push(new Mesh(at(E(0.02, 0.16, 0.09, 8, 6), [g * 0.07, -0.56, -0.62], [0.6, 0, g * 0.7]), mt(C(b || a), { twoSide: true })))); }
    else if (kind === 'scorpion') { const P = [[0, -0.02, -0.08], [0, 0.05, -0.26], [0, 0.25, -0.41], [0, 0.5, -0.44], [0, 0.72, -0.36], [0, 0.86, -0.21]]; const t = one(merge(P.map((p, i) => at(E(0.072 - i * 0.005, 0.072 - i * 0.005, 0.072 - i * 0.005, 8, 6), p))), mt(C(a), { spec: 0.4 })); t.meshes.push(new Mesh(at(cone(0.04, 0.18, 6), [0, 0.88, -0.17], [1.9, 0, 0]), glow(C(b || '#ff5a3a')))); }
    else if (kind === 'bunny') add(J, 'r_tail', at(E(0.085, 0.085, 0.085, 9, 7), [0, 0.02, -0.15]), mt(C(a), { rough: 1 }));
    else if (kind === 'tuft') { const t = one(tube([[0, 0, -0.04], [0, -0.14, -0.26], [0, -0.3, -0.42], [0, -0.36, -0.6]], () => [0.02, 0.02], 6), mt(C(a))); t.meshes.push(new Mesh(at(E(0.055, 0.075, 0.055, 8, 6), [0, -0.38, -0.65]), mt(C(b || a), { rough: 1 }))); }
    else if (kind === 'ring') { const P = [[0, -0.02, -0.1, 0.085], [0, -0.02, -0.24, 0.11], [0, 0.02, -0.39, 0.125], [0, 0.08, -0.54, 0.12], [0, 0.15, -0.67, 0.095]]; const t = one(blobs(P.filter((p, i) => i % 2 === 0)), mt(C(a), { rough: 1 })); t.meshes.push(new Mesh(blobs(P.filter((p, i) => i % 2 === 1)), mt(C(b), { rough: 1 }))); }
    else if (kind === 'bolt') one(merge([[0, 0, -0.06], [0.09, 0.1, -0.22], [-0.07, 0.16, -0.36], [0.09, 0.28, -0.48], [0, 0.42, -0.6]].map((p, i, A) => (i ? capsule(A[i - 1], p, 0.032 - i * 0.004, 0.03 - i * 0.004, 5) : null)).filter(Boolean)), glow(C(a)));
    else if (kind === 'fan') { const n = new Node('r_fan'); n.pos = [0, 0.05, -0.15]; n.rot = [-0.3, 0, 0]; J.add(n); const cols = a, N = b || 9, len = k || 0.8, St = [], Ey = [[], [], []]; for (let i = 0; i < N; i++) { const an = (i / (N - 1) - 0.5) * 2.5, l = len * (1 - Math.abs(an) * 0.12), e = [Math.sin(an) * l, Math.cos(an) * l, 0]; St.push(at(at(E(0.05, l * 0.5, 0.008, 6, 8), [0, l * 0.5, 0]), [0, 0, 0], [0, 0, -an])); Ey[i % 3].push(at(E(x ? 0.075 : 0.05, x ? 0.095 : 0.07, 0.012, 8, 6), [e[0], e[1], 0.004], [0, 0, -an])); if (x) Ey[(i + 1) % 3].push(at(E(0.035, 0.045, 0.016, 6, 5), [e[0], e[1], 0.006], [0, 0, -an])); }
      n.meshes.push(new Mesh(merge(St), mt(C(cols[0]), { twoSide: true }))); Ey.forEach((L, i) => { if (L.length) n.meshes.push(new Mesh(merge(L), mt(C(cols[(i + 1) % cols.length]), { unlit: true, noCast: true, twoSide: true }))); }); sw(c, n, 0.04, 0.06); }
    else if (kind === 'bulb') add(J, 'r_tail', at(E(0.085, 0.13, 0.085, 10, 8), [0, -0.02, -0.17], [0.5, 0, 0]), glow(C(a)));
    else if (kind === 'bone') one(merge([[0, -0.02, -0.1], [0, -0.1, -0.26], [0, -0.22, -0.4], [0, -0.36, -0.52], [0, -0.48, -0.66], [0, -0.55, -0.82]].map((p, i) => at(E(0.06 - i * 0.006, 0.05 - i * 0.005, 0.07 - i * 0.006, 7, 5), p))), mt(C(a || '#e8e2d0'), { rough: 0.6 }));
    else if (kind === 'curl') one(tube([[0, 0, -0.06], [0, -0.2, -0.24], [0, -0.42, -0.2], [0, -0.5, -0.02], [0, -0.38, 0.06], [0, -0.3, -0.04]], t => [0.07 - t * 0.05, 0.07 - t * 0.05], 7), mt(C(a)));
  };
  P16.hips = (c, kind, a, b, k) => {
    const J = c.J.hips; if (!J) return;
    if (kind === 'kilt') add(J, 'r_kilt', lathe([[0.15, 0.07], [0.19, -0.1], [0.24, -0.3], [0.252, -0.335], [0.232, -0.325]], 20, { sz: 0.86 }), cloth(C(a)));
    else if (kind === 'tassets') add(J, 'r_tas', merge([0, 1, 2, 3, 4, 5].map(i => at(at(E(0.075, 0.13, 0.02, 8, 6), [0, -0.13, 0.185], [-0.14, 0, 0]), [0, 0, 0], [0, i / 6 * PI * 2 + PI / 6, 0]))), metal(C(a)));
    else if (kind === 'loin') { add(J, 'r_loin', grid(2, 4, (u, v) => ({ p: [(u - 0.5) * 0.17, 0.03 - v * 0.46, 0.125 + v * 0.03] })), cloth(C(a))); add(J, 'r_loin', grid(2, 4, (u, v) => ({ p: [(u - 0.5) * 0.17, 0.03 - v * 0.42, -0.115 - v * 0.03] })), cloth(C(a))); add(J, 'r_loin', lathe([[0.158, 0.0], [0.17, 0.03], [0.158, 0.06]], 18, { sz: 0.8 }), mt(dk(C(a), 0.6))); }
    else if (kind === 'petal') { const n = b || 8, cr = k === 'crystal', L = []; for (let i = 0; i < n; i++) L.push([at(at(cr ? at(cone(0.06, 0.3, 5), [0, 0, 0], [PI, 0, 0]) : E(0.085, 0.2, 0.018, 8, 8), [0, cr ? -0.02 : -0.2, 0.2], [-0.2, 0, 0]), [0, 0.02, 0], [0, i / n * PI * 2, 0]), i]);
      if (a === 'rainbow') L.forEach(([g, i]) => add(J, 'r_petal', g, glow(C(a, i)))); else add(J, 'r_petal', merge(L.map(l => l[0])), cr ? glow(C(a)) : mt(C(a), { twoSide: true })); }
    else if (kind === 'cloud') { const s = b || 1, L = []; for (let i = 0; i < 9; i++) { const an = i / 9 * PI * 2; L.push([Math.sin(an) * 0.19 * s, -0.1 - (i % 2) * 0.09, Math.cos(an) * 0.16 * s, 0.125 * s]); } for (let i = 0; i < 6; i++) { const an = i / 6 * PI * 2 + 0.4; L.push([Math.sin(an) * 0.12 * s, -0.32 * s, Math.cos(an) * 0.1 * s, 0.11 * s]); } add(J, 'r_cloud', blobs(L), mt(C(a), { rough: 1, rim: 0.7 })); }
  };
  P16.arms = (c, kind, a) => S(g => {
    const el = jn(c, g > 0 ? 'elL' : 'elR'), ha = jn(c, g > 0 ? 'haL' : 'haR'); if (!el || !ha) return;
    if (kind === 'bracers') add(el, 'r_brc', lathe([[0.047, -0.05], [0.057, -0.1], [0.05, -0.2], [0.044, -0.215]], 12), metal(C(a)));
    else if (kind === 'gauntlets') { add(ha, 'r_gnt', at(E(0.058, 0.075, 0.058, 12, 9), [0, -0.055, 0.005]), mt(C(a), { spec: 0.3 })); add(el, 'r_gnt', lathe([[0.05, -0.1], [0.064, -0.16], [0.058, -0.235]], 12), mt(C(a), { spec: 0.3 })); }
    else if (kind === 'claws') add(ha, 'r_claw', merge([-0.028, 0, 0.028].map(x => at(cone(0.012, 0.075, 5), [x, -0.13, 0.02], [PI, 0, 0]))), mt(C(a), { spec: 0.5 }));
    else if (kind === 'pincers') add(ha, 'r_pinc', merge([at(E(0.085, 0.12, 0.06, 12, 9), [0, -0.1, 0]), spike([[0.035, -0.18, 0], [0.06, -0.3, 0], [0.012, -0.37, 0]], 0.036, 7), spike([[-0.035, -0.18, 0], [-0.055, -0.28, 0], [-0.012, -0.35, 0]], 0.03, 7)]), mt(C(a), { spec: 0.4 }));
  });
  P16.legs = (c, kind, a) => S(g => {
    const th = jn(c, g > 0 ? 'thL' : 'thR'), kn = jn(c, g > 0 ? 'knL' : 'knR'), ft = jn(c, g > 0 ? 'ftL' : 'ftR'); if (!kn) return;
    if (kind === 'greaves') add(kn, 'r_grv', lathe([[0.062, -0.02], [0.071, -0.12], [0.058, -0.36], [0.05, -0.385]], 12), metal(C(a)));
    else if (kind === 'hooves') { if (ft) add(ft, 'r_hoof', at(E(0.056, 0.05, 0.088, 10, 8), [0, -0.065, 0.045]), mt(C(a), { spec: 0.4 })); }
    else if (kind === 'fur') { if (th) add(th, 'r_furl', lathe([[0.078, 0.0], [0.096, -0.12], [0.086, -0.3], [0.07, -0.375]], 12), mt(C(a), { rough: 1 })); add(kn, 'r_furl', lathe([[0.07, 0.0], [0.082, -0.12], [0.062, -0.34], [0.056, -0.4]], 12), mt(C(a), { rough: 1 })); }
  });
  P16.extra = (c, kind, a, b) => {
    const J = c.J, ch = J.chest, col = () => C(a);
    if (kind === 'cracks') { if (!ch) return; add(ch, 'r_crack', merge([tube([[-0.08, 0.2, 0.118], [-0.02, 0.11, 0.14], [-0.06, 0.02, 0.135], [0.0, -0.07, 0.125]], () => [0.008, 0.008], 4), tube([[0.09, 0.18, 0.11], [0.04, 0.1, 0.138], [0.08, 0.0, 0.13]], () => [0.007, 0.007], 4), tube([[-0.05, 0.2, -0.105], [0.02, 0.08, -0.115], [-0.03, -0.05, -0.11]], () => [0.008, 0.008], 4)]), glow(col())); S(g => { const s = jn(c, g > 0 ? 'shL' : 'shR'), k = jn(c, g > 0 ? 'knL' : 'knR'); if (s) add(s, 'r_crack', tube([[g * 0.04, -0.02, 0.03], [g * 0.055, -0.1, 0.01], [g * 0.04, -0.17, 0.035]], () => [0.007, 0.007], 4), glow(col())); if (k) add(k, 'r_crack', tube([[0.0, -0.05, 0.062], [0.02, -0.16, 0.066], [-0.01, -0.28, 0.058]], () => [0.007, 0.007], 4), glow(col())); }); }
    else if (kind === 'moss') { S(g => { const s = jn(c, g > 0 ? 'shL' : 'shR'); if (s) add(s, 'r_moss', blobs([[g * 0.03, 0.05, 0, 0.065], [g * 0.07, 0.02, 0.03, 0.045], [g * 0.01, 0.04, -0.04, 0.05]]), mt(col(), { rough: 1 })); }); if (c.hd) add(c.hd, 'acc_moss', blobs([[0.3, 1.0, 0.1, 0.36], [-0.35, 0.95, -0.2, 0.32], [0, 1.05, -0.4, 0.3]]), mt(col(), { rough: 1 })); }
    else if (kind === 'drips') { const m = glass(col(), 0.75); S(g => { const e = jn(c, g > 0 ? 'elL' : 'elR'); if (e) add(e, 'r_drip', merge([at(E(0.03, 0.05, 0.03, 7, 6), [0.02, -0.12, 0.04]), at(E(0.02, 0.04, 0.02, 6, 5), [-0.02, -0.2, 0.03])]), m); }); if (ch) add(ch, 'r_drip', merge([at(E(0.035, 0.06, 0.03, 7, 6), [0.08, 0.02, 0.12]), at(E(0.025, 0.045, 0.02, 6, 5), [-0.06, -0.08, 0.12]), at(E(0.03, 0.05, 0.03, 7, 6), [0.0, 0.12, -0.12])]), m); }
    else if (kind === 'straw') { const m = mt(col(), { rough: 1 }); S(g => { const h = jn(c, g > 0 ? 'haL' : 'haR'), k = jn(c, g > 0 ? 'ftL' : 'ftR'); if (h) add(h, 'r_straw', merge([-0.03, 0, 0.03].map(x => at(cone(0.016, 0.14, 4), [x, -0.02, 0], [PI + x * 6, 0, 0]))), m); if (k) add(k, 'r_straw', merge([-0.03, 0, 0.03].map(x => at(cone(0.016, 0.1, 4), [x, 0.06, 0.02], [PI, 0, x * 8]))), m); }); if (ch) { const L = []; for (let i = 0; i < 10; i++) { const an = i / 10 * PI * 2; L.push(at(cone(0.018, 0.12, 4), [Math.sin(an) * 0.12, 0.22, Math.cos(an) * 0.09], [PI - Math.cos(an) * 0.5, 0, Math.sin(an) * 0.5])); } add(ch, 'r_straw', merge(L), m); } }
    else if (kind === 'bandages') { const m = cloth(col(), { twoSide: false }), band = (r, y, sz) => lathe([[r, y - 0.014], [r + 0.006, y], [r, y + 0.014]], 12, { sz: sz || 1 }); S(g => { const e = jn(c, g > 0 ? 'elL' : 'elR'), s = jn(c, g > 0 ? 'shL' : 'shR'), k = jn(c, g > 0 ? 'knL' : 'knR'), t = jn(c, g > 0 ? 'thL' : 'thR'); if (e) add(e, 'r_band', merge([-0.05, -0.11, -0.17].map(y => band(0.046, y))), m); if (s) add(s, 'r_band', merge([-0.06, -0.13].map(y => band(0.052, y))), m); if (k) add(k, 'r_band', merge([-0.08, -0.18, -0.28].map(y => band(0.062, y))), m); if (t) add(t, 'r_band', merge([-0.1, -0.22].map(y => band(0.088, y))), m); }); if (ch) add(ch, 'r_band', merge([0.16, 0.06, -0.04].map(y => band(0.172, y, 0.74))), m); if (c.hd) add(c.hd, 'acc_band', merge([[0.5, 1.0], [-0.45, 0.96], [-0.75, 0.75]].map(([y, r]) => lathe([[r, y - 0.1], [r + 0.03, y], [r, y + 0.1]], 16))), m); }
    else if (kind === 'spikesAll') { const m = mt(col()), sp = (L) => merge(L.map(([x, y, z, rx, rz]) => at(cone(0.011, 0.06, 4), [x, y, z], [rx || 0, 0, rz || 0]))); S(g => { const s = jn(c, g > 0 ? 'shL' : 'shR'), e = jn(c, g > 0 ? 'elL' : 'elR'), k = jn(c, g > 0 ? 'knL' : 'knR'), t = jn(c, g > 0 ? 'thL' : 'thR'); if (s) add(s, 'r_spk', sp([[g * 0.05, 0.02, 0, 0, -g * 1.2], [g * 0.055, -0.08, 0.02, 0.5, -g * 1.4], [g * 0.05, -0.15, -0.02, -0.5, -g * 1.5], [0, 0.05, 0, 0, 0]]), m); if (e) add(e, 'r_spk', sp([[g * 0.045, -0.06, 0, 0, -g * 1.5], [g * 0.04, -0.15, 0.02, 0.6, -g * 1.5], [0, -0.1, 0.045, 1.5, 0]]), m); if (k) add(k, 'r_spk', sp([[g * 0.06, -0.1, 0, 0, -g * 1.5], [0, -0.2, 0.06, 1.5, 0], [g * 0.05, -0.28, 0, 0, -g * 1.5]]), m); if (t) add(t, 'r_spk', sp([[g * 0.09, -0.12, 0, 0, -g * 1.5], [0, -0.22, 0.09, 1.5, 0]]), m); });
      if (ch) add(ch, 'r_spk', sp([[0.07, 0.15, 0.13, 1.5], [-0.07, 0.15, 0.13, 1.5], [0, 0.05, 0.14, 1.5], [0.08, -0.05, 0.12, 1.5], [-0.08, -0.05, 0.12, 1.5], [0.05, 0.12, -0.11, -1.5], [-0.05, 0.12, -0.11, -1.5], [0, 0, -0.11, -1.5]]), m); if (c.hd) { const L = []; for (let i = 0; i < 10; i++) { const p = hp(i * 0.63, 0.45 + (i % 3) * 0.3, 1.0); L.push(at(cone(0.05, 0.3, 4), p, [p[2] * 1.2, 0, -p[0] * 1.2])); } add(c.hd, 'acc_spk', merge(L), m); } }
    else if (kind === 'iceShoulders') S(g => { const s = jn(c, g > 0 ? 'shL' : 'shR'); if (s) [0, 1, 2].forEach(i => add(s, 'r_ice', at(cone(0.038, 0.24 - i * 0.05, 5), [g * 0.03, 0.03, 0], [0, 0, -g * (0.25 + i * 0.4)]), a === 'rainbow' ? glow(C(a, i + (g > 0 ? 0 : 3))) : shiny(C(a)))); });
    else if (kind === 'stars') { const n = b || 16, L = []; let s = 12345; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; if (!ch) return; for (let i = 0; i < n; i++) { const f = rnd() > 0.4 ? 1 : -1; L.push(at(E(0.009, 0.009, 0.006, 5, 4), [(rnd() - 0.5) * 0.24, -0.1 + rnd() * 0.32, f * (f > 0 ? 0.125 : 0.108)])); } add(ch, 'r_star', merge(L), glow(col())); S(g => { const t = jn(c, g > 0 ? 'thL' : 'thR'), e = jn(c, g > 0 ? 'shL' : 'shR'); if (t) add(t, 'r_star', merge([0, 1, 2, 3].map(i => at(E(0.008, 0.008, 0.006, 5, 4), [(rnd() - 0.5) * 0.08, -0.05 - rnd() * 0.3, 0.085]))), glow(col())); if (e) add(e, 'r_star', merge([0, 1, 2].map(i => at(E(0.007, 0.007, 0.007, 5, 4), [g * 0.05, -0.02 - rnd() * 0.16, (rnd() - 0.5) * 0.05]))), glow(col())); }); }
    else if (kind === 'rays') { if (!c.hd) return; for (let i = 0; i < 7; i++) add(c.hd, 'acc_ray', at(at(cone(0.07, 1.5, 4), [0, 1.3, 0]), [0, 0.2, -0.5], [0, 0, (i - 3) * 0.5]), glow(C('rainbow', i))); }
  };

  /* ================= LES 89 FICHES (les 10 créatures de la v15 sont dans race15.js) ================= */
  const T = {
    // ---- FEU ----
    taro: ['Diablotin de braise', '#e0503a', '#2a0f10', '#ffd23d', '#3a1418', '#e0a030', 0.92, 'flat', 'tailSpade belt', [['horns', 'small', '#2a1a1a'], ['face', 'fangs'], ['arms', 'bracers', '#e0a030'], ['hips', 'loin', '#7a1c1c']]],
    mina: ['Nymphe des flammes', '#ffb38a', '#ff7a2a', '#ffe08a', '#c23a1a', '#ffd060', 0.98, 'flat', '', [['crown', 'flame', '#ff8a2a', '#ffe27a', 0.8], ['hips', 'petal', '#ff9a3a', 9], ['torso', 'petalCollar', '#ffc04a'], ['arms', 'bracers', '#ffd060']]],
    gorou: ['Géant de cendres', '#8a8480', '#3a3432', '#ff8a3a', '#4a4442', '#c0562a', 1.16, 'skin', 'pauldronRock belt', [['horns', 'bull', '#3a3432'], ['arms', 'gauntlets', '#5a5452'], ['hips', 'loin', '#7a2c1c'], ['extra', 'cracks', '#ff7a2a']], { js: { shL: 1.15, shR: 1.15 } }],
    pyra: ['Salamandre', '#ff8a3a', '#ffcf5a', '#2a1a10', '#ff8a3a', '#ffd060', 0.94, 'skin', 'tailDragon crest', [['back', 'spikes', '#ffd060'], ['muzzle', 'snout', '#ffa55a'], ['arms', 'claws', '#3a1a10'], ['torso', 'belly', '#ffe0a0']], { bald: 1 }],
    akio: ['Oni samouraï', '#c8402c', '#1a1012', '#ffe08a', '#1c1a22', '#c9a03a', 1.04, 'flat', 'tusks', [['helm', 'kabuto', '#1c1a22', '#c9a03a'], ['torso', 'cuirass', '#8a1c1c'], ['hips', 'tassets', '#8a1c1c'], ['arms', 'bracers', '#1c1a22'], ['legs', 'greaves', '#1c1a22']]],
    rin: ['Kitsune', '#ffe4d0', '#ff6b3d', '#ffcf3a', '#f4ecdf', '#c8321e', 0.96, 'flat', '', [['ears', 'fox', '#ff6b3d', '#fff0e0'], ['tail', 'fox', 3, '#ff6b3d', '#fff4e6'], ['hips', 'kilt', '#c8321e'], ['torso', 'scarf', '#c8321e']]],
    bram: ['Minotaure de magma', '#6a3324', '#2a1410', '#ffb03a', '#6a3324', '#d08a2a', 1.18, 'skin', 'pauldrons belt', [['horns', 'bull', '#f0e6d0'], ['muzzle', 'beast', '#8a4a34', '#2a1410'], ['crown', 'nosering', '#e0b040'], ['legs', 'hooves', '#2a1410'], ['hips', 'loin', '#3a1a14'], ['tail', 'tuft', '#6a3324', '#2a1410']], { js: { shL: 1.18, shR: 1.18 }, bald: 1 }],
    kaen: ['Demi-dragon écarlate', '#c8281e', '#ffb03a', '#ffe07a', '#c8281e', '#ffb03a', 1.06, 'skin', 'hornsBack tailDragon', [['back', 'spikes', '#ffb03a'], ['arms', 'claws', '#f0e0c0'], ['torso', 'cuirass', '#3a1010'], ['face', 'fangs'], ['hips', 'tassets', '#3a1010']]],
    seika: ['Phénix', '#ffd9a8', '#ffb347', '#ff5a2a', '#e8521c', '#ffd24a', 1.0, 'flat', '', [['wings', 'feather', '#ff7a1e', null, 0.82], ['tail', 'fan', ['#ff5a1e', '#ffb02a', '#ffe07a'], 7, 0.7], ['crown', 'feather', '#ffd24a'], ['hips', 'kilt', '#e8521c'], ['torso', 'cuirass', '#ffcf4a']]],
    // ---- EAU ----
    mio: ['Esprit de rosée', '#7fe0ff', '#bff4ff', '#1a6ad0', '#7fe0ff', '#ffffff', 0.9, 'skin', 'orbs', [['crown', 'drop', '#9feaff'], ['hips', 'petal', '#5fd0ff', 10], ['extra', 'drips', '#dff8ff']], { bald: 1 }],
    kai: ['Homme-requin', '#6f8fa8', '#2a4a66', '#101820', '#6f8fa8', '#2a3a4a', 1.08, 'skin', '', [['back', 'fin', '#5a7a94'], ['tail', 'fish', '#6f8fa8', '#4a6a84'], ['crown', 'fin', '#5a7a94'], ['face', 'fangs'], ['torso', 'belly', '#e8f0f4'], ['arms', 'bracers', '#2a3a4a']], { bald: 1 }],
    shio: ['Tortue des récifs', '#6fbf7a', '#2bb3a3', '#2a1a10', '#6fbf7a', '#3a7a5a', 1.0, 'skin', '', [['back', 'shell', '#3a7a5a', '#8fd0a0'], ['torso', 'belly', '#e8dca0'], ['muzzle', 'beakS', '#4f9f6a'], ['hips', 'kilt', '#2a6a5a'], ['arms', 'bracers', '#3a7a5a']], { bald: 1 }],
    nori: ['Fantôme des brumes', '#cfe4f0', '#3d4b6b', '#7fffff', '#8fa8c0', '#cfe4f0', 1.0, 'flat', 'robe orbs', [['helm', 'hood', '#5a6f8a'], ['torso', 'poncho', '#7a90aa'], ['crown', 'eyesGlow', '#9fffff']], { hs: 'short', robeC: '#8fa8c0' }],
    aiko: ['Hippocampe', '#ffd27a', '#5fb8ff', '#2a8ad0', '#ffd27a', '#ff9a5a', 0.98, 'skin', '', [['muzzle', 'seahorse', '#ffd27a'], ['crown', 'fin', '#ff9a5a'], ['tail', 'curl', '#ffd27a'], ['back', 'fin', '#ff9a5a'], ['torso', 'belly', '#fff0c0'], ['hips', 'kilt', '#2a8ab0']], { bald: 1 }],
    kiri: ['Homme-pieuvre', '#5a3a8a', '#0c2a4a', '#ffe14d', '#5a3a8a', '#c8a0e8', 1.02, 'skin', '', [['face', 'tentaclebeard', '#7a52b0'], ['back', 'tentacles', '#5a3a8a'], ['crown', 'mantle', '#5a3a8a'], ['torso', 'belly', '#c8a0e8']], { bald: 1 }],
    isao: ['Loutre des rivières', '#7a5a40', '#1a3f66', '#1a1210', '#7a5a40', '#2a6a8a', 1.02, 'skin', '', [['ears', 'bear', '#6a4a34', '#c8a080'], ['muzzle', 'beast', '#e8d8c0', '#2a1a14', 0.9], ['tail', 'fish', '#6a4a34', '#6a4a34'], ['torso', 'belly', '#e8d8c0'], ['torso', 'necklace', '#f4f0e0'], ['hips', 'kilt', '#2a6a8a']], { bald: 1 }],
    ondine: ['Méduse des abysses', '#d8f4ff', '#9fe3ff', '#ff8ad8', '#a8dcff', '#ff9ae0', 1.02, 'flat', 'robe', [['helm', 'jelly', '#b8ecff', '#ff9ae0'], ['torso', 'petalCollar', '#e0f8ff', 1.3]], { bald: 1, robeC: '#bfe6ff' }],
    suiren: ['Dame du givre', '#e4f4ff', '#d6f1ff', '#5ab0ff', '#f4faff', '#9fd0ff', 1.0, 'flat', 'robe', [['crown', 'ice', '#bfe8ff'], ['torso', 'fur', '#ffffff'], ['extra', 'iceShoulders', '#dff4ff']], { robeC: '#eef6ff' }],
    // ---- FOUDRE ----
    rai: ["Lutin d'orage", '#ffe680', '#fff4b0', '#2a6ad0', '#3a5ab0', '#ffe14d', 0.86, 'flat', 'elfEarsShort belt', [['hat', 'gnome', '#3a5ab0', '#ffe14d'], ['torso', 'cloudcollar', '#ffffff'], ['tail', 'bolt', '#ffe14d']], { js: { head: 1.15 } }],
    volt: ['Kobold mécano', '#b0c04a', '#f2c200', '#1a1210', '#5a4a3a', '#c08a3a', 0.84, 'flat', 'tailDragon belt', [['muzzle', 'snout', '#c0d05a'], ['crown', 'goggles', '#c08a3a', '#7fffff'], ['back', 'tank', '#8a8f96', '#ffe14d'], ['arms', 'gauntlets', '#8a5a2a'], ['horns', 'small', '#e8e0c0']], { js: { head: 1.2 }, bald: 1 }],
    ohm: ['Automate de cuivre', '#c87a4a', '#6b5a2a', '#ffe14d', '#c87a4a', '#6a4a3a', 1.16, 'metal', 'pauldrons', [['helm', 'robotdome', '#c87a4a', '#ffe14d'], ['torso', 'core', '#ffe14d'], ['back', 'rod', '#8a8f96', '#ffe14d'], ['arms', 'gauntlets', '#a05a34'], ['legs', 'greaves', '#a05a34']], { js: { shL: 1.15, shR: 1.15 }, bald: 1 }],
    lumi: ['Fée luciole', '#fff0c0', '#fff27a', '#3aa05a', '#3a3a2a', '#d8ff5a', 0.88, 'flat', '', [['wings', 'insect', '#f4ffd0'], ['crown', 'antenna', 'ball', '#d8ff5a'], ['tail', 'bulb', '#d8ff5a'], ['hips', 'petal', '#5a6a2a', 8]]],
    jinto: ['Oni du tonnerre', '#4a8ad0', '#ffe14d', '#ffe14d', '#4a8ad0', '#e0a020', 1.1, 'skin', 'tusks', [['horns', 'oni', '#ffe9a0'], ['back', 'drums', '#c8321e', '#ffe14d'], ['hips', 'loin', '#e0a020'], ['arms', 'bracers', '#e0a020'], ['torso', 'necklace', '#f0e8d0']]],
    hikari: ["Valkyrie de l'aurore", '#fff0e4', '#ffe9a8', '#5ad0c0', '#f4f4ff', '#ffd860', 1.03, 'flat', '', [['helm', 'winged', '#ffd860', '#ffffff'], ['wings', 'feather', '#ffffff', null, 0.8], ['torso', 'cuirass', '#ffd860'], ['hips', 'tassets', '#ffd860'], ['legs', 'greaves', '#ffd860'], ['hips', 'kilt', '#f4f4ff']]],
    neko: ['Nekomata', '#5a5a66', '#3a3a3a', '#ffe14d', '#5a5a66', '#ffe14d', 0.97, 'skin', '', [['ears', 'cat', '#3a3a44', '#ffb0c0'], ['tail', 'cat', 2, '#3a3a44'], ['arms', 'claws', '#f0f0f0'], ['torso', 'scarf', '#ffe14d'], ['torso', 'belly', '#8a8a96']]],
    raijo: ['Kirin de foudre', '#e8c040', '#fff0a0', '#ff5a3a', '#e8c040', '#2a6a5a', 1.08, 'skin', 'crest', [['horns', 'uni', '#fff4c0'], ['ears', 'wolf', '#e8c040', '#fff0a0'], ['tail', 'tuft', '#e8c040', '#fff0a0'], ['legs', 'hooves', '#3a2a10'], ['torso', 'cuirass', '#2a6a5a']]],
    // ---- TERRE ----
    iwa: ['Gargouille', '#6c727c', '#5a5f64', '#ffb02a', '#8f9499', '#5a5f64', 1.08, 'skin', 'wingsBat tailSpade', [['horns', 'small', '#6a6f74'], ['ears', 'bat', '#8f9499', '#6a6f74'], ['arms', 'claws', '#5a5f64'], ['face', 'fangs'], ['extra', 'moss', '#5a8a4a']], { bald: 1 }],
    daichi: ['Troll des collines', '#7a9a5a', '#4a3a2a', '#ffd060', '#7a9a5a', '#6a4a30', 1.2, 'skin', 'goblinEars', [['torso', 'fur', '#6a4a30'], ['hips', 'loin', '#6a4a30'], ['arms', 'gauntlets', '#5a7a44'], ['muzzle', 'nose', '#6a8a4a', null, 1.2], ['torso', 'necklace', '#f0e8d0']], { js: { shL: 1.2, shR: 1.2, head: 0.95 } }],
    mousse: ['Dryade', '#b8e08a', '#3f9a4a', '#ffe07a', '#3a7a3a', '#ff8ab0', 0.96, 'flat', '', [['crown', 'leaf', '#4faa4a'], ['hips', 'petal', '#4faa4a', 9], ['torso', 'petalCollar', '#6fc45a'], ['crown', 'flower', '#ff8ab0', 3], ['arms', 'bracers', '#3a7a3a']]],
    grav: ['Scorpion des sables', '#c8a060', '#3a2a1a', '#ff5a3a', '#c8a060', '#a07a40', 1.02, 'skin', '', [['tail', 'scorpion', '#b08a4a', '#ff5a3a'], ['arms', 'pincers', '#b08a4a'], ['crown', 'antenna', 'ball', '#8a6a3a'], ['torso', 'cuirass', '#a07a40'], ['crown', 'eyes', '#ff5a3a']], { bald: 1 }],
    bodo: ['Tréant', '#7a5a3a', '#3a2a1a', '#b0ff5a', '#7a5a3a', '#5faa4a', 1.22, 'skin', '', [['horns', 'antler', '#5a4028'], ['crown', 'leaf', '#5faa4a'], ['extra', 'moss', '#5faa4a'], ['arms', 'gauntlets', '#6a4a2e'], ['face', 'cloudbeard', '#5faa4a']], { js: { shL: 1.15, shR: 1.15 }, bald: 1 }],
    koji: ['Ours des roches', '#7a5a44', '#3a2a1a', '#1a1210', '#7a5a44', '#8a8f96', 1.16, 'skin', 'pauldronRock', [['ears', 'bear', '#6a4a36', '#c8a080'], ['muzzle', 'beast', '#c8a080', '#2a1a14'], ['arms', 'claws', '#f0e8d8'], ['torso', 'belly', '#b89878'], ['tail', 'bunny', '#6a4a36']], { js: { shL: 1.15, shR: 1.15 }, bald: 1 }],
    hana: ['Alraune', '#d8f0b0', '#ff7ab0', '#ffd24a', '#4f9a4a', '#ff7ab0', 0.98, 'flat', '', [['torso', 'petalCollar', '#ff7ab0', 1.7], ['hips', 'petal', '#ff9ac4', 8], ['crown', 'flower', '#ffe6f0', 1, 'big'], ['arms', 'bracers', '#4f9a4a']]],
    takeru: ['Homme-serpent', '#5a9a5a', '#2a3a1a', '#ffe14d', '#5a9a5a', '#e8d060', 1.04, 'skin', 'tailDragon', [['helm', 'cobra', '#4a8a4a', '#e8d060'], ['face', 'fangs'], ['torso', 'belly', '#e8e0a0'], ['arms', 'bracers', '#e8d060'], ['hips', 'loin', '#8a2a5a']], { bald: 1 }],
    // ---- OMBRE ----
    kuro: ['Ombre vivante', '#14101c', '#0a0810', '#ffffff', '#14101c', '#8a4ad0', 0.96, 'skin', 'orbs', [['torso', 'scarf', '#8a4ad0'], ['crown', 'eyesGlow', '#ffffff']]],
    yoru: ['Vampire', '#e8e0ec', '#1a1420', '#ff2a3a', '#1a1420', '#8a1428', 1.04, 'flat', 'collar cape elfEarsShort', [['face', 'fangs'], ['torso', 'jabot', '#f4f0f4'], ['arms', 'bracers', '#8a1428']], { hs: 'short' }],
    shin: ['Chevalier noir', '#2a2a34', '#101014', '#b06aff', '#1c1c26', '#8a4ad0', 1.1, 'metal', 'pauldronSpike cape', [['helm', 'full', '#1c1c26', '#b06aff', '#8a4ad0'], ['torso', 'cuirass', '#22222e'], ['hips', 'tassets', '#22222e'], ['legs', 'greaves', '#22222e'], ['arms', 'gauntlets', '#22222e']], { bald: 1 }],
    luna: ['Lapin de lune', '#f0e8ff', '#e0d8f8', '#ff7ab0', '#c8b8f0', '#fff0a0', 0.92, 'flat', '', [['ears', 'bunny', '#f4eeff', '#ffc0d8'], ['tail', 'bunny', '#ffffff'], ['crown', 'tiara', '#fff0a0', '#ffffff'], ['hips', 'kilt', '#c8b8f0'], ['torso', 'fur', '#ffffff']]],
    ren: ['Tengu corbeau', '#2a2a34', '#101018', '#ff3a3a', '#16161e', '#8a1c1c', 1.0, 'flat', '', [['muzzle', 'beak', '#c8a040'], ['wings', 'feather', '#16161e', null, 0.74], ['crown', 'feather', '#16161e'], ['hips', 'kilt', '#16161e'], ['arms', 'bracers', '#8a1c1c']]],
    mayu: ['Arachné', '#c8b0e0', '#2a1a3a', '#ff3a8a', '#2a1a3a', '#8a3ab0', 1.0, 'flat', '', [['back', 'legs', '#2a1a3a'], ['crown', 'eyes', '#ff3a8a'], ['hips', 'kilt', '#2a1a3a'], ['face', 'fangs'], ['back', 'abdomen', '#2a1a3a', '#ff3a8a']]],
    ayame: ['Phalène', '#e8dcc8', '#8a7a6a', '#1a1a1a', '#6a5a4a', '#c8b090', 0.97, 'flat', '', [['wings', 'moth', '#a08a6a', '#3a2a1a', '#f4ecd8'], ['torso', 'fur', '#f4ecd8'], ['crown', 'antenna', 'feather', '#c8b090'], ['hips', 'kilt', '#8a7a5a']]],
    kurai: ['Faucheur', '#d8d4c8', '#101014', '#7a3aff', '#101014', '#7a3aff', 1.08, 'flat', 'robe', [['helm', 'skull', '#e8e4d8', '#7a3aff'], ['helm', 'hood', '#16161c'], ['torso', 'ribs', '#e8e4d8']], { bald: 1, robeC: '#16161c' }],
    // ---- NOUVEAUX : FEU ----
    zarok: ['Éfrit', '#7a2a3a', '#ff7a1a', '#ffe08a', '#7a2a3a', '#ffd24a', 1.14, 'skin', 'elfEarsShort', [['crown', 'flame', '#ff5a1a', '#ffd24a', 1.1], ['arms', 'bracers', '#ffd24a'], ['hips', 'cloud', '#ff8a3a'], ['torso', 'necklace', '#ffd24a'], ['hips', 'loin', '#ffd24a']], { js: { shL: 1.15, shR: 1.15 }, bald: 1 }],
    leo: ['Lion solaire', '#e8b050', '#ffb020', '#3a1a10', '#e8b050', '#c8321e', 1.12, 'skin', '', [['crown', 'mane', '#c8641a'], ['ears', 'bear', '#e8b050', '#c8641a'], ['muzzle', 'beast', '#f4d8a0', '#3a1a10'], ['tail', 'tuft', '#e8b050', '#c8641a'], ['arms', 'claws', '#f4f0e0'], ['torso', 'cuirass', '#c8321e'], ['hips', 'loin', '#c8321e']], { bald: 1 }],
    brazo: ['Golem de lave', '#2a2224', '#2a1612', '#ff8a1a', '#2a2224', '#ff7a1a', 1.22, 'skin', 'pauldronRock', [['extra', 'cracks', '#ff7a1a'], ['torso', 'core', '#ffb02a'], ['arms', 'gauntlets', '#3a2e2e'], ['crown', 'eyesGlow', '#ffb02a'], ['crown', 'rocks', '#3a2e2e']], { js: { shL: 1.25, shR: 1.25, head: 0.88 }, bald: 1 }],
    magda: ['Fourneau vivant', '#8a8a94', '#c4521c', '#ffb02a', '#4a4a52', '#c87a3a', 1.08, 'metal', '', [['torso', 'furnace', '#ff8a1a'], ['back', 'chimney', '#3a3a42', '#ff8a1a'], ['crown', 'goggles', '#c87a3a', '#ffb02a'], ['arms', 'gauntlets', '#3a3a42'], ['torso', 'apron', '#6a4a2e'], ['legs', 'greaves', '#3a3a42']]],
    cendre: ['Lanterne hantée', '#3a2a2a', '#ffcf7a', '#ffcf7a', '#5a1c1c', '#1a1010', 0.98, 'flat', '', [['helm', 'lantern', '#ffcf7a', '#1a1010'], ['torso', 'poncho', '#5a1c1c'], ['hips', 'kilt', '#3a1414'], ['arms', 'bracers', '#1a1010']], { bald: 1 }],
    pompa: ['Épouvantail', '#c8a870', '#d9a441', '#1a1210', '#5a6a8a', '#c8321e', 1.06, 'flat', '', [['helm', 'sack', '#c8a870'], ['hat', 'straw', '#d9b451'], ['torso', 'poncho', '#8a5a2e'], ['torso', 'scarf', '#c8321e'], ['extra', 'straw', '#e8c860']], { bald: 1, pants: '#6a4a2e' }],
    fumi: ['Feu follet', '#fff0d0', '#ffd98a', '#ff7a1a', '#fff0d0', '#ff9a2a', 0.74, 'skin', '', [['crown', 'flame', '#ff9a2a', '#fff0a0', 1.3], ['torso', 'poncho', '#f4e8d0'], ['extra', 'drips', '#fff8e8']], { js: { head: 1.22 }, bald: 1 }],
    tika: ['Chamane masqué', '#8a5a3a', '#3a1c14', '#ffb02a', '#8a5a3a', '#c8321e', 0.98, 'skin', '', [['helm', 'mask', '#6a4a2e', '#ffb02a', '#ffffff'], ['crown', 'feather', '#c8321e'], ['hips', 'loin', '#c8321e'], ['torso', 'necklace', '#f0e8d0'], ['arms', 'bracers', '#e0a030']]],
    // ---- NOUVEAUX : EAU ----
    abyssa: ['Baudroie des abysses', '#1a2448', '#101a3a', '#7fffd0', '#1a2448', '#7fffd0', 1.05, 'skin', '', [['crown', 'lure', '#7fffd0'], ['face', 'fangs', 1.7], ['back', 'fin', '#2a3a6a'], ['tail', 'fish', '#1a2448', '#7fffd0'], ['extra', 'stars', '#7fffd0', 14], ['torso', 'belly', '#3a4a7a']]],
    borg: ['Yéti', '#eef4fa', '#eef6ff', '#5ab0ff', '#eef4fa', '#7fb8e8', 1.24, 'skin', '', [['horns', 'small', '#7fb8e8'], ['torso', 'fur', '#ffffff'], ['crown', 'mane', '#ffffff'], ['arms', 'gauntlets', '#dfe8f0'], ['face', 'fangs'], ['muzzle', 'nose', '#8fb8d8'], ['legs', 'fur', '#eef4fa']], { js: { shL: 1.22, shR: 1.22 }, bald: 1 }],
    frimas: ['Chevalier de givre', '#bfe0f4', '#e8f6ff', '#2a8aff', '#9fd0f0', '#dff4ff', 1.06, 'metal', '', [['horns', 'long', '#dff4ff'], ['extra', 'iceShoulders', '#dff4ff'], ['torso', 'cuirass', '#bfe4fa'], ['hips', 'tassets', '#bfe4fa'], ['legs', 'greaves', '#bfe4fa'], ['arms', 'bracers', '#bfe4fa']]],
    koa: ['Grenouille ninja', '#5fc86a', '#3fbf5f', '#1a1210', '#5fc86a', '#2a2a34', 0.86, 'skin', '', [['crown', 'stalk', 'frog', '#5fc86a'], ['torso', 'belly', '#e8f4c0'], ['torso', 'scarf', '#c8321e'], ['hips', 'loin', '#2a2a34'], ['arms', 'bracers', '#2a2a34']], { js: { head: 1.15 }, bald: 1 }],
    karka: ['Crabe géant', '#e0562c', '#e0562c', '#1a1210', '#e0562c', '#f08a5a', 1.1, 'skin', '', [['arms', 'pincers', '#e8643a'], ['back', 'shell', '#c8421e', '#f08a5a'], ['crown', 'stalk', 'crab', '#e0562c'], ['torso', 'belly', '#f4d8b0']], { js: { shL: 1.2, shR: 1.2 }, bald: 1 }],
    narval: ['Narval', '#9fc4d8', '#9fc4d8', '#101820', '#9fc4d8', '#3a5a7a', 1.1, 'skin', '', [['horns', 'uni', '#f4f0e0', 1.5], ['torso', 'belly', '#f0f6fa'], ['back', 'fin', '#7fa8c0'], ['tail', 'fish', '#9fc4d8', '#7fa8c0'], ['hips', 'kilt', '#3a5a7a']], { bald: 1 }],
    pingo: ['Manchot', '#1a2230', '#1a2230', '#1a1210', '#1a2230', '#ffa02a', 0.78, 'skin', '', [['muzzle', 'beak', '#ffa02a', 0.55], ['torso', 'belly', '#ffffff', 1.2], ['crown', 'brow', '#ffd24a'], ['legs', 'hooves', '#ffa02a'], ['torso', 'scarf', '#c8321e']], { js: { head: 1.18, chest: 1.12 }, bald: 1 }],
    axo: ['Axolotl', '#ffb6c9', '#ffb6c9', '#2a1a2a', '#ffb6c9', '#7fd0e0', 0.88, 'skin', '', [['crown', 'gills', '#ff6a9a'], ['tail', 'fish', '#ffb6c9', '#ff8ab0'], ['torso', 'belly', '#ffe0ea'], ['hips', 'kilt', '#7fd0e0']], { js: { head: 1.15 }, bald: 1 }],
    // ---- NOUVEAUX : FOUDRE ----
    ryujin: ['Dragon des nuées', '#3a7ad0', '#e8f4ff', '#ffe14d', '#3a7ad0', '#ffe9a0', 1.1, 'skin', 'tailDragon orbs', [['horns', 'antler', '#ffe9a0'], ['crown', 'whiskers', '#e8f4ff'], ['back', 'spikes', '#e8f4ff'], ['torso', 'belly', '#ffe9a0'], ['hips', 'cloud', '#ffffff'], ['arms', 'claws', '#ffe9a0']]],
    tesla: ['Méca-samouraï', '#c8d2e0', '#c8d2e0', '#2affff', '#aab4c4', '#2a6aff', 1.06, 'metal', '', [['helm', 'kabuto', '#8a94a4', '#2affff'], ['crown', 'visor', '#2affff'], ['torso', 'core', '#2affff'], ['hips', 'tassets', '#8a94a4'], ['arms', 'bracers', '#2a6aff'], ['legs', 'greaves', '#8a94a4'], ['back', 'tank', '#8a94a4', '#2affff']], { bald: 1 }],
    stratos: ['Cyclope des tempêtes', '#8fa8c8', '#e8ecf4', '#ffe14d', '#8fa8c8', '#ffe14d', 1.26, 'skin', '', [['crown', 'cyclops', '#ffe14d'], ['face', 'cloudbeard', '#ffffff'], ['torso', 'fur', '#ffffff'], ['hips', 'cloud', '#e8ecf4'], ['arms', 'bracers', '#ffe14d'], ['horns', 'small', '#e8ecf4']], { js: { shL: 1.2, shR: 1.2 }, bald: 1 }],
    zephyr: ['Djinn des nuages', '#7fc8f0', '#f4f7ff', '#ffffff', '#7fc8f0', '#ffd24a', 1.04, 'skin', 'elfEarsShort', [['hips', 'cloud', '#ffffff', 1.35], ['arms', 'bracers', '#ffd24a'], ['torso', 'necklace', '#ffd24a'], ['torso', 'scarf', '#ffd24a']]],
    magno: ['Élémentaire magnétique', '#6a6f7a', '#b0342c', '#ff5a4a', '#5a5f6a', '#c8321e', 1.08, 'metal', '', [['horns', 'magnet', '#c8321e'], ['back', 'shardsOrbit', '#b0b8c8'], ['torso', 'core', '#c8321e'], ['arms', 'gauntlets', '#c8321e'], ['legs', 'greaves', '#3a5ab0']], { bald: 1 }],
    hoot: ['Hibou savant', '#b08a5a', '#8a6a3a', '#ffb02a', '#b08a5a', '#3a2a4a', 0.92, 'skin', '', [['ears', 'feather', '#8a6a3a'], ['muzzle', 'beak', '#e8c060', 0.45], ['crown', 'goggles', '#3a2a1a', '#ffe6a0', 'eyes'], ['wings', 'feather', '#8a6a3a', null, 0.6], ['torso', 'belly', '#e8d8b8'], ['hips', 'kilt', '#3a2a4a']], { js: { head: 1.15 }, bald: 1 }],
    fuse: ['Belette-éclair', '#ffe680', '#ffe680', '#1a1210', '#ffe680', '#3a5ab0', 0.84, 'skin', '', [['ears', 'bear', '#ffe680', '#fff8d0'], ['muzzle', 'beast', '#fff8d0', '#3a2a10', 0.8], ['tail', 'bolt', '#ffd020'], ['torso', 'belly', '#fff8d0'], ['torso', 'scarf', '#3a5ab0']]],
    gong: ['Tanuki', '#8a6a4a', '#7a5a3a', '#1a1210', '#8a6a4a', '#d9b451', 0.98, 'skin', '', [['ears', 'bear', '#5a4030', '#c8a880'], ['muzzle', 'beast', '#e8d8b8', '#2a1a14'], ['crown', 'patches', '#3a2a1e'], ['tail', 'ring', '#8a6a4a', '#3a2a1e'], ['torso', 'drum', '#f0e4c8'], ['hat', 'kasa', '#d9b451']], { js: { chest: 1.15 }, bald: 1 }],
    // ---- NOUVEAUX : TERRE ----
    jade: ['Guerrier de jade', '#5fae8a', '#2a6a4f', '#e8fff0', '#5fae8a', '#e8d48a', 1.12, 'skin', 'pauldrons', [['hat', 'topknot', '#3f8e6a', '#e8d48a'], ['torso', 'lamellar', '#3f8e6a', '#e8d48a'], ['hips', 'tassets', '#3f8e6a'], ['legs', 'greaves', '#3f8e6a'], ['arms', 'bracers', '#3f8e6a'], ['torso', 'scarf', '#c8321e']], { hs: 'short' }],
    bront: ['Rhinocéros', '#8a8f96', '#8a8f96', '#1a1210', '#8a8f96', '#6a5a3a', 1.22, 'skin', 'pauldrons', [['muzzle', 'rhino', '#8a8f96', '#e8e0d0'], ['ears', 'cat', '#7a7f86', '#a8adb4'], ['torso', 'cuirass', '#6a5a3a'], ['hips', 'tassets', '#6a5a3a'], ['tail', 'tuft', '#8a8f96', '#3a3a3a']], { js: { shL: 1.25, shR: 1.25 }, bald: 1 }],
    sylvan: ['Faune', '#e0b890', '#6a4526', '#5a8a3a', '#e0b890', '#4a6a2e', 1.0, 'skin', 'elfEarsShort', [['horns', 'ram', '#8a6a4a'], ['legs', 'fur', '#6a4526'], ['legs', 'hooves', '#2a1a10'], ['tail', 'bunny', '#6a4526'], ['torso', 'necklace', '#5a8a3a'], ['hips', 'loin', '#4a6a2e']]],
    mamut: ['Mammouth', '#6b4a30', '#6b4a30', '#1a1210', '#6b4a30', '#f4ecd8', 1.26, 'skin', '', [['muzzle', 'trunk', '#6b4a30', '#f4ecd8'], ['ears', 'flap', '#6b4a30'], ['torso', 'fur', '#5a3a24'], ['legs', 'fur', '#5a3a24'], ['arms', 'gauntlets', '#5a3a24']], { js: { shL: 1.2, shR: 1.2 }, bald: 1 }],
    sirocco: ['Momie', '#d8c9a0', '#d8c9a0', '#3affc8', '#d8c9a0', '#e8c040', 1.02, 'skin', '', [['crown', 'eyesGlow', '#3affc8'], ['extra', 'bandages', '#f4ecd0'], ['torso', 'scarf', '#c8b888'], ['crown', 'tiara', '#e8c040', '#3affc8'], ['arms', 'bracers', '#e8c040']], { bald: 1 }],
    gemma: ['Fée géode', '#b48cff', '#e8d8ff', '#ffffff', '#b48cff', '#e0c8ff', 0.98, 'skin', '', [['crown', 'crystal', '#e0c8ff'], ['extra', 'iceShoulders', '#e0c8ff'], ['hips', 'petal', '#c8a0ff', 7, 'crystal'], ['torso', 'core', '#ffffff'], ['back', 'shardsOrbit', '#e0c8ff', 'glow']]],
    champi: ['Champignon', '#f0e6d0', '#e8dcc0', '#1a1210', '#f0e6d0', '#c8321e', 0.8, 'skin', '', [['helm', 'mushroom', '#c8321e', '#ffffff'], ['hips', 'kilt', '#e8dcc0'], ['torso', 'fur', '#f8f0e0']], { js: { head: 1.1 }, bald: 1 }],
    spino: ['Cactus', '#4fa85a', '#3f9a4a', '#1a1210', '#4fa85a', '#ff5a8a', 1.0, 'skin', '', [['extra', 'spikesAll', '#f4f0c0'], ['crown', 'flower', '#ff5a8a', 1, 'big'], ['torso', 'belly', '#6fc47a']], { bald: 1 }],
    // ---- NOUVEAUX : OMBRE ----
    erebos: ['Dracoliche', '#3a3440', '#e8e2d0', '#7affb0', '#1c1a22', '#e8e2d0', 1.2, 'flat', '', [['helm', 'bone', '#e8e2d0', '#7affb0'], ['torso', 'ribs', '#e8e2d0'], ['back', 'bonewings', '#e8e2d0'], ['tail', 'bone', '#e8e2d0'], ['arms', 'claws', '#e8e2d0']], { js: { shL: 1.15, shR: 1.15 }, bald: 1 }],
    noct: ['Loup-garou', '#5a5e6c', '#4a4e5c', '#ffe14d', '#5a5e6c', '#3a2a5a', 1.16, 'skin', '', [['ears', 'wolf', '#4a4e5c', '#8a8e9c'], ['muzzle', 'beast', '#8a8e9c', '#1a1a20', 1.15], ['tail', 'fox', 1, '#5a5e6c', '#8a8e9c'], ['arms', 'claws', '#f0f0f0'], ['torso', 'fur', '#4a4e5c'], ['hips', 'loin', '#3a2a5a'], ['face', 'fangs']], { js: { shL: 1.18, shR: 1.18 } }],
    nyx: ['Gorgone', '#9fc8a0', '#3f8a5a', '#ffe14d', '#2a4a3a', '#c8a040', 1.02, 'flat', 'robe', [['crown', 'snakes', '#3f8a5a'], ['arms', 'bracers', '#c8a040'], ['torso', 'necklace', '#c8a040'], ['face', 'fangs']], { bald: 1, robeC: '#2a4a3a' }],
    onyx: ["Panthère d'ombre", '#1c1a24', '#16141c', '#b0ff3a', '#1c1a24', '#8a4ad0', 1.04, 'skin', '', [['ears', 'bear', '#1c1a24', '#5a3a6a'], ['muzzle', 'beast', '#2a2834', '#ff8ab0', 0.9], ['tail', 'cat', 1, '#1c1a24'], ['arms', 'claws', '#e8e8f0'], ['torso', 'necklace', '#b0ff3a'], ['arms', 'bracers', '#8a4ad0']], { bald: 1 }],
    corvus: ['Médecin de peste', '#e8e4d8', '#1a1a20', '#3affb0', '#1a1a20', '#3affb0', 1.04, 'flat', 'robe', [['muzzle', 'beakLong', '#e8e4d8', '#3affb0'], ['hat', 'plague', '#1a1a20'], ['torso', 'poncho', '#24242c'], ['torso', 'necklace', '#3affb0']], { bald: 1, robeC: '#1a1a20' }],
    gloom: ["Slime d'ombre", '#5a2f8a', '#5a2f8a', '#ffffff', '#5a2f8a', '#ff7ae0', 0.92, 'skin', '', [['helm', 'dome', '#7a4ab0'], ['crown', 'eyesGlow', '#ffffff'], ['extra', 'drips', '#9a6ad0'], ['torso', 'core', '#ff7ae0']], { js: { chest: 1.12 }, bald: 1 }],
    vespera: ['Chauve-souris', '#6a4a7a', '#3a2a4a', '#ffb0d0', '#6a4a7a', '#f0e0f4', 0.9, 'skin', '', [['ears', 'bat', '#5a3a6a', '#ffb0d0'], ['wings', 'batS', '#4a2a5a'], ['torso', 'fur', '#f0e0f4'], ['face', 'fangs'], ['muzzle', 'nose', '#ff9ac0', null, 0.5]]],
    mimi: ['Mimic', '#3a2a3a', '#7a4a22', '#ff3a5a', '#5a3a1e', '#e8c040', 0.9, 'flat', '', [['helm', 'chest', '#7a4a22', '#e8c040', '#ff3a5a'], ['hips', 'kilt', '#5a3a1e'], ['arms', 'gauntlets', '#7a4a22'], ['torso', 'core', '#e8c040']], { bald: 1 }],
    // ---- NOUVEAUX : PRISME ----
    astra: ['Licorne astrale', '#fff4fa', '#f6c8ff', '#8a5aff', '#ffffff', '#ffd8f0', 1.04, 'flat', '', [['horns', 'uni', '#ffe9a0', 1.2, 'glow'], ['ears', 'cat', '#ffffff', '#ffc8e0'], ['tail', 'fox', 1, '#f6c8ff', '#c8e0ff'], ['legs', 'hooves', '#ffd24a'], ['hips', 'kilt', '#ffffff'], ['extra', 'stars', '#fff0a0', 14]]],
    nebula: ['Enfant de la galaxie', '#1a1450', '#2a1f6a', '#ffffff', '#1a1450', '#ff8ae0', 1.1, 'skin', 'orbs', [['extra', 'stars', '#ffffff', 34], ['crown', 'eyesGlow', '#ffffff'], ['crown', 'shards', '#ff8ae0'], ['torso', 'core', '#ff8ae0'], ['hips', 'cloud', '#4a2a9a']], { bald: 1 }],
    zenith: ['Titan stellaire', '#fff0e0', '#fff3c4', '#ffb02a', '#fafaff', '#ffd24a', 1.14, 'metal', 'pauldrons', [['back', 'blades', '#fff3c4'], ['crown', 'shards', '#ffd24a'], ['torso', 'cuirass', '#fafaff'], ['hips', 'tassets', '#fafaff'], ['legs', 'greaves', '#ffd24a'], ['arms', 'bracers', '#ffd24a']]],
    prisma: ['Prisme vivant', '#f4f4ff', '#ffffff', '#ff5ac8', '#f4f4ff', '#ffffff', 1.0, 'skin', '', [['helm', 'pyramid'], ['extra', 'rays'], ['torso', 'core', '#ffffff'], ['back', 'crystals', 'rainbow'], ['hips', 'petal', 'rainbow', 7, 'crystal']], { bald: 1 }],
    iris: ['Papillon prismatique', '#ffe4f4', '#ffc2e8', '#5ad0ff', '#b08aff', '#ffe14d', 0.95, 'flat', '', [['wings', 'butterfly', '#ff8ad0', '#5ad0ff', '#ffe14d'], ['crown', 'antenna', 'curl', '#b08aff'], ['hips', 'petal', '#b08aff', 8], ['torso', 'fur', '#ffffff']]],
    lumen: ['Paon royal', '#1fa890', '#1fa890', '#ffd24a', '#1fa890', '#2a4ab0', 1.04, 'skin', '', [['tail', 'fan', ['#1fa890', '#2a6ad0', '#ffd24a'], 11, 1.0, 1], ['crown', 'feather', '#2a6ad0'], ['muzzle', 'beak', '#ffd24a', 0.4], ['torso', 'cuirass', '#2a4ab0'], ['hips', 'kilt', '#1a6a5a']], { bald: 1 }],
    sphinx: ['Sphinx', '#e0b070', '#1a1430', '#3ad0ff', '#f4e8c0', '#2a5ab0', 1.08, 'flat', '', [['helm', 'nemes', '#e8c040', '#2a5ab0'], ['wings', 'feather', '#e8c040', null, 0.7], ['tail', 'tuft', '#e0b070', '#8a5a2a'], ['torso', 'necklace', '#3ad0ff'], ['arms', 'bracers', '#e8c040'], ['hips', 'kilt', '#f4e8c0']], { bald: 1 }]
  };
  Object.keys(T).forEach(id => {
    const [nom, sk, hr, ey, mn, sc, s, suit, parts, p, o] = T[id], X = o || {};
    RACES[id] = { nom, skin: hx(sk), hair: hx(hr), eye: hx(ey), main: hx(mn), sec: hx(sc), pants: X.pants ? hx(X.pants) : dk(hx(mn), 0.7), s, js: X.js, suit, bald: X.bald, hairStyle: X.hs, robeC: X.robeC ? hx(X.robeC) : null, parts: parts ? parts.split(' ') : [], p };
  });
  // les 10 créatures de la v15 : leur tenue d'origine passe aussi en combinaison unie
  Object.keys(RACES).forEach(id => { if (!RACES[id].suit) RACES[id].suit = 'flat'; });
})();

;

const VERSION_JEU = '17.1';
