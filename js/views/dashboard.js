'use strict';
/* Vue « Tableau de bord » : ventes, moyens de paiement, billets, réseau et activité, sur un seul écran.
   Tout est calculé à partir des données de cet appareil. `dashboardModel` est pur : il ne touche ni au DOM ni au stockage. */

const DASH_RANGES = [{ value: '7', label: '7 jours', days: 7 }, { value: '30', label: '30 jours', days: 30 }, { value: 'all', label: 'Tout', days: null }];
const DASH_MAX_BARS = 60;      // barres affichées au plus (les totaux, eux, couvrent toute la période)
const DASH_RECENT_ROWS = 10;
const METHOD_COLOR = { orange: 'var(--s2)', wave: 'var(--s1)', legacy: 'var(--s3)' }; // la couleur suit le moyen de paiement, jamais son rang
const SEVERITY_TONE = { crit: 'crit', warn: 'warn', info: 'info' };

const dayStart = (ts, offset = 0) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + offset); return d.getTime(); };
const sumCa = list => list.reduce((acc, s) => acc + s.price, 0);
const percent = (part, whole) => whole ? Math.round(part / whole * 100) : 0;

/** Agrégats du tableau de bord. `data` : { sales, tickets, resa, favs, trips, requests }. */
function dashboardModel(data, rangeValue, now = Date.now()) {
  const range = DASH_RANGES.find(r => r.value === rangeValue) || DASH_RANGES[0];
  const all = data.sales, today0 = dayStart(now);
  const from = range.days ? dayStart(now, -(range.days - 1)) : -Infinity;
  const sales = all.filter(s => s.at >= from && s.at <= now);
  const total = sumCa(sales), todaySales = all.filter(s => s.at >= today0 && s.at <= now);

  const withShare = rows => rows.map(r => ({ ...r, share: percent(r.ca, total) }));
  const methods = PAYMENT_METHODS.filter(m => m.phone).map(m => ({ id: m.id, label: m.label, color: METHOD_COLOR[m.id], ...tally(sales.filter(s => s.method === m.id)) }));
  const legacy = sales.filter(s => !PAYMENT[s.method]);
  if (legacy.length) methods.push({ id: 'legacy', label: 'Mobile money (ancien)', color: METHOD_COLOR.legacy, ...tally(legacy) });
  const products = PRODUCTS.map(p => ({ id: p.id, label: p.name, ...tally(sales.filter(s => s.pid === p.id)) }));

  const chartFrom = Math.max(range.days ? from : (all.length ? dayStart(Math.min(...all.map(s => s.at))) : today0), dayStart(now, -(DASH_MAX_BARS - 1)));
  const days = [];
  for (let ts = chartFrom; ts <= today0; ts = dayStart(ts, 1)) days.push({ ts, ...tally(sales.filter(s => s.at >= ts && s.at < dayStart(ts, 1))) });

  const wallet = { new: 0, active: 0, expired: 0 };
  data.tickets.forEach(t => { wallet[ticketStatus(t).key]++; });
  const open = data.resa.filter(r => r.until > now);
  const alerts = ALERTS.filter(alertActive);

  return {
    range, sales: sales.length, total, average: sales.length ? Math.round(total / sales.length) : 0,
    today: { n: todaySales.length, ca: sumCa(todaySales) },
    methods: withShare(methods), products: withShare(products), days, hasSales: sales.length > 0,
    wallet, reservations: { n: open.length, total: open.reduce((a, r) => a + r.total, 0) },
    network: { lines: LINES.length, stops: STOP_LIST.length, pmr: STOP_LIST.filter(s => s.acc).length, alerts },
    activity: { favs: data.favs.length, trips: data.trips.length, requests: data.requests.length },
    recent: [...sales].sort((a, b) => b.at - a.at).slice(0, DASH_RECENT_ROWS)
  };
  function tally(list) { return { n: list.length, ca: sumCa(list) }; }
}

const readDashboardData = () => ({
  sales: store.get('sales', []), tickets: store.get('tickets', []), resa: store.get('resa', []),
  favs: store.get('favs', []), trips: store.get('trips', []), requests: store.get('requests', [])
});

/** Ventes de démonstration (30 jours), reproductibles et marquées `demo` pour pouvoir les retirer seules. */
function demoSales(now = Date.now()) {
  let seed = 20260101;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pick = weights => { let r = rnd() * weights.reduce((a, [, w]) => a + w, 0); for (const [v, w] of weights) if ((r -= w) < 0) return v; return weights[0][0]; };
  const out = [];
  for (let back = 29; back >= 0; back--) {
    const day = dayStart(now, -back), count = 4 + Math.floor(rnd() * 11);
    for (let i = 0; i < count; i++) {
      const at = day + (6 + Math.floor(rnd() * 15)) * 3600e3 + Math.floor(rnd() * 3600e3);
      if (at > now) continue;
      const pid = pick([['t90', 55], ['day', 20], ['week', 12], ['month', 8], ['stud', 5]]);
      out.push({ pid, price: PRODUCT[pid].price, method: pick([['wave', 55], ['orange', 45]]), at, demo: true });
    }
  }
  return out;
}

