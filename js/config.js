/* =============================================================================
   RUNE CLASH — RÉGLAGES DU SITE
   -----------------------------------------------------------------------------
   C'est LE fichier à modifier en premier. Tout le reste du site lit ces valeurs.
   Règles simples :
     - garde les guillemets '...' autour du texte ;
     - une virgule à la fin de chaque ligne d'une liste ;
     - un lien vide '' = le bouton ou la ligne est caché automatiquement.
   ============================================================================= */
const CONFIG = {

  /* --- Bouton principal « Jouer » (en haut, au centre et en bas de la page) --- */
  jouer: {
    url: 'https://ayk942.github.io/rune-clash/',   // adresse du jeu (vérifie-la après chaque déménagement du jeu)
    texte: 'Jouer maintenant'
  },

  /* --- Bouton secondaire ---
     Si « url » est rempli (lien vers un fichier ou un magasin d'applis), le bouton y mène directement.
     Si « url » est vide, le bouton ouvre le guide « Installer l'appli » (le jeu s'installe depuis le navigateur). */
  telecharger: {
    url: '',
    texte: "Installer l'appli"
  },

  /* --- Les héros mis en avant dans la scène 3D d'accueil (identifiants du jeu, dans l'ordre) --- */
  herosVedette: ['lumen', 'akio', 'seika', 'erebos', 'kiri', 'sphinx', 'mimi', 'ryujin'],

  /* --- Fondateur ---
     nom : ton prénom ou ton pseudo (laisse '' pour ne pas l'afficher).
     Le texte est une liste de paragraphes : ajoute, retire ou réécris librement. */
  fondateur: {
    nom: '',
    role: 'Fondateur de Rune Clash',
    citation: "Je voulais un jeu de combat où l'on gagne parce qu'on joue bien, jamais parce qu'on a payé.",
    texte: [
      "Rune Clash a commencé avec une envie simple : créer le jeu de combat anime que j'aurais voulu trouver sur mon téléphone. Des héros originaux, des combats en temps réel, et rien à acheter pour gagner.",
      "Je suis un jeune entrepreneur. Pas de studio, pas de budget de départ : une idée, et l'envie d'aller au bout. Le jeu s'est construit version après version, en gardant ce qui marchait et en refaisant ce qui ne marchait pas.",
      "Je décide de l'univers, des 99 personnages, de l'équilibre des combats et de ce qui entre dans le jeu. Une règle ne bougera pas : tout s'obtient en jouant, et il n'y a aucun achat en argent réel.",
      "Le projet ne fait que commencer. Si tu joues, dis-moi ce que tu en penses : c'est comme ça que Rune Clash avance."
    ]
  },

  /* --- Communauté ---
     Ajoute une ligne par réseau. Les lignes avec un lien vide ne s'affichent pas.
     Exemple : { nom: 'YouTube', detail: 'Bandes-annonces et astuces', url: 'https://www.youtube.com/@...' }, */
  communaute: [
    { nom: 'YouTube', detail: 'Bandes-annonces et astuces', url: '' },
    { nom: 'TikTok', detail: 'Les meilleurs combats', url: '' },
    { nom: 'Instagram', detail: 'Coulisses et nouveaux héros', url: '' },
    { nom: 'Discord', detail: 'Discuter avec les joueurs', url: '' }
  ],

  /* --- Contact (adresse e-mail affichée en bas de page ; '' pour la cacher) --- */
  contact: ''
};
