# Tableau de bord

Page `#tableau` : un seul écran qui regroupe les ventes, les moyens de paiement et l'activité du site.

## Contenu
| Bloc | Source | Remarque |
|---|---|---|
| 6 indicateurs : billets vendus, chiffre d'affaires (panier moyen), vendus aujourd'hui, billets actifs, à régler en agence, perturbations | ventes, billets, réservations, infos trafic | « vendus aujourd'hui » ignore le filtre de période |
| Ventes par jour | `sales` | une colonne par jour ; « Tout » affiche les 60 derniers jours (les totaux couvrent toute la période) |
| Moyens de paiement | `sales[].method` | Orange Money, Wave, et « Mobile money (ancien) » pour les ventes sans moyen enregistré. Les réservations en agence ne sont pas des ventes : elles sont comptées à part |
| Ventes par titre | `sales[].pid` | les 5 titres, même à zéro |
| Billets et réservations | `tickets`, `resa` | état actuel, indépendant de la période ; une réservation expirée n'est pas comptée |
| Réseau | `LINES`, `STOP_LIST`, `ALERTS` | lignes, arrêts, part accessible PMR, perturbations en cours |
| Activité sur cet appareil | favoris, trajets, demandes d'aide | |
| État du site | configuration (`YOON_CONFIG`) et navigateur | mode de paiement (démonstration ou serveur), version, application installée ou non, mode hors ligne |
| Dernières ventes | `sales` | 10 plus récentes de la période |

Filtres : **période** (7 jours, 30 jours, tout) et **affichage** (graphiques ou tableaux). Le mode tableaux est l'alternative accessible aux graphiques.

## Données
Tout est calculé dans le navigateur à partir du stockage local (`yoon:sales`, `tickets`, `resa`, `favs`, `trips`, `requests`). **Rien n'est envoyé nulle part** : un autre appareil ou un autre navigateur a son propre tableau de bord, vide au départ. Ce n'est donc pas un tableau de bord de l'exploitant du réseau : pour cela il faudrait que les ventes confirmées arrivent sur le serveur de paiement ([SERVEUR-PAIEMENT.md](SERVEUR-PAIEMENT.md)) et une page qui les lit.

**Ventes de démonstration** : le bouton les ajoute (30 jours, reproductibles) en les marquant `demo`. Elles comptent aussi sur la page Billets. « Retirer » ne supprime qu'elles, jamais les vraies ventes.

## Code
- `js/views/dashboard.js` : `dashboardModel()` (pur, testé sans navigateur), `demoSales()`, vue et actions.
- `js/charts.js` : histogramme SVG, barres étiquetées, info-bulle commune (`attachTips`).
- Couleurs : `--s1`, `--s2`, `--s3` dans `css/styles.css` (clair et sombre), validées avec le contrôleur de palette (daltonisme, contraste). La couleur suit le **moyen de paiement** (Wave bleu, Orange Money orange), jamais son rang. Chaque barre porte son nom et sa valeur : la couleur n'est jamais le seul repère.
- Ajouter un moyen de paiement : il apparaît tout seul (entrée dans `PAYMENT_METHODS`) ; lui donner une couleur dans `METHOD_COLOR`.
- Tests : `tests/unit/dashboard.test.js` (agrégats, périodes, ventes futures, ventes de démonstration) et deux parcours dans `tests/e2e/flows.test.js`.
