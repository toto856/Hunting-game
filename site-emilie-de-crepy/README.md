# Site vitrine — Émilie De Crépy, conseillère immobilière (iad France, Orléans)

Fichier unique, autonome : `index.html`. Aucune dépendance à installer.
Ouvrez-le dans un navigateur, ou déposez-le tel quel sur un hébergeur
(Netlify, Vercel, OVH, GitHub Pages…).

## Structure : six pages, aucun défilement vertical
Le site est une application à vues : l'en-tête (logo + onglets) reste fixe, la zone
en dessous change au clic. Chaque vue tient dans un écran.

1. **Accueil** — titre, présentation, 4 boutons d'entrée, chiffres clés, illustration.
2. **À propos** — citation, parcours, points forts, méthode en 4 étapes.
3. **Services** — 6 prestations.
4. **Mes biens** — filtres + carrousel horizontal des 9 biens (flèches ← →, compteur).
   « Demander le dossier » bascule sur Estimation avec le bien déjà inscrit.
5. **Estimation** — formulaire, ouvre la messagerie adressée à Émilie.
6. **Contact** — e-mail, téléphone, adresse, profil iad, avis, zones, mentions légales.

Chaque vue a son ancre (`#accueil`, `#biens`, `#contact`…) : un lien direct ouvre la
bonne page.

## À VÉRIFIER avant mise en ligne
| Élément | Valeur utilisée | Source / statut |
|---|---|---|
| E-mail | `emilie.de-crepy@iadfrance.fr` | **NON CONFIRMÉ** — déduit du format habituel iad (prenom.nom@iadfrance.fr). À remplacer par l'adresse réelle. |
| Téléphone | 06 83 20 83 50 | Repris de ParuVendu / Superimmo, à confirmer. |
| Adresse | 14 rue Coursimault, 45100 Orléans | Registre des entreprises (Pappers / Infonet). |
| RSAC / SIREN | 991 481 615 | Registre des entreprises + mentions des annonces. |
| Les 9 biens | prix, surfaces, villes | Profil iad (instantané indexé) — à revérifier, les prix bougent. |
| Avis | 5/5 (1 avis) | Annuaire iad. Le texte du témoignage est une formulation générique, à remplacer par le vrai avis. |
| Photos | **aucune photo réelle** | Illustrations SVG dessinées (7 scènes), marquées « Illustration » sur chaque vignette. Le réseau de la session bloque tout téléchargement d'images, et les photos des annonces appartiennent à iad / au photographe. À remplacer par les vraies photos. |

L'e-mail apparaît à **3 endroits** dans `index.html` : les deux liens `mailto:`
du bloc contact et la constante `var DEST = "..."` dans le script du formulaire.
Un simple rechercher/remplacer de `emilie.de-crepy@iadfrance.fr` suffit.

## Personnalisation rapide
- **Couleurs** : variables CSS en haut du fichier (`:root`) — `--accent` (vert sauge),
  `--paper` (fond), `--ink` (texte).
- **Ajouter un bien** : dupliquer un bloc `<article class="bien" data-tags="...">`.
  Tags disponibles : `prestige`, `maison`, `appartement`, `exclusivite`.
- **Photos** : dans chaque carte, remplacer le bloc
  `<svg class="scene" …>…</svg><span class="vis-note">Illustration</span>` par
  `<img src="photos/mon-bien.jpg" alt="…" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`.
  Les illustrations sont définies une seule fois dans le sprite SVG (`#s-domaine`, `#s-manoir`,
  `#s-foret`, `#s-solognote`, `#s-maison`, `#s-contemporaine`, `#s-immeuble`).

Le formulaire d'estimation ouvre directement la messagerie du visiteur, adressée à
l'e-mail du site, avec la demande déjà rédigée — aucun serveur requis. Pour que les
demandes arrivent dans la boîte d'Émilie **sans passer par la messagerie du visiteur**,
brancher le `<form>` sur Formspree ou Netlify Forms (endpoint gratuit, 2 lignes à changer).

## Deux fichiers
- `index.html` — version autonome, à ouvrir en local ou à héberger (doctype + head complets).
- `artifact.html` — même site adapté au format Artifact Claude (sans `<html>/<head>/<body>`,
  avec mode sombre, boutons de copie et formulaire sans `mailto`), publié en page privée :
  https://claude.ai/artifact/4XpYxJwCgBjo87cAbgmJsL

L'adresse e-mail à corriger apparaît dans **les deux** fichiers.
