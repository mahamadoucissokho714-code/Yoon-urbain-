# Déploiement et exploitation

Yoon Urbain est un site statique : **il n'y a ni serveur applicatif, ni base de données, ni secret**. La production consiste à servir le dossier `dist/` avec les bons en-têtes, après avoir passé les tests.

## 1. Mise en ligne en 5 étapes (GitHub Pages, gratuit)

Guide détaillé pour débutant, avec dépannage : [MISE-EN-LIGNE.md](MISE-EN-LIGNE.md).

1. Créez un dépôt GitHub et poussez le projet sur la branche `main`.
2. *Settings → Pages → Source* : choisir **GitHub Actions**.
3. *Settings → Secrets and variables → Actions → Variables* : ajouter (facultatif mais recommandé) :
   - `YOON_SITE_URL` : l'adresse publique, par exemple `https://votre-compte.github.io/yoon-urbain` (active robots.txt, sitemap et la surveillance).
   - `YOON_REPORT_URL` : adresse **https** qui reçoit les erreurs du navigateur (voir §4). Laisser vide pour désactiver.
4. Poussez sur `main` : le workflow *Déploiement* lance les tests, construit `dist/`, publie, puis vérifie le site en ligne.
5. Ouvrez l'adresse affichée dans l'onglet *Actions*. C'est fait.

Aucun secret n'est nécessaire : le déploiement utilise le jeton temporaire fourni par GitHub (`GITHUB_TOKEN`) avec des droits limités.

## 2. Environnements et variables

Les variables servent **uniquement au build** (`npm run build`). Elles sont toutes facultatives.

| Variable | Rôle | Défaut |
|---|---|---|
| `YOON_ENV` | `production` ou `staging` (préproduction : `noindex`, robots.txt fermé, titre suffixé) | `production` |
| `YOON_RELEASE` | identifiant de version affiché dans `version.json` et joint aux rapports d'erreurs | SHA du commit |
| `YOON_SITE_URL` | adresse publique (https) pour robots.txt et sitemap | vide |
| `YOON_PAYMENT_API` | adresse https du serveur de paiement (ajoutée à `connect-src`) ; voir [SERVEUR-PAIEMENT.md](SERVEUR-PAIEMENT.md) | vide : mode démo, paiements simulés |
| `YOON_REPORT_URL` | adresse https de collecte des erreurs et performances (ajoutée à `connect-src` de la CSP) | vide : désactivé |

Le build refuse une valeur invalide (adresse non https, environnement inconnu) au lieu de produire un site mal configuré. En local : `YOON_ENV=staging npm run build`, puis `npm run preview`.

**Ne jamais mettre de secret dans ces variables ni dans le code** : tout ce qui est dans `dist/` est public. `.env*` est ignoré par git et par Docker au cas où.

## 3. Sécurité

| Mesure | Où |
|---|---|
| Content-Security-Policy stricte : scripts uniquement du site et de cdnjs (QR), pas de script en ligne, pas d'objet, pas d'intégration dans un cadre | `scripts/security.js` → balise `<meta>` dans `index.html` + `_headers` + `nginx.conf` |
| `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (caméra, micro, géolocalisation, paiement coupés), `Cross-Origin-Opener-Policy`, HSTS | idem (en-têtes HTTP) |
| Toute saisie est échappée avant affichage (`esc()`) ; données relues du stockage validées | code + tests |
| Aucune donnée envoyée à un serveur : billets, ventes et favoris restent dans le navigateur | architecture |
| Supervision sans donnée personnelle : ni saisie, ni stockage local, plafond de 10 rapports par visite | `js/monitor.js` + test |
| Dépendances : aucune au runtime ; Playwright en développement seulement | `package.json` |
| Droits minimaux des workflows (`contents: read`, `pages: write` seulement au déploiement) | `.github/workflows/` |

Limites à connaître :
- **GitHub Pages ne permet pas de poser des en-têtes HTTP** : la CSP passe par la balise `<meta>`, mais `frame-ancestors`, HSTS et `X-Content-Type-Options` ne s'appliquent pas. HTTPS reste imposé par GitHub. Pour des en-têtes complets, hébergez sur Cloudflare Pages ou Netlify (le fichier `dist/_headers` est déjà prêt) ou avec Docker/nginx.
- La bibliothèque QR est chargée depuis cdnjs **sans contrôle d'intégrité (SRI)**. Pour l'ajouter : héberger le fichier dans `js/` (recommandé) ou ajouter l'attribut `integrity` dans `loadScript()`.
- Le paiement est simulé : ne branchez jamais un vrai paiement sans serveur ; les clés ne doivent jamais se trouver dans le navigateur.

## 4. Journaux, performances et alertes

**Disponibilité.** Le workflow *Surveillance* (`uptime.yml`) lance toutes les 30 minutes le test de fumée (`scripts/smoke.js`, 31 contrôles : page, ressources, types de contenu, en-têtes, temps de réponse, version, `/healthz`, 404). En cas d'échec il ouvre une issue « Site indisponible » (e-mail aux abonnés du dépôt) et la referme au retour à la normale. Il demande `YOON_SITE_URL`. Pour une alerte plus rapide ou par SMS, ajoutez un moniteur gratuit (UptimeRobot, Better Stack) sur `https://votre-site/healthz` (réponse `ok`).

