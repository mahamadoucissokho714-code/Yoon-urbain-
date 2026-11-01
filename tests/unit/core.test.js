'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('../helpers/load');

const c = load(['js/core.js'], ['norm', 'toMin', 'fmtT', 'plural', 'money', 'fmtKm', 'esc', 'dataAttrs', 'genId', 'store', 'pad2']);

test('norm : insensible aux accents, à la casse et aux séparateurs', () => {
  assert.equal(c.norm('Sacré-Cœur'), 'sacrecur');
  assert.equal(c.norm("Patte d'Oie"), 'pattedoie');
  assert.equal(c.norm('  GRAND   Dakar '), 'granddakar');
});

test('toMin et fmtT : conversions HH:MM <-> minutes, modulo 24 h', () => {
  assert.equal(c.toMin('05:30'), 330);
  assert.equal(c.fmtT(330), '05:30');
  assert.equal(c.fmtT(1440 + 65), '01:05', 'après minuit : retour sur 24 h');
  assert.equal(c.fmtT(-10), '23:50', 'valeur négative : veille');
  assert.equal(c.fmtT(59.9), '00:59', 'les secondes sont tronquées, jamais arrondies à la minute suivante');
});

test('plural : accorde selon la quantité', () => {
  assert.equal(c.plural(0, 'arrêt'), '0 arrêt');
  assert.equal(c.plural(1, 'arrêt'), '1 arrêt');
  assert.equal(c.plural(2, 'arrêt'), '2 arrêts');
});

test('money et fmtKm : formats français', () => {
  assert.equal(c.money(17000).replace(/\s/g, ' '), '17 000 FCFA');
  assert.equal(c.fmtKm(3.25 + 0.05), '3,3 km');
});

test('esc : neutralise le HTML (aucune injection via les saisies)', () => {
  assert.equal(c.esc('<img src=x onerror="a()">'), '&lt;img src=x onerror=&quot;a()&quot;&gt;');
  assert.equal(c.esc("l'été"), 'l&#39;été');
  assert.equal(c.dataAttrs({ a: '"x"' }), ' data-a="&quot;x&quot;"');
});

test('genId : préfixe et longueur', () => {
  assert.match(c.genId('YU', 6), /^YU-[A-Z0-9]{1,6}$/);
});

test('store : repli en mémoire quand localStorage est indisponible', () => {
  assert.equal(c.store.get('absent', 'défaut'), 'défaut');
  c.store.set('k', { a: 1 });
  assert.deepEqual(plain(c.store.get('k', null)), { a: 1 });
  assert.equal(c.store.toggle('liste', 'x'), true, 'ajout');
  assert.equal(c.store.toggle('liste', 'x'), false, 'retrait');
  assert.deepEqual(plain(c.store.get('liste', null)), []);
});
