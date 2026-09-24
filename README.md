# PASSÉE — Chasse au gibier d'eau

Jeu de chasse au canard en 3D, à la première personne, qui tourne directement dans le navigateur (Three.js, aucune installation).

## Lancer le jeu

Ouvrez simplement `index.html` dans Chrome, Firefox, Edge ou Safari.
(Optionnel : `python3 -m http.server` puis http://localhost:8000.)

## Contenu

- **6 territoires à débloquer** : Marais de Camargue, Lac de la Forêt d'Automne, Rivière Gelée (glace + trous d'eau), Toundra du Grand Nord, Fjord Norvégien, Bayou de Louisiane.
- **11 météos** dont 6 styles de neige : neige légère, gros flocons, poudreuse scintillante, grésil, neige fondante, blizzard — plus pluie, orage (éclairs et tonnerre), brouillard, couvert, grand beau. La neige s'accumule au sol pendant la partie.
- **4 moments de la journée** : aube, journée, crépuscule, nuit de pleine lune (ciel étoilé).
- **6 modes** : Chasse classique, Chasse libre, Contre-la-montre, Ball-trap, Chasse réglementée (quotas + espèces protégées), Survie (vagues de migration).
- **7 armes** : pompe, juxtaposé, superposé cal.20, semi-automatique, carabine à lunette, Magnum cal.10, superposé « Or Royal ».
- **5 types de cartouches**, **chokes** interchangeables et **équipement** : appeau, jumelles, cartouchière, appelants, camouflage, labrador rapporteur, waders.
- **11 espèces** (colvert, sarcelle, pilet, mandarin, branchu, eider, oie cendrée, bernache… et deux espèces protégées à ne pas tirer).
- Progression : XP, niveaux, argent, armurerie, carnet de chasse et records (sauvegarde locale dans le navigateur).

## Réalisme

- Balistique simulée plomb par plomb : temps de vol (il faut donner de l'avance), traînée, gravité, dérive au vent, perte d'énergie au-delà de la portée utile.
- Canards qui volent en groupe (en V pour les oies), tournent au-dessus des étangs, se posent, barbotent, et s'envolent si vous approchez ou tirez.
- Respiration et tremblement en visée (Maj pour bloquer sa respiration), recul, réarmement à la pompe, ouverture des fusils basculants, douilles éjectées.
- Discrétion : l'affût, la position accroupie, le camouflage et la nuit réduisent la distance à laquelle les canards vous repèrent.
- Sons entièrement synthétisés : coups de feu avec écho selon le relief, cancanements spatialisés, vent, pluie.

## Commandes

| Touche | Action |
| --- | --- |
| ZQSD / WASD | Se déplacer |
| Souris | Regarder |
| Clic gauche / droit | Tirer / Épauler |
| Maj | Courir (en visée : retenir sa respiration) |
| C ou Ctrl | S'accroupir |
| Espace | Sauter |
| R | Recharger |
| 1, 2, molette | Changer d'arme |
| F | Appeau |
| B | Jumelles |
| E | Ramasser le gibier |
| Tab | Tableau de chasse |
| Échap / P | Pause |

Sur téléphone ou tablette, des commandes tactiles s'affichent automatiquement (joystick, zone de visée, boutons).
