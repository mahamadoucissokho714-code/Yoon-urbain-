'use strict';
/* Vue « Plan » : carte plein format, filtre de lignes et fiche d'arrêt. */

const mapView = {
  map: null,
  render(root) {
    root.innerHTML = `${pageHead('Plan du réseau', 'Touchez un arrêt pour voir ses lignes et ses prochains passages. Faites glisser pour déplacer le plan.')}
      <div class="split wide-left">
        <div class="card map-card"><div id="mapMount" class="rel"></div></div>
        <div class="stack">
          <div class="card stack"><div class="lbl">Afficher les lignes</div>
            <div class="chips">${LINES.map(l => chip({ html: `${lineBadge(l.id)} ${esc(l.name)}`, action: 'map-line', data: { line: l.id }, pressed: state.mapVisible.has(l.id) })).join('')}</div></div>
          <div id="stopInfo">${emptyState('Sélectionnez un arrêt sur le plan.')}</div>
        </div>
      </div>`;
    this.map = NetworkMap($('#mapMount'), { big: true, onStop: id => { $('#stopInfo').innerHTML = stopCard(id); } });
    this.map.setVisible(state.mapVisible);
  }
};

ACTIONS['map-line'] = el => {
  const id = el.dataset.line, visible = state.mapVisible;
  visible.has(id) ? visible.delete(id) : visible.add(id);
  el.setAttribute('aria-pressed', visible.has(id));
  mapView.map.setVisible(visible);
};
