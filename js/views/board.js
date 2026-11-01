'use strict';
/* Vue « Prochains passages » : tableau de départs mis à jour chaque seconde. */

const BOARD_ROWS = 10;
const APPROACHING_SEC = 60;
const COUNTDOWN_MAX_SEC = 3600;

function boardRowsHtml() {
  const from = nowMin(), rows = upcoming(state.board.stop, from, BOARD_ROWS, state.board.filter, dayFactor());
  if (!rows.length) return '<div class="brow"><span></span><span class="dest">Aucun passage prévu</span></div>';
  return rows.map(r => {
    const diff = (r.time - from) * 60;
    const countdown = diff < APPROACHING_SEC ? "À l'approche" : diff < COUNTDOWN_MAX_SEC ? `${Math.ceil(diff / 60)} min` : fmtT(r.time);
    return `<div class="brow">${lineBadge(r.line.id, true)}<span class="dest">${esc(r.dest)}</span><span class="cd">${countdown}</span><span class="hh">${fmtT(r.time)}${r.time >= MIN_PER_DAY ? ' +1' : ''}</span></div>`;
  }).join('');
}

const boardView = {
  render(root) {
    const b = state.board, stop = STOPS[b.stop], favs = store.get('favs', []), isFav = favs.includes(b.stop), lines = stopLines(b.stop);
    root.innerHTML = `${pageHead('Prochains passages', 'Horaires théoriques mis à jour chaque seconde, pour le jour en cours.')}
      <div class="stack narrow">
        <div class="card form">
          <div class="row">${field('bStop', 'Arrêt', `<select id="bStop">${STOP_LIST.map(s => `<option value="${s.id}"${s.id === b.stop ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>`)}
            ${button({ html: `${ic('star', isFav ? 'fill' : '')} ${isFav ? 'Favori' : 'Ajouter aux favoris'}`, action: 'fav', data: { stop: b.stop }, cls: isFav ? 'primary' : '', pressed: isFav })}</div>
          ${labelled('Lignes', `<div class="chips">${lines.map(id => chip({ html: id, action: 'board-filter', data: { line: id }, pressed: b.filter.has(id) })).join('')}</div>`)}
          ${favs.length ? labelled('Mes favoris', `<div class="chips">${favs.map(f => chip({ html: esc(STOPS[f].name), action: 'board-here', data: { stop: f } })).join('')}</div>`) : ''}
        </div>
        <div class="board"><div class="bh"><span>${esc(stop.name)} · ${DAY_TYPES[todayType()].label}</span><span id="bClock">${fmtT(nowMin())}</span></div><div id="boardRows">${boardRowsHtml()}</div></div>
        <div class="card stopqr"><div class="qr" data-qr="${esc(stopLink(b.stop))}"></div>
          <div><b>QR code de l'arrêt</b><p class="small muted">Affichez-le à l'arrêt : en le scannant, les voyageurs ouvrent directement les prochains passages de « ${esc(stop.name)} ».</p></div></div>
        <div class="small muted">${plural(lines.length, 'ligne')} desservent cet arrêt. ${stop.acc ? 'Arrêt accessible aux personnes à mobilité réduite.' : 'Arrêt non accessible aux personnes à mobilité réduite.'}</div>
      </div>`;
    $('#bStop').addEventListener('change', e => { b.stop = e.target.value; b.filter.clear(); rerender(); });
    drawQRCodes(112);
  },
  tick() {
    setHTML($('#boardRows'), boardRowsHtml());
    const clock = $('#bClock'); if (clock) clock.textContent = fmtT(nowMin());
  }
};

Object.assign(ACTIONS, {
  'board-here'(el) { state.board.stop = el.dataset.stop; state.board.filter.clear(); app.name === 'departs' ? rerender() : go('departs'); },
  'board-filter'(el) { const f = state.board.filter, id = el.dataset.line; f.has(id) ? f.delete(id) : f.add(id); rerender(); },
  fav(el) {
    const id = el.dataset.stop, on = store.toggle('favs', id);
    toast(on ? 'Arrêt ajouté aux favoris' : 'Arrêt retiré des favoris');
    rerender();
    if (app.view.map) { $('#stopInfo').innerHTML = stopCard(id); app.view.map.select(id); } // garde la fiche ouverte sur les vues à plan
  }
});