/* ---------- Affichage ---------- */
const dashState = { range: '7', mode: 'chart' };
const kpiMoney = n => `${numberFmt.format(n)} <small>FCFA</small>`;
const kpi = (label, value, sub = '') => `<div class="card kpi"><span class="small muted">${esc(label)}</span><b>${value}</b>${sub ? `<span class="small muted">${sub}</span>` : ''}</div>`;
const dashTable = (head, rows) => `<div class="tablewrap nowrap"><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td class="mono">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

function salesByDayCard(m) {
  const body = !m.hasSales ? emptyState('Aucune vente sur cette période.')
    : dashState.mode === 'table' ? dashTable(['Jour', 'Billets', 'Montant'], m.days.map(d => [new Date(d.ts).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }), d.n, money(d.ca)]))
    : '<div class="chartbox" id="dayChart"></div>';
  return `<section class="card stack" aria-label="Ventes par jour"><h2>Ventes par jour</h2>
    <p class="small muted">Chiffre d'affaires en FCFA${m.range.value === 'all' && m.days.length >= DASH_MAX_BARS ? ` — ${DASH_MAX_BARS} derniers jours affichés` : ''}.</p>${body}</section>`;
}

function methodsCard(m) {
  const rows = m.methods;
  const body = !m.hasSales ? emptyState('Aucun paiement enregistré sur cette période.')
    : dashState.mode === 'table' ? dashTable(['Moyen', 'Billets', 'Montant', 'Part'], rows.map(r => [esc(r.label), r.n, money(r.ca), `${r.share} %`]))
    : `<div class="chartbox">${barRows(rows)}</div>`;
  return `<section class="card stack" aria-label="Moyens de paiement"><h2>Moyens de paiement</h2>
    <p class="small muted">Orange Money et Wave. Les réservations en agence ne sont pas encore payées : elles figurent plus bas.</p>${body}</section>`;
}

function productsCard(m) {
  const body = !m.hasSales ? emptyState('Aucune vente sur cette période.')
    : dashState.mode === 'table' ? dashTable(['Titre', 'Billets', 'Montant', 'Part'], m.products.map(r => [esc(r.label), r.n, money(r.ca), `${r.share} %`]))
    : `<div class="chartbox">${barRows(m.products)}</div>`;
  return `<section class="card stack" aria-label="Ventes par titre"><h2>Ventes par titre</h2>${body}</section>`;
}

const walletCard = m => `<section class="card stack" aria-label="Billets et réservations"><h2>Billets et réservations</h2>
  <div class="stats">${stat(m.wallet.active, 'billets actifs')}${stat(m.wallet.new, 'à activer')}${stat(m.wallet.expired, 'expirés')}</div>
  <p class="small muted">${m.reservations.n ? `${plural(m.reservations.n, 'réservation')} à régler en agence, ${money(m.reservations.total)} au total.` : 'Aucune réservation en attente.'}</p>
  <a class="btn sm" href="#billets">Voir mes billets</a></section>`;

const networkCard = m => `<section class="card stack" aria-label="Réseau"><h2>Réseau</h2>
  <div class="stats">${stat(m.network.lines, 'lignes')}${stat(m.network.stops, 'arrêts')}${stat(`${percent(m.network.pmr, m.network.stops)} %`, 'arrêts accessibles PMR')}</div>
  ${m.network.alerts.length ? `<div class="stack tight">${m.network.alerts.map(a => `<div class="dep two"><span>${tag(a.sev === 'crit' ? 'Interruption' : a.sev === 'warn' ? 'Perturbation' : 'Info', SEVERITY_TONE[a.sev])} ${esc(a.title)}</span><span class="small muted">${a.lines.join(', ')}</span></div>`).join('')}</div>`
    : '<p class="small muted">Aucune perturbation en cours.</p>'}
  <a class="btn sm" href="#infos">Toutes les infos trafic</a></section>`;

const activityCard = m => `<section class="card stack" aria-label="Activité sur cet appareil"><h2>Activité sur cet appareil</h2>
  <div class="stats">${stat(m.activity.favs, 'arrêts favoris')}${stat(m.activity.trips, 'trajets enregistrés')}${stat(m.activity.requests, 'demandes envoyées')}</div>
  <div class="actions"><a class="btn sm" href="#itineraire">Calculer un itinéraire</a><a class="btn sm" href="#aide">Aide et contact</a></div></section>`;

/** État du site : mode de paiement, version et installation. Lit la configuration et le navigateur, jamais le stockage. */
function siteStatus() {
  const cfg = window.YOON_CONFIG || {}, server = paymentServerOn();
  let host = '';
  try { host = server ? new URL(cfg.paymentApi).host : ''; } catch (e) { host = cfg.paymentApi || ''; }
  return {
    payment: server ? `Serveur de paiement (${host})` : 'Démonstration : paiements simulés, aucun débit',
    release: `${cfg.env || 'development'} · ${cfg.release || 'dev'}`,
    installed: typeof isStandalone === 'function' && isStandalone(),
    offline: Boolean(navigator.serviceWorker && navigator.serviceWorker.controller)
  };
}

