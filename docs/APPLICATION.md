# Application installable (PWA) — gratuite, sans magasin d'applications

Yoon Urbain est une **application web progressive** : une fois le site en ligne en HTTPS, n'importe qui l'installe sur son téléphone ou son ordinateur depuis le navigateur. Pas de compte développeur, pas de frais, pas de validation par un magasin, et chaque mise à jour du site met l'application à jour.

## Ce que l'application apporte

- **Icône sur l'écran d'accueil** et ouverture en plein écran, sans barre d'adresse (`manifest.webmanifest`, icônes dans `icons/`).
- **Fonctionne sans réseau** : les horaires, le calculateur d'itinéraire, le plan et les billets enregistrés sur l'appareil s'ouvrent hors ligne (`sw.js`). Les polices et la bibliothèque du QR code, qui viennent d'internet, utilisent le texte de secours ou le cache.
- **Raccourcis** par appui long sur l'icône (Android) : « Prochains passages » et « Mes billets ».
- **Bouton « Installer l'appli »** dans l'en-tête, affiché quand le navigateur propose l'installation (Android, Chrome, Edge). Sur iPhone, le bouton affiche le mode d'emploi.
- **Mises à jour** : à chaque nouvelle version du site, l'ancien cache est supprimé et le nouveau prend le relais ; un message l'indique.

## Installer

| Appareil | Geste |
|---|---|
| Android (Chrome, Edge, Samsung Internet) | bouton **Installer l'appli** du site, ou menu ⋮ → *Installer l'application* |
| iPhone / iPad (Safari) | bouton Partager → *Sur l'écran d'accueil* |
| Ordinateur (Chrome, Edge) | icône d'installation dans la barre d'adresse |

## Mettre en ligne (gratuit)

Il faut une adresse **HTTPS** : GitHub Pages, Netlify, Cloudflare Pages ou Vercel l'offrent gratuitement (voir [DEPLOIEMENT.md](DEPLOIEMENT.md)). `npm run build` génère tout : le service worker reçoit la liste exacte des fichiers à mémoriser et une version propre au build.

Le service worker n'est **pas enregistré en développement** (`env: development`) : l'application n'est donc pas installable depuis `npm start` ni depuis la page de démonstration publiée sur claude.ai, seulement depuis un site construit en production ou préproduction.

## Obtenir un fichier .apk (facultatif)

Pour distribuer un fichier Android en dehors du navigateur, [PWABuilder](https://www.pwabuilder.com) (gratuit) génère un paquet à partir de l'adresse du site déployé. L'installer à la main (« sources inconnues ») est gratuit. **Publier sur Google Play** demande un compte développeur payant (frais unique) ; l'App Store d'Apple demande un abonnement annuel. L'installation directe depuis le navigateur évite ces deux coûts.

## Maintenir

- Changer le logo : modifier `scripts/make-icons.js`, puis `npm run icons`.
- Ajouter un fichier au site : rien à faire, `scripts/build.js` lit `index.html` pour établir la liste hors ligne et refuse un fichier introuvable.
- Une page ou une ressource non listée dans `index.html` (chargée plus tard) est mémorisée à sa première utilisation en ligne.
- Les envois (paiements, rapports d'erreurs) ne passent **jamais** par le cache.

## Limites connues

- Installation et mode hors ligne testés dans Chromium (tests automatisés sur le site construit) ; pas testés sur un vrai téléphone, ni sur Safari/iOS.
- Sur un hébergeur qui sert mal l'extension `.webmanifest`, vérifier le type `application/manifest+json` (nginx : `include mime.types;` le fournit selon la version).
- Hors ligne, le mode serveur de paiement est inutilisable (il faut joindre le serveur) : le site affiche « serveur injoignable » et ne délivre rien.
