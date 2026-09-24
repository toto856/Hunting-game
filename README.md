# TERRES SAUVAGES — Simulateur de chasse 3D

Jeu de chasse réaliste à la première personne qui tourne directement dans le navigateur (Three.js, aucune installation, aucun asset externe : tout est généré procéduralement).

## Lancer le jeu

Ouvrez `index.html` dans Chrome, Firefox, Edge ou Safari (ou `python3 -m http.server` puis http://localhost:8000).

## Contenu

- **Camp d'entraînement (lobby)** : stand carabine 50 → 300 m avec cibles papier notées, gongs acier et sanglier courant ; fosse de trap, skeet et parcours de chasse en accès libre ; armurerie, chenil et bureau des chasses.
- **11 modes** : approche, affût au mirador (nuit, agrainage), battue (3 traques, rabatteurs, chiens courants, angle de sécurité de 30°), passée aux canards (hutte, appelants, appeau), petit gibier devant soi (chien d'arrêt), bécasse au bois, chasse en montagne, chasse à l'arc, régulation des nuisibles, expédition boréale (orignal, wapiti, ours), plus 3 compétitions de ball-trap (fosse, skeet, parcours) avec prix en argent.
- **6 territoires** : forêt de Chambord, plaine de Beauce, marais de Brière, massif des Écrins, forêt boréale du Québec, camp d'entraînement.
- **26 espèces** dont des espèces protégées (bouquetin, cygne, héron, marmotte) et des marcassins rayés à ne pas tirer : amendes et perte d'XP.
- **17 armes** (fusils à pompe, superposés, juxtaposé, semi-auto, cal.20, fusil de trap, carabines .22 LR → .300 Win Mag, 6,5 Creedmoor, express 9,3x74R, lever-action .45-70, arc à poulies), **17 munitions**, 4 chokes, 6 optiques (point rouge, 1-6x, 3-9x, 4-16x, 5-25x, lunette crépusculaire), zéro réglable.
- **6 chiens** : labrador (rapport), épagneul breton et setter (arrêt et lever), beagle, teckel et jagdterrier (recherche au sang, voie).
- **Équipement** : camouflage, waders, jumelles télémètre, bâton de pirsch, bipied, appeaux (canard, oie, brame, chevreuil, renard), appelants, cartouchière, modérateur de son…
- Économie : licences par mode, valeur des trophées selon l'espèce, le placement du tir (cœur/poumons, tête, ventre…), la distance, la médaille (bronze/argent/or), amendes (tir dans la ligne, plombs sur grand gibier, calibre non conforme, quota, espèce protégée).
- Progression : XP, 10 niveaux qui débloquent les modes, carnet de chasse avec records par espèce, sauvegarde locale.

## Réalisme

- Balistique simulée en temps réel : gravité, traînée (coefficient balistique), dérive au vent, temps de vol (avance sur le gibier), gerbe de plombs par choke, énergie à l'impact.
- Zones vitales (cœur/poumons, tête, cou, ventre, arrière-main, pattes) : mort instantanée, animal mortellement touché qui court avant de tomber, ou blessé qui laisse une piste de sang à suivre avec le chien.
- Sens des animaux : vue (posture, camouflage, mouvement, couvert), ouïe (bruit de vos pas selon le sol), odorat porté par le vent. Hardes, meneuses, fuite en groupe, sangliers et ours qui chargent quand ils sont blessés.
- Chasseur : endurance, rythme cardiaque, blocage du souffle, tremblement selon la posture (debout, accroupi, couché, mirador), bâton et bipied.
- Monde : cycle jour/nuit avec soleil, lune et étoiles, 7 météos (brume, pluie, neige, grand vent…), arbres et herbes animés par le vent, eau, ombres dynamiques, forêts d'automne, feuilles qui tombent.

## Commandes

Souris : regarder · Clic gauche : tir · Clic droit : viser · Molette : zoom · ZQSD/WASD : marcher · Maj : courir · C : accroupi · Z/X : couché · Espace : sauter · H : bloquer le souffle · R : recharger · E : agir / PULL / prélever · Q : appeau · F : chien · B : jumelles · M : carte · L : zéro lunette · K : choke · 1/2 : changer d'arme · T : munitions · Tab : menu · Échap : pause. Contrôles tactiles sur mobile.
