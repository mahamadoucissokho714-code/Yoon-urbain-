'use strict';
/* Moteur : horaires théoriques, prochains passages et calcul d'itinéraire (Dijkstra sur tas binaire). */

/* ---------- Horaires ---------- */
const depCache = new Map();

function headway(line, t) {
  if (PEAK_PERIODS.some(([a, b]) => t >= a && t < b)) return line.hw.peak;
  return t >= EVENING_START ? line.hw.eve : line.hw.off;
}
/** Départs d'un terminus (minutes depuis minuit) pour un sens et un type de jour. Mis en cache. */
function terminusDeps(line, dir, factor) {
  const key = `${line.id}|${dir}|${factor}`;
  if (depCache.has(key)) return depCache.get(key);
  const shift = dir ? REVERSE_DELAY : 0, end = toMin(line.last) + shift, out = [];
  for (let t = toMin(line.first) + shift; t <= end; t += Math.max(MIN_HEADWAY, Math.round(headway(line, t) * factor))) out.push(Math.round(t));
  depCache.set(key, out);
  return out;
}
const stopTimes = (line, dir, idx, factor) => terminusDeps(line, dir, factor).map(d => d + line.cum[dir][idx]);

/** Premier indice d'un tableau trié dont la valeur est >= x (recherche dichotomique). */
function lowerBound(sorted, x) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; sorted[mid] < x ? (lo = mid + 1) : (hi = mid); }
  return lo;
}
/** Prochain passage (minutes) à un arrêt, à partir de `from` ; bascule au lendemain si le service est terminé. */
function nextAt(line, dir, idx, from, factor) {
  const deps = terminusDeps(line, dir, factor), off = line.cum[dir][idx];
  const day = Math.floor(from / MIN_PER_DAY), local = from - day * MIN_PER_DAY;
  const i = lowerBound(deps, local - off);
  return i < deps.length ? day * MIN_PER_DAY + deps[i] + off : (day + 1) * MIN_PER_DAY + deps[0] + off;
}
/** Les `n` prochains passages à un arrêt, toutes lignes confondues (filtre facultatif sur les lignes). */
function upcoming(stopId, from, n, filter, factor) {
  const out = [];
  for (const { line, dir, idx } of STOP_LD[stopId] || []) {
    const order = line.order[dir];
    if (idx >= order.length - 1) continue;
    if (filter && filter.size && !filter.has(line.id)) continue;
    const dest = STOPS[order[order.length - 1]].name;
    for (let i = 0, t = from; i < n; i++) { t = nextAt(line, dir, idx, t, factor); out.push({ line, dir, time: t, dest }); t += 1; }
  }
  return out.sort((a, b) => a.time - b.time).slice(0, n);
}
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; };

/* ---------- Calcul d'itinéraire ---------- */
const MIN_TRANSFER = 2;          // minutes minimum pour changer de bus
const MAX_TRANSFER_WAIT = 90;    // attente maximale acceptée lors d'une correspondance
const TRANSFER_PENALTIES = [3, 12, 30]; // trois profils : rapide, équilibré, peu de correspondances
const FIRST_SERVICE = toMin('05:30');

class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(node) {
    const a = this.items; a.push(node);
    for (let i = a.length - 1, p; i > 0 && a[(p = (i - 1) >> 1)].cost > a[i].cost; i = p) [a[p], a[i]] = [a[i], a[p]];
  }
  pop() {
    const a = this.items, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l].cost < a[m].cost) m = l;
        if (r < a.length && a[r].cost < a[m].cost) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

/**
 * Un seul calcul d'itinéraire. États : (arrêt, ligne+sens en cours) ou (arrêt, à pied).
 * `penalty` pénalise chaque correspondance, ce qui change le compromis vitesse / confort.
 */
