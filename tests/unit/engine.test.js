'use strict';
/* Moteur d'horaires et d'itinéraires. Les tests passent toujours un facteur et une heure explicites :
   ils ne dépendent jamais de l'heure réelle. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/load');

const e = load(['js/core.js', 'js/data.js', 'js/engine.js'], [
  'LINES', 'LINE', 'STOPS', 'STOP_LIST', 'lowerBound', 'MinHeap', 'terminusDeps', 'nextAt', 'upcoming', 'findStop',
  'planJourneys', 'MIN_TRANSFER', 'MIN_PER_DAY', 'toMin', 'MIN_HEADWAY'
]);
const WEEKDAY = 1;
const MORNING = e.toMin('08:00');

/* ---------- Briques de base ---------- */
test('lowerBound : premier élément >= x', () => {
  const a = [10, 20, 30];
  assert.equal(e.lowerBound(a, 5), 0);
  assert.equal(e.lowerBound(a, 20), 1);
  assert.equal(e.lowerBound(a, 21), 2);
  assert.equal(e.lowerBound(a, 31), 3);
  assert.equal(e.lowerBound([], 1), 0);
});

test('MinHeap : restitue les éléments par coût croissant', () => {
  const heap = new e.MinHeap(), costs = [5, 3, 9, 1, 7, 3, 0, 8];
  costs.forEach(cost => heap.push({ cost }));
  const out = []; while (heap.size) out.push(heap.pop().cost);
  assert.deepEqual(out, [...costs].sort((a, b) => a - b));
});

/* ---------- Horaires ---------- */
test('terminusDeps : triés, dans la plage de service, intervalle >= minimum', () => {
  for (const line of e.LINES) for (const dir of [0, 1]) {
    const deps = e.terminusDeps(line, dir, WEEKDAY);
    assert.ok(deps.length > 20, `${line.id} : trop peu de départs`);
    deps.slice(1).forEach((t, i) => assert.ok(t - deps[i] >= e.MIN_HEADWAY, `${line.id} : intervalle trop court`));
    assert.ok(deps[0] >= e.toMin(line.first) && deps.at(-1) <= e.toMin(line.last) + 12);
  }
});

test('terminusDeps : le week-end est moins dense que la semaine', () => {
  const line = e.LINE.L1;
  assert.ok(e.terminusDeps(line, 0, 1.7).length < e.terminusDeps(line, 0, 1).length);
});

test('nextAt : jamais dans le passé, et bascule au lendemain après le dernier bus', () => {
  const line = e.LINE.L1;
  const t = e.nextAt(line, 0, 2, MORNING, WEEKDAY);
  assert.ok(t >= MORNING && t - MORNING <= line.hw.peak + 1, 'un bus arrive dans l\'intervalle de pointe');
  const late = e.nextAt(line, 0, 2, 23 * 60 + 50, WEEKDAY);
  assert.ok(late >= e.MIN_PER_DAY, 'le prochain passage est le lendemain');
  const tomorrow = e.nextAt(line, 0, 2, e.MIN_PER_DAY + MORNING, WEEKDAY);
  assert.ok(tomorrow >= e.MIN_PER_DAY + MORNING, 'fonctionne aussi au-delà de minuit');
});

test('upcoming : trié, limité à n, filtrable par ligne, sans passage au terminus d\'arrivée', () => {
  const rows = e.upcoming('colobane', MORNING, 6, null, WEEKDAY);
  assert.equal(rows.length, 6);
  rows.slice(1).forEach((r, i) => assert.ok(r.time >= rows[i].time));
  const l1 = e.upcoming('colobane', MORNING, 4, new Set(['L1']), WEEKDAY);
  assert.ok(l1.length && l1.every(r => r.line.id === 'L1'));
  const atTerminus = e.upcoming('guediawaye', MORNING, 8, new Set(['L1']), WEEKDAY);
  assert.ok(atTerminus.every(r => r.dest !== e.STOPS.guediawaye.name), 'pas de départ vers soi-même');
});

/* ---------- Recherche d'arrêt ---------- */
test('findStop : exact, sans accent, préfixe unique, ambigu et inconnu', () => {
  assert.equal(e.findStop('Plateau').id, 'plateau');
  assert.equal(e.findStop('  mÉdina ').id, 'medina');
  assert.equal(e.findStop('guedia').id, 'guediawaye', 'préfixe unique');
  assert.equal(e.findStop('grand'), null, 'Grand Dakar et Grand Yoff : ambigu');
  assert.equal(e.findStop('zzz'), null);
  assert.equal(e.findStop(''), null);
});

