# Yoon Urbain

Site web de transport urbain pour un réseau fictif de 5 lignes et 28 arrêts : calcul d'itinéraires, horaires, prochains passages, plan du réseau, billets avec code QR, infos trafic et aide.

C'est un site **statique** : du HTML, du CSS et du JavaScript sans framework ni étape de build. Les données (billets, favoris, ventes) sont enregistrées dans le navigateur de chaque visiteur (`localStorage`). Les horaires sont théoriques et le paiement est simulé : aucune somme n'est débitée et aucune donnée n'est envoyée.

## Démarrage rapide

Prérequis : [Node.js](https://nodejs.org) 20 ou plus récent (Node sert uniquement au serveur local et aux tests, pas au site lui-même).

```bash
npm start            # sert le site sur http://localhost:8080  (PORT=3000 npm start pour changer de port)
```

Pour juste regarder le site, vous pouvez aussi ouvrir `index.html` dans un navigateur, ou le déposer tel quel sur n'importe quel hébergement statique.

## Fonctionnalités

| Page | Ce que l'on peut faire |
|---|---|
| Itinéraire | Chercher un trajet (maintenant ou à une heure donnée), option accès PMR, jusqu'à 3 propositions, distances en km, enregistrer ou copier un trajet, retrouver ses recherches récentes |
| Lignes et horaires | Consulter une ligne, son sens, son type de jour (semaine, samedi, dimanche) et la grille horaire de chaque arrêt |
| Prochains passages | Tableau de départs mis à jour chaque seconde, filtre par ligne, arrêts favoris |
| Plan | Plan schématique déplaçable et zoomable, filtre par ligne, fiche d'arrêt |
| Billets | Panier, tarif étudiant, paiement simulé Orange Money ou Wave (voir [docs/PAIEMENTS.md](docs/PAIEMENTS.md) et le serveur de confirmation [docs/SERVEUR-PAIEMENT.md](docs/SERVEUR-PAIEMENT.md)) ou réservation en agence, billets avec code QR, activation, registre des ventes calculé automatiquement |
| Tableau de bord | Ventes, moyens de paiement (Orange Money, Wave), billets, réseau et activité sur un écran, filtres par période, vue graphiques ou tableaux (voir [docs/TABLEAU-DE-BORD.md](docs/TABLEAU-DE-BORD.md)) |
| Infos trafic | Alertes filtrables, suivi de ses lignes |
| Aide | Questions fréquentes, formulaire de contact enregistré localement |

## Tests

```bash
npm install                  # installe Playwright (uniquement pour les tests e2e)
npx playwright install chromium

npm test                     # tests unitaires : rapides (moins de 2 s), sans navigateur
npm run test:e2e             # parcours utilisateur dans Chromium (≈ 20 s)
npm run test:all             # les deux
```

| Dossier | Contenu |
|---|---|
| `tests/unit/` | Fonctions pures : utilitaires, intégrité des données du réseau, horaires, calcul d'itinéraire, règles des billets et des trajets enregistrés |
| `tests/e2e/` | `flows.test.js` : parcours critiques dans un vrai navigateur ; `production.test.js` : build, CSP, supervision et test de fumée. Parcours : recherche d'itinéraire et erreurs de saisie, trajets et arrêts favoris, achat de billet de bout en bout, tarif étudiant, réservation, infos trafic, formulaire d'aide, thème, absence de débordement mobile |
| `tests/helpers/` | `load.js` (charge les scripts du site dans Node), `serve.js` (serveur statique), `browser.js` (Chromium + serveur pour les e2e) |

Ce que les tests garantissent, en pratique :

- **Réseau valide** : toute ligne référence des arrêts existants, les temps et distances cumulés croissent, chaque arrêt est desservi.
- **Itinéraires corrects** : les 756 paires d'arrêts sont reliées, chaque correspondance se fait au même arrêt avec au moins 2 minutes, un trajet PMR n'utilise que des arrêts accessibles pour monter et descendre, un départ tardif propose le premier bus du lendemain.
- **Achat fiable** : validations du formulaire, total du panier, un paiement accepté crée un billet et une vente, une réservation ne crée pas de vente.
- **Pas de régression silencieuse** : les tests e2e échouent à la moindre erreur JavaScript pendant un parcours.

Les tests e2e bloquent les polices Google et la bibliothèque QR (CDN) : ils sont ainsi rapides, déterministes et fonctionnent hors ligne. Ils fixent l'heure de départ des recherches et ne dépendent donc pas de l'heure réelle.

Une intégration continue (GitHub Actions) lance les deux suites : `.github/workflows/ci.yml` pour les propositions, `deploy.yml` avant chaque mise en production.

## Production

```bash
npm run build        # construit dist/ (versionnage, CSP, en-têtes, nginx.conf, healthz, version.json)
npm run preview      # construit puis sert dist/ en local, avec les en-têtes de production
npm run smoke -- https://votre-site --expect-env production   # contrôle un site en ligne
```

Le déploiement, les variables d'environnement, la sécurité, la surveillance et le retour arrière sont décrits dans [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md). Trois workflows GitHub : `ci.yml` (tests des propositions), `deploy.yml` (tests → build → publication → test de fumée sur le site en ligne), `uptime.yml` (surveillance toutes les 30 minutes avec alerte).

## Structure du projet

```
index.html            page unique : en-tête, <main id="app">, scripts
config.js             configuration d'exécution (remplacée au build par les variables d'environnement)
css/styles.css        design tokens (clair et sombre), composants, mises en page responsive
js/
  core.js             utilitaires : DOM, formats, stockage, icônes, notifications, registres ACTIONS et FORMS
  data.js             réseau (arrêts, lignes), tarifs, alertes, FAQ, index dérivés
  engine.js           horaires théoriques, prochains passages, calcul d'itinéraire (Dijkstra)
  state.js            état de l'application (un seul objet)
  components.js       composants HTML réutilisables (boutons, champs, badges, fiche d'arrêt…)
  map.js              plan SVG interactif
  app.js              routeur, thème, événements délégués, horloge : chargé en dernier
  monitor.js          supervision navigateur (désactivée sans adresse de rapports)
  views/              une vue par page : plan, lines, board, map, tickets, infos, help
scripts/              build de production (build.js), en-têtes de sécurité, test de fumée (smoke.js)
Dockerfile            image nginx de production
.github/workflows/    ci.yml, deploy.yml, uptime.yml
tests/                voir ci-dessus
docs/ARCHITECTURE.md  fonctionnement détaillé et recettes d'extension
```

Pour comprendre le code, lisez dans cet ordre : `data.js`, `engine.js`, puis une vue simple (`views/infos.js`), puis `app.js`. Le détail est dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Configuration

Il n'y a aucune variable d'environnement. Tout se règle dans le code, à un seul endroit :

| Quoi | Où | Exemple |
|---|---|---|
| Arrêts et leur position sur le plan | `js/data.js`, tableau `STOPS` | ajouter un arrêt |
| Lignes, fréquences, heures de service | `js/data.js`, tableau `LINES` | `hw: { peak: 6, off: 10, eve: 18 }` |
| Heures de pointe, soirée, vitesse, km par unité | `js/data.js`, constantes en tête de fichier | `PEAK_PERIODS`, `UNITS_PER_MIN` |
| Tarifs | `js/data.js`, tableau `PRODUCTS` | prix, durée de validité |
| Alertes trafic | `js/data.js`, tableau `ALERTS` | dates relatives à aujourd'hui |
| Correspondances (durée minimale, attente maximale) | `js/engine.js` | `MIN_TRANSFER`, `MAX_TRANSFER_WAIT` |
| Couleurs et thèmes | `css/styles.css`, bloc `:root` | jetons de couleur, thème sombre |

Données enregistrées dans le navigateur (préfixe `yoon:`) : `trips` (trajets enregistrés), `recents`, `favs` (arrêts favoris), `follow` (lignes suivies), `tickets`, `resa` (réservations), `sales` (ventes), `requests` (demandes d'aide), `theme`. Si le stockage est indisponible (navigation privée, par exemple), le site continue de fonctionner en mémoire pour la session.

## Limites connues

- Les données sont locales à un navigateur : elles ne se synchronisent pas entre appareils et n'existent pas côté serveur.
- Le paiement est simulé. Brancher un vrai paiement demande un serveur (voir « Faire évoluer »).
- Les horaires sont calculés à partir des fréquences, pas d'horaires réels temps réel.
- Les codes QR se génèrent avec une bibliothèque chargée depuis un CDN ; hors ligne, le site affiche le texte du code à la place.

## Faire évoluer

Les pistes naturelles, dans l'ordre de difficulté : ajouter une ligne ou un arrêt (données seulement), ajouter un produit (une entrée dans `PRODUCTS`), ajouter une page (une vue + une entrée de navigation), remplacer `localStorage` par une API (isoler les appels `store.get/set`, tout le code passe par là). Les recettes pas à pas sont dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), les règles de contribution dans [CONTRIBUTING.md](CONTRIBUTING.md).

## Application mobile

Le site s'installe comme une application, gratuitement et sans magasin, et fonctionne hors ligne une fois déployé en HTTPS : voir [docs/APPLICATION.md](docs/APPLICATION.md). Mise en ligne gratuite pas à pas : [docs/MISE-EN-LIGNE.md](docs/MISE-EN-LIGNE.md).
