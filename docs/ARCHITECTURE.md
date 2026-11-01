# Architecture

## Principes

1. **Aucune étape de build.** Les scripts sont des scripts classiques (`<script defer>`), chargés dans un ordre fixe, qui partagent la portée globale. L'ordre est dans `index.html` : `core` → `data` → `engine` → `state` → `components` → `map` → `views/*` → `app`.
2. **Les données ne contiennent pas de logique d'affichage, le moteur ne touche pas au DOM.** `data.js` et `engine.js` sont testables sans navigateur (voir `tests/helpers/load.js`).
3. **Une vue = un objet** avec `render(root)` et, si besoin, `tick()` (appelé chaque seconde), `submit()`.
4. **Pas de gestionnaire d'événement par bouton.** Les événements sont délégués au document (`app.js`) et routés par attribut.

## Flux d'un clic

```
<button data-action="save-trip">  ──click──▶  app.js (écouteur unique sur document)
                                                │  ACTIONS['save-trip'](element, event)
                                                ▼
                                          modifie le stockage ou l'état,
                                          puis rerender()  ──▶  app.view.render(#app)
```

- `data-action="nom"` → `ACTIONS[nom]` ; `data-form="nom"` sur un `<form>` → `FORMS[nom]`.
- Chaque vue enregistre ses actions : `Object.assign(ACTIONS, { … })` en bas de son fichier.
- `rerender()` redessine la vue courante en conservant le défilement et le champ actif.

## État et stockage

| Où | Quoi | Durée de vie |
|---|---|---|
| `state` (`state.js`) | saisies en cours, filtres, panier, drapeaux | la page |
| `store` (`core.js`) | trajets, favoris, billets, ventes, thème… | persistant (`localStorage`, préfixe `yoon:`) |

`store.get(clé, défaut)` et `store.set(clé, valeur)` sont les seuls accès au stockage. Ils retombent sur la mémoire si `localStorage` est indisponible. **Toute donnée relue du stockage doit être validée avant usage** (voir `savedTrips()` dans `views/plan.js` : il écarte les entrées corrompues ou devenues invalides).

## Le moteur d'itinéraires (`engine.js`)

- **Horaires** : `terminusDeps(ligne, sens, facteur)` produit les départs du terminus à partir des fréquences (pointe, creux, soirée) ; l'heure à un arrêt = départ + temps cumulé (`line.cum`). `nextAt` trouve le prochain passage par recherche dichotomique et bascule au lendemain après le dernier bus.
- **Itinéraire** : algorithme de Dijkstra sur des états `(arrêt, ligne+sens en cours)`. Chaque correspondance coûte une pénalité ; trois pénalités (`TRANSFER_PENALTIES`) donnent trois profils (rapide, équilibré, peu de correspondances), dédoublonnés puis triés par heure d'arrivée. Les résultats sont mis en cache.
- **Règles** : `MIN_TRANSFER` minutes minimum pour changer de bus, attente de correspondance plafonnée (`MAX_TRANSFER_WAIT`), mode PMR : on ne monte et ne descend qu'à des arrêts accessibles.
- **Temps** : les heures sont des minutes depuis minuit ; `≥ 1440` signifie le lendemain. Le facteur d'intervalle (1, 1,3 ou 1,7) représente le type de jour.

## Recettes

### Ajouter un arrêt ou une ligne
1. `data.js` : ajouter l'arrêt dans `STOPS` (id, nom, x, y sur le plan, accessible, côté de l'étiquette) puis la ligne dans `LINES` avec ses fréquences.
2. CSS : pour une nouvelle ligne `L6`, ajouter la couleur `--l6` dans le bloc `:root` (et ses variantes sombres si besoin) et la règle `.lb[data-l="L6"]{background:var(--l6)}` dans `css/styles.css`.
3. `npm test` : les tests d'intégrité vérifient les références, la croissance des distances et la connexité du réseau.

### Ajouter un produit tarifaire
Ajouter une entrée dans `PRODUCTS` (`id`, `name`, `price`, `minutes`, `desc`, `student: true` si réduit). Les cartes, le panier, le registre des ventes et les tests de cohérence s'adaptent seuls.

### Ajouter une page
1. Créer `js/views/ma-vue.js` avec un objet `maVue = { render(root) {…} }` et ses actions.
2. L'ajouter à `index.html` (avant `app.js`), dans `VIEWS` et `NAV` (`app.js`).
3. Ajouter un test dans `tests/e2e/flows.test.js` pour le parcours principal.

### Brancher un vrai serveur
- Remplacer l'intérieur de `store.get/set` par des appels à une API (en gardant la même signature), ou migrer clé par clé.
- Le paiement : remplacer `ticketsView.finalize` (le seul endroit qui crée billets et ventes) et conserver la validation `validateCheckout`.
- Les horaires réels : produire les mêmes tableaux que `terminusDeps` ; le reste du moteur ne change pas.

## Conventions de code

- Fonctions courtes, une responsabilité ; commentaire seulement pour le « pourquoi ».
- Tout texte venant d'une saisie ou du stockage passe par `esc()` avant d'entrer dans du HTML.
- Pas de style en ligne sauf valeur dynamique (`--lc:` pour la couleur de ligne) ; pas de couleur en dur hors des jetons `:root`.
- Un composant d'interface répété trois fois devient une fonction de `components.js`.