/* ---------- Itinéraires ---------- */
function checkJourney(j, from, to, start) {
  assert.ok(j.legs.length >= 1);
  assert.equal(j.legs[0].stops[0], from, 'part du bon arrêt');
  assert.equal(j.legs.at(-1).stops.at(-1), to, 'arrive au bon arrêt');
  assert.ok(j.dep >= start, 'ne part pas avant l\'heure demandée');
  assert.ok(j.arr > j.dep, 'arrive après le départ');
  assert.ok(j.km > 0);
  j.legs.forEach((leg, i) => {
    assert.ok(leg.arr > leg.dep);
    if (i) {
      assert.equal(leg.stops[0], j.legs[i - 1].stops.at(-1), 'la correspondance se fait au même arrêt');
      assert.ok(leg.dep - j.legs[i - 1].arr >= 2, 'temps de correspondance minimal (2 min) respecté');
    }
  });
}

test('planJourneys : trajet direct Plateau → Guédiawaye (L1)', () => {
  const js = e.planJourneys('plateau', 'guediawaye', MORNING, false, WEEKDAY);
  assert.ok(js.length >= 1);
  js.forEach(j => checkJourney(j, 'plateau', 'guediawaye', MORNING));
  assert.equal(js[0].legs.length, 1);
  assert.equal(js[0].legs[0].line.id, 'L1');
  assert.equal(js[0].label, 'Le plus rapide');
});

test('planJourneys : trajet avec correspondance (Almadies → Cambérène)', () => {
  const js = e.planJourneys('almadies', 'camberene', MORNING, false, WEEKDAY);
  assert.ok(js.length >= 1);
  js.forEach(j => checkJourney(j, 'almadies', 'camberene', MORNING));
  assert.ok(js.every(j => j.legs.length >= 2), 'aucune ligne directe');
});

test('planJourneys : les propositions sont distinctes et triées par arrivée', () => {
  const js = e.planJourneys('almadies', 'keurmassar', MORNING, false, WEEKDAY);
  const sigs = js.map(j => j.legs.map(l => `${l.line.id}${l.dir}${l.fromIdx}-${l.toIdx}`).join('>'));
  assert.equal(new Set(sigs).size, sigs.length, 'pas de doublon');
  js.slice(1).forEach((j, i) => assert.ok(j.arr >= js[i].arr));
});

test('planJourneys : le réseau est entièrement connecté (toutes les paires, heure de pointe)', () => {
  const ids = e.STOP_LIST.map(s => s.id);
  for (const a of ids) for (const b of ids) {
    if (a === b) continue;
    const js = e.planJourneys(a, b, MORNING, false, WEEKDAY);
    assert.ok(js.length > 0, `aucun itinéraire ${a} → ${b}`);
    js.forEach(j => j.legs.slice(1).forEach((leg, i) => assert.ok(leg.dep - j.legs[i].arr >= 2, `${a} → ${b} : correspondance trop courte`)));
  }
});

test('planJourneys PMR : n\'utilise que des arrêts accessibles pour monter et descendre', () => {
  const js = e.planJourneys('plateau', 'guediawaye', MORNING, true, WEEKDAY);
  assert.ok(js.length >= 1);
  for (const j of js) for (const leg of j.legs) {
    assert.ok(e.STOPS[leg.stops[0]].acc && e.STOPS[leg.stops.at(-1)].acc, 'montée et descente accessibles');
  }
});

test('planJourneys PMR : refuse un départ ou une arrivée non accessible, mais traverse un arrêt non accessible à bord', () => {
  assert.equal(e.STOPS.sandaga.acc, false, 'hypothèse du test : Sandaga n\'est pas accessible');
  assert.equal(e.planJourneys('sandaga', 'plateau', MORNING, true, WEEKDAY).length, 0, 'départ non accessible');
  assert.equal(e.planJourneys('plateau', 'sandaga', MORNING, true, WEEKDAY).length, 0, 'arrivée non accessible');
  const through = e.planJourneys('plateau', 'medina', MORNING, true, WEEKDAY);
  assert.ok(through.length >= 1 && through[0].legs[0].stops.includes('sandaga'), 'passer devant Sandaga sans y descendre reste permis');
  assert.ok(e.planJourneys('plateau', 'medina', MORNING, false, WEEKDAY).length >= 1);
});

test('planJourneys : départ tardif, le premier bus du lendemain est proposé', () => {
  const start = 23 * 60 + 55;
  const js = e.planJourneys('plateau', 'guediawaye', start, false, WEEKDAY);
  assert.ok(js.length >= 1);
  assert.ok(js[0].dep >= e.MIN_PER_DAY, 'départ le lendemain');
});

test('planJourneys : résultat mis en cache (même objet pour la même requête)', () => {
  const a = e.planJourneys('medina', 'hann', MORNING, false, WEEKDAY), b = e.planJourneys('medina', 'hann', MORNING, false, WEEKDAY);
  assert.equal(a, b);
});
