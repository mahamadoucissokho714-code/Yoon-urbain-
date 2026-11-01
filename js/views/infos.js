'use strict';
/* Vue « Infos trafic » : alertes filtrables et suivi des lignes. */

const SEVERITY = {
  crit: { rank: 0, label: 'Perturbation', icon: 'alert' },
  warn: { rank: 1, label: 'Attention', icon: 'alert' },
  info: { rank: 2, label: 'Information', icon: 'info' }
};

function visibleAlerts(filter, followed) {
  const today = startOfDay();
  return ALERTS.filter(a => a.end >= today)
    .filter(a => filter === 'all' || (filter === 'mine' ? a.lines.some(l => followed.includes(l)) : a.lines.includes(filter)))
    .sort((a, b) => SEVERITY[a.sev].rank - SEVERITY[b.sev].rank);
}

function alertCard(a) {
  const sev = SEVERITY[a.sev];
  return `<article class="card alert"><div class="sev ${a.sev}">${ic(sev.icon)}</div><div class="stack tight">
    <div class="chips center">${tag(sev.label, a.sev)}${a.lines.map(l => lineBadge(l)).join('')}${tag(alertActive(a) ? 'En cours' : 'À venir')}</div>
    <h3>${esc(a.title)}</h3><p>${esc(a.text)}</p>
    <p class="small muted">${a.from === a.to ? `Le ${fmtDate(a.start)}` : `Du ${fmtDate(a.start)} au ${fmtDate(a.end)}`}</p></div></article>`;
}

const infosView = {
  render(root) {
    const followed = store.get('follow', []), filter = state.infoFilter, list = visibleAlerts(filter, followed);
    const filters = [['all', 'Toutes'], ['mine', `Mes lignes${followed.length ? ` (${followed.length})` : ''}`], ...LINES.map(l => [l.id, l.id])];
    root.innerHTML = `${pageHead('Infos trafic', 'Travaux, déviations et perturbations. Suivez vos lignes pour les retrouver en un clic.')}
      <div class="stack narrow">
        <div class="card form">
          ${labelled('Filtrer', `<div class="chips">${filters.map(([value, label]) => chip({ html: esc(label), action: 'info-filter', data: { f: value }, pressed: filter === value })).join('')}</div>`)}
          ${labelled('Lignes que je suis', `<div class="chips">${LINES.map(l => chip({ html: `${lineBadge(l.id)} ${followed.includes(l.id) ? 'Suivie' : 'Suivre'}`, action: 'follow', data: { line: l.id }, pressed: followed.includes(l.id) })).join('')}</div>`)}
        </div>
        ${list.length ? list.map(alertCard).join('') : emptyState(filter === 'mine' && !followed.length ? 'Vous ne suivez aucune ligne pour le moment.' : 'Aucune information pour ce filtre.')}
      </div>`;
  }
};

ACTIONS['info-filter'] = el => { state.infoFilter = el.dataset.f; rerender(); };
