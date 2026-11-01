'use strict';
/* Intégrité des données : une faute de frappe dans un identifiant doit casser ces tests, pas le site. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('../helpers/load');

const d = load(['js/core.js', 'js/data.js'], ['STOPS', 'LINES', 'STOP_LD', 'PRODUCTS', 'PRODUCT', 'SINGLE_TICKET', 'ALERTS', 'DAY_TYPES', 'STOP_LIST']);

test('chaque ligne référence uniquement des arrêts existants, sans doublon', () => {
  for (const line of d.LINES) {
    assert.ok(line.stops.length >= 2, `${line.id} : au moins 2 arrêts`);
    assert.equal(new Set(line.stops).size, line.stops.length, `${line.id} : arrêt répété`);
    line.stops.forEach(id => assert.ok(d.STOPS[id], `${line.id} : arrêt inconnu « ${id} »`));
  }
});

test('temps et distances cumulés croissent strictement dans les deux sens', () => {
  for (const line of d.LINES) for (const dir of [0, 1]) {
    for (const series of [line.cum[dir], line.km[dir]]) {
      assert.equal(series[0], 0);
      series.slice(1).forEach((v, i) => assert.ok(v > series[i], `${line.id} sens ${dir} : valeur non croissante à l'indice ${i + 1}`));
    }
  }
});

test('chaque arrêt est desservi par au moins une ligne', () => {
  for (const id of Object.keys(d.STOPS)) assert.ok(d.STOP_LD[id]?.length, `arrêt isolé : ${id}`);
});

test('le réseau a deux sens cohérents (le retour est l\'inverse de l\'aller)', () => {
  for (const line of d.LINES) assert.deepEqual(plain(line.order[1]), plain([...line.order[0]].reverse()));
});

test('tarifs : identifiants uniques, ticket unitaire défini, prix positifs', () => {
  assert.equal(new Set(d.PRODUCTS.map(p => p.id)).size, d.PRODUCTS.length);
  assert.ok(d.PRODUCT[d.SINGLE_TICKET], 'SINGLE_TICKET doit exister dans PRODUCTS');
  d.PRODUCTS.forEach(p => { assert.ok(p.price > 0 && p.minutes > 0, p.id); });
  const student = d.PRODUCTS.filter(p => p.student);
  assert.ok(student.length >= 1 && student.every(p => p.price < d.PRODUCT.month.price), 'le tarif étudiant est réduit');
});

test('alertes : lignes connues, dates cohérentes, gravité valide', () => {
  const lineIds = new Set(d.LINES.map(l => l.id));
  for (const a of d.ALERTS) {
    a.lines.forEach(l => assert.ok(lineIds.has(l), `${a.id} : ligne inconnue ${l}`));
    assert.ok(a.end >= a.start, `${a.id} : fin avant début`);
    assert.ok(['crit', 'warn', 'info'].includes(a.sev), `${a.id} : gravité`);
  }
});

test('types de jour : facteur d\'intervalle croissant (week-end moins dense)', () => {
  const f = d.DAY_TYPES.map(t => t.factor);
  assert.deepEqual(plain([...f].sort((a, b) => a - b)), plain(f));
});
