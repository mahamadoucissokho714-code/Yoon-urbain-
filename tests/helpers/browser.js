'use strict';
/* Fixture e2e : serveur statique + Chromium, une page neuve (stockage vide) par test.
   Les polices Google et la bibliothèque QR (CDN) sont bloquées pour que les tests soient rapides et déterministes. */
const { chromium } = require('playwright');
const { startServer } = require('./serve');

async function setup() {
  const { server, url } = await startServer();
  const browser = await chromium.launch();
  const errors = [];

  async function newPage(viewport = { width: 1280, height: 900 }, { config = null } = {}) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.route(/fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/, route => route.abort());
    if (config) await page.route('**/config.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.YOON_CONFIG = ${JSON.stringify({ env: 'development', release: 'test', reportUrl: '', ...config })};` }));
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) errors.push(m.text()); });
    await page.goto(url);
    return page;
  }
  const teardown = async () => { await browser.close(); server.close(); };
  return { newPage, errors, teardown, url };
}

module.exports = { setup };
