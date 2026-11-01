'use strict';
/* Serveur de confirmation de paiement (sans dépendance). Lancer : npm run server */
const http = require('node:http');
const crypto = require('node:crypto');
const { PaymentStore } = require('./payments');

const MAX_BODY = 16 * 1024;
const PROVIDERS = ['orange', 'wave'];
const REF_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;
const PHONE_PATTERN = /^(\+?221)?7[05-8]\d{7}$/;

/** Signature HMAC-SHA256 (hexadécimal) du corps brut. À adapter au format exact imposé par chaque opérateur. */
const sign = (secret, rawBody) => crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

function validSignature(secret, rawBody, received) {
  if (typeof received !== 'string' || !/^[0-9a-f]{64}$/i.test(received)) return false;
  return crypto.timingSafeEqual(Buffer.from(sign(secret, rawBody), 'hex'), Buffer.from(received, 'hex'));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * @param {{ secrets: {orange: string, wave: string}, store: PaymentStore, allowedOrigin?: string, log?: Function }} opts
 */
function createServer({ secrets, store, allowedOrigin = '', log = () => {} }) {
  for (const p of PROVIDERS) if (!secrets[p] || secrets[p].length < 16) throw new Error(`Secret webhook manquant ou trop court (≥ 16 caractères) : ${p}`);

  return http.createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', Vary: 'Origin' } : {})
      });
      res.end(JSON.stringify(body));
    };
    try {
      const url = new URL(req.url, 'http://localhost'), route = `${req.method} ${url.pathname}`;
      if (req.method === 'OPTIONS') return send(204, {});
      if (route === 'GET /health') return send(200, { ok: true });

      let m;
      if (req.method === 'GET' && (m = url.pathname.match(/^\/api\/payments\/([\w-]+)$/))) {
        const p = store.get(m[1]);
        return p ? send(200, { ref: p.ref, status: p.status }) : send(404, { error: 'Paiement inconnu' });
      }

      if (route === 'POST /api/payments') {
        const raw = await readBody(req); let b;
        try { b = JSON.parse(raw.toString('utf8')); } catch { return send(400, { error: 'JSON invalide' }); }
        if (!b || !REF_PATTERN.test(b.ref || '')) return send(400, { error: 'Référence invalide' });
        if (!PROVIDERS.includes(b.method)) return send(400, { error: 'Moyen de paiement inconnu' });
        if (!Number.isInteger(b.amount) || b.amount <= 0 || b.amount > 1_000_000) return send(400, { error: 'Montant invalide (entier en FCFA)' });
        if (!PHONE_PATTERN.test(b.phone || '')) return send(400, { error: 'Numéro invalide' });
        const r = store.create({ ref: b.ref, amount: b.amount, method: b.method, phone: b.phone });
        log('create', b.ref);
        return r.ok ? send(201, { ref: b.ref, status: 'pending' }) : send(409, { error: 'Référence déjà utilisée' });
      }

      if (req.method === 'POST' && (m = url.pathname.match(/^\/webhooks\/(orange|wave)$/))) {
        const provider = m[1], raw = await readBody(req);
        if (!validSignature(secrets[provider], raw, req.headers['x-signature'])) { log('bad-signature', provider); return send(401, { error: 'Signature invalide' }); }
        let b;
        try { b = JSON.parse(raw.toString('utf8')); } catch { return send(400, { error: 'JSON invalide' }); }
        if (!b || !['success', 'failed'].includes(b.status)) return send(400, { error: 'Statut invalide' });
        const r = store.confirm(b.ref, provider, b.status, b.amount);
        log('webhook', provider, b.ref, r.ok ? b.status : r.code);
        if (r.ok) return send(200, { ref: b.ref, status: r.payment.status, replay: r.replay });
        const status = { unknown: 404, 'wrong-provider': 409, 'amount-mismatch': 409, conflict: 409 }[r.code];
        return send(status, { error: r.code });
      }
      send(404, { error: 'Introuvable' });
    } catch (e) {
      if (e.status === 413) return send(413, { error: 'Corps trop volumineux' });
      log('error', e.message); send(500, { error: 'Erreur interne' });
    }
  });
}

module.exports = { createServer, sign, validSignature };

if (require.main === module) {
  const env = process.env;
  try {
    const server = createServer({
      secrets: { orange: env.WEBHOOK_SECRET_ORANGE || '', wave: env.WEBHOOK_SECRET_WAVE || '' },
      store: new PaymentStore(env.DATA_FILE || 'server/data/payments.json'),
      allowedOrigin: env.ALLOWED_ORIGIN || '',
      log: (...a) => console.log(new Date().toISOString(), ...a)
    });
    server.listen(+env.PORT || 8787, () => console.log(`Serveur de paiement sur le port ${server.address().port}`));
  } catch (e) { console.error(e.message); process.exit(1); }
}
