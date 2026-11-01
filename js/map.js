'use strict';
/* Plan schématique du réseau : zoom, déplacement, sélection d'arrêt et tracé d'un itinéraire. */

const MAP_W = 1000, MAP_H = 620;
const LABEL_ATTRS = {
  r: s => `x="${s.x + 13}" y="${s.y + 4}"`,
  l: s => `x="${s.x - 13}" y="${s.y + 4}" text-anchor="end"`,
  t: s => `x="${s.x}" y="${s.y - 13}" text-anchor="middle"`,
  b: s => `x="${s.x}" y="${s.y + 22}" text-anchor="middle"`
};
const LAND_PATH = 'M70 70C120 40 250 20 400 20L1000 20 1000 600 140 600C90 590 70 540 80 500 110 470 90 430 100 400 120 360 90 330 110 290 120 250 80 230 90 200 60 170 50 120 70 70Z';
const INTERCHANGES = new Set(Object.keys(STOPS).filter(id => stopLines(id).length > 1));
/** Décalage de chaque ligne pour que les tronçons communs restent distincts. */
const LINE_OFFSETS = LINES.map((_, i) => [(i - 2) * 2.5, (2 - i) * 2.5]);

const mapPolyline = (stops, offset = [0, 0]) => stops.map(id => `${STOPS[id].x + offset[0]},${STOPS[id].y + offset[1]}`).join(' ');

function mapMarkup(big) {
  const lines = LINES.map((l, i) => `<polyline class="ln" data-line="${l.id}" points="${mapPolyline(l.stops, LINE_OFFSETS[i])}" stroke="${lineVar(l.id)}"/>`).join('');
  const stops = Object.values(STOPS).map(s => {
    const x = INTERCHANGES.has(s.id);
    return `<g class="stop${x ? ' x' : ''}" tabindex="0" role="button" data-stop="${s.id}" aria-label="Arrêt ${esc(s.name)}"><circle cx="${s.x}" cy="${s.y}" r="${x ? 9 : 7}"/><text ${LABEL_ATTRS[s.lab](s)}>${esc(s.name)}</text></g>`;
  }).join('');
  return `<svg class="map${big ? ' big' : ''}" viewBox="0 0 ${MAP_W} ${MAP_H}" role="group" aria-label="Plan du réseau Yoon Urbain" preserveAspectRatio="xMidYMid meet">
    <rect class="sea" width="${MAP_W}" height="${MAP_H}"/><path class="land" d="${LAND_PATH}"/>
    <text class="sealbl" x="14" y="330" transform="rotate(-90 14 330)">Océan Atlantique</text>
    <g class="lines">${lines}</g><g class="hl"></g><g class="stops">${stops}</g><g class="marks"></g></svg>
    <div class="mapctl">${iconButton({ icon: 'plus', action: 'map-zoom-in', label: 'Zoomer' })}${iconButton({ icon: 'minus', action: 'map-zoom-out', label: 'Dézoomer' })}${iconButton({ icon: 'fit', action: 'map-reset', label: 'Recentrer la carte' })}</div>`;
}

/**
 * Crée un plan dans `mount`. Renvoie { setVisible, select, reset, highlight }.
 * `onStop(id)` est appelé quand l'utilisateur choisit un arrêt (clic ou clavier).
 */
