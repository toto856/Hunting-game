# Domaine de Hautevallée — jeu de chasse 3D

Jeu de chasse réaliste à la première personne, dans le navigateur (ordinateur et iPhone), en un seul fichier : `index.html`.

## Jouer

- Ouvrez `index.html` dans Chrome, Safari, Edge ou Firefox (WebGL 2). Rien à installer.
- Version publiée sur Claude : la progression (argent, trophées, armes) est synchronisée entre l'ordinateur et l'iPhone.
- Hors Claude, la progression est enregistrée dans le navigateur.

## Le pavillon de chasse (point de départ)

Un pavillon en 3D que l'on parcourt librement :

- **Grande salle** : cheminée, lustres en bois de cerf, maquette en relief du domaine sur la table des cartes (c'est là qu'on prépare la sortie : type de chasse, mirador ou hutte, moment de la journée, météo), registre de votre progression, carnet du chasseur.
- **Salle des trophées** (à gauche) : vos prises sont naturalisées. Le plus beau trophée de chaque espèce est présenté en entier sur un socle, les suivants en tête sur écusson de chêne avec plaque gravée et médaille ; les canards médaillés « en vol » au mur.
- **Armurerie** (à droite) : râteliers de carabines et de fusils (avec vos finitions et lunettes), vitrine des armes exclusives à gagner, comptoir (munitions, optiques, jumelles, appeaux, chien), établi (finitions).
- **Vestiaire** : mannequins portant chaque tenue (loden, gilet orange, camouflages, ghillie, tenues exclusives).

On achète avec l'argent gagné à la chasse ; certaines pièces ne s'achètent pas et se gagnent avec des trophées (carabine « Diamant », « Grand Veneur », drilling, superposé « Or Royal », gravures…).

## Deux façons de chasser

- **Grand gibier d'Europe** : cerf élaphe, chevreuil, sanglier, chamois, daim. Trophées cotés sur un barème inspiré du CIC, médailles bronze, argent, or, diamant, et rares animaux légendaires.
- **Gibier d'eau** à la hutte : colvert, sarcelle, pilet, siffleur, souchet, milouin, oie cendrée (le cygne et le tadorne sont protégés). La plupart des oiseaux volent lentement et se tirent facilement ; la sarcelle reste rapide.

## Réalisme

- Zones vitales : cœur, poumons, foie, colonne, cerveau… Un tir dans l'axe de la patte avant, au tiers inférieur du corps, est éthique. Le tableau de chasse montre l'animal aux **rayons X** (squelette, organes touchés, trajet de la balle).
- Balistique : chute de la balle, énergie restante (en joules), lunette réglée à 100 m, grenaille plomb par plomb pour les oiseaux.
- Discrétion : vent, bruit, posture, tenue et couvert ; les animaux voient, entendent et fuient.
- Règles : tir de jour pour le grand gibier, grenaille sans plomb près de l'eau, amendes pour les espèces protégées.

## Commandes

| Ordinateur | Action |
| --- | --- |
| ZQSD / WASD | Se déplacer |
| Souris | Regarder |
| Clic gauche / droit | Tirer / épauler (lunette) |
| Molette | Grossissement de la lunette |
| Maj | Courir · à la lunette : retenir son souffle |
| C / X | Accroupi / couché |
| R | Recharger |
| 1 · 2 · A | Carabine · fusil · changer |
| B | Jumelles |
| F | Appeau |
| V | Bâton de tir |
| E | Interagir (mirador, gibier, armurerie…) |
| M | Carte |
| Échap | Pause / menu |

**iPhone** (paysage) : joystick au pouce gauche (poussez au-delà du cercle pour courir), regard au pouce droit n'importe où — y compris à la lunette. Le bouton FEU peut être glissé pour corriger la visée sans relâcher ; à la lunette, bouton TIR à gauche, SOUFFLE pour stabiliser, pincer pour zoomer. Double tape pour épauler.

## Développement

```
npm install
npm run build        # construit index.html et dist/artifact.html
node build.mjs --dev # version non minifiée
```

Code source dans `src/` (moteur three.js r170, tout est procédural : relief, végétation, animaux, textures, sons).
Outils de contrôle visuel dans `tools/` (captures Chromium).