**Erreurs et performances côté navigateur.** Avec `YOON_REPORT_URL`, chaque visiteur envoie (`sendBeacon`, texte brut) : les erreurs JavaScript et refus de promesse (dédoublonnés), et à la fermeture de la page les mesures LCP, CLS, TTFB et temps de chargement, avec `env`, `release` et la page. Il faut un point de réception : un service de journaux (Sentry, Better Stack, Logtail), une fonction serverless ou un petit serveur. Sans point de réception, rien n'est envoyé.

**Journaux d'accès.** Fournis par l'hébergeur (Cloudflare, Netlify, nginx `access_log`). Aucun journal applicatif côté serveur : il n'y a pas de serveur applicatif.

**Seuils conseillés** : LCP < 2,5 s (p75), CLS < 0,1, disponibilité > 99,9 %, aucune erreur JavaScript nouvelle après un déploiement (comparer par `release`).

## 5. Contrôles après lancement

Automatiques : le job `verify` de *Déploiement* exécute le test de fumée sur l'adresse publiée (6 essais, le temps de la propagation). Manuel, à tout moment :

```bash
node scripts/smoke.js https://votre-site --expect-env production --budget-ms 3000
```

Code de sortie 0 = tout va bien. Ajoutez `--strict-headers` sur un hébergeur qui pose les en-têtes (Cloudflare, Netlify, nginx) pour faire échouer le test s'ils manquent.

Vérification humaine de 2 minutes après un lancement : chercher un itinéraire, ouvrir les horaires d'une ligne, ajouter un billet au panier et le payer (simulé), basculer en thème sombre, ouvrir le site sur un téléphone.

## 6. Retour arrière

- **GitHub Pages** : *Actions → Déploiement → Run workflow* en choisissant un ancien commit, ou `git revert` du commit fautif puis push. Comptez 2 à 3 minutes.
- **Docker** : relancer l'image précédente (`docker run … yoon-urbain:<ancienne-version>`). Taguez chaque image avec `--build-arg YOON_RELEASE=<version>`.
- Les données des visiteurs ne sont jamais touchées par un déploiement (elles sont chez eux).

## 7. Hébergements alternatifs

| Hébergeur | Commande de build | Dossier publié | En-têtes |
|---|---|---|---|
| Cloudflare Pages / Netlify | `npm run build` | `dist` | `dist/_headers` lu automatiquement |
| Docker / nginx / VPS | `docker build -t yoon-urbain .` puis `docker run -p 8080:8080 yoon-urbain` | image | `nginx.conf` généré, `HEALTHCHECK` sur `/healthz` |
| Tout hébergement statique | `npm run build` | `dist` | CSP via `<meta>` seulement |

## 8. Ce qui a été vérifié, et ce qui ne l'a pas été

Vérifié par les tests automatiques : le build (fichiers, versionnage, refus de configuration invalide, préproduction), la CSP (le site fonctionne dessous, un script injecté est bloqué), la supervision (erreurs dédoublonnées, aucune saisie transmise, désactivée sans adresse), le test de fumée (réussit sur le site construit, échoue si un fichier manque, si l'environnement est faux ou si le site est injoignable).

Non vérifié (impossible sans compte d'hébergement ou sans démon Docker lors de la préparation) : l'exécution réelle des workflows GitHub, le déploiement sur un hébergeur, la construction de l'image Docker, le comportement de la CSP avec la vraie bibliothèque QR de cdnjs. Le premier déploiement doit donc être suivi dans l'onglet *Actions*.
