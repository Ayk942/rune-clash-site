# Site officiel de Rune Clash

Le site présente le jeu : la scène 3D de l'accueil, l'univers, le combat, les 99 héros (chacun visible en 3D), le fondateur, les mises à jour et la communauté. Il ne demande aucun serveur particulier : ce sont des fichiers à mettre en ligne tels quels (GitHub Pages, par exemple).

## Ce que tu modifieras le plus souvent

| Je veux… | Fichier | Où |
|---|---|---|
| changer le lien du bouton **Jouer** | `js/config.js` | `jouer.url` |
| mettre un lien de téléchargement | `js/config.js` | `telecharger.url` (vide = guide « Installer l'appli ») |
| ajouter un réseau social | `js/config.js` | `communaute` (une ligne par réseau, lien vide = caché) |
| mettre mon prénom ou mon texte de fondateur | `js/config.js` | `fondateur` |
| choisir les héros de la scène d'accueil | `js/config.js` | `herosVedette` |
| écrire une nouvelle mise à jour | `js/contenu.js` | copier un bloc en haut de `majs` |
| changer un texte (univers, combat, modes) | `js/contenu.js` | la rubrique correspondante |
| changer une couleur ou une police | `css/site.css` | les variables tout en haut (`:root`) |

Garde les guillemets `'…'` autour des textes et une virgule à la fin de chaque ligne d'une liste. Si une apostrophe pose problème dans un texte entre `'…'`, mets le texte entre `"…"`.

## Les personnages viennent du jeu

Le site n'a pas sa propre liste de héros : il utilise directement le code et les données du jeu, rangés dans `js/moteur-3d.js`. Les héros, leurs espèces, statistiques, techniques et histoires sont donc toujours les mêmes que dans le jeu.

Pour **ajouter un personnage** :
1. on l'ajoute au jeu ;
2. on relance `node outils/construire.js` (met à jour `js/moteur-3d.js` et les modèles 3D) ;
3. on relance `python3 outils/portraits.py` (fabrique son image dans `img/heros/`).

Si l'étape 3 est oubliée, le site dessine lui-même le portrait manquant à l'ouverture : ça marche, juste un peu plus lentement.

Ne modifie pas `js/moteur-3d.js` à la main : il est réécrit à chaque construction.

## Les fichiers

```
index.html            la page (structure des rubriques)
css/site.css          tout le style
js/config.js          les réglages : liens, fondateur, réseaux  ← à modifier
js/contenu.js         les textes : univers, combat, modes, mises à jour  ← à modifier
js/scene-3d.js        les scènes 3D (accueil et fiche d'un héros)
js/site.js            le fonctionnement de la page (filtres, fiches, menus)
js/moteur-3d.js       moteur 3D et données du jeu (fichier généré)
models/               les deux corps 3D de base et leurs textures
img/heros/            un portrait par héros (fond transparent)
img/accueil.jpg       image affichée si l'appareil ne sait pas faire de 3D
img/partage.jpg       image d'aperçu quand on partage le lien
outils/               construire.js et portraits.py
```

## Mettre en ligne

Copie tout le dossier tel quel. Deux possibilités sur GitHub Pages :
- dans le dépôt du jeu, dans un dossier `site/` (adresse : `…/rune-clash/site/`) ;
- ou dans un dépôt à part (par exemple `rune-clash-site`).

Après la mise en ligne, remplace dans `index.html` la ligne `og:image` par l'adresse complète de `img/partage.jpg` (par exemple `https://ayk942.github.io/rune-clash/site/img/partage.jpg`) : les réseaux sociaux ont besoin d'une adresse complète pour afficher l'aperçu.

Une fiche de héros a sa propre adresse : `…/#heros-akio`, `…/#heros-lumen`, etc. Pratique pour partager un personnage.

## Tester sur ton ordinateur

Les fichiers 3D ne se chargent pas en ouvrant `index.html` par double clic. Dans le dossier du site : `python3 -m http.server 8770`, puis ouvre `http://localhost:8770`.
