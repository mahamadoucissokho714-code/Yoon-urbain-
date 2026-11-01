'use strict';
/* Serveur de confirmation de paiement : signatures, idempotence, montants, limites. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createServer, sign } = require('../../server/server');
const { PaymentStore } = require('../../server/payments');

const secrets = { orange: 'secret-orange-0123456789', wave: 'secret-wave-0123456789ab' };
let server, base, store;
test.before(async () => {
  store = new PaymentStore();
  server = createServer({ secrets, store, allowedOrigin: 'https://exemple.sn' });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const post = (url, body, headers = {}) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const create = (ref, extra = {}) => post('/api/payments', { ref, amount: 500, method: 'wave', phone: '771234567', ...extra });
const hook = (provider, payload, secret = secrets[provider]) => { const raw = JSON.stringify(payload); return post(`/webhooks/${provider}`, raw, { 'x-signature': sign(secret, raw) }); };
const status = async ref => (await (await fetch(`${base}/api/payments/${ref}`)).json()).status;

test('démarrage refusé sans secrets suffisants', () => {
  assert.throws(() => createServer({ secrets: { orange: 'court', wave: '' }, store: new PaymentStore() }), /Secret webhook/);
});

test('création : champs validés, doublon refusé', async () => {
  assert.equal((await create('REF-0001')).status, 201);
  assert.equal((await create('REF-0001')).status, 409);
  assert.equal((await create('x')).status, 400, 'référence trop courte');
  assert.equal((await create('REF-0002', { amount: 0 })).status, 400);
  assert.equal((await create('REF-0002', { amount: 12.5 })).status, 400);
  assert.equal((await create('REF-0002', { method: 'carte' })).status, 400);
  assert.equal((await create('REF-0002', { phone: '123' })).status, 400);
  assert.equal((await post('/api/payments', '{pas du json')).status, 400);
});

test('confirmation signée : le paiement passe de pending à success, rejouable sans effet', async () => {
  await create('REF-0010');
  assert.equal(await status('REF-0010'), 'pending');
  const r = await hook('wave', { ref: 'REF-0010', status: 'success', amount: 500 });
  assert.equal(r.status, 200);
  assert.equal(await status('REF-0010'), 'success');
  const again = await hook('wave', { ref: 'REF-0010', status: 'success', amount: 500 });
  assert.equal(again.status, 200);
  assert.equal((await again.json()).replay, true);
});

test('signature absente, fausse ou d\'un autre opérateur : refusée, paiement inchangé', async () => {
  await create('REF-0020');
  const raw = JSON.stringify({ ref: 'REF-0020', status: 'success', amount: 500 });
  assert.equal((await post('/webhooks/wave', raw)).status, 401);
  assert.equal((await post('/webhooks/wave', raw, { 'x-signature': 'abc' })).status, 401);
  assert.equal((await hook('wave', { ref: 'REF-0020', status: 'success', amount: 500 }, secrets.orange)).status, 401);
  assert.equal(await status('REF-0020'), 'pending');
});

test('corps modifié après signature : refusé', async () => {
  await create('REF-0030');
  const signed = JSON.stringify({ ref: 'REF-0030', status: 'failed', amount: 500 });
  const tampered = JSON.stringify({ ref: 'REF-0030', status: 'success', amount: 500 });
  assert.equal((await post('/webhooks/wave', tampered, { 'x-signature': sign(secrets.wave, signed) })).status, 401);
  assert.equal(await status('REF-0030'), 'pending');
});

test('montant différent, mauvais opérateur, référence inconnue, statut contradictoire', async () => {
  await create('REF-0040');
  assert.equal((await hook('wave', { ref: 'REF-0040', status: 'success', amount: 100 })).status, 409);
  assert.equal((await hook('orange', { ref: 'REF-0040', status: 'success', amount: 500 })).status, 409);
  assert.equal((await hook('wave', { ref: 'REF-9999', status: 'success', amount: 500 })).status, 404);
  assert.equal((await hook('wave', { ref: 'REF-0040', status: 'peut-etre', amount: 500 })).status, 400);
  assert.equal(await status('REF-0040'), 'pending');
  await hook('wave', { ref: 'REF-0040', status: 'failed', amount: 500 });
  assert.equal((await hook('wave', { ref: 'REF-0040', status: 'success', amount: 500 })).status, 409, 'un paiement échoué ne devient pas réussi');
  assert.equal(await status('REF-0040'), 'failed');
});

test('corps trop volumineux, route inconnue, santé, CORS', async () => {
  assert.equal((await post('/api/payments', 'x'.repeat(20000)).catch(() => ({ status: 413 }))).status, 413);
  assert.equal((await fetch(base + '/nimporte')).status, 404);
  assert.equal((await fetch(base + '/health')).status, 200);
  assert.equal((await fetch(base + '/health')).headers.get('access-control-allow-origin'), 'https://exemple.sn');
});

test('persistance : les paiements survivent à un redémarrage', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'yoon-pay-')), 'p.json');
  const a = new PaymentStore(file);
  a.create({ ref: 'REF-0100', amount: 300, method: 'orange', phone: '771234567' });
  a.confirm('REF-0100', 'orange', 'success', 300);
  assert.equal(new PaymentStore(file).get('REF-0100').status, 'success');
  fs.writeFileSync(file, '{corrompu');
  assert.throws(() => new PaymentStore(file), /illisible/);
});
