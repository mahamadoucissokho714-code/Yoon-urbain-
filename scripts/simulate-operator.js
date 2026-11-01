'use strict';
/* Joue l'opérateur en développement : envoie au serveur de paiement une confirmation signée.
   Usage : WEBHOOK_SECRET_WAVE=... node scripts/simulate-operator.js wave PAY-ABC123 success 1000 [http://localhost:8787]
   Ne sert qu'à tester : en production, c'est Orange Money ou Wave qui appelle le serveur. */
const { sign } = require('../server/server');

const [provider, ref, status, amount, base = 'http://localhost:8787'] = process.argv.slice(2);
const secret = process.env[`WEBHOOK_SECRET_${(provider || '').toUpperCase()}`];
if (!['orange', 'wave'].includes(provider) || !ref || !['success', 'failed'].includes(status) || !Number.isInteger(+amount) || !secret) {
  console.error('Usage : WEBHOOK_SECRET_<OPERATEUR>=... node scripts/simulate-operator.js <orange|wave> <référence> <success|failed> <montant FCFA> [adresse]');
  process.exit(1);
}
const raw = JSON.stringify({ ref, status, amount: +amount });
fetch(`${base.replace(/\/$/, '')}/webhooks/${provider}`, { method: 'POST', headers: { 'x-signature': sign(secret, raw) }, body: raw })
  .then(async r => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1); })
  .catch(e => { console.error('Serveur injoignable :', e.message); process.exit(1); });