const siteCard = () => {
  const st = siteStatus();
  return `<section class="card stack" aria-label="État du site"><h2>État du site</h2>
    <div class="dep two"><span>Paiements Orange Money et Wave</span><span class="small">${esc(st.payment)}</span></div>
    <div class="dep two"><span>Version</span><span class="small mono">${esc(st.release)}</span></div>
    <div class="dep two"><span>Application</span><span class="small">${st.installed ? 'Installée sur cet appareil' : 'Ouverte dans le navigateur'}</span></div>
    <div class="dep two"><span>Mode hors ligne</span><span class="small">${st.offline ? 'Actif' : 'Inactif (actif sur le site en ligne)'}</span></div></section>`;
};

const recentCard = m => `<section class="card stack" aria-label="Dernières ventes"><h2>Dernières ventes</h2>${m.recent.length
  ? dashTable(['Date', 'Titre', 'Moyen', 'Montant'], m.recent.map(s => [new Date(s.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), esc(PRODUCT[s.pid] ? PRODUCT[s.pid].name : s.pid), esc(methodLabel(s.method)), money(s.price)]))
  : emptyState('Aucune vente pour le moment. Achetez un billet depuis la page Billets, ou chargez des ventes de démonstration.')}</section>`;

const dashboardView = {
  render(root) {
    const data = readDashboardData(), m = dashboardModel(data, dashState.range);
    const hasDemo = data.sales.some(s => s.demo);
    root.innerHTML = `${pageHead('Tableau de bord', 'Ventes, moyens de paiement et activité du site, calculés sur cet appareil. Rien n\'est envoyé à un serveur.')}
      <div class="stack">
        <div class="toolbar">
          ${segmented({ label: 'Période', action: 'dash-range', current: dashState.range, options: DASH_RANGES.map(r => ({ value: r.value, label: r.label })) })}
          ${segmented({ label: 'Affichage', action: 'dash-mode', current: dashState.mode, options: [{ value: 'chart', label: 'Graphiques' }, { value: 'table', label: 'Tableaux' }] })}
          <div class="actions">${hasDemo
            ? button({ html: 'Retirer les ventes de démonstration', action: 'dash-demo-clear', cls: 'sm' })
            : button({ html: 'Charger des ventes de démonstration', action: 'dash-demo', cls: 'sm' })}</div>
        </div>
        ${hasDemo ? banner('info', 'Des ventes de <strong>démonstration</strong> sont chargées : elles apparaissent aussi sur la page Billets.') : ''}
        <div class="kpis">
          ${kpi('Billets vendus', m.sales, m.range.label.toLowerCase() === 'tout' ? 'depuis le début' : `sur ${m.range.label}`)}
          ${kpi("Chiffre d'affaires", kpiMoney(m.total), m.sales ? `panier moyen ${money(m.average)}` : '')}
          ${kpi("Vendus aujourd'hui", m.today.n, money(m.today.ca))}
          ${kpi('Billets actifs', m.wallet.active, `${m.wallet.new} à activer`)}
          ${kpi('À régler en agence', m.reservations.n, m.reservations.n ? money(m.reservations.total) : 'aucune réservation')}
          ${kpi('Perturbations', m.network.alerts.length, 'en cours sur le réseau')}
        </div>
        ${salesByDayCard(m)}
        <div class="split">${methodsCard(m)}${productsCard(m)}</div>
        <div class="split">${walletCard(m)}${networkCard(m)}</div>
        <div class="split">${activityCard(m)}${siteCard()}</div>
        ${recentCard(m)}
      </div>`;
    this.draw(m);
  },
  /** Dessine les graphiques (largeur mesurée) et branche les info-bulles des barres. */
  draw(m = dashboardModel(readDashboardData(), dashState.range)) {
    if (dashState.mode !== 'chart' || !m.hasSales) return;
    const host = $('#dayChart');
    if (host) columnChart(host, m.days, { label: "Chiffre d'affaires par jour" });
    $$('.chartbox').forEach(box => { if (box.id !== 'dayChart') attachTips(box); });
  }
};

Object.assign(ACTIONS, {
  'dash-range'(el) { dashState.range = el.dataset.value; rerender(); },
  'dash-mode'(el) { dashState.mode = el.dataset.value; rerender(); },
  'dash-demo'() { store.set('sales', [...store.get('sales', []), ...demoSales()]); toast('Ventes de démonstration chargées'); rerender(); },
  'dash-demo-clear'() { store.set('sales', store.get('sales', []).filter(s => !s.demo)); toast('Ventes de démonstration retirées'); rerender(); }
});
let dashResizeTimer;
if (typeof window !== 'undefined') { // redessine les graphiques quand la largeur change (absent des tests sans navigateur)
  window.addEventListener('resize', () => { clearTimeout(dashResizeTimer); dashResizeTimer = setTimeout(() => { if (app.name === 'tableau') dashboardView.draw(); }, 150); });
}
