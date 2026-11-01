#!/usr/bin/env node
'use strict';
/* Test de fumée : vérifie qu'un site déployé répond correctement. Utilisé après chaque déploiement et toutes les 30 minutes
   (workflow uptime). Code de sortie 0 = tout va bien, 1 = au moins un contrôle a échoué.

   Usage : node scripts/smoke.js https://exemple.org/yoon [--budget-ms 3000] [--expect-env production] [--strict-headers] */

/** @returns {Promise<{ok:boolean, checks:{name:string, ok:boolean, detail:string, warn?:boolean}[]}>} */
async function runSmoke(baseUrl, { budgetMs = 3000, expectEnv = '', strictHeaders = false } = {}) {
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  const checks = [];
  const check = (name, ok, detail = '', warn = false) => checks.push({ name, ok, detail, warn });
  const get = async (path, init) => { const t0 = performance.now(); const res = await fetch(new URL(path, base), { redirect: 'follow', ...init }); return { res, ms: Math.round(performance.now() - t0) }; };

  let html = '';
  try {
    const { res, ms } = await get('./');
    html = await res.text();
    check('Page d\'accueil répond 200', res.status === 200, `HTTP ${res.status}`);
    check('Type de contenu HTML', /text\/html/.test(res.headers.get('content-type') || ''), res.headers.get('content-type') || 'absent');
    check(`Temps de réponse sous ${budgetMs} ms`, ms <= budgetMs, `${ms} ms`);
    check('Document complet (doctype, langue, viewport)', /^<!doctype html>/i.test(html) && /<html lang=/.test(html) && /name="viewport"/.test(html));
    check('Titre présent', /<title>Yoon Urbain/.test(html));
    const csp = res.headers.get('content-security-policy') || (html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
    check('Content-Security-Policy active', /default-src 'self'/.test(csp) && /object-src 'none'/.test(csp), csp ? 'présente' : 'absente');
    for (const header of ['x-content-type-options', 'referrer-policy', 'strict-transport-security']) {
      const present = !!res.headers.get(header);
      check(`En-tête ${header}`, present || !strictHeaders, present ? 'présent' : 'absent (non posable sur certains hébergements)', !present);
    }
    if (base.startsWith('https://') && !strictHeaders) { /* HTTPS déjà garanti par l'adresse */ }
  } catch (e) {
    check('Page d\'accueil joignable', false, e.message);
    return { ok: false, checks };
  }

  // Toutes les ressources locales référencées par la page doivent répondre
  const assets = [...html.matchAll(/(?:src|href)="((?:css|js)\/[^"]+|config\.js)"/g)].map(m => m[1]);
  check('Ressources référencées trouvées', assets.length >= 10, `${assets.length} ressources`);
  const expectedType = { css: /text\/css/, js: /javascript/ };
  for (const asset of assets) {
    try {
      const { res } = await get(asset);
      const ext = asset.split('?')[0].split('.').pop();
      check(`Ressource ${asset.split('?')[0]}`, res.status === 200 && expectedType[ext].test(res.headers.get('content-type') || ''), `HTTP ${res.status}`);
    } catch (e) { check(`Ressource ${asset}`, false, e.message); }
  }

  try {
    const { res } = await get('version.json', { cache: 'no-store' });
    const v = res.status === 200 ? await res.json() : null;
    check('version.json lisible', !!(v && v.release && v.builtAt), v ? `version ${v.release}, ${v.env}` : `HTTP ${res.status}`);
    if (expectEnv) check(`Environnement « ${expectEnv} »`, v && v.env === expectEnv, v ? v.env : 'inconnu');
  } catch (e) { check('version.json lisible', false, e.message); }

  try {
    const { res } = await get('healthz');
    check('Sonde /healthz', res.status === 200 && (await res.text()).trim() === 'ok', `HTTP ${res.status}`);
  } catch (e) { check('Sonde /healthz', false, e.message); }

  try {
    const { res } = await get('page-qui-n-existe-pas-' + Date.now());
    check('Adresse inconnue renvoie 404', res.status === 404, `HTTP ${res.status}`);
  } catch (e) { check('Adresse inconnue renvoie 404', false, e.message); }

  return { ok: checks.every(c => c.ok || c.warn), checks };
}

module.exports = { runSmoke };

if (require.main === module) {
  const args = process.argv.slice(2), url = args.find(a => /^https?:\/\//.test(a));
  const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : ''; };
  if (!url) { console.error('Usage : node scripts/smoke.js <url> [--budget-ms N] [--expect-env production] [--strict-headers]'); process.exit(2); }
  runSmoke(url, { budgetMs: Number(opt('--budget-ms')) || 3000, expectEnv: opt('--expect-env'), strictHeaders: args.includes('--strict-headers') }).then(({ ok, checks }) => {
    for (const c of checks) console.log(`${c.ok ? '✔' : c.warn ? '!' : '✘'} ${c.name}${c.detail ? ' : ' + c.detail : ''}`);
    console.log(ok ? `\nTout est en ordre (${checks.length} contrôles).` : `\n${checks.filter(c => !c.ok && !c.warn).length} contrôle(s) en échec.`);
    process.exit(ok ? 0 : 1);
  });
}
