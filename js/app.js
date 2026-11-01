'use strict';
/* Application : navigation par ancre, délégation d'événements, thème, horloge. Chargé en dernier. */

const VIEWS = { itineraire: planView, lignes: linesView, departs: boardView, carte: mapView, billets: ticketsView, tableau: dashboardView, infos: infosView, aide: helpView };
const NAV = [['itineraire', 'Itinéraire'], ['lignes', 'Lignes et horaires'], ['departs', 'Prochains passages'], ['carte', 'Plan'], ['billets', 'Billets'], ['tableau', 'Tableau de bord'], ['infos', 'Infos trafic'], ['aide', 'Aide']];
const TITLES = Object.fromEntries(NAV);
const BASE_TITLE = 'Yoon Urbain';

const go = name => { location.hash === `#${name}` ? route() : (location.hash = name); };

function renderNav() {
  const nav = $('#nav');
  nav.innerHTML = NAV.map(([key, label]) => `<a href="#${key}"${key === app.name ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  const current = $('[aria-current]', nav);
  if (current) nav.scrollLeft = current.offsetLeft - (nav.clientWidth - current.clientWidth) / 2; // garde l'onglet actif visible sur mobile
}

function route() {
  state.salesArmed = false;
  const [name, query = ''] = location.hash.slice(1).split('?');
  const wanted = new URLSearchParams(query).get('stop');
  if (name === 'departs' && wanted && STOPS[wanted] && state.board.stop !== wanted) { state.board.stop = wanted; state.board.filter.clear(); }
  app.name = VIEWS[name] ? name : 'itineraire';
  app.view = VIEWS[app.name];
  renderNav();
  const root = $('#app');
  app.view.render(root);
  root.classList.remove('view-enter'); void root.offsetWidth; root.classList.add('view-enter'); // relance l'animation d'entrée
  window.scrollTo(0, 0);
  document.title = app.name === 'itineraire' ? BASE_TITLE : `${BASE_TITLE} · ${TITLES[app.name]}`;
}

/** Redessine la vue courante en conservant le défilement et le champ actif. */
function rerender() {
  const y = window.scrollY, activeId = document.activeElement && document.activeElement.id;
  app.view.render($('#app'));
  window.scrollTo(0, y);
  const el = activeId && document.getElementById(activeId);
  if (el) el.focus({ preventScroll: true });
}

/* ---------- Thème ---------- */
ACTIONS.theme = () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  store.set('theme', root.dataset.theme);
};
ACTIONS.skip = () => $('#app').focus();

/* ---------- Événements délégués ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  const handler = el && ACTIONS[el.dataset.action];
  if (handler) { e.preventDefault(); handler(el, e); }
});
document.addEventListener('keydown', e => { // éléments role="button" non natifs
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('span[data-action]')) { e.preventDefault(); e.target.click(); }
});
document.addEventListener('submit', e => {
  const form = e.target.closest('[data-form]');
  if (form && FORMS[form.dataset.form]) { e.preventDefault(); FORMS[form.dataset.form](); }
});
window.addEventListener('hashchange', route);

/* ---------- Horloge et rafraîchissement des vues dynamiques (en pause quand l'onglet est caché) ---------- */
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const drawClock = () => { $('#clock').textContent = timeFmt.format(new Date()); };
const tick = () => { drawClock(); if (app.view && app.view.tick) app.view.tick(); };
setInterval(() => { if (!document.hidden) tick(); }, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

/* ---------- Démarrage ---------- */
$('#stopList').innerHTML = STOP_LIST.map(s => `<option value="${esc(s.name)}"></option>`).join('');
const savedTheme = store.get('theme', null);
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
$('#themeBtn').innerHTML = ic('moon');
if (paymentServerOn()) $('#payNote').textContent = 'Les paiements Orange Money et Wave sont confirmés par le serveur de paiement.';
drawClock();
route();
