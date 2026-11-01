# Serveur de confirmation de paiement

Petit serveur Node (sans dépendance) qui enregistre un paiement, reçoit la **confirmation de l'opérateur** (webhook) et permet au site de connaître le résultat. Un billet ne doit être activé que lorsque ce serveur répond `success`, jamais sur la seule parole du navigateur.

> **État : le site est branché, en deux modes.** Sans adresse configurée, le site reste en **mode démo** (paiement simulé, aucun serveur appelé). Avec `YOON_PAYMENT_API`, il passe en **mode serveur** : un billet n'est délivré que lorsque le serveur reçoit la confirmation de l'opérateur. Ce circuit est testé de bout en bout avec un opérateur joué par les tests, mais il n'a jamais reçu de vraie confirmation Orange Money ou Wave : leurs interfaces officielles n'ont pas pu être vérifiées. Le format de signature (HMAC-SHA256 du corps brut, en-tête `x-signature`) est un **modèle générique** à remplacer par celui de la documentation de chaque opérateur.

## Lancer

```bash
export WEBHOOK_SECRET_ORANGE="<au moins 16 caractères>"
export WEBHOOK_SECRET_WAVE="<au moins 16 caractères>"
export ALLOWED_ORIGIN="https://votre-site.sn"   # origine autorisée à appeler l'API (CORS)
npm run server                                   # port 8787 par défaut
```

| Variable | Rôle | Défaut |
|---|---|---|
| `WEBHOOK_SECRET_ORANGE`, `WEBHOOK_SECRET_WAVE` | secrets de signature (obligatoires, le serveur refuse de démarrer sans) | – |
| `ALLOWED_ORIGIN` | origine du site autorisée en CORS | aucune |
| `PORT` | port d'écoute | `8787` |
| `DATA_FILE` | fichier JSON des paiements | `server/data/payments.json` |

Les secrets ne vont **jamais** dans le code ni dans Git : variables d'environnement ou secrets de l'hébergeur.

## Routes

| Route | Rôle |
|---|---|
| `POST /api/payments` | crée un paiement `pending` : `{ref, amount, method: "orange"\|"wave", phone}` (montant entier en FCFA) → 201, 409 si la référence existe |
| `GET /api/payments/:ref` | `{ref, status}` : `pending`, `success` ou `failed` (le site interroge cette route) |
| `POST /webhooks/orange`, `/webhooks/wave` | confirmation de l'opérateur : `{ref, status: "success"\|"failed", amount}` + en-tête `x-signature` |
| `GET /health` | sonde de disponibilité |

## Garanties (vérifiées par les tests)

- Signature fausse, absente, ou calculée avec le secret de l'autre opérateur → **401**, rien ne change.
- Corps modifié après signature → 401.
- Montant différent de celui créé, opérateur différent, référence inconnue → 409 / 409 / 404.
- Même confirmation reçue deux fois (les opérateurs réessaient) → 200, sans effet (`replay: true`).
- Un paiement `failed` ne peut pas devenir `success` (409).
- Corps limité à 16 Ko, écriture du fichier atomique, fichier corrompu → démarrage refusé plutôt que données perdues.

## Les deux modes du site

| | Mode démo (défaut) | Mode serveur |
|---|---|---|
| Activation | rien à faire | `YOON_PAYMENT_API=https://paiement.votre-domaine.sn` au build (ou `paymentApi` dans `config.js` en développement) |
| Orange Money / Wave | paiement simulé après 1,4 s | enregistrement sur le serveur puis attente de la confirmation de l'opérateur |
| Espèces en agence | réservation locale | idem : aucun appel au serveur |
| Serveur arrêté | sans importance | message « serveur injoignable », **aucun billet** (jamais de repli silencieux sur la simulation) |

Déroulé en mode serveur : `POST /api/payments` avec la référence du QR de paiement → le site interroge `GET /api/payments/:ref` toutes les 2 s → `success` : billet délivré ; `failed` : message de refus, nouvelle référence au prochain essai ; pas de réponse après 2 minutes : message « ne payez pas une seconde fois », et un nouvel essai **reprend la même référence** (aucun doublon). Réglages facultatifs dans `config.js` : `pollMs`, `timeoutMs`.

## Essayer en local, sans opérateur

```bash
# terminal 1 : le serveur
WEBHOOK_SECRET_ORANGE=orange-secret-123456 WEBHOOK_SECRET_WAVE=wave-secret-1234567 ALLOWED_ORIGIN=http://localhost:8080 npm run server
# terminal 2 : le site, avec paymentApi: 'http://localhost:8787' dans config.js
npm start
# dans le site : choisir Wave, payer ; la page attend. Puis jouer l'opérateur avec la référence affichée sous le QR :
WEBHOOK_SECRET_WAVE=wave-secret-1234567 npm run pay:simulate -- wave PAY-XXXXXXXX success 1000
```

Le billet apparaît dès la confirmation. Avec `failed`, la page affiche le refus. (Adapter le port du site à celui affiché par `npm start`.)

## Avant la mise en ligne

- Servir en **HTTPS** (reverse proxy) : les opérateurs n'appellent pas un webhook en HTTP.
- Définir `ALLOWED_ORIGIN` à l'adresse exacte du site, et `YOON_PAYMENT_API` au build (la CSP l'autorise alors dans `connect-src` ; un build refuse une adresse non https).
- Remplacer la signature générique par celle de l'opérateur et rejouer `tests/unit/server.test.js` adapté.
- Limiter le débit de `POST /api/payments` (proxy ou middleware) : non fait ici.
- Remplacer le fichier JSON par une vraie base si le volume grandit ; le fichier est conçu pour un seul processus.
- Sauvegarder les paiements : ils servent de preuve en cas de litige.
