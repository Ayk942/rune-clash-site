/* ============================================================================
   Rune Clash — outil de construction du site
   ----------------------------------------------------------------------------
   Rôle : prendre le code 3D et les données du JEU et en faire le fichier
   js/moteur-3d.js du site. Comme ça, le site montre exactement les mêmes
   personnages que le jeu, et un héros ajouté dans le jeu apparaît aussi ici.

   Utilisation (depuis le dossier du site) :
       node outils/construire.js  [chemin du code du jeu, par défaut ../v3]

   Ne modifie pas js/moteur-3d.js à la main : il est réécrit à chaque fois.
   ============================================================================ */
const fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..');
const JEU = path.resolve(process.argv[2] || path.join(SITE, '..', 'v3'));
const lire = f => fs.readFileSync(path.join(JEU, f), 'utf8');

// Fichiers du jeu nécessaires pour afficher un héros en 3D (dans cet ordre)
const FICHIERS = [
  'engine.js',    // moteur WebGL (G3)
  'soft.js',      // ombres douces
  'head.js',      // têtes de secours
  'chars.js',     // squelette et poses d'animation
  'heroes.js',    // les 52 premiers héros
  'heroes16.js',  // les 47 héros de la v16
  'data3.js',     // éléments, raretés, rôles, statistiques, techniques
  'hq2.js',       // construction des personnages
  'vrm.js',       // corps 3D VRoid (modèles dans models/)
  'race15.js',    // espèces : pièces de base
  'design16.js'   // espèces : les 99 fiches
];

let js = FICHIERS.map(f => {
  let s = lire(f);
  if (f === 'vrm.js') {
    // Le site n'utilise que deux corps (tous les héros ont une espèce) : on ne charge pas le 3e (1,3 Mo de moins)
    s = s.replace("NAMES = ['male', 'female', 'avf']", "NAMES = ['male', 'female']")
         .replace("(hashId(look.id) % 4 === 0) ? 'avf' : 'female'", "'female'");
  }
  return `\n/* ---------- ${f} (jeu) ---------- */\n` + s + '\n;\n';
}).join('');

// Version du jeu (lue dans online.js) : affichée en bas du site
const ver = (lire('online.js').match(/GAME_VER\s*=\s*'([^']+)'/) || [])[1] || '';
js += `\nconst VERSION_JEU = '${ver}';\n`;

const entete = `/* Rune Clash — moteur 3D du site. FICHIER GÉNÉRÉ par outils/construire.js le ${new Date().toISOString().slice(0, 10)}.
   Ne pas modifier à la main : modifier le jeu puis relancer « node outils/construire.js ». */\n`;
fs.writeFileSync(path.join(SITE, 'js', 'moteur-3d.js'), entete + js);

// Copie des deux corps 3D et de leurs textures
const SRC_M = path.join(JEU, '..', 'dist', 'pwa', 'models'), DST_M = path.join(SITE, 'models');
if (fs.existsSync(SRC_M)) {
  fs.mkdirSync(DST_M, { recursive: true });
  let n = 0;
  fs.readdirSync(SRC_M).filter(f => /^(male|female)[._]/.test(f)).forEach(f => { fs.copyFileSync(path.join(SRC_M, f), path.join(DST_M, f)); n++; });
  console.log('modèles copiés :', n);
}
console.log('ok : js/moteur-3d.js', (js.length / 1024).toFixed(0) + ' Ko');
