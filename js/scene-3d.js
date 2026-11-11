/* =============================================================================
   RUNE CLASH — SCÈNES 3D DU SITE
   -----------------------------------------------------------------------------
   Utilise le moteur du jeu (js/moteur-3d.js) : les héros affichés ici sont
   exactement ceux du jeu. Une seule zone de dessin 3D (canvas) pour tout le site,
   qu'on déplace entre deux endroits :
     - « accueil » : le décor de l'écran d'accueil du jeu et un héros en vedette ;
     - « fiche »   : la fiche d'un héros, sur un fond à la couleur de son élément.
   Commandes : glisser = tourner · molette / pincer / boutons = zoomer · toucher = petite animation.
   ============================================================================= */
const Scene3D = (function () {
  const PI = Math.PI;
  const calme = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Ciel de chaque élément (haut, horizon, sol) — repris du jeu
  const CIEL = {
    feu: [[0.11, 0.035, 0.11], [0.66, 0.22, 0.10], [0.15, 0.05, 0.07]], eau: [[0.03, 0.09, 0.20], [0.10, 0.50, 0.58], [0.03, 0.13, 0.18]],
    foudre: [[0.09, 0.05, 0.22], [0.52, 0.36, 0.70], [0.11, 0.07, 0.20]], terre: [[0.05, 0.11, 0.08], [0.62, 0.48, 0.20], [0.13, 0.10, 0.06]],
    ombre: [[0.05, 0.02, 0.10], [0.44, 0.13, 0.42], [0.08, 0.03, 0.10]], prisme: [[0.09, 0.07, 0.20], [0.78, 0.52, 0.60], [0.13, 0.09, 0.19]]
  };
  const CIEL_NUIT = [[0.15, 0.06, 0.36], [0.10, 0.50, 0.86], [0.10, 0.05, 0.26]];   // décor d'accueil
  // petites animations jouées de temps en temps (noms des poses du jeu)
  const GESTES = [['jabW', 'jab', 'crossW', 'cross', 'idle'], ['kickW', 'kick', 'idle'], ['charge', 'blast', 'blast', 'idle'], ['win', 'win', 'idle'], ['slashW', 'slash', 'idle']];

  let R = null, cv = null, hote = null, mode = null, pret = false, echec = false, chargement = null;
  const modeles = new Map();             // héros déjà construits (on en garde quelques-uns)
  const V = { id: null, lacet: 0.5, tangage: 0.06, dist: 4.4, cible: { lacet: 0.5, dist: 4.4, tangage: 0.06 }, auto: !calme, t: 0, geste: null, gT: 0, dernierGeste: 0, visible: true };
  const ecouteurs = { change: [] };

  /* ---------- démarrage ---------- */
  function init() {
    if (R || echec) return !echec;
    try {
      cv = document.createElement('canvas'); cv.className = 'scene3d'; cv.setAttribute('aria-label', 'Héros en 3D. Glisse pour le faire tourner, molette ou pincement pour zoomer.'); cv.tabIndex = 0;
      R = new G3.Renderer(cv); SOFT.attach(R, 1536);
    } catch (e) { echec = true; R = null; return false; }
    brancherCommandes();
    chargement = VRMC.load().then(ok => { pret = !!ok; if (!ok) echec = true; ecouteurs.change.forEach(f => f()); return ok; });
    requestAnimationFrame(boucle);
    new ResizeObserver(ajuster).observe(document.documentElement);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) dernier = performance.now(); });
    return true;
  }
  const progression = () => { const p = VRMC.prog(); return p.tot ? Math.min(1, p.done / p.tot) : 0; };

  /* ---------- placer la zone 3D dans la page ---------- */
  function monter(el, m) {
    if (!init()) return false;
    hote = el; mode = m; el.insertBefore(cv, el.firstChild); ajuster();
    if (m === 'fiche') { V.cible.dist = V.dist = 4.1; V.cible.tangage = V.tangage = 0.08; }
    else { V.cible.dist = V.dist = distAccueil(); V.cible.tangage = V.tangage = 0.06; }
    if (m === 'accueil' && 'IntersectionObserver' in window && !el._obs) { el._obs = new IntersectionObserver(e => { V.visible = e[0].isIntersecting; }, { threshold: 0.02 }); el._obs.observe(el); }
    return true;
  }
  function ajuster() {
    if (!R || !hote) return;
    const r = hote.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
    R.resize(r.width, r.height, Math.min(window.devicePixelRatio || 1, 1.75));
  }
  const aspect = () => (R.vw || R.W) / (R.vh || R.H);
  const distAccueil = () => (aspect() < 0.8 ? 5.4 : 5.5);

  /* ---------- choisir le héros affiché ---------- */
  function montrer(id) {
    if (!HBY[id]) return;
    V.id = id; V.geste = null; V.gT = 0;
    if (mode === 'fiche') { V.lacet = V.cible.lacet = 0.45; }
    if (pret) modele(id);
  }
  function modele(id) {
    if (!modeles.has(id)) {
      const h = HBY[id]; modeles.set(id, HQ.build(R, HQ.lookOf(h), h.idx + 1));
      // mémoire du téléphone : on ne garde que les 5 derniers héros construits
      if (modeles.size > 5) { const vieux = [...modeles.keys()].find(k => k !== id && k !== V.id); if (vieux) { HQ.dispose(R, modeles.get(vieux)); modeles.delete(vieux); } }
    }
    return modeles.get(id);
  }
  function jouerGeste() { if (!calme) { V.geste = { seq: GESTES[Math.floor(Math.random() * GESTES.length)], t: 0 }; V.dernierGeste = V.t; } }

  /* ---------- commandes : souris, doigt, clavier ---------- */
  function brancherCommandes() {
    const doigts = new Map(); let depart = null, pince = null, bouge = 0;
    cv.addEventListener('pointerdown', e => {
      doigts.set(e.pointerId, { x: e.clientX, y: e.clientY }); bouge = 0;
      if (doigts.size === 1) depart = { x: e.clientX, y: e.clientY, lacet: V.cible.lacet, tangage: V.cible.tangage };
      if (doigts.size === 2) { const [a, b] = [...doigts.values()]; pince = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: V.cible.dist }; }
      try { cv.setPointerCapture(e.pointerId); } catch (x) { /* */ }
    });
    cv.addEventListener('pointermove', e => {
      if (!doigts.has(e.pointerId)) return;
      doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (doigts.size === 2 && pince) { const [a, b] = [...doigts.values()]; zoomer(pince.dist * pince.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), true); bouge = 99; return; }
      if (!depart) return;
      const dx = e.clientX - depart.x, dy = e.clientY - depart.y; bouge = Math.max(bouge, Math.abs(dx) + Math.abs(dy));
      V.cible.lacet = depart.lacet + dx * 0.012; V.auto = false;
      if (mode === 'fiche') V.cible.tangage = Math.max(-0.25, Math.min(0.55, depart.tangage + dy * 0.004));
    });
    const fin = e => {
      if (!doigts.has(e.pointerId)) return;
      doigts.delete(e.pointerId);
      if (doigts.size < 2) pince = null;
      if (!doigts.size) { if (bouge < 6 && e.type === 'pointerup') jouerGeste(); depart = null; setTimeout(() => { if (!calme) V.auto = true; }, 4000); }
    };
    cv.addEventListener('pointerup', fin); cv.addEventListener('pointercancel', fin);
    cv.addEventListener('wheel', e => { if (mode !== 'fiche' && !e.ctrlKey && !V.zoomAccueil) return; e.preventDefault(); zoomer(V.cible.dist * Math.exp(e.deltaY * 0.0012), true); }, { passive: false });
    cv.addEventListener('keydown', e => {
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'ArrowRight') { V.cible.lacet += (k === 'ArrowLeft' ? -0.3 : 0.3); V.auto = false; e.preventDefault(); }
      else if (k === '+' || k === '=') { zoomer(V.cible.dist * 0.85, true); e.preventDefault(); }
      else if (k === '-') { zoomer(V.cible.dist * 1.18, true); e.preventDefault(); }
      else if (k === 'Enter' || k === ' ') { jouerGeste(); e.preventDefault(); }
    });
  }
  function limites() { return mode === 'fiche' ? [1.5, 6] : [3.2, aspect() < 0.8 ? 8 : 7.5]; }
  function zoomer(d, abs) { const [a, b] = limites(); V.cible.dist = Math.max(a, Math.min(b, abs ? d : V.cible.dist * d)); }
  function recentrer() { V.cible.lacet = 0.45; V.cible.tangage = mode === 'fiche' ? 0.12 : 0.06; V.cible.dist = mode === 'fiche' ? 4.1 : distAccueil(); if (!calme) V.auto = true; }

  /* ---------- dessin ---------- */
  let dernier = performance.now();
  function boucle(now) {
    requestAnimationFrame(boucle);
    const dt = Math.min(0.05, (now - dernier) / 1000); dernier = now;
    if (!R || !hote || !hote.isConnected || document.hidden) return;
    if (mode === 'accueil' && !V.visible) return;
    V.t += dt;
    // la caméra glisse doucement vers la position voulue
    if (V.auto) V.cible.lacet += dt * (mode === 'fiche' ? 0.35 : 0.22);
    const k = Math.min(1, dt * 7);
    V.lacet += (V.cible.lacet - V.lacet) * k; V.tangage += (V.cible.tangage - V.tangage) * k; V.dist += (V.cible.dist - V.dist) * k;
    if (mode === 'accueil') dessinerAccueil(dt); else dessinerFiche(dt);
  }
  function poserHeros(ch, dt) {
    let pose = HQ.idlePose(V.t);
    if (!V.geste && !calme && V.t - V.dernierGeste > 6) jouerGeste();
    if (V.geste) {
      const a = V.geste; a.t += dt; const pas = 0.16, i = Math.floor(a.t / pas);
      if (i >= a.seq.length - 1) V.geste = null;
      else pose = CHAR.blend(CHAR.POSES[a.seq[i]], CHAR.POSES[a.seq[i + 1]], Math.min(1, (a.t - i * pas) / pas));
    }
    HQ.setPose(ch, HQ.springPose(ch, pose, dt, V.geste ? 26 : 12), dt);
  }
  function lumiere(el, ciel) {
    const E = EL[el] || EL.prisme, S = ciel || CIEL[el] || CIEL.prisme;
    R.env.sky = S[0].map(v => 0.3 + v * 0.6); R.env.gnd = S[2].map(v => 0.1 + v);
    R.env.L2C = E.rim.map((v, i) => (v * 0.5 + [0.45, 0.68, 1][i] * 0.5) * 0.85);
  }
  function anneau(el, r, n, y) {
    const E = EL[el] || EL.prisme, Q = [];
    for (let i = 0; i < n; i++) { const a = i / n * PI * 2 + V.t * 0.3; Q.push({ p: [Math.cos(a) * r, y || 0.02, Math.sin(a) * r], s: 0.06, c: [...E.fx[1], 0.55] }); }
    if (!calme) for (let i = 0; i < 6; i++) { const t = (V.t * 0.4 + i / 6) % 1, a = i * 2.1; Q.push({ p: [Math.cos(a) * r * 0.75, t * 2.2, Math.sin(a) * r * 0.75], s: 0.04, c: [...E.fx[0], 1 - t] }); }
    return Q;
  }
  function dessinerAccueil(dt) {
    const h = V.id && HBY[V.id], as = aspect();
    // sur grand écran, le héros est décalé à droite pour laisser la place au titre
    const cx = as > 1.15 ? -Math.tan(0.31) * as * V.dist * 0.34 : 0;
    const portrait = as < 0.8;
    R.camera([cx, portrait ? 1.2 : 1.3, V.dist], [cx, portrait ? 0.82 : 1.02, 0], 0.62);
    R.clear(CIEL_NUIT); lumiere(h ? h.el : 'ombre', CIEL.ombre); dessinerDecor(dt);
    if (h && pret) {
      const ch = modele(h.id); poserHeros(ch, dt);
      ch.root.pos = [0, 0, 0]; ch.root.rot = [0, V.lacet, 0];
      R.drawSoft([ch.root], { center: [0, 0.9, 0], radius: 1.3 * (ch.raceS || 1) });
      R.fx(anneau(h.el, 0.95, 40), 'soft');
    }
  }
  function dessinerFiche(dt) {
    const h = V.id && HBY[V.id]; if (!h) return;
    const S = CIEL[h.el] || CIEL.prisme;
    R.clear([S[0], S[1].map(v => v * 0.7), S[2]]); lumiere(h.el);
    if (!pret) return;
    const ch = modele(h.id), s = ch.raceS || 1; poserHeros(ch, dt);
    ch.root.pos = [0, 0, 0]; ch.root.rot = [0, V.lacet, 0];
    // plus on zoome, plus on regarde vers le visage
    const z = Math.max(0, 1 - (V.dist - 1.5) / (6 - 1.5)), ty = (0.86 + z * 0.62) * s, hy = ty + 0.2 * s + V.tangage * V.dist;
    R.camera([0, hy, V.dist * Math.max(0.85, s)], [0, ty, 0], 0.62);
    const Q = anneau(h.el, 0.95, 44); const E = EL[h.el] || EL.prisme;
    Q.push({ quad: [[-1.1, 0.01, -1.1], [1.1, 0.01, -1.1], [-1.1, 0.01, 1.1], [1.1, 0.01, 1.1]], c: [...E.fx[2], 0.22] });
    R.drawSoft([ch.root], { center: [0, 0.9 * s, 0], radius: 1.3 * s }); R.fx(Q, 'soft');
  }

  /* ---------- décor de l'accueil du jeu : nuit sur une planète-désert ---------- */
  const DECOR = { racine: null, flottent: [] };
  function decor() {
    if (DECOR.racine) return DECOR.racine;
    const { ellipsoid: E, lathe, merge, xformGeo, grid, Node, Mesh, M } = G3;
    const at = (g, p, r, s) => xformGeo(g, M.compose(p || [0, 0, 0], r || [0, 0, 0], s || 1));
    const plat = (c, o) => Object.assign({ col: c, unlit: true, noCast: true, twoSide: true, rough: 1, spec: 0, wrap: 0, rim: 0 }, o || {});
    const pierre = (c, rim) => ({ col: c, rough: 0.85, spec: 0.1, wrap: 0.35, rim: rim == null ? 0.8 : rim, rimC: [0.35, 0.85, 1], noCast: true });
    const racine = new Node('decor'); let g = 11; const rnd = () => { g = (g * 16807) % 2147483647; return g / 2147483647; };
    const poser = (nom, geo, mat, pos, rot) => { const n = new Node(nom); n.pos = pos || [0, 0, 0]; if (rot) n.rot = rot; n.meshes.push(new Mesh(geo, mat)); racine.add(n); return n; };
    const bloc = (w, h, d) => at(lathe([[0.01, h], [w * 0.7, h], [w * 0.74, h * 0.5], [w * 0.7, 0], [0.01, 0]], 4, { sub: 1, sz: d / w }), [0, 0, 0], [0, PI / 4, 0]);
    const caillou = (r, k) => E(r, r * (k || 0.7), r * 0.8, 5, 4);
    const V1 = [0.33, 0.20, 0.66], V2 = [0.25, 0.14, 0.52], V3 = [0.17, 0.09, 0.38], V4 = [0.12, 0.06, 0.28];
    poser('halo2', E(9.5, 9.5, 0.04, 48, 32), plat([0.2, 0.75, 1.0], { alpha: 0.16 }), [3.2, 3.0, -31]);
    poser('halo', E(6.4, 6.4, 0.04, 48, 32), plat([0.55, 0.92, 1.0], { alpha: 0.3 }), [3.2, 3.0, -30.6]);
    poser('lune', E(4.6, 4.6, 0.05, 56, 36), plat([0.95, 0.99, 1.0]), [3.2, 3.0, -30.2]);
    const crete = (z, w, h, base, col, k) => {
      const ph = [rnd() * 6, rnd() * 6], f = x => { const u = x / w; return base + h * (0.35 + 0.4 * Math.abs(Math.sin(u * 2.3 * k + ph[0])) + 0.25 * Math.abs(Math.sin(u * 6.1 * k + ph[1]))); };
      poser('crete', grid(36, 1, (a, b) => { const x = (a - 0.5) * 2 * w; return { p: [x, b ? f(x) : -1, 0] }; }), plat(col), [0, 0, z]);
    };
    crete(-28, 44, 2.2, 0.5, [0.30, 0.26, 0.74], 1.0); crete(-20, 32, 1.6, 0.2, V2, 1.5); crete(-13, 24, 1.0, 0.0, V3, 2.1);
    poser('sol', grid(1, 1, (a, b) => ({ p: [(a - 0.5) * 90, -0.02, 8 - b * 40] })), plat(V4));
    poser('arche', merge([at(bloc(1.5, 1.5, 1.2), [0, 0, 0], [0, 0.2, 0.05]), at(bloc(1.25, 1.4, 1.0), [0.1, 1.45, 0], [0, -0.15, -0.06]), at(bloc(1.05, 1.1, 0.9), [0.05, 2.8, 0], [0, 0.3, 0.05]),
      at(bloc(3.6, 0.8, 1.1), [1.5, 3.7, 0], [0, 0.05, -0.16]), at(bloc(0.8, 1.5, 0.7), [3.4, 2.0, 0.1], [0, 0.2, 0.5]), at(bloc(1.3, 0.8, 1.1), [1.9, 0, 0.5], [0, 0.6, 0]), at(bloc(0.9, 0.5, 0.8), [-1.3, 0, 0.6], [0, 0.3, 0])]), pierre(V1), [-6.2, -0.05, -9.5]);
    poser('dalles', merge([at(bloc(2.6, 0.5, 1.6), [0, 0.5, 0], [0, 0.3, 0.42]), at(bloc(2.0, 0.4, 1.3), [1.5, 0.25, 0.4], [0, -0.2, 0.3]), at(bloc(1.2, 0.5, 1.0), [-1.6, 0, 0.6], [0, 0.5, 0.08])]), pierre(V2), [5.4, -0.05, -6.5]);
    [[-3.4, -3.2, 0.5], [3.0, -2.2, 0.38], [-2.2, -6.0, 0.6], [7.5, -11, 1.1], [-9.5, -14, 1.4]].forEach(([x, z, r]) => poser('roche', at(caillou(r, 0.55), [0, r * 0.3, 0], [0, rnd() * 3, 0]), pierre(V2), [x, 0, z]));
    [[-4.2, 5.2, -11, 0.5], [-1.8, 6.6, -14, 0.38], [2.4, 6.0, -12, 0.95], [5.6, 4.4, -10, 0.45], [0.6, 7.6, -16, 0.3], [-6.5, 7.0, -15, 0.42], [4.2, 7.4, -15, 0.26], [-2.6, 4.3, -9, 0.2], [1.5, 4.6, -9.5, 0.16], [7.4, 6.6, -14, 0.34]].forEach(([x, y, z, r], i) => {
      const n = poser('flotte', at(caillou(r, 0.75), [0, 0, 0], [rnd() * 3, rnd() * 3, rnd() * 3]), pierre(i % 3 ? V2 : V1), [x, y, z]); DECOR.flottent.push({ n, y, ph: rnd() * 6, a: 0.12 + r * 0.25, w: 0.35 + rnd() * 0.4 });
    });
    const flaques = [[-2.6, 1.6, 0.55, 0.3], [2.3, 0.9, 0.42, 0.24], [-1.0, -3.6, 0.7, 0.36], [3.6, -4.2, 0.5, 0.26], [-4.6, -1.2, 0.36, 0.2], [0.9, 2.2, 0.3, 0.17], [5.2, -1.0, 0.3, 0.2], [-3.4, 2.4, 0.2, 0.12], [1.8, -6.5, 0.6, 0.3], [-5.5, -5.6, 0.45, 0.22]];
    poser('flaque-halo', merge(flaques.map(([x, z, a, b]) => at(E(a * 1.9, 0.004, b * 1.9, 18, 3), [x, 0.004, z]))), plat([1.0, 0.55, 0.1], { alpha: 0.22 }));
    poser('flaque', merge(flaques.map(([x, z, a, b]) => at(E(a, 0.004, b, 18, 3), [x, 0.012, z]))), plat([1.0, 0.72, 0.12]));
    poser('flaque-reflet', merge(flaques.map(([x, z, a, b]) => at(E(a * 0.6, 0.004, b * 0.55, 14, 3), [x + a * 0.08, 0.018, z]))), plat([1.0, 0.93, 0.35]));
    poser('socle', lathe([[0.01, 0.0], [2.05, 0.0], [2.2, -0.08], [2.24, -0.3], [0.01, -0.3]], 7, { sub: 1 }), pierre(V1, 0.2), [0, -0.012, -0.2], [0, 0.2, 0]);
    DECOR.racine = racine; return racine;
  }
  const ETOILES = (() => { const L = []; let s = 99; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; for (let i = 0; i < 80; i++) L.push([(r() - 0.5) * 64, 8 + r() * 16, -34, 0.05 + r() * 0.09, r() * 6]); return L; })();
  function dessinerDecor() {
    const racine = decor(), t = calme ? 0 : V.t;
    DECOR.flottent.forEach(f => { f.n.pos[1] = f.y + Math.sin(t * f.w + f.ph) * f.a; });
    R.draw([racine]);
    const Q = ETOILES.map(([x, y, z, sz, ph]) => ({ p: [x, y, z], s: sz * 2.2, c: [0.85, 0.95, 1, 0.3 + 0.5 * Math.abs(Math.sin(t * 0.7 + ph))] }));
    if (!calme) for (let i = 0; i < 10; i++) { const u = (t * 0.05 + i / 10) % 1, a = i * 2.4; Q.push({ p: [Math.cos(a) * (3 + i % 4), u * 5, -3 - (i % 5) * 1.6], s: 0.07, c: [1, 0.8, 0.3, (1 - u) * 0.7] }); }
    R.fx(Q, 'soft');
  }

  /* ---------- portrait d'un héros (image) : sert aux vignettes ----------
     fond : couleur unie [r, g, b] (0 à 1), ou null pour le ciel de l'élément. Renvoie une image PNG (data URL). */
  function portrait(id, w, h, fond) {
    if (!R || !pret || !HBY[id]) return null;
    const garde = R.cv.width < w * R.dpr || R.cv.height < h * R.dpr;
    const ancien = [R.W, R.H, R.dpr];
    if (garde) R.resize(Math.max(w, R.W), Math.max(h, R.H), 1);
    const H = HBY[id], ch = modele(id), s = ch.raceS || 1;
    HQ.setPose(ch, CHAR.POSES.idle); ch.root.pos = [0, 0, 0]; ch.root.rot = [0, 0.42, 0];
    R.view2(0, 0, w, h);
    R.camera([0.2 * s, 1.05 * s, 3.8 * s], [0, 0.88 * s, 0], 0.62);
    const S = CIEL[H.el] || CIEL.prisme;
    R.clear(fond ? [fond, fond, fond] : [S[0], S[1].map(v => v * 0.7), S[2]]); lumiere(H.el);
    R.drawSoft([ch.root], { center: [0, 0.9 * s, 0], radius: 1.3 * s });
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(R.cv, 0, 0, Math.round(w * R.dpr), Math.round(h * R.dpr), 0, 0, w, h);
    R.full(); if (garde) R.resize(ancien[0], ancien[1], ancien[2]);
    return c.toDataURL('image/png');
  }

  return {
    init, monter, montrer, portrait, zoomer: f => zoomer(f), recentrer, jouerGeste,
    get pret() { return pret; }, get echec() { return echec; }, get id() { return V.id; }, get mode() { return mode; },
    progression, quandPret: f => { if (pret) f(); else ecouteurs.change.push(f); },
    set auto(v) { V.auto = !!v && !calme; }, get auto() { return V.auto; },
    chargement: () => chargement
  };
})();