function planOnce(from, to, start, penalty, pmr, factor) {
  const best = new Map(), open = new MinHeap();
  const keyOf = n => `${n.stop}|${n.ld ? n.ld.line.id + n.ld.dir : '-'}`;
  const push = node => { const k = keyOf(node); if (best.has(k) && best.get(k) <= node.cost) return; best.set(k, node.cost); open.push(node); };
  const origin = { stop: from, ld: null, time: start, cost: 0, prev: null, boardings: 0, idx: -1 };
  best.set(keyOf(origin), 0); open.push(origin);

  while (open.size) {
    const n = open.pop();
    if (best.get(keyOf(n)) < n.cost) continue;
    if (!n.ld && n.stop === to && n.boardings > 0) return buildJourney(n, start);

    if (!n.ld) { // à pied : monter dans un bus
      if (pmr && !STOPS[n.stop].acc) continue;
      const transfer = n.boardings > 0;
      for (const ld of STOP_LD[n.stop]) {
        if (ld.idx >= ld.line.order[ld.dir].length - 1) continue;
        const dep = nextAt(ld.line, ld.dir, ld.idx, n.time + (transfer ? MIN_TRANSFER : 0), factor), wait = dep - n.time;
        if (transfer && wait > MAX_TRANSFER_WAIT) continue;
        push({ stop: n.stop, ld, time: dep, cost: n.cost + wait + (transfer ? penalty : 0), prev: n, boardings: n.boardings + 1, idx: ld.idx });
      }
    } else { // à bord : avancer d'un arrêt ou descendre
      const { line, dir } = n.ld, order = line.order[dir];
      if (n.idx < order.length - 1) {
        const seg = line.cum[dir][n.idx + 1] - line.cum[dir][n.idx];
        push({ stop: order[n.idx + 1], ld: n.ld, time: n.time + seg, cost: n.cost + seg, prev: n, boardings: n.boardings, idx: n.idx + 1 });
      }
      if (!pmr || STOPS[n.stop].acc) push({ stop: n.stop, ld: null, time: n.time, cost: n.cost, prev: n, boardings: n.boardings, idx: -1 });
    }
  }
  return null;
}

/** Transforme la chaîne d'états en trajet : une étape (leg) par bus emprunté. */
function buildJourney(end, start) {
  const chain = []; for (let n = end; n; n = n.prev) chain.push(n);
  chain.reverse();
  const legs = []; let cur = null;
  for (const n of chain) {
    if (!n.ld) { if (cur) cur.closed = true; continue; }
    const key = n.ld.line.id + n.ld.dir;
    if (!cur || cur.key !== key || cur.closed) {
      cur = { key, line: n.ld.line, dir: n.ld.dir, fromIdx: n.idx, toIdx: n.idx, dep: n.time, arr: n.time, closed: false };
      legs.push(cur);
    } else { cur.toIdx = n.idx; cur.arr = n.time; }
  }
  legs.forEach(l => {
    l.stops = l.line.order[l.dir].slice(l.fromIdx, l.toIdx + 1);
    l.km = roundTo1(l.line.km[l.dir][l.toIdx] - l.line.km[l.dir][l.fromIdx]);
  });
  return { legs, start, dep: legs[0].dep, arr: end.time, km: roundTo1(legs.reduce((sum, l) => sum + l.km, 0)) };
}

const journeyCache = new Map();
/** Propositions d'itinéraires distinctes, triées par heure d'arrivée. Résultats mis en cache. */
function planJourneys(from, to, start, pmr, factor) {
  const cacheKey = `${from}|${to}|${start}|${pmr}|${factor}`;
  if (journeyCache.has(cacheKey)) return journeyCache.get(cacheKey);
  const seen = new Set(), out = [];
  for (const penalty of TRANSFER_PENALTIES) {
    const j = planOnce(from, to, start, penalty, pmr, factor);
    if (!j) continue;
    const signature = j.legs.map(l => `${l.line.id}${l.dir}${l.fromIdx}-${l.toIdx}`).join('>');
    if (!seen.has(signature)) { seen.add(signature); out.push(j); }
  }
  out.sort((a, b) => a.arr - b.arr || a.legs.length - b.legs.length);
  const fewest = Math.min(...out.map(j => j.legs.length));
  out.forEach((j, i) => { j.label = i === 0 ? 'Le plus rapide' : j.legs.length === fewest ? 'Moins de correspondances' : 'Alternative'; });
  if (journeyCache.size > 60) journeyCache.clear();
  journeyCache.set(cacheKey, out);
  return out;
}

/** Retrouve un arrêt à partir d'un texte saisi (exact, début de nom, puis contenu si unique). */
function findStop(text) {
  const q = norm(text);
  if (!q) return null;
  const exact = STOP_INDEX.find(e => e.key === q);
  if (exact) return exact.stop;
  const starts = STOP_INDEX.filter(e => e.key.startsWith(q));
  if (starts.length === 1) return starts[0].stop;
  const inc = STOP_INDEX.filter(e => e.key.includes(q));
  return inc.length === 1 ? inc[0].stop : null;
}
