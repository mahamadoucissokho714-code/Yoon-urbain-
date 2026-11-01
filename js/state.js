'use strict';
/* État de l'application : un seul objet, lu et modifié par les vues. */

const state = {
  plan: { from: '', to: '', when: 'now', time: '', pmr: false, results: null, sel: 0, error: '', fromId: null, toId: null, tomorrow: false },
  board: { stop: 'plateau', filter: new Set() },
  lines: { id: 'L1', dir: 0, day: todayType(), stopIdx: 0 },
  mapVisible: new Set(LINES.map(l => l.id)),
  cart: {},
  infoFilter: 'all',
  salesArmed: false,
  ticketBusy: false,
  payRef: null // référence du paiement en cours, partagée avec le QR de paiement
};

/** Vue affichée : { name, view }. */
const app = { name: '', view: null };
