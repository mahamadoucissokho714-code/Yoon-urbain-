'use strict';
/* Construction de production : fichiers produits, sécurité, supervision, test de fumée.
   Le site est construit dans un dossier temporaire avec une adresse de rapports factice. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const DIST = fs.mkdtempSync(path.join(os.tmpdir(), 'yoon-dist-'));
const REPORT = 'https://logs.exemple.test/collect';
const build = env => spawnSync('node', ['scripts/build.js'], { cwd: ROOT, env: { ...process.env, YOON_DIST: DIST, ...env }, encoding: 'utf8' });

process.env.SITE_ROOT = DIST; // doit précéder le chargement du serveur
const first = build({ YOON_ENV: 'production', YOON_RELEASE: 'test-1', YOON_REPORT_URL: REPORT, YOON_SITE_URL: 'https://yoon.exemple.test' });
const { startServer } = require('../helpers/serve');
const { chromium } = require('playwright');
const { runSmoke } = require('../../scripts/smoke');

let server, url, browser;
test.before(async () => { ({ server, url } = await startServer()); browser = await chromium.launch(); });
test.after(async () => { await browser.close(); server.close(); fs.rmSync(DIST, { recursive: true, force: true }); });

test('build : produit le site complet, rien d\'autre', () => {
  assert.equal(first.status, 0, first.stderr);
  const files = JSON.parse(fs.readFileSync(path.join(DIST, 'version.json'), 'utf8')).files;
  for (const f of ['index.html', '404.html', 'config.js', 'healthz', 'robots.txt', 'sitemap.xml', '_headers', 'nginx.conf', 'css/styles.css', 'js/engine.js', 'js/monitor.js', 'js/payment-client.js', 'js/pwa.js', 'sw.js', 'manifest.webmanifest', 'icons/icon-512.png']) assert.ok(files.includes(f), `manquant : ${f}`);
  assert.ok(!files.some(f => /tests|docs|package|node_modules|\.md$/.test(f)), 'aucun fichier de développement dans dist');
});

test('build : configuration d\'environnement et versionnage', () => {
  const config = fs.readFileSync(path.join(DIST, 'config.js'), 'utf8');
  assert.match(config, /"release":"test-1"/);
  assert.match(config, new RegExp(REPORT.replace(/[/.]/g, '\\$&')));
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  assert.match(html, /css\/styles\.css\?v=[0-9a-f]{10}/, 'ressources versionnées');
  const v = JSON.parse(fs.readFileSync(path.join(DIST, 'version.json'), 'utf8'));
  assert.equal(v.reportUrl, undefined, 'version.json n\'expose pas l\'adresse des rapports');
  assert.match(fs.readFileSync(path.join(DIST, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/yoon\.exemple\.test\/sitemap\.xml/);
});

test('build : refuse une configuration dangereuse ou invalide', () => {
  assert.notEqual(build({ YOON_REPORT_URL: 'http://pas-securise.test' }).status, 0, 'rapports en http refusés');
  assert.notEqual(build({ YOON_REPORT_URL: 'pas une adresse' }).status, 0);
  assert.notEqual(build({ YOON_ENV: 'prod' }).status, 0);
  assert.notEqual(build({ YOON_SITE_URL: 'http://non-https.test' }).status, 0);
  assert.notEqual(build({ YOON_PAYMENT_API: 'http://paiement.test' }).status, 0, 'serveur de paiement en http refusé');
  assert.notEqual(build({ YOON_PAYMENT_API: 'pas une adresse' }).status, 0);
  build({ YOON_ENV: 'production', YOON_RELEASE: 'test-1', YOON_REPORT_URL: REPORT, YOON_SITE_URL: 'https://yoon.exemple.test' }); // restaure le build de référence
});

test('préproduction : indexation interdite', () => {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'yoon-stg-'));
  const r = spawnSync('node', ['scripts/build.js'], { cwd: ROOT, env: { ...process.env, YOON_DIST: staging, YOON_ENV: 'staging' }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(fs.readFileSync(path.join(staging, 'robots.txt'), 'utf8'), /Disallow: \//);
  assert.match(fs.readFileSync(path.join(staging, 'index.html'), 'utf8'), /noindex/);
  assert.ok(!fs.existsSync(path.join(staging, 'sitemap.xml')));
  fs.rmSync(staging, { recursive: true, force: true });
});

test('paiements : mode démo par défaut, serveur de paiement déclaré et autorisé par la CSP quand configuré', () => {
  assert.match(fs.readFileSync(path.join(DIST, 'config.js'), 'utf8'), /"paymentApi":""/, 'démo sans YOON_PAYMENT_API');
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'yoon-pay-dist-'));
  try {
    const r = build({ YOON_DIST: other, YOON_PAYMENT_API: 'https://paiement.exemple.test/', YOON_REPORT_URL: REPORT });
    assert.equal(r.status, 0, r.stderr);
    assert.match(fs.readFileSync(path.join(other, 'config.js'), 'utf8'), /"paymentApi":"https:\/\/paiement\.exemple\.test"/);
    const csp = fs.readFileSync(path.join(other, 'index.html'), 'utf8').match(/Content-Security-Policy" content="([^"]+)"/)[1];
    assert.match(csp, /connect-src 'self' https:\/\/logs\.exemple\.test https:\/\/paiement\.exemple\.test(;|$)/);
    assert.match(fs.readFileSync(path.join(other, '_headers'), 'utf8'), /paiement\.exemple\.test/, 'aussi dans les en-têtes HTTP');
  } finally { fs.rmSync(other, { recursive: true, force: true }); }
});

test('sécurité : la CSP n\'autorise que le nécessaire', () => {
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /script-src 'self' https:\/\/cdnjs\.cloudflare\.com(;|$)/, 'pas de script en ligne ni d\'eval');
  assert.doesNotMatch(csp, /unsafe-eval|script-src[^;]*unsafe-inline/);
  assert.match(csp, /connect-src 'self' https:\/\/logs\.exemple\.test(;|$)/, 'seule adresse de rapports autorisée');
  assert.match(csp, /object-src 'none'/);
  assert.match(fs.readFileSync(path.join(DIST, 'nginx.conf'), 'utf8'), /Strict-Transport-Security/);
});

test('navigateur : le site construit fonctionne sous CSP, un script injecté est bloqué', async () => {
  const page = await (await browser.newContext()).newPage();
  const problems = [];
  await page.route(/fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/, r => r.abort());
  page.on('pageerror', e => problems.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/net::/.test(m.text())) problems.push(m.text()); });
  await page.goto(url);
  assert.equal(await page.textContent('#app h1'), 'Où allez-vous ?');
  await page.fill('#pFrom', 'Plateau'); await page.fill('#pTo', 'Hann'); await page.click('#planForm button[type=submit]');
  assert.ok(await page.locator('.jcard').count() >= 1, 'le calcul d\'itinéraire fonctionne sous CSP');
  const blocked = await page.evaluate(() => new Promise(resolve => {
    document.addEventListener('securitypolicyviolation', e => resolve(e.violatedDirective), { once: true });
    const s = document.createElement('script'); s.textContent = 'window.__pwned = true'; document.body.appendChild(s);
    setTimeout(() => resolve('non bloqué'), 500);
  }));
  assert.match(blocked, /script-src/, 'un script en ligne est refusé');
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
  assert.deepEqual(problems.filter(p => !/inline script/i.test(p)), [], 'aucune erreur hors violation provoquée');
});

test('supervision : erreurs et performances remontées, sans doublon ni donnée personnelle', async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => { window.__beacons = []; navigator.sendBeacon = (u, d) => { d.text().then(t => window.__beacons.push({ url: u, body: JSON.parse(t) })); return true; }; });
  const page = await context.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/, r => r.abort());
  await page.goto(url);
  await page.evaluate(() => { for (let i = 0; i < 3; i++) setTimeout(() => { throw new Error('boom test'); }); Promise.reject(new Error('rejet test')); });
  await page.waitForTimeout(300);
  await page.goto(url + '#billets'); await page.fill('#cName', 'Nom Secret'); // saisie : ne doit jamais partir
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const beacons = await page.evaluate(() => window.__beacons);
  const errors = beacons.filter(b => b.body.type === 'error'), rejections = beacons.filter(b => b.body.type === 'rejection');
  assert.equal(errors.length, 1, 'la même erreur n\'est envoyée qu\'une fois');
  assert.equal(rejections.length, 1);
  assert.equal(errors[0].url, REPORT);
  assert.equal(errors[0].body.release, 'test-1');
  assert.equal(errors[0].body.env, 'production');
  assert.match(errors[0].body.message, /boom test/);
  assert.ok(!JSON.stringify(beacons).includes('Nom Secret'), 'aucune saisie transmise');
});

test('supervision : désactivée sans adresse de rapports', async () => {
  const page = await (await browser.newContext()).newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/, r => r.abort());
  await page.route('**/config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.YOON_CONFIG = { env: "development", release: "dev", reportUrl: "" };' })); // build sans adresse de rapports
  await page.addInitScript(() => { window.__sent = 0; navigator.sendBeacon = () => { window.__sent++; return true; }; });
  await page.goto(url);
  await page.evaluate(() => setTimeout(() => { throw new Error('x'); }));
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__sent), 0);
});

test('test de fumée : réussit sur le site construit, échoue sur un site cassé', async () => {
  const ok = await runSmoke(url, { expectEnv: 'production' });
  assert.ok(ok.ok, JSON.stringify(ok.checks.filter(c => !c.ok)));
  assert.ok(ok.checks.length >= 25);
  const wrongEnv = await runSmoke(url, { expectEnv: 'staging' });
  assert.equal(wrongEnv.ok, false, 'mauvais environnement détecté');
  const js = path.join(DIST, 'js', 'engine.js'), saved = fs.readFileSync(js);
  fs.rmSync(js);
  try {
    const broken = await runSmoke(url);
    assert.equal(broken.ok, false, 'un fichier manquant est détecté');
    assert.ok(broken.checks.some(c => !c.ok && /engine\.js/.test(c.name)));
  } finally { fs.writeFileSync(js, saved); }
  const down = await runSmoke('http://localhost:9');
  assert.equal(down.ok, false, 'site injoignable détecté');
});
