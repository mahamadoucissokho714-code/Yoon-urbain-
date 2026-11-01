'use strict';
/* Site branché sur le vrai serveur de paiement (démarré dans le test). L'opérateur est joué par le test : il signe et envoie la confirmation. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../helpers/browser');
const { createServer, sign } = require('../../server/server');
const { PaymentStore } = require('../../server/payments');

const secrets = { orange: 'secret-orange-0123456789', wave: 'secret-wave-0123456789ab' };
let env, api, store, payServer;
test.before(async () => {
  env = await setup();
  store = new PaymentStore();
  payServer = createServer({ secrets, store, allowedOrigin: new URL(env.url).origin });
  await new Promise(r => payServer.listen(0, '127.0.0.1', r));
  api = `http://127.0.0.1:${payServer.address().port}`;
});
test.after(async () => {
  assert.deepEqual(env.errors.filter(e => !/status of 409/.test(e)), [], 'aucune erreur JavaScript');
  payServer.close(); await env.teardown();
});

const config = (extra = {}) => ({ config: { paymentApi: api, pollMs: 100, timeoutMs: 1500, ...extra } });

/** Joue l'opérateur : envoie la confirmation signée du paiement. */
async function operator(provider, ref, status) {
  const p = store.get(ref);
  const raw = JSON.stringify({ ref, status, amount: p.amount });
  return fetch(`${api}/webhooks/${provider}`, { method: 'POST', headers: { 'x-signature': sign(secrets[provider], raw) }, body: raw });
}
const lastRef = () => [...store.items.keys()].pop();

async function fillAndPay(page, method = 'wave') {
  await page.click('[data-action=add-cart][data-id=t90]');
  await page.fill('#cName', 'Awa Diop');
  await page.selectOption('#cMethod', method);
  await page.fill('#cPhone', '77 123 45 67');
  await page.click('#cSubmit');
}
const goTickets = async page => { await page.click('#nav a[href="#billets"]'); await page.waitForSelector('#nav a[href="#billets"][aria-current="page"]'); };

test('mode serveur : le billet n\'est délivré qu\'après la confirmation signée de l\'opérateur', async () => {
  const page = await env.newPage(undefined, config({ timeoutMs: 15000 }));
  await goTickets(page);
  assert.match(await page.textContent('#checkoutForm'), /dès que le serveur de paiement reçoit la confirmation/);
  const qrRef = (await (async () => { await page.click('[data-action=add-cart][data-id=t90]'); return page.getAttribute('#cQr', 'data-qr'); })()).split('|')[3];
  await page.fill('#cName', 'Awa Diop'); await page.selectOption('#cMethod', 'wave'); await page.fill('#cPhone', '77 123 45 67');
  await page.click('#cSubmit');
  await page.waitForFunction(() => /En attente de Wave/.test(document.querySelector('#cSubmit').textContent));
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.tk[data-tk]').count(), 0, 'pas de billet tant que l\'opérateur n\'a rien confirmé');
  assert.equal(lastRef(), qrRef, 'la référence du QR est celle du serveur');
  assert.equal(store.get(qrRef).status, 'pending');
  assert.equal((await operator('wave', qrRef, 'success')).status, 200);
  await page.waitForSelector('.tk[data-tk]', { timeout: 5000 });
  assert.match(await page.textContent('.tk[data-tk]'), /payé avec Wave/);
});

test('mode serveur : un refus de l\'opérateur ne délivre aucun billet et permet de réessayer avec une nouvelle référence', async () => {
  const page = await env.newPage(undefined, config({ timeoutMs: 15000 }));
  await goTickets(page);
  await fillAndPay(page, 'orange');
  await page.waitForFunction(() => /En attente de Orange/.test(document.querySelector('#cSubmit').textContent));
  const first = lastRef();
  await operator('orange', first, 'failed');
  await page.waitForFunction(() => /refusé/.test(document.querySelector('#cErr').textContent), null, { timeout: 5000 });
  assert.equal(await page.locator('.tk[data-tk]').count(), 0);
  assert.ok(await page.isEnabled('#cSubmit'), 'le bouton est de nouveau disponible');
  await page.click('#cSubmit');
  await page.waitForFunction(() => /En attente/.test(document.querySelector('#cSubmit').textContent));
  assert.notEqual(lastRef(), first, 'nouvelle référence après un refus');
});

test('mode serveur : sans confirmation, délai dépassé, message clair et même référence au nouvel essai', async () => {
  const page = await env.newPage(undefined, config({ timeoutMs: 600 }));
  await goTickets(page);
  await fillAndPay(page);
  await page.waitForFunction(() => /Pas encore de confirmation/.test(document.querySelector('#cErr').textContent), null, { timeout: 5000 });
  const ref = lastRef(), count = store.items.size;
  assert.equal(await page.locator('.tk[data-tk]').count(), 0);
  await page.click('#cSubmit');
  await page.waitForTimeout(300);
  assert.equal(store.items.size, count, 'le nouvel essai reprend la même référence, sans doublon');
  await operator('wave', ref, 'success');
  await page.waitForSelector('.tk[data-tk]', { timeout: 5000 });
});

test('mode serveur : serveur injoignable → erreur affichée, aucun billet délivré (jamais de repli silencieux sur la simulation)', async () => {
  const page = await env.newPage(undefined, config({ paymentApi: 'http://127.0.0.1:9' }));
  await goTickets(page);
  await fillAndPay(page);
  await page.waitForFunction(() => /injoignable/.test(document.querySelector('#cErr').textContent), null, { timeout: 5000 });
  assert.equal(await page.locator('.tk[data-tk]').count(), 0);
});

test('agence : aucun appel au serveur de paiement, la réservation reste possible', async () => {
  const page = await env.newPage(undefined, config());
  const before = store.items.size;
  await goTickets(page);
  await page.click('[data-action=add-cart][data-id=t90]');
  await page.fill('#cName', 'Awa Diop'); await page.selectOption('#cMethod', 'agence');
  await page.click('#cSubmit');
  await page.waitForFunction(() => /Réservation|réservation/.test(document.body.textContent), null, { timeout: 5000 });
  assert.equal(store.items.size, before);
});

test('pied de page : annonce le mode serveur, et la démo par défaut', async () => {
  const server = await env.newPage(undefined, config());
  assert.match(await server.textContent('#payNote'), /confirmés par le serveur de paiement/);
  const demo = await env.newPage();
  assert.match(await demo.textContent('#payNote'), /simulés/);
});
