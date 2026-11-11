/* =============================================================================
   RUNE CLASH — TEXTES DU SITE
   -----------------------------------------------------------------------------
   Tous les textes des rubriques Univers, Combat, Modes, Fondateur (étapes) et
   Mises à jour. Modifie-les ici, le site se met à jour tout seul.
   Les PERSONNAGES, eux, viennent directement du jeu (js/moteur-3d.js) :
   pour en ajouter, on les ajoute au jeu puis on relance « node outils/construire.js ».
   ============================================================================= */
const CONTENU = {

  /* ---------- Accueil ---------- */
  accroche: 'Jeu de combat 3D · gratuit',
  intro: "Le Prisme s'est brisé. Dans les cinq terres, 99 héros ont perdu la mémoire. Ta rune vient de se réveiller.",
  supports: 'Navigateur, téléphone ou PC · rien à installer pour commencer · aucun achat en argent réel',
  chiffres: [
    { n: '99', t: 'héros, tous différents' },
    { n: '6', t: 'éléments' },
    { n: '5 + 1', t: 'régions, dont une cachée' },
    { n: '12', t: 'modes de jeu' }
  ],

  /* ---------- Univers ---------- */
  lore: {
    titre: 'Dix ans après la chute du Prisme',
    paragraphes: [
      "Le Prisme protégeait les cinq terres. Il y a dix ans, il s'est brisé, et personne ne sait vraiment pourquoi.",
      "Depuis, des failles s'ouvrent dans le ciel et dans le sol. Les héros qu'elles touchent oublient qui ils sont et attaquent tous ceux qui approchent.",
      "Ta rune t'a choisi. Avec Maître Ilyas, ton mentor, tu traverses les cinq terres pour affronter ces héros, les ramener à eux, et comprendre ce qui dort au cœur du Prisme."
    ]
  },
  regions: [
    { el: 'feu', nom: 'Le Volcan de Kurogane', txt: "Terres brûlées où les forges ne s'éteignent jamais. Guide : Hiba, gardienne des braises." },
    { el: 'eau', nom: 'La Mer de verre', txt: "Un océan si calme qu'on y voit le ciel en double. Guide : Capitaine Nalu." },
    { el: 'foudre', nom: "Les Pics d'orage", txt: "Des sommets où l'orage gronde jour et nuit. Guide : Sorei, l'ermite." },
    { el: 'terre', nom: "L'Arbre-mère", txt: 'Une forêt dont les racines tiennent le monde. Guide : Grand-mère Moka.' },
    { el: 'ombre', nom: 'La Lune brisée', txt: "Une nuit qui ne finit jamais. On y croise le Veilleur, qui en sait plus qu'il ne le dit." },
    { el: 'prisme', nom: 'Le Cœur du Prisme', txt: 'La région cachée. Elle ne s\'ouvre qu\'à ceux qui ont réuni les cinq sceaux anciens.' }
  ],

  /* ---------- Combat ---------- */
  combat: [
    { t: 'Bouge et frappe', d: "Joystick d'un pouce, attaque de l'autre. Appuie plusieurs fois : trois coups enchaînés. Tout se joue en temps réel." },
    { t: 'Le Spécial', d: "Chaque héros a quatre techniques (la quatrième se débloque au niveau 5) : charge, rayon, salve, téléportation, piège, soin… Tu choisis celle qui va sur ton bouton." },
    { t: 'La garde parfaite', d: 'Maintiens la garde pour bloquer. Déclenche-la juste avant le coup : garde parfaite, aucun dégât, et du ki en plus.' },
    { t: "L'Ultime", d: "Quand l'étoile dorée est pleine, ton héros libère son attaque la plus puissante. Cinq styles d'ultime, de l'explosion au déluge de coups." },
    { t: 'Le sceau de rune', d: "Quand le losange est plein, trace la rune à l'écran avant la fin du temps : une frappe énorme. Trop lent, et le sceau se brise." },
    { t: 'Une équipe de trois', d: "Tu entres en combat avec trois héros. Change de héros à tout moment pour enchaîner ou te sortir d'un mauvais pas." }
  ],
  // Effet de chaque élément (dans l'ordre d'affichage)
  elements: [
    { el: 'feu', effet: 'Brûlure', d: 'Dégâts sur 4 secondes' },
    { el: 'eau', effet: 'Ralentissement', d: "L'adversaire ralentit 2,5 secondes" },
    { el: 'foudre', effet: 'Paralysie', d: "L'adversaire est figé un instant" },
    { el: 'terre', effet: 'Brise-armure', d: 'Défense -30 % pendant 5 secondes' },
    { el: 'ombre', effet: 'Vol', d: 'Vole du ki et de la jauge ultime' },
    { el: 'prisme', effet: 'Tous', d: 'Les effets des cinq autres éléments' }
  ],

  /* ---------- Modes ---------- */
  modes: [
    { t: 'Histoire', d: 'Les cinq régions, leurs guides, leurs boss en deux phases et la région cachée.' },
    { t: 'En ligne', d: 'Affronte tes amis ou un joueur au hasard.' },
    { t: 'Classé', d: 'Monte de Bronze à All Time, saison après saison.' },
    { t: '1 contre 1', d: 'Choisis ton héros, ton adversaire et le décor.' },
    { t: '2 contre 2', d: 'Quatre héros en même temps, avec un robot ou un ami.' },
    { t: 'Tournoi', d: '8 participants, élimination directe, chaque week-end.' },
    { t: 'Tour des Runes', d: 'Monte le plus haut possible, un étage après l\'autre.' },
    { t: 'Raid de boss', d: 'À deux contre un géant.' },
    { t: 'Défi du jour', d: 'Héros, décor et règle imposés : le même pour tout le monde.' },
    { t: 'Survie', d: 'Des vagues sans fin, ta vie se garde.' },
    { t: 'Événement', d: 'Défis à règles spéciales et boss de la semaine.' },
    { t: 'Entraînement', d: 'Teste n\'importe quel héros, capacités au maximum, sans risque.' }
  ],
  progression: "Les héros se débloquent avec des tickets d'invocation gagnés en jouant : victoires, Histoire, boss, objectifs du jour, et un ticket gratuit toutes les 20 minutes. Les chances de chaque portail sont affichées dans le jeu.",

  /* ---------- Fondateur : les grandes étapes du projet ---------- */
  etapes: [
    { v: 'Les débuts', t: 'Un plateau de runes', d: "La toute première idée : un jeu de réflexion sur un plateau, avec des personnages à collectionner." },
    { v: 'Refonte', t: 'Le combat en temps réel', d: 'Le plateau disparaît. Place à des duels en direct, avec techniques, garde et ultime.' },
    { v: 'v9', t: "Le mode Histoire", d: 'Une carte du monde, cinq régions, des guides, des dialogues et des boss.' },
    { v: 'v11', t: 'Les personnages en 3D', d: 'Les héros passent sur des corps 3D, avec des animations fluides.' },
    { v: 'v16', t: '99 héros, 99 créatures', d: 'Chaque héros devient une espèce à part : dragon, golem, kitsune, mimic…' },
    { v: 'v17', t: "Plus de coffres", d: 'Tout passe par des tickets d\'invocation gagnés en jouant.' }
  ],

  /* ---------- Mises à jour (la plus récente en premier) ----------
     Pour ajouter une mise à jour : copie un bloc { ... }, colle-le tout en haut de la liste et change le texte. */
  majs: [
    { v: '17.1', date: '11 novembre 2026', titre: 'Boutons de combat sur téléphone', points: [
      "Sur certains téléphones en paysage, le bouton Attaque recouvrait le Spécial : c'est corrigé.",
      'Les boutons de combat ne peuvent plus se chevaucher, quelle que soit leur taille dans les réglages.',
      'Mode gaucher : Esquive et Ki passent aussi de l\'autre côté.'
    ] },
    { v: '17.0', date: '11 novembre 2026', titre: 'Fin des coffres, nouvel accueil', points: [
      "Les coffres disparaissent : toutes les récompenses donnent des tickets d'invocation.",
      'Un ticket gratuit toutes les 20 minutes.',
      'Héros visé : ses fragments en plus à chaque invocation ×10.',
      "Nouveau décor d'accueil : une planète-désert la nuit, sa lune et ses pierres flottantes.",
      'Comparateur : les statistiques des 99 héros côte à côte, triables.',
      "Accueil allégé sur téléphone et PC, sans rien retirer."
    ] },
    { v: '16.0', date: '11 novembre 2026', titre: '99 héros', points: [
      '47 nouveaux héros.',
      'Les 42 héros restants sont redessinés : chacun devient une créature avec son espèce, sa silhouette et ses couleurs.',
      'Plus aucun héros ne ressemble à un autre.'
    ] },
    { v: '15.1', date: '11 novembre 2026', titre: 'Plus de zoom accidentel', points: [
      'Sur téléphone, appuyer plusieurs fois sur un bouton ne zoome plus l\'écran.'
    ] },
    { v: '15.0', date: '11 novembre 2026', titre: 'Créatures et invocations', points: [
      'Dix héros phares deviennent des créatures fantastiques : démon, nain, elfe, liche, orc…',
      "Invocations : plusieurs portails, ×1 ou ×10, chances affichées, garantie au bout de 50 invocations.",
      'Les modes se débloquent au fil de l\'Histoire.',
      'Combats plus lisibles et plus percutants.'
    ] },
    { v: '14.0', date: '10 novembre 2026', titre: 'Nouvel écran de lancement', points: [
      'Écran de chargement, menu principal et fiches de héros refaits.',
      'La Boutique et le Marché entre joueurs sont séparés.',
      'Vingt nouveautés : expéditions, note de style, écran face-à-face, albums…'
    ] }
  ]
};
