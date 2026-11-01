'use strict';
/* Application installable : manifeste, icônes, service worker et fonctionnement hors ligne, sur le site construit (sous CSP). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const DIST = fs.mkdtempSync(path.join(os.tmpdir(), 'yoon-pwa-'));
const built = spawnSync('node', ['scripts/build.js'], { cwd: ROOT, env: { ...process.env, YOON_DIST: DIST, YOON_ENV: 'production', YOON_RELEASE: 'pwa-1' }, encoding: 'utf8' });
process.env.SITE_ROOT = DIST; // doit précéder le chargement du serveur
const { startServer } = require('../helpers/serve');
const { chromium } = require('playwright');

let server, url, browser;
const errors = [];
test.before(async () => { ({ server, url } = await startServer()); browser = await chromium.launch(); });
test.after(async () => {
  await browser.close(); server.close(); fs.rmSync(DIST, { recursive: true, force: true });
  assert.deepEqual(errors, [], 'aucune erreur JavaScript ni violation de la politique de sécurité');
});

async function open() {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
  await context.route(/fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/, r => r.abort());
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  return { context, page };
}

test('manifeste : installable (nom, mode autonome, icônes réelles, maskable, raccourcis)', () => {
  assert.equal(built.status, 0, built.stderr);
  const m = JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.lang, 'fr');
  assert.ok(m.name && m.short_name && m.start_url && m.scope && m.theme_color && m.background_color);
  const sizes = m.icons.map(i => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'), 'icônes 192 et 512 exigées pour l\'installation');
  assert.ok(m.icons.some(i => i.purpose === 'maskable'), 'icône adaptative Android');
  for (const i of m.icons) {
    const file = path.join(DIST, i.src), png = fs.readFileSync(file);
    assert.equal(png.readUInt32BE(16), +i.sizes.split('x')[0], `${i.src} a bien la taille annoncée`);
  }
  assert.ok(m.shortcuts.length >= 2);
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /apple-touch-icon/);
});

test('service worker : marqueurs remplacés, version propre à ce build, tout le nécessaire mémorisé', () => {
  const sw = fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8');
  assert.doesNotMatch(sw, /__VERSION__|__PRECACHE__/);
  const list = JSON.parse(sw.match(/const PRECACHE = (\[.*\]);/)[1]);
  for (const f of ['index.html', 'manifest.webmanifest', 'config.js']) assert.ok(list.includes(f), `non mémorisé : ${f}`);
  assert.ok(list.some(f => /^js\/engine\.js\?v=/.test(f)) && list.some(f => /^css\/styles\.css\?v=/.test(f)), 'ressources versionnées avec leur empreinte');
  list.forEach(f => assert.ok(fs.existsSync(path.join(DIST, f.split('?')[0])), `fichier absent : ${f}`));
  const files = JSON.parse(fs.readFileSync(path.join(DIST, 'version.json'), 'utf8')).files;
  assert.ok(files.includes('sw.js') && files.includes('icons/icon-512.png'));
});

test('hors ligne : le site construit s\'ouvre et se parcourt sans réseau, bouton Installer caché', async () => {
  const { context, page } = await open();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // la page est maintenant contrôlée par le service worker
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  const cached = await page.evaluate(async () => (await (await caches.open((await caches.keys())[0])).keys()).length);
  assert.ok(cached >= 15, `ressources mémorisées : ${cached}`);
  assert.ok(await page.locator('#installBtn').isHidden(), 'pas d\'invitation tant que le navigateur n\'en propose pas');

  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('#nav a[aria-current="page"]');
  assert.ok(await page.locator('#planForm').count() >= 1, 'le calculateur d\'itinéraire s\'affiche hors ligne');
  await page.click('#nav a[href="#billets"]');
  await page.waitForSelector('#nav a[href="#billets"][aria-current="page"]');
  assert.ok(await page.locator('#checkoutForm').count() === 1, 'la page Billets fonctionne hors ligne');
  await context.close();
});

test('mise à jour : une nouvelle version supprime l\'ancien cache', async () => {
  const { context, page } = await open();
  await page.evaluate(() => navigator.serviceWorker.ready);
  const before = await page.evaluate(() => caches.keys());
  assert.equal(before.length, 1);
  // Simule l'ancien cache d'une version précédente, puis relance l'activation avec un nouveau service worker.
  await page.evaluate(() => caches.open('yoon-ancienne-version'));
  const swPath = path.join(DIST, 'sw.js'), original = fs.readFileSync(swPath, 'utf8');
  fs.writeFileSync(swPath, original.replace(/const VERSION = "[^"]+"/, 'const VERSION = "nouvelle"'));
  try {
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
    await page.waitForFunction(async () => (await caches.keys()).join() === 'yoon-nouvelle', null, { timeout: 8000 });
  } finally { fs.writeFileSync(swPath, original); }
  await context.close();
});
