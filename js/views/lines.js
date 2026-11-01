'use strict';
/* Vue « Lignes et horaires » : détail d'une ligne, arrêts avec distances, grille horaire. */

const isFollowed = id => store.get('follow', []).includes(id);

function lineRow(line, selected) {
  return `<button class="lrow" role="listitem" data-action="pick-line" data-line="${line.id}" aria-pressed="${selected}">${lineBadge(line.id, true)}
    <span class="nm"><strong>${esc(line.name)}</strong><span class="small muted">${line.stops.length} arrêts · ${fmtKm(line.km[0].at(-1))} · toutes les ${line.hw.peak}–${line.hw.off} min · ${line.first}–${line.last}</span></span></button>`;
}

/** Grille « heure / minutes de passage » d'un arrêt. */
function timetableRows(times) {
  const byHour = new Map();
  times.forEach(t => { const h = Math.floor(t / 60); (byHour.get(h) || byHour.set(h, []).get(h)).push(pad2(t % 60)); });
  return [...byHour].map(([h, mins]) => `<tr><td class="h">${pad2(h % 24)} h</td><td class="m">${mins.map(m => `<span>${m}</span>`).join('')}</td></tr>`).join('');
}

const linesView = {
  render(root) {
    const s = state.lines, line = LINE[s.id], order = line.order[s.dir], factor = DAY_TYPES[s.day].factor;
    if (s.stopIdx >= order.length) s.stopIdx = 0;
    const times = stopTimes(line, s.dir, s.stopIdx, factor), followed = isFollowed(line.id);
    const alerts = ALERTS.filter(a => alertActive(a) && a.lines.includes(line.id));
    const first = STOPS[line.stops[0]].name, lastName = STOPS[line.stops.at(-1)].name;

    root.innerHTML = `${pageHead('Lignes et horaires', 'Choisissez une ligne, un sens et un arrêt pour consulter les horaires théoriques.')}
      <div class="split layout-lines">
        <div class="linelist" role="list">${LINES.map(l => lineRow(l, l.id === line.id)).join('')}</div>
        <div class="stack">
          <div class="card stack">
            <div class="jtop"><div class="line-title">${lineBadge(line.id, true)}<div><h2>${esc(line.name)}</h2><span class="small muted">Trajet complet : ${fmtKm(line.km[s.dir].at(-1))} · ${line.cum[s.dir].at(-1)} min</span></div></div>
              ${button({ html: followed ? 'Ligne suivie' : 'Suivre les infos trafic', action: 'follow', data: { line: line.id }, cls: 'sm', pressed: followed })}</div>
            ${alerts.map(a => banner('alert', `<strong>${esc(a.title)}</strong>`)).join('')}
            <div class="row">
              ${segmented({ label: 'Sens', action: 'dir', current: String(s.dir), options: [{ value: '0', label: `Vers ${esc(lastName)}` }, { value: '1', label: `Vers ${esc(first)}` }] })}
              ${segmented({ label: 'Jour', action: 'day', current: String(s.day), options: DAY_TYPES.map((d, i) => ({ value: String(i), label: d.label })) })}</div>
          </div>
          <div class="split layout-hours">
            <div class="card"><div class="lbl">Arrêts vers ${esc(STOPS[order.at(-1)].name)} · distance depuis le départ</div>
              <ul class="stops" style="--lc:${lineVar(line.id)}">${order.map((id, i) => `<li><i></i><button data-action="pick-stop-idx" data-i="${i}" aria-pressed="${i === s.stopIdx}">${esc(STOPS[id].name)}</button><span class="mono small muted">${fmtKm(line.km[s.dir][i])}</span></li>`).join('')}</ul></div>
            <div class="card stack"><h3>Horaires à ${esc(STOPS[order[s.stopIdx]].name)}</h3>
              ${s.stopIdx === order.length - 1 ? '<p class="muted">Terminus de la ligne dans ce sens : les passages indiqués sont des arrivées.</p>' : ''}
              <div class="tablewrap scroll"><table><thead><tr><th>Heure</th><th>Minutes</th></tr></thead><tbody>${timetableRows(times)}</tbody></table></div>
              <p class="small muted">${times.length} passages · premier ${fmtT(times[0])} · dernier ${fmtT(times.at(-1))}</p></div>
          </div>
        </div>
      </div>`;
  }
};

Object.assign(ACTIONS, {
  'pick-line'(el) { Object.assign(state.lines, { id: el.dataset.line, dir: 0, stopIdx: 0 }); rerender(); },
  dir(el) { Object.assign(state.lines, { dir: +el.dataset.value, stopIdx: 0 }); rerender(); },
  day(el) { state.lines.day = +el.dataset.value; rerender(); },
  'pick-stop-idx'(el) { state.lines.stopIdx = +el.dataset.i; rerender(); },
  follow(el) {
    const id = el.dataset.line, on = store.toggle('follow', id);
    toast(on ? `Ligne ${id} suivie` : `Ligne ${id} retirée`); rerender();
  }
});
