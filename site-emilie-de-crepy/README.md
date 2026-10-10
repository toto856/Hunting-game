# Site vitrine — Émilie De Crépy, conseillère immobilière (iad France, Orléans)

Fichier unique, autonome : `index.html`. Aucune dépendance à installer.
Ouvrez-le dans un navigateur, ou déposez-le tel quel sur un hébergeur
(Netlify, Vercel, OVH, GitHub Pages…).

## Structure de la page
Accueil (hero) → chiffres clés → à propos → services → **9 biens** avec filtres →
méthode en 4 étapes → formulaire d'estimation → avis client → **contact + e-mails
en bas de page** + mentions légales.

## À VÉRIFIER avant mise en ligne
| Élément | Valeur utilisée | Source / statut |
|---|---|---|
| E-mail | `emilie.de-crepy@iadfrance.fr` | **NON CONFIRMÉ** — déduit du format habituel iad (prenom.nom@iadfrance.fr). À remplacer par l'adresse réelle. |
| Téléphone | 06 83 20 83 50 | Repris de ParuVendu / Superimmo, à confirmer. |
| Adresse | 14 rue Coursimault, 45100 Orléans | Registre des entreprises (Pappers / Infonet). |
| RSAC / SIREN | 991 481 615 | Registre des entreprises + mentions des annonces. |
| Les 9 biens | prix, surfaces, villes | Profil iad (instantané indexé) — à revérifier, les prix bougent. |
| Avis | 5/5 (1 avis) | Annuaire iad. Le texte du témoignage est une formulation générique, à remplacer par le vrai avis. |
| Photos | aucune | Visuels typographiques en attendant les vraies photos des biens et le portrait. |

L'e-mail apparaît à **3 endroits** dans `index.html` : les deux liens `mailto:`
du bloc contact et la constante `var DEST = "..."` dans le script du formulaire.
Un simple rechercher/remplacer de `emilie.de-crepy@iadfrance.fr` suffit.

## Personnalisation rapide
- **Couleurs** : variables CSS en haut du fichier (`:root`) — `--accent` (vert sauge),
  `--paper` (fond), `--ink` (texte).
- **Ajouter un bien** : dupliquer un bloc `<article class="bien" data-tags="...">`.
  Tags disponibles : `prestige`, `maison`, `appartement`, `exclusivite`.
- **Photos** : remplacer le `<div class="visual" …>` par
  `<div class="visual"><img src="photos/mon-bien.jpg" alt="…"></div>`.

Le formulaire d'estimation ouvre la messagerie du visiteur avec un message
pré-rempli (aucun serveur requis). Pour un envoi direct, le brancher sur
Formspree / Netlify Forms.

## Deux fichiers
- `index.html` — version autonome, à ouvrir en local ou à héberger (doctype + head complets).
- `artifact.html` — même site adapté au format Artifact Claude (sans `<html>/<head>/<body>`,
  avec mode sombre, boutons de copie et formulaire sans `mailto`), publié en page privée :
  https://claude.ai/artifact/4XpYxJwCgBjo87cAbgmJsL

L'adresse e-mail à corriger apparaît dans **les deux** fichiers.
