# Contribuer

## Avant d'ouvrir une demande de fusion

```bash
npm install && npx playwright install chromium   # une seule fois
npm run test:all
```

Tout doit passer. Un correctif de bug commence par **un test qui échoue**, puis le correctif.

## Où mettre un test ?

| Je modifie… | J'ajoute un test dans… |
|---|---|
| un utilitaire, un format | `tests/unit/core.test.js` |
| le réseau, les tarifs, les alertes | `tests/unit/data.test.js` (intégrité) |
| horaires ou itinéraires | `tests/unit/engine.test.js` |
| une règle de billet, de trajet enregistré | `tests/unit/business.test.js` |
| un parcours visible (bouton, formulaire, page) | `tests/e2e/flows.test.js` |

Règles pour des tests fiables : ne jamais dépendre de l'heure réelle (passer l'heure et le facteur de jour explicitement), attendre l'état affiché plutôt qu'une durée fixe, une assertion = une règle métier lisible dans son message.

## Style

- JavaScript sans dépendance, `'use strict'`, noms en anglais pour le code et en français pour les textes affichés.
- Indentation de 2 espaces (`.editorconfig`).
- Messages d'erreur destinés à l'utilisateur : dire ce qui ne va pas **et** comment le corriger.
- Accessibilité : chaque champ a une étiquette, chaque bouton icône un `aria-label`, l'état se lit aussi sans la couleur.

Voir aussi [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
