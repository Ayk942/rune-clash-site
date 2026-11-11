/* =============================================================================
   RUNE CLASH — FONCTIONNEMENT DU SITE
   -----------------------------------------------------------------------------
   Remplit les rubriques avec CONFIG (js/config.js) et CONTENU (js/contenu.js),
   affiche les héros du jeu (HEROES, RACES… viennent de js/moteur-3d.js),
   et pilote la scène 3D (js/scene-3d.js).
   Sommaire : 1. outils · 2. textes et liens · 3. barre du haut · 4. accueil 3D
              5. les héros · 6. fiche d'un héros · 7. installer · 8. démarrage
   ============================================================================= */
(function () {
  'use strict';

  /* ---------- 1. outils ---------- */
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sansAccent = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const nf = n => Math.round(n).toLocaleString('fr-FR');
  const JEU_OK = typeof HEROES !== 'undefined' && typeof EL !== 'undefined';

  // Les runes des six éléments (mêmes tracés que dans le jeu)
  const TRACES = {
    feu: [[0.5, 0.08], [0.2, 0.92], [0.8, 0.38], [0.2, 0.38], [0.8, 0.92]], eau: [[0.12, 0.3], [0.38, 0.12], [0.62, 0.3], [0.88, 0.12], [0.5, 0.9]],
    foudre: [[0.62, 0.06], [0.28, 0.5], [0.66, 0.5], [0.34, 0.94]], terre: [[0.15, 0.85], [0.15, 0.2], [0.5, 0.5], [0.85, 0.2], [0.85, 0.85]],
    ombre: [[0.8, 0.15], [0.3, 0.2], [0.18, 0.62], [0.55, 0.88], [0.82, 0.55]], prisme: [[0.5, 0.08], [0.88, 0.62], [0.12, 0.62], [0.5, 0.08], [0.5, 0.92]]
  };
  const COUL = { feu: '#ff6a3d', eau: '#4aa8ff', foudre: '#f2c94c', terre: '#5cc98a', ombre: '#a77bff', prisme: '#ff8ad8' };
  const couleur = el => (JEU_OK && EL[el] ? EL[el].c : COUL[el]) || '#9c7dff';
  function rune(el, c) {
    const S = TRACES[el] || TRACES.prisme, d = S.map(([x, y], i) => (i ? 'L' : 'M') + (x * 48 + 8).toFixed(1) + ' ' + (y * 48 + 8).toFixed(1)).join(' ');
    c = c || couleur(el);
    return `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="none" stroke="${c}" stroke-width="2" opacity=".45"/><path d="${d}" fill="none" stroke="${c}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  const nomEl = el => (JEU_OK && EL[el] ? EL[el].nom : el);

  /* ---------- 2. textes et liens ---------- */
  function remplirTextes() {
    $$('[data-texte]').forEach(e => { const v = CONTENU[e.dataset.texte]; if (v) e.textContent = v; });
    $$('[data-rune]').forEach(e => { e.innerHTML = rune(e.dataset.rune, e.closest('.marque') ? 'currentColor' : null); });
    $('#chiffres').innerHTML = CONTENU.chiffres.map(c => `<li><b>${esc(c.n)}</b><span>${esc(c.t)}</span></li>`).join('');
    $('#lore-titre').textContent = CONTENU.lore.titre;
    $('#lore').innerHTML = CONTENU.lore.paragraphes.map(p => `<p>${esc(p)}</p>`).join('');
    $('#regions').innerHTML = CONTENU.regions.map(r => `<li class="${r.el === 'prisme' ? 'cachee' : ''}"><span class="rune">${rune(r.el)}</span><div><b>${esc(r.nom)}</b><span>${esc(r.txt)}</span></div></li>`).join('');
    $('#combat-liste').innerHTML = CONTENU.combat.map(c => `<li><b>${esc(c.t)}</b><p>${esc(c.d)}</p></li>`).join('');
    $('#elements').innerHTML = CONTENU.elements.map(e => `<li style="--ec:${couleur(e.el)}"><span class="rune">${rune(e.el)}</span><b>${esc(nomEl(e.el))}</b><em>${esc(e.effet)}</em><span>${esc(e.d)}</span></li>`).join('');
    $('#modes').innerHTML = CONTENU.modes.map(m => `<li><b>${esc(m.t)}</b><span>${esc(m.d)}</span></li>`).join('');
    $('#progression').textContent = CONTENU.progression;
    // fondateur
    const F = CONFIG.fondateur;
    $('#citation').textContent = F.citation;
    $('#signature').innerHTML = F.nom ? `<b>${esc(F.nom)}</b> · ${esc(F.role)}` : esc(F.role);
    $('#fondateur-texte').innerHTML = F.texte.map(p => `<p>${esc(p)}</p>`).join('');
    $('#etapes').innerHTML = CONTENU.etapes.map(e => `<li><small>${esc(e.v)}</small><b>${esc(e.t)}</b><span>${esc(e.d)}</span></li>`).join('');
    // mises à jour : la plus récente est ouverte
    $('#journal').innerHTML = CONTENU.majs.map((m, i) => `<details class="version"${i === 0 ? ' open' : ''}><summary><b>${esc(m.v)}</b><span>${esc(m.titre)}</span><small>${esc(m.date)}</small></summary><ul>${m.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul></details>`).join('');
    // communauté : seulement les réseaux qui ont un lien
    const R = (CONFIG.communaute || []).filter(r => r.url);
    $('#reseaux').innerHTML = R.length ? R.map(r => `<li><a href="${esc(r.url)}" rel="noopener"><span><b>${esc(r.nom)}</b><small>${esc(r.detail || '')}</small></span></a></li>`).join('')
      : '<li class="bientot">Les réseaux officiels arrivent bientôt.</li>';
    $('#contact').innerHTML = CONFIG.contact ? `Contact : <a href="mailto:${esc(CONFIG.contact)}">${esc(CONFIG.contact)}</a>` : '';
    $('#annee').textContent = new Date().getFullYear();
    $('#version-jeu').textContent = typeof VERSION_JEU !== 'undefined' ? 'v' + VERSION_JEU : '';
  }
  function remplirLiens() {
    const J = CONFIG.jouer, T = CONFIG.telecharger;
    $$('[data-lien="jouer"]').forEach(a => { a.href = J.url; });
    $$('[data-texte-lien="jouer"]').forEach(s => { s.textContent = J.texte; });
    $$('[data-lien="telecharger"]').forEach(a => { a.href = T.url || '#installer'; if (!T.url) a.addEventListener('click', e => { e.preventDefault(); ouvrirInstaller(); }); });
    $$('[data-texte-lien="telecharger"]').forEach(s => { s.textContent = T.texte; });
  }

  /* ---------- 3. barre du haut ---------- */
  function barre() {
    const b = $('#barre'), menu = $('#menu'), burger = $('#burger');
    const maj = () => b.classList.toggle('pleine', scrollY > 30 || menu.classList.contains('ouvert'));
    addEventListener('scroll', maj, { passive: true }); maj();
    burger.addEventListener('click', () => { const o = !menu.classList.contains('ouvert'); menu.classList.toggle('ouvert', o); burger.setAttribute('aria-expanded', o); maj(); });
    menu.addEventListener('click', e => { if (e.target.closest('a')) { menu.classList.remove('ouvert'); burger.setAttribute('aria-expanded', 'false'); maj(); } });
    // rubrique en cours soulignée
    const liens = $$('#menu a'), obs = new IntersectionObserver(E => E.forEach(x => { if (x.isIntersecting) liens.forEach(a => a.classList.toggle('ici', a.getAttribute('href') === '#' + x.target.id)); }), { rootMargin: '-45% 0px -50% 0px' });
    ['univers', 'combat', 'heros', 'fondateur', 'mises-a-jour'].forEach(id => obs.observe(document.getElementById(id)));
  }

  /* ---------- 4. accueil : la scène 3D ---------- */
  const VED = { liste: [], i: 0 };
  function accueil3D() {
    const hote = $('#scene-accueil');
    VED.liste = (CONFIG.herosVedette || []).filter(id => JEU_OK && HBY[id]);
    if (!VED.liste.length && JEU_OK) VED.liste = [HEROES[0].id];
    if (!JEU_OK || !Scene3D.monter(hote, 'accueil')) { secoursAccueil(); return; }
    afficherVedette();
    // progression du chargement des corps 3D
    const txt = $('#charge-txt'), charge = $('#charge-accueil');
    const suivre = () => { if (Scene3D.pret) { charge.classList.add('fini'); return; } if (Scene3D.echec) { secoursAccueil(); return; } txt.textContent = `Les héros arrivent… ${Math.round(Scene3D.progression() * 100)} %`; setTimeout(suivre, 200); };
    suivre();
    Scene3D.quandPret(() => { if (Scene3D.echec) secoursAccueil(); else Scene3D.montrer(VED.liste[VED.i]); demarrerPortraits(); });
    $('#ved-prec').addEventListener('click', () => changerVedette(-1));
    $('#ved-suiv').addEventListener('click', () => changerVedette(1));
    $('#ved-info').addEventListener('click', e => { e.preventDefault(); location.hash = 'heros-' + VED.liste[VED.i]; });
    $$('#outils-accueil [data-zoom]').forEach(b => b.addEventListener('click', () => Scene3D.zoomer(+b.dataset.zoom > 0 ? 1.18 : 0.85)));
  }
  function afficherVedette() {
    const h = HBY[VED.liste[VED.i]]; if (!h) return;
    $('#ved-nom').textContent = h.name;
    $('#ved-espece').textContent = (RACES[h.id] ? RACES[h.id].nom + ' · ' : '') + nomEl(h.el);
    $('#ved-rune').innerHTML = rune(h.el);
    $('#ved-info').setAttribute('aria-label', `Voir la fiche de ${h.name}`);
    if (Scene3D.mode === 'accueil') Scene3D.montrer(h.id);
  }
  function changerVedette(d) { VED.i = (VED.i + d + VED.liste.length) % VED.liste.length; afficherVedette(); }
  function secoursAccueil() {
    const img = $('.scene-secours'); img.hidden = false; $('#charge-accueil').classList.add('fini');
    $('#outils-accueil').hidden = true; $('#ved-prec').hidden = true; $('#ved-suiv').hidden = true;
  }

  /* ---------- 5. les héros ---------- */
  const ARMES = { katana: 'Katana', lance: 'Lance', staff: 'Bâton' };
  const ROLES = ['att', 'def', 'soin', 'sab'];
  const ORDRE_EL = ['feu', 'eau', 'foudre', 'terre', 'ombre', 'prisme'];
  let LISTE = [], VUE = [], toutVoir = false;
  const filtre = { el: null, role: null, r: null, q: '', tri: 'rarete' };
  const PAR_PAGE = () => (innerWidth < 760 ? 12 : 24);   // sans filtre, on montre d'abord ce nombre de héros

  function preparerHeros() {
    const TECH = { t1: 1, t2: 1, t3: 1, t4: 1, ult: 1 };
    LISTE = HEROES.map(h => {
      const s = statsOf(h, { lvl: 1, stars: RAR[h.r].stars }, []);
      return { h, s, puissance: powerOf(s, TECH), espece: RACES[h.id] ? RACES[h.id].nom : '', cle: sansAccent([h.name, h.title, RACES[h.id] ? RACES[h.id].nom : '', h.id].join(' ')) };
    });
    // maximum de chaque statistique (pour la longueur des barres)
    LISTE.max = {}; STAT_DEFS.concat([{ k: 'puissance' }]).forEach(d => { LISTE.max[d.k] = Math.max(...LISTE.map(x => d.k === 'puissance' ? x.puissance : x.s[d.k])); });
    $('#nb-heros').textContent = LISTE.length;
  }
  function puces() {
    const n = k => LISTE.filter(k).length;
    const p = (grp, v, txt, c, extra) => `<button class="puce" data-f="${grp}" data-v="${v == null ? '' : v}" aria-pressed="${filtre[grp] === v}" style="--ec:${c || 'var(--ame)'}">${extra || ''}${esc(txt)}${grp === 'el' && v ? ` <small>${n(x => x.h.el === v)}</small>` : ''}</button>`;
    $('#f-element').innerHTML = p('el', null, 'Tous') + ORDRE_EL.map(e => p('el', e, nomEl(e), couleur(e), `<span class="rune">${rune(e)}</span>`)).join('');
    $('#f-role').innerHTML = p('role', null, 'Tous les rôles') + ROLES.map(r => p('role', r, ROLE[r].nom)).join('');
    $('#f-rarete').innerHTML = p('r', null, 'Toutes raretés') + RAR.map((R, i) => p('r', i, R.nom, R.c)).reverse().join('');
  }
  function appliquer() {
    const q = sansAccent(filtre.q.trim());
    VUE = LISTE.filter(x => (!filtre.el || x.h.el === filtre.el) && (!filtre.role || x.h.role === filtre.role) && (filtre.r == null || x.h.r === filtre.r) && (!q || x.cle.includes(q)));
    const t = filtre.tri, byNom = (a, b) => a.h.name.localeCompare(b.h.name, 'fr');
    VUE.sort(t === 'nom' ? byNom : t === 'puissance' ? (a, b) => b.puissance - a.puissance || byNom(a, b)
      : t === 'element' ? (a, b) => ORDRE_EL.indexOf(a.h.el) - ORDRE_EL.indexOf(b.h.el) || b.h.r - a.h.r || byNom(a, b) : (a, b) => b.h.r - a.h.r || byNom(a, b));
    const filtrage = filtre.el || filtre.role || filtre.r != null || q, montres = toutVoir || filtrage ? VUE : VUE.slice(0, PAR_PAGE());
    $('#grille').innerHTML = VUE.length ? montres.map(carte).join('') : '<li class="vide">Aucun héros ne correspond. Essaie un autre nom ou retire un filtre.</li>';
    const reste = VUE.length - montres.length, plus = $('#voir-tout');
    plus.hidden = reste <= 0; plus.textContent = `Voir les ${reste} autres héros`;
    $('#compte').textContent = VUE.length === LISTE.length ? `${LISTE.length} héros` : `${VUE.length} héros sur ${LISTE.length}`;
    $$('#grille img').forEach(img => img.addEventListener('error', () => portraitManquant(img), { once: true }));
    $$('#filtres .puce').forEach(b => { const g = b.dataset.f, v = b.dataset.v; b.setAttribute('aria-pressed', String(String(filtre[g] == null ? '' : filtre[g]) === v)); });
  }
  function carte(x) {
    const h = x.h, R = RAR[h.r];
    return `<li><button class="carte" data-heros="${h.id}" style="--ec:${couleur(h.el)};--rc:${R.c}" aria-label="${esc(h.name)}, ${esc(x.espece)}, ${esc(R.nom)}, ${esc(nomEl(h.el))}">
      <span class="carte-rune">${rune(h.el)}</span><span class="carte-rar" aria-hidden="true">${'<i></i>'.repeat(R.stars)}</span>
      <span class="carte-img"><img src="${PORTRAITS.get(h.id) || 'img/heros/' + h.id + '.webp'}" alt="" loading="lazy" decoding="async" data-id="${h.id}" width="300" height="400"></span>
      <span class="carte-txt"><b>${esc(h.name)}</b><span>${esc(x.espece || h.title)}</span></span></button></li>`;
  }
  function filtres() {
    $('#filtres').addEventListener('click', e => {
      const b = e.target.closest('.puce'); if (!b) return;
      const g = b.dataset.f, v = b.dataset.v; filtre[g] = v === '' ? null : g === 'r' ? +v : v; appliquer();
    });
    let t = 0; $('#cherche').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { filtre.q = e.target.value; appliquer(); }, 120); });
    $('#f-tri').addEventListener('change', e => { filtre.tri = e.target.value; appliquer(); });
    $('#voir-tout').addEventListener('click', () => { toutVoir = true; const n = $$('#grille .carte').length; appliquer(); const c = $$('#grille .carte')[n]; if (c) c.focus(); });
    $('#grille').addEventListener('click', e => { const c = e.target.closest('[data-heros]'); if (c) location.hash = 'heros-' + c.dataset.heros; });
  }

  // Portraits : les images sont dans img/heros/. S'il en manque une (héros ajouté depuis), le site la dessine lui-même.
  const PORTRAITS = new Map(), A_FAIRE = [];
  let portraitsLances = false;
  function portraitManquant(img) {
    const id = img.dataset.id; img.removeAttribute('src'); img.closest('.carte-img').insertAdjacentHTML('beforeend', `<span class="rune-vide">${rune(HBY[id].el)}</span>`);
    if (!A_FAIRE.includes(id)) A_FAIRE.push(id); demarrerPortraits();
  }
  function demarrerPortraits() {
    if (portraitsLances || !Scene3D.pret || !A_FAIRE.length) return; portraitsLances = true;
    const suivant = () => {
      const id = A_FAIRE.shift(); if (!id) { portraitsLances = false; return; }
      const url = Scene3D.portrait(id, 300, 400, null);
      if (url) { PORTRAITS.set(id, url); $$(`img[data-id="${id}"]`).forEach(im => { im.src = url; const v = im.parentNode.querySelector('.rune-vide'); if (v) v.remove(); }); }
      setTimeout(suivant, 60);
    };
    suivant();
  }

  /* ---------- 6. fiche d'un héros ---------- */
  const fiche = $('#fiche');
  let ficheId = null;
  function ouvrirFiche(id) {
    const x = LISTE.find(y => y.h.id === id); if (!x) return;
    ficheId = id; const h = x.h, R = RAR[h.r], E = EL[h.el];
    fiche.style.setProperty('--ec', E.c);
    const stat = (nom, v, max, txt, cls) => `<div class="stat ${cls || ''}"><span>${esc(nom)}</span><i style="--w:${Math.round(v / max * 100)}%"></i><b>${txt}</b></div>`;
    const techs = h.techs.map(t => { const K = KINDS[t.kind] || {}; return `<li><b>${esc(t.nom)}</b><em>${esc(K.nom || t.kind)}${t.lvl ? ' · niveau ' + t.lvl : ''}</em><p>${esc(K.d || '')}${K.cost ? ` · ${K.cost} ki` : ''}</p></li>`; }).join('');
    const U = ULTK[h.ult.kind] || {};
    $('#fiche-info').innerHTML = `
      <div class="fiche-tete">
        <div class="fiche-meta"><span class="rune">${rune(h.el)}</span>${esc(E.nom)} · ${esc(ROLE[h.role].nom)}
          <span class="tag" style="border-color:${R.c};color:${R.c}">${esc(R.nom)}</span>${x.espece ? `<span class="tag">${esc(x.espece)}</span>` : ''}</div>
        <h2 id="fiche-nom">${esc(h.name)}</h2>
        <p class="fiche-titre">${esc(h.title)} · ${esc(ARMES[h.weapon] || 'Arts martiaux')}</p>
      </div>
      <h3>Statistiques</h3>
      <div class="stats">
        ${stat('Puissance', x.puissance, LISTE.max.puissance, nf(x.puissance), 'stat-puissance')}
        ${STAT_DEFS.map(d => stat(d.nom, x.s[d.k], LISTE.max[d.k], d.pct ? x.s[d.k] + ' %' : nf(x.s[d.k]))).join('')}
      </div>
      <p class="note">Au niveau 1, sans équipement. Elles montent avec les niveaux, les étoiles d'éveil et l'équipement.</p>
      <h3>Techniques</h3>
      <ul class="techs">${techs}<li class="ultime"><b>${esc(h.ult.nom)}</b><em>Ultime</em><p>${esc(U.d || '')}</p></li></ul>
      <p class="note">Effet de l'élément ${esc(E.nom)} : ${esc(STATUS[E.status] || '')}.</p>
      <h3>Son histoire</h3>
      <div class="recit"><p>${esc(h.quest)}</p><details><summary>Comment son histoire se termine</summary><p>${esc(h.end)}</p></details></div>`;
    $('#fiche-info').scrollTop = 0;
    if (!fiche.open) { fiche.showModal(); }
    // la 3D passe dans la fiche
    const img = $('#fiche-img'), charge = $('#charge-fiche');
    if (Scene3D.monter($('#scene-fiche'), 'fiche') && !Scene3D.echec) {
      img.hidden = true; Scene3D.montrer(id);
      charge.classList.toggle('fini', Scene3D.pret); Scene3D.quandPret(() => { charge.classList.add('fini'); if (Scene3D.mode === 'fiche') Scene3D.montrer(ficheId); });
    } else { charge.classList.add('fini'); img.hidden = false; img.src = PORTRAITS.get(id) || 'img/heros/' + id + '.webp'; img.alt = h.name; $('#scene-fiche .scene-outils').hidden = true; }
  }
  function fermerFiche() { if (fiche.open) fiche.close(); }
  fiche.addEventListener('close', () => {
    ficheId = null;
    if (/^#heros-/.test(location.hash)) history.replaceState(null, '', '#heros');
    if (JEU_OK && Scene3D.monter($('#scene-accueil'), 'accueil')) Scene3D.montrer(VED.liste[VED.i]);
  });
  function voisin(d) {
    const L = VUE.length && VUE.some(x => x.h.id === ficheId) ? VUE : LISTE, i = L.findIndex(x => x.h.id === ficheId);
    location.hash = 'heros-' + L[(i + d + L.length) % L.length].h.id;
  }
  $('#fiche-prec').addEventListener('click', () => voisin(-1));
  $('#fiche-suiv').addEventListener('click', () => voisin(1));
  $('#fiche-fermer').addEventListener('click', fermerFiche);
  fiche.addEventListener('click', e => { if (e.target === fiche) fermerFiche(); });   // clic à côté de la fiche
  fiche.addEventListener('keydown', e => { if (e.target.tagName === 'CANVAS' || e.target.tagName === 'SUMMARY') return; if (e.key === 'ArrowLeft') voisin(-1); if (e.key === 'ArrowRight') voisin(1); });
  $$('#scene-fiche [data-zoom]').forEach(b => b.addEventListener('click', () => Scene3D.zoomer(+b.dataset.zoom > 0 ? 1.18 : 0.85)));
  $('#scene-fiche [data-recentrer]').addEventListener('click', () => Scene3D.recentrer());

  // adresse « #heros-akio » : ouvre directement la fiche (pratique pour partager un héros)
  function route() {
    const m = /^#heros-([a-z0-9]+)$/.exec(location.hash);
    if (m && JEU_OK && HBY[m[1]]) ouvrirFiche(m[1]); else if (fiche.open) fermerFiche();
  }

  /* ---------- 7. installer ---------- */
  const inst = $('#installer');
  function ouvrirInstaller() { if (!inst.open) inst.showModal(); }
  $('#inst-fermer').addEventListener('click', () => inst.close());
  inst.addEventListener('click', e => { if (e.target === inst) inst.close(); });

  /* ---------- 8. démarrage ---------- */
  remplirTextes(); remplirLiens(); barre();
  if (JEU_OK) {
    preparerHeros(); puces(); filtres(); appliquer(); accueil3D();
    addEventListener('hashchange', route); route();
  } else {
    $('#grille').innerHTML = '<li class="vide">Les héros n\'ont pas pu être chargés. Recharge la page.</li>'; secoursAccueil();
  }
  if (navigator.webdriver) window.__site = { ouvrirFiche, LISTE: () => LISTE, VUE: () => VUE, filtre, appliquer, Scene3D };
})();
