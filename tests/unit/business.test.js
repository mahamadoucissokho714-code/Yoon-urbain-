'use strict';
/* Règles métier des vues (billets, trajets enregistrés), testées sans navigateur. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('../helpers/load');

const b = load(['js/core.js', 'js/data.js', 'js/engine.js', 'js/state.js', 'js/components.js', 'js/views/tickets.js', 'js/views/plan.js'],
  ['state', 'store', 'ORANGE_PATTERN', 'WAVE_PATTERN', 'PAYMENT_METHODS', 'methodLabel', 'ticketStatus', 'remaining', 'cartItems', 'cartTotal', 'savedTrips', 'sameTrip', 'MAX_SAVED_TRIPS', 'PRODUCT']);

/* ---------- Billets ---------- */
test('Wave : tout numéro mobile sénégalais (70, 75, 76, 77, 78), avec ou sans indicatif', () => {
  ['771234567', '701234567', '761234567', '+221781234567', '221751234567'].forEach(n => assert.ok(b.WAVE_PATTERN.test(n), n));
  ['721234567', '77123456', '7712345678', '0771234567', 'abcdefghi', ''].forEach(n => assert.ok(!b.WAVE_PATTERN.test(n), n));
});

test('Orange Money : uniquement les numéros Orange (77 et 78)', () => {
  ['771234567', '781234567', '+221771234567'].forEach(n => assert.ok(b.ORANGE_PATTERN.test(n), n));
  ['701234567', '751234567', '761234567', '77123456'].forEach(n => assert.ok(!b.ORANGE_PATTERN.test(n), n));
});

test('moyens de paiement : identifiants uniques, Orange Money et Wave présents, agence sans numéro', () => {
  const ids = b.PAYMENT_METHODS.map(m => m.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(plain(ids), ['orange', 'wave', 'agence']);
  b.PAYMENT_METHODS.filter(m => m.phone).forEach(m => assert.ok(m.pattern.test(m.example.replace(/\s/g, '')), `l'exemple de ${m.label} doit être valide`));
  assert.equal(b.PAYMENT_METHODS.find(m => m.id === 'agence').phone, false);
  assert.equal(b.methodLabel('wave'), 'Wave');
  assert.equal(b.methodLabel(undefined), 'Mobile money', 'anciens billets sans moyen enregistré');
});

test('panier : total = somme prix × quantité, quantités nulles ignorées', () => {
  b.state.cart = { t90: 3, day: 1, week: 0 };
  assert.equal(b.cartItems().length, 2);
  assert.equal(b.cartTotal(), 3 * b.PRODUCT.t90.price + b.PRODUCT.day.price);
  b.state.cart = {};
  assert.equal(b.cartTotal(), 0);
});

test('statut d\'un billet : à activer, actif, expiré', () => {
  assert.equal(b.ticketStatus({ activatedAt: null }).key, 'new');
  assert.equal(b.ticketStatus({ activatedAt: 1, expiresAt: Date.now() + 60000 }).key, 'active');
  assert.equal(b.ticketStatus({ activatedAt: 1, expiresAt: Date.now() - 1 }).key, 'expired');
});

test('remaining : durée restante lisible, jamais négative', () => {
  assert.equal(b.remaining(-5000), '00 min 00 s');
  assert.equal(b.remaining(65 * 1000), '01 min 05 s');
  assert.equal(b.remaining((2 * 3600 + 5 * 60) * 1000), '2 h 05 min');
  assert.equal(b.remaining((3 * 86400 + 4 * 3600) * 1000), '3 j 4 h');
});

/* ---------- Trajets enregistrés ---------- */
test('savedTrips : écarte les données corrompues, inconnues, identiques et doublons', () => {
  b.store.set('trips', [null, 5, { from: 'zzz', to: 'plateau' }, { from: 'plateau', to: 'plateau' },
    { from: 'plateau', to: 'hann' }, { from: 'plateau', to: 'hann' }, { from: 'plateau', to: 'hann', pmr: true }]);
  const trips = b.savedTrips();
  assert.deepEqual(plain(trips), [{ from: 'plateau', to: 'hann', pmr: false }, { from: 'plateau', to: 'hann', pmr: true }]);
});

test('savedTrips : tolère un stockage qui n\'est pas une liste, et plafonne à la limite', () => {
  b.store.set('trips', 'corrompu');
  assert.deepEqual(plain(b.savedTrips()), []);
  const ids = ['plateau', 'sandaga', 'medina', 'colobane', 'granddakar', 'liberte6', 'grandyoff', 'parcelles', 'guediawaye', 'almadies', 'ngor', 'ouakam'];
  b.store.set('trips', ids.slice(1).map(to => ({ from: 'plateau', to })));
  assert.equal(b.savedTrips().length, b.MAX_SAVED_TRIPS);
});

test('sameTrip : le mode PMR distingue deux favoris', () => {
  assert.ok(b.sameTrip({ from: 'a', to: 'b' }, { from: 'a', to: 'b', pmr: false }));
  assert.ok(!b.sameTrip({ from: 'a', to: 'b' }, { from: 'a', to: 'b', pmr: true }));
});
