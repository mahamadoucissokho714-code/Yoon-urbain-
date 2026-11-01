'use strict';
/* Application installable : enregistrement du service worker et bouton « Installer ». Chargé après app.js. */

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
let installPrompt = null;

function setInstallButton(visible) { const b = $('#installBtn'); if (b) b.hidden = !visible; }

/** Hors développement uniquement : un service worker en développement garderait d'anciens fichiers en cache. */
function registerServiceWorker() {
  const cfg = window.YOON_CONFIG || {};
  if (!('serviceWorker' in navigator) || cfg.env === 'development') return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) toast('Mise à jour installée : elle sera active au prochain lancement.');
  });
  navigator.serviceWorker.register('sw.js').catch(() => { /* sans service worker, le site reste utilisable en ligne */ });
}

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; setInstallButton(true); });
window.addEventListener('appinstalled', () => { installPrompt = null; setInstallButton(false); toast('Application installée'); });

ACTIONS.install = async () => {
  if (installPrompt) {
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') installPrompt = null;
    return;
  }
  toast(isIos() ? 'Sur iPhone : touchez Partager, puis « Sur l\'écran d\'accueil ».' : 'Utilisez le menu du navigateur : « Installer l\'application » ou « Ajouter à l\'écran d\'accueil ».');
};

if (!isStandalone() && isIos()) setInstallButton(true); // Safari iOS n'envoie pas d'invitation : on affiche le mode d'emploi
registerServiceWorker();