function NetworkMap(mount, { onStop, big = false } = {}) {
  mount.innerHTML = mapMarkup(big);
  const svg = $('svg', mount);
  let view = { x: 0, y: 0, w: MAP_W, h: MAP_H }, drag = null, moved = false;

  const clamp = () => { view.x = Math.min(Math.max(view.x, -40), MAP_W + 40 - view.w); view.y = Math.min(Math.max(view.y, -40), MAP_H + 40 - view.h); };
  const apply = () => { clamp(); svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`); };
  const setView = (x, y, w) => { view = { x, y, w, h: w * MAP_H / MAP_W }; apply(); };
  const zoom = (factor, cx = view.x + view.w / 2, cy = view.y + view.h / 2) => {
    const w = Math.min(MAP_W, Math.max(180, view.w * factor)), h = w * MAP_H / MAP_W;
    setView(cx - (cx - view.x) * w / view.w, cy - (cy - view.y) * h / view.h, w);
  };

  const controls = { 'map-zoom-in': () => zoom(0.7), 'map-zoom-out': () => zoom(1.4), 'map-reset': () => api.reset() };
  mount.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (b && controls[b.dataset.action]) { e.stopPropagation(); controls[b.dataset.action](); } });

  // Le pointeur n'est capturé qu'après un vrai glissement, sinon le clic sur un arrêt serait perdu.
  svg.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; moved = false; });
  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!moved) { if (Math.abs(dx) + Math.abs(dy) <= 5) return; moved = true; svg.setPointerCapture(e.pointerId); }
    const r = svg.getBoundingClientRect(), k = Math.max(view.w / r.width, view.h / r.height);
    view.x = drag.vx - dx * k; view.y = drag.vy - dy * k; apply();
  });
  ['pointerup', 'pointercancel'].forEach(type => svg.addEventListener(type, () => { drag = null; }));
  svg.addEventListener('wheel', e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    zoom(e.deltaY > 0 ? 1.15 : 0.87, view.x + (e.clientX - r.left) / r.width * view.w, view.y + (e.clientY - r.top) / r.height * view.h);
  }, { passive: false });

  const choose = (el, byKeyboard) => { if (moved && !byKeyboard) return; api.select(el.dataset.stop); onStop && onStop(el.dataset.stop); };
  svg.addEventListener('click', e => { const el = e.target.closest('.stop'); if (el) choose(el, false); });
  svg.addEventListener('keydown', e => {
    const el = e.target.closest('.stop');
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); choose(el, true); }
  });

  const api = {
    setVisible(visible) { $$('.ln', svg).forEach(p => { p.style.display = visible.has(p.dataset.line) ? '' : 'none'; }); },
    select(id) { $$('.stop', svg).forEach(g => g.classList.toggle('sel', g.dataset.stop === id)); },
    reset() { setView(0, 0, MAP_W); },
    /** Met un itinéraire en évidence (A et B) et cadre la vue dessus ; `null` efface. */
    highlight(journey) {
      const layer = $('.hl', svg), marks = $('.marks', svg);
      svg.classList.toggle('dim', !!journey);
      if (!journey) { layer.innerHTML = ''; marks.innerHTML = ''; return; }
      layer.innerHTML = journey.legs.map(l => { const pts = mapPolyline(l.stops); return `<polyline class="casing" points="${pts}"/><polyline class="ln" style="stroke-width:9" stroke="${lineVar(l.line.id)}" points="${pts}"/>`; }).join('');
      const a = STOPS[journey.legs[0].stops[0]], b = STOPS[journey.legs.at(-1).stops.at(-1)];
      marks.innerHTML = [[a, 'A'], [b, 'B']].map(([s, t]) =>
        `<g class="mk"><circle cx="${s.x}" cy="${s.y - 30}" r="13"/><text x="${s.x}" y="${s.y - 25.5}">${t}</text><path d="M${s.x - 5} ${s.y - 20}L${s.x} ${s.y - 11}L${s.x + 5} ${s.y - 20}Z" fill="var(--ink)"/></g>`).join('');
      const pts = journey.legs.flatMap(l => l.stops).map(id => STOPS[id]);
      const x0 = Math.min(...pts.map(s => s.x)) - 90, x1 = Math.max(...pts.map(s => s.x)) + 130;
      const y0 = Math.min(...pts.map(s => s.y)) - 80, y1 = Math.max(...pts.map(s => s.y)) + 70;
      const w = Math.min(MAP_W, Math.max(x1 - x0, (y1 - y0) * MAP_W / MAP_H, 300));
      setView((x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - w * MAP_H / MAP_W / 2, w);
    }
  };
  return api;
}
