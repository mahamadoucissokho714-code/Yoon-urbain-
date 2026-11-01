'use strict';
/* Supervision côté navigateur : erreurs JavaScript et mesures de performance, envoyées à YOON_CONFIG.reportUrl.
   Désactivé tant que reportUrl est vide. Aucune donnée personnelle : ni saisies, ni billets, ni stockage local. */
(() => {
  const cfg = window.YOON_CONFIG || {};
  if (!cfg.reportUrl) return;

  const MAX_REPORTS = 10, seen = new Set();
  let sent = 0;

  /** Envoie un rapport en texte brut (évite la requête préalable CORS). */
  function report(type, data) {
    if (sent >= MAX_REPORTS) return;
    const payload = JSON.stringify({ type, env: cfg.env, release: cfg.release, page: location.pathname + location.hash.split('?')[0], at: new Date().toISOString(), ...data });
    try { if (navigator.sendBeacon(cfg.reportUrl, new Blob([payload], { type: 'text/plain' }))) sent++; } catch (e) { /* la supervision ne doit jamais casser le site */ }
  }
  function reportOnce(type, data) {
    const key = type + (data.message || '') + (data.line || '');
    if (!seen.has(key)) { seen.add(key); report(type, data); }
  }

  window.addEventListener('error', e => reportOnce('error', { message: String(e.message).slice(0, 300), source: String(e.filename || '').split('/').slice(-2).join('/'), line: e.lineno, col: e.colno }));
  window.addEventListener('unhandledrejection', e => reportOnce('rejection', { message: String(e.reason && e.reason.message || e.reason).slice(0, 300) }));

  /* Performance : LCP et CLS, envoyés une fois quand la page passe en arrière-plan. */
  const vitals = { lcp: null, cls: 0 };
  try {
    new PerformanceObserver(list => { const last = list.getEntries().at(-1); if (last) vitals.lcp = Math.round(last.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) vitals.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  } catch (e) { /* navigateur sans ces mesures */ }
  let vitalsSent = false;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || vitalsSent) return;
    vitalsSent = true;
    const nav = performance.getEntriesByType('navigation')[0];
    report('vitals', { lcp: vitals.lcp, cls: Math.round(vitals.cls * 1000) / 1000, ttfb: nav ? Math.round(nav.responseStart) : null, load: nav ? Math.round(nav.loadEventEnd) : null });
  });
})();
