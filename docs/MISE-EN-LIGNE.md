# Mettre Yoon Urbain en ligne gratuitement (GitHub Pages)

Durée : 15 minutes la première fois. Coût : 0. Résultat : une adresse `https://VOTRE-COMPTE.github.io/yoon-urbain/` d'où le site s'installe comme une application.

> Je (Claude) ne peux pas créer votre compte ni publier à votre place : le dépôt doit appartenir à **votre** compte GitHub, et personne d'autre que vous ne doit connaître votre mot de passe. Tout ce qui précède la publication (tests, dépôt Git, workflows) est déjà prêt. Vérifié : le site construit fonctionne sous une adresse à sous-dossier comme `/yoon-urbain/` (installation et mode hors ligne compris) ; les workflows, eux, n'ont jamais tourné sur un vrai dépôt GitHub : leur premier lancement est leur premier vrai test.

## Avant de commencer

- Un compte GitHub gratuit : <https://github.com/signup>.
- Le projet décompressé (le zip contient déjà un dépôt Git avec un premier commit sur la branche `main`).
- **GitHub Desktop** (gratuit, le plus simple) : <https://desktop.github.com>. Ou la ligne de commande avec `git`.

## Étape 1 : créer le dépôt sur GitHub

1. Connectez-vous, puis **+ → New repository**.
2. Nom : `yoon-urbain`. Visibilité : **Public** (GitHub Pages est gratuit pour les dépôts publics ; pour un dépôt privé il faut un abonnement payant).
3. **Ne cochez rien** (ni README, ni .gitignore, ni licence) : le projet les a déjà. Cliquez **Create repository**.

## Étape 2 : activer GitHub Pages **avant** d'envoyer le code

1. Dans le dépôt : **Settings → Pages**.
2. *Build and deployment → Source* : choisir **GitHub Actions**. (Rien d'autre à régler.)

Si vous oubliez cette étape, le premier déploiement échoue avec « Get Pages site failed » : activez-la puis relancez (étape 5).

## Étape 3 : envoyer le projet

**Avec GitHub Desktop (recommandé)**
1. *File → Add local repository…* → choisissez le dossier `yoon-v2` décompressé.
2. *Publish repository* → décochez **Keep this code private** → *Publish*.
   (Si le nom du dépôt proposé diffère de `yoon-urbain`, remettez `yoon-urbain`.)

**En ligne de commande**
```bash
cd yoon-v2
git remote add origin https://github.com/VOTRE-COMPTE/yoon-urbain.git
git push -u origin main
```
GitHub n'accepte plus le mot de passe du compte : Git ouvre une fenêtre de connexion dans le navigateur, ou utilisez `gh auth login` (GitHub CLI).

Le premier commit est signé « Claude » : pour l'avoir à votre nom avant l'envoi, `git commit --amend --reset-author` après `git config user.name "Votre nom"` et `git config user.email "votre-adresse-github-noreply"`. Dans *Settings → Emails* de GitHub, cochez **Keep my email addresses private** pour ne pas exposer votre vraie adresse dans un dépôt public.

## Étape 4 : suivre le déploiement

1. Onglet **Actions** → workflow **Déploiement**. Il enchaîne : tests (unitaires puis navigateur) → construction → publication → test de fumée sur le site en ligne. Comptez 4 à 6 minutes.
2. Tout vert : l'adresse du site s'affiche dans le job **deploy** (et dans *Settings → Pages*).
3. Un test rouge = **rien n'est publié** (c'est voulu). Ouvrez le job en échec, lisez la dernière ligne rouge, corrigez, renvoyez.

## Étape 5 : relancer si besoin

*Actions → Déploiement → Run workflow* (branche `main`). Utile après avoir activé Pages en retard, ou pour revenir à une ancienne version (choisir un ancien commit).

## Étape 6 : renseigner l'adresse publique (recommandé)

*Settings → Secrets and variables → Actions → onglet **Variables** → New repository variable* :

| Nom | Valeur | Effet |
|---|---|---|
| `YOON_SITE_URL` | `https://VOTRE-COMPTE.github.io/yoon-urbain` (sans `/` final) | génère `robots.txt` et `sitemap.xml`, active la surveillance toutes les 30 min qui ouvre une issue si le site tombe |

Relancez le déploiement (étape 5) pour que la valeur soit prise en compte.

## Étape 7 : vérifier et installer

1. Ouvrez l'adresse sur votre téléphone : la page, les horaires, le plan, les billets et le QR d'arrêt doivent s'afficher.
2. Android/Chrome : bouton **Installer l'appli** (ou menu ⋮ → *Installer l'application*). iPhone/Safari : Partager → *Sur l'écran d'accueil*.
3. Coupez les données mobiles et rouvrez l'icône : l'application s'ouvre hors ligne.

## Mises à jour ensuite

Modifier, puis *Commit → Push* : le workflow republie tout seul. Les utilisateurs reçoivent la nouvelle version à leur prochaine ouverture avec réseau.

## Ce qui reste simulé

Le site publié est en **mode démo** : les paiements Orange Money et Wave sont simulés. Pour de vrais paiements, voir [SERVEUR-PAIEMENT.md](SERVEUR-PAIEMENT.md) (compte marchand, serveur HTTPS, variable `YOON_PAYMENT_API`). GitHub Pages ne peut pas héberger ce serveur.

## Dépannage

| Symptôme | Cause probable | Remède |
|---|---|---|
| « Get Pages site failed » | Pages pas activé sur *GitHub Actions* | étape 2, puis étape 5 |
| Le job `deploy` attend une approbation | règle de protection de l'environnement `github-pages` | *Settings → Environments → github-pages* : autoriser la branche `main` |
| Page blanche ou 404 | mauvaise adresse (oubli de `/yoon-urbain/`) | ouvrir l'adresse exacte affichée par le job `deploy` |
| Les tests passent chez moi, échouent sur GitHub | version de Node ou navigateur | lire le journal ; les workflows utilisent Node 20 |
| Aucune invitation d'installation | page ouverte en HTTP ou dans un navigateur intégré à une appli | ouvrir dans Chrome/Safari |
| Alerte « Site indisponible » | la surveillance a échoué | ouvrir l'issue ; elle se referme seule au retour du site |

## Limites

Ces étapes n'ont pas pu être exécutées de bout en bout ici : je n'ai pas accès à votre compte GitHub. Les tests, la construction et la syntaxe des workflows sont vérifiés ; l'enchaînement réel sur les serveurs de GitHub (Pages, Actions, permissions) ne le sera qu'au premier envoi.
