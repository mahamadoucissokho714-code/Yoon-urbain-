'use strict';
/* Tableau de bord : agrégats des ventes, moyens de paiement, période, billets, réseau. Pur : sans navigateur. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('../helpers/load');

const d = load(['js/core.js', 'js/data.js', 'js/engine.js', 'js/state.js', 'js/components.js', 'js/charts.js', 'js/views/tickets.js', 'js/views/dashboard.js'],
  ['dashboardModel', 'demoSales', 'dayStart', 'DASH_MAX_BARS', 'barRows', 'niceMax', 'PRODUCT', 'LINES', 'STOP_LIST']);

const NOW = new Date(2026, 10, 1, 15, 0, 0).getTime();   // dimanche 1er novembre 2026, 15 h
const H = 3600e3, DAY = 24 * H;
const empty = { sales: [], tickets: [], resa: [], favs: [], trips: [], requests: [] };
const sale = (pid, method, at, extra = {}) => ({ pid, price: d.PRODUCT[pid].price, method, at, ...extra });
const model = (data, range = '7') => plain(d.dashboardModel({ ...empty, ...data }, range, NOW));

test('sans donnée : tout est à zéro, rien ne plante, les moyens de paiement restent listés', () => {
  const m = model({});
  assert.equal(m.sales, 0); assert.equal(m.total, 0); assert.equal(m.average, 0); assert.equal(m.hasSales, false);
  assert.deepEqual(m.methods.map(x => [x.id, x.n, x.share]), [['orange', 0, 0], ['wave', 0, 0]]);
  assert.equal(m.days.length, 7);
  assert.ok(m.days.every(x => x.n === 0 && x.ca === 0));
});

test('totaux, panier moyen et ventes du jour', () => {
  const m = model({ sales: [sale('t90', 'wave', NOW - H), sale('day', 'orange', NOW - 2 * H), sale('month', 'wave', NOW - 3 * DAY)] });
  assert.equal(m.sales, 3);
  assert.equal(m.total, 300 + 1000 + 17000);
  assert.equal(m.average, Math.round(18300 / 3));
  assert.deepEqual(m.today, { n: 2, ca: 1300 });
});

test('répartition par moyen de paiement : montants, parts, ancien mobile money', () => {
  const m = model({ sales: [sale('day', 'wave', NOW - H), sale('day', 'wave', NOW - H), sale('day', 'orange', NOW - H), sale('t90', undefined, NOW - H)] });
  const by = Object.fromEntries(m.methods.map(x => [x.id, x]));
  assert.deepEqual([by.wave.n, by.wave.ca], [2, 2000]);
  assert.deepEqual([by.orange.n, by.orange.ca], [1, 1000]);
  assert.deepEqual([by.legacy.n, by.legacy.ca, by.legacy.label], [1, 300, 'Mobile money (ancien)'], 'ventes anciennes sans moyen enregistré');
  assert.equal(m.methods.reduce((a, x) => a + x.ca, 0), m.total, 'la somme des moyens égale le total');
  assert.equal(by.wave.share, Math.round(2000 / 3300 * 100));
});

test('période : 7 jours exclut les ventes plus anciennes, « tout » les garde', () => {
  const data = { sales: [sale('t90', 'wave', NOW - H), sale('t90', 'wave', NOW - 10 * DAY), sale('t90', 'wave', NOW - 40 * DAY)] };
  assert.equal(model(data, '7').sales, 1);
  assert.equal(model(data, '30').sales, 2);
  assert.equal(model(data, 'all').sales, 3);
  assert.equal(model(data, 'inconnue').sales, 1, 'une période inconnue retombe sur 7 jours');
});

test('ventes futures ignorées ; série quotidienne : un jour par barre, ventes au bon jour', () => {
  const m = model({ sales: [sale('day', 'wave', NOW - H), sale('day', 'wave', NOW + 2 * H), sale('t90', 'orange', NOW - 2 * DAY)] });
  assert.equal(m.sales, 2, 'une vente datée du futur est ignorée');
  assert.equal(m.days.length, 7);
  const last = m.days[6], twoAgo = m.days[4];
  assert.deepEqual([last.n, last.ca], [1, 1000]);
  assert.deepEqual([twoAgo.n, twoAgo.ca], [1, 300]);
  assert.equal(m.days.reduce((a, x) => a + x.ca, 0), m.total, 'la somme des jours égale le total');
});

test('« tout » : barres limitées aux derniers jours, totaux sur toute la période', () => {
  const m = model({ sales: [sale('t90', 'wave', NOW - 200 * DAY), sale('t90', 'wave', NOW - H)] }, 'all');
  assert.equal(m.days.length, d.DASH_MAX_BARS);
  assert.equal(m.sales, 2);
});

test('ventes par titre : tous les titres listés, parts cohérentes', () => {
  const m = model({ sales: [sale('week', 'wave', NOW - H), sale('t90', 'wave', NOW - H)] });
  assert.equal(m.products.length, 5);
  assert.equal(m.products.find(p => p.id === 'week').n, 1);
  assert.equal(m.products.find(p => p.id === 'stud').n, 0);
  assert.ok(Math.abs(m.products.reduce((a, p) => a + p.share, 0) - 100) <= 2, 'parts arrondies : somme proche de 100');
});

test('billets, réservations, activité et réseau', () => {
  const tk = (activatedAt, expiresAt) => ({ id: 'x', pid: 't90', name: 'A', createdAt: NOW, activatedAt, expiresAt });
  const m = d.dashboardModel({ ...empty,
    tickets: [tk(null, null), tk(Date.now() - H, Date.now() + H), tk(Date.now() - 3 * H, Date.now() - H)],
    resa: [{ code: 'RS-1', total: 600, until: NOW + H }, { code: 'RS-2', total: 900, until: NOW - H }],
    favs: ['plateau', 'fann'], trips: [{}], requests: [{}, {}, {}] }, '7', NOW);
  assert.deepEqual(plain(m.wallet), { new: 1, active: 1, expired: 1 });
  assert.deepEqual(plain(m.reservations), { n: 1, total: 600 }, 'une réservation expirée n\'est pas comptée');
  assert.deepEqual(plain(m.activity), { favs: 2, trips: 1, requests: 3 });
  assert.equal(m.network.lines, d.LINES.length);
  assert.equal(m.network.stops, d.STOP_LIST.length);
  assert.ok(m.network.pmr > 0 && m.network.pmr <= m.network.stops);
});

test('dernières ventes : 10 maximum, plus récentes d\'abord', () => {
  const sales = Array.from({ length: 15 }, (_, i) => sale('t90', 'wave', NOW - (i + 1) * H));
  const m = model({ sales });
  assert.equal(m.recent.length, 10);
  assert.ok(m.recent.every((s, i) => i === 0 || s.at <= m.recent[i - 1].at));
});

test('ventes de démonstration : reproductibles, marquées, jamais dans le futur, 30 jours', () => {
  const a = plain(d.demoSales(NOW)), b = plain(d.demoSales(NOW));
  assert.deepEqual(a, b, 'même résultat à chaque appel');
  assert.ok(a.length > 100);
  assert.ok(a.every(s => s.demo === true && s.at <= NOW && s.at >= d.dayStart(NOW, -29) && s.price === d.PRODUCT[s.pid].price));
  assert.ok(new Set(a.map(s => s.method)).size === 2, 'Orange Money et Wave présents');
  assert.ok(a.some(s => s.pid === 't90') && a.some(s => s.pid === 'month'));
});

test('barres : largeur proportionnelle, texte échappé, ligne vide sans barre', () => {
  const html = d.barRows([{ label: '<b>A</b>', n: 2, ca: 200, share: 67, color: 'red' }, { label: 'B', n: 1, ca: 100, share: 33 }, { label: 'C', n: 0, ca: 0, share: 0 }]);
  assert.doesNotMatch(html, /<b>A<\/b>/);
  assert.match(html, /width:100%/); assert.match(html, /width:50%/); assert.match(html, /width:0%/);
  assert.equal(d.niceMax(0), 1);
  assert.equal(d.niceMax(1730), 2000);
  assert.equal(d.niceMax(22000), 24000, 'repères entiers : 6 k, 12 k, 18 k, 24 k');
  for (const v of [1, 7, 130, 999, 1730, 22000, 97100, 450000]) { const max = d.niceMax(v); assert.ok(max >= v); const tick = max / 4; assert.equal(tick % (tick >= 1000 ? 100 : 0.25), 0, `repères propres pour ${v}`); }
});
