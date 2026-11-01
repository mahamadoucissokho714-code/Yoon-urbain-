'use strict';
/* Service worker : l'application s'ouvre et fonctionne sans réseau (horaires théoriques, billets enregistrés sur l'appareil).
   `npm run build` remplace VERSION et PRECACHE : chaque version du site a son propre cache, l'ancien est supprimé à l'activation.
   Non enregistré en développement (voir js/pwa.js). */
const VERSION = '__VERSION__';
const PRECACHE = /*__PRECACHE__*/[];
const CACHE = `yoon-${VERSION}`;
const QR_HOST = 'cdnjs.cloudflare.com'; // seule ressource externe mise en cache : la bibliothèque du QR code

const url = path => new URL(path, self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE.map(url))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('yoon-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request, target = new URL(req.url);
  if (req.method !== 'GET') return; // jamais d'interception des envois (paiements compris)

  if (req.mode === 'navigate') { // pages : réseau d'abord (version à jour), cache si hors ligne
    event.respondWith(fetch(req).catch(() => caches.match(url('index.html'))));
    return;
  }
  if (target.origin === self.location.origin) { // ressources du site : cache d'abord, sinon réseau puis mémorisation
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok && !/\/(sw\.js|healthz|version\.json)$/.test(target.pathname)) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  if (target.hostname === QR_HOST) { // bibliothèque QR : cache d'abord (réponse opaque acceptée), mise à jour discrète
    event.respondWith(caches.match(req).then(hit => {
      const fresh = fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; });
      return hit || fresh;
    }));
  }
  // Tout le reste (API de paiement, polices, rapports) passe directement par le réseau.
});
