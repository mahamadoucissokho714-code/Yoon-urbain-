'use strict';
/* Client du serveur de paiement (voir server/ et docs/SERVEUR-PAIEMENT.md).
   Mode démo : sans YOON_CONFIG.paymentApi, le site simule le paiement et n'appelle aucun serveur.
   Mode serveur : un billet n'est délivré que si le serveur confirme « success ». */

const PAY_DEFAULTS = { pollMs: 2000, timeoutMs: 120000 };
const payConfig = () => ({ ...PAY_DEFAULTS, ...(window.YOON_CONFIG || {}) });
const paymentServerOn = () => Boolean(payConfig().paymentApi);

class PaymentError extends Error {
  /** @param {'network'|'rejected'|'failed'|'timeout'|'invalid'} kind */
  constructor(kind, message) { super(message); this.kind = kind; }
}

async function payFetch(path, options) {
  const base = payConfig().paymentApi.replace(/\/$/, '');
  let res;
  try { res = await fetch(base + path, { cache: 'no-store', ...options }); }
  catch (e) { throw new PaymentError('network', 'Serveur de paiement injoignable. Réessayez dans un instant.'); }
  let body = {};
  try { body = await res.json(); } catch (e) { /* corps vide ou non JSON */ }
  return { res, body };
}

/** Enregistre le paiement. Une référence déjà connue (nouvel essai) est reprise, pas dupliquée. */
async function createPayment({ ref, amount, method, phone }) {
  const { res, body } = await payFetch('/api/payments', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref, amount, method, phone })
  });
  if (res.status === 201 || res.status === 409) return;
  throw new PaymentError(res.status === 400 ? 'invalid' : 'rejected', body.error || 'Paiement refusé par le serveur.');
}

/** Attend la confirmation de l'opérateur. Renvoie si « success », lève sinon. */
async function waitForPayment(ref) {
  const { pollMs, timeoutMs } = payConfig(), deadline = Date.now() + timeoutMs;
  for (;;) {
    const { res, body } = await payFetch(`/api/payments/${encodeURIComponent(ref)}`);
    if (res.ok && body.status === 'success') return;
    if (res.ok && body.status === 'failed') throw new PaymentError('failed', "Le paiement a été refusé par l'opérateur. Aucune somme n'a été prélevée.");
    if (!res.ok) throw new PaymentError('rejected', body.error || 'Paiement introuvable.');
    if (Date.now() + pollMs > deadline) throw new PaymentError('timeout', "Pas encore de confirmation de l'opérateur. Ne payez pas une seconde fois : cliquez sur « Payer » pour vérifier à nouveau.");
    await new Promise(r => setTimeout(r, pollMs));
  }
}
