'use strict';
/* Registre des paiements : création, confirmation idempotente, persistance dans un fichier JSON. */
const fs = require('node:fs');
const path = require('node:path');

const FINAL = new Set(['success', 'failed']);

class PaymentStore {
  /** @param {string|null} file Fichier JSON ; null = mémoire seule (tests). */
  constructor(file = null) {
    this.file = file;
    this.items = new Map();
    if (file && fs.existsSync(file)) {
      try { JSON.parse(fs.readFileSync(file, 'utf8')).forEach(p => this.items.set(p.ref, p)); }
      catch (e) { throw new Error(`Fichier de paiements illisible (${file}) : ${e.message}`); }
    }
  }

  get(ref) { return this.items.get(ref) || null; }

  create({ ref, amount, method, phone }) {
    if (this.items.has(ref)) return { ok: false, code: 'exists' };
    const payment = { ref, amount, method, phone, status: 'pending', createdAt: new Date().toISOString(), confirmedAt: null };
    this.items.set(ref, payment); this.save();
    return { ok: true, payment };
  }

  /** Applique la confirmation d'un opérateur. Rejouer la même confirmation ne change rien. */
  confirm(ref, provider, status, amount) {
    const p = this.items.get(ref);
    if (!p) return { ok: false, code: 'unknown' };
    if (p.method !== provider) return { ok: false, code: 'wrong-provider' };
    if (amount !== p.amount) return { ok: false, code: 'amount-mismatch' };
    if (FINAL.has(p.status)) return p.status === status ? { ok: true, payment: p, replay: true } : { ok: false, code: 'conflict' };
    p.status = status; p.confirmedAt = new Date().toISOString(); this.save();
    return { ok: true, payment: p, replay: false };
  }

  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify([...this.items.values()], null, 2));
    fs.renameSync(tmp, this.file); // écriture atomique : jamais de fichier à moitié écrit
  }
}

module.exports = { PaymentStore };
