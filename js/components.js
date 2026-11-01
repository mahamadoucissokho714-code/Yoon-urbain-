'use strict';
/* Composants d'interface réutilisables : chaque fonction renvoie du HTML prêt à insérer. */

const lineBadge = (id, big = false) => `<span class="lb${big ? ' big' : ''}" data-l="${id}" title="${esc(LINE[id].name)}">${id}</span>`;

/** Étiquette colorée. `tone` : ok | warn | crit | info | ''. */
const tag = (text, tone = '', icon = '') => `<span class="tag ${tone}">${icon ? ic(icon) + ' ' : ''}${esc(text)}</span>`;

/** Bouton. `html` est du contenu de confiance ; `data` devient des attributs data-*. */
const button = ({ html, action, data = {}, cls = '', pressed, label, type = 'button', disabled = false, id = '' }) =>
  `<button type="${type}" class="btn ${cls}"${id ? ` id="${id}"` : ''}${action ? ` data-action="${action}"` : ''}${dataAttrs(data)}` +
  `${pressed !== undefined ? ` aria-pressed="${pressed}"` : ''}${label ? ` aria-label="${esc(label)}"` : ''}${disabled ? ' disabled' : ''}>${html}</button>`;

const iconButton = ({ icon, action, data = {}, label, cls = '', pressed }) =>
  `<button type="button" class="icon-btn ${cls}" data-action="${action}"${dataAttrs(data)} aria-label="${esc(label)}"${pressed !== undefined ? ` aria-pressed="${pressed}"` : ''}>${ic(icon, pressed ? 'fill' : '')}</button>`;

/** Pastille cliquable (filtre, raccourci). */
const chip = ({ html, action, data = {}, pressed }) =>
  `<button type="button" class="chip" data-action="${action}"${dataAttrs(data)}${pressed !== undefined ? ` aria-pressed="${pressed}"` : ''}>${html}</button>`;

/** Groupe de boutons exclusifs (un seul actif). */
const segmented = ({ label, action, options, current }) =>
  `<div><div class="lbl">${esc(label)}</div><div class="seg" role="group" aria-label="${esc(label)}">${options.map(o =>
    `<button type="button" data-action="${action}" data-value="${esc(o.value)}" aria-pressed="${o.value === current}">${o.label}</button>`).join('')}</div></div>`;

const field = (id, label, control, { hidden = false, wrapId = '' } = {}) =>
  `<div class="field"${wrapId ? ` id="${wrapId}"` : ''}${hidden ? ' hidden' : ''}><label for="${id}">${esc(label)}</label>${control}</div>`;

const labelled = (label, inner) => `<div><div class="lbl">${esc(label)}</div>${inner}</div>`;
const emptyState = text => `<div class="empty">${text}</div>`;
const banner = (icon, html) => `<div class="banner">${ic(icon)} ${html}</div>`;
const pageHead = (title, subtitle = '') => `<div class="head"><h1>${esc(title)}</h1>${subtitle ? `<p class="muted">${subtitle}</p>` : ''}</div>`;
const stat = (value, label) => `<div><b>${value}</b>${label}</div>`;
const pmrTag = stop => stop.acc ? tag('Accessible PMR', 'ok', 'access') : tag('Non accessible PMR', 'warn', 'access');

/** Fiche d'un arrêt : lignes, accessibilité, prochains passages et raccourcis. */
function stopCard(id) {
  const stop = STOPS[id], isFav = store.get('favs', []).includes(id);
  const next = upcoming(id, nowMin(), 4, null, dayFactor());
  const alerts = alertsForLines(stopLines(id));
  return `<div class="card stopcard">
    <div class="jtop"><div><h3>${esc(stop.name)}</h3>
      <div class="chips">${stopLines(id).map(l => lineBadge(l)).join('')}${pmrTag(stop)}</div></div>
      ${iconButton({ icon: 'star', action: 'fav', data: { stop: id }, pressed: isFav, label: `${isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'} : ${stop.name}`, cls: isFav ? 'on' : '' })}</div>
    <div class="dep-list">${next.map(d => `<div class="dep">${lineBadge(d.line.id)}<span class="to">vers ${esc(d.dest)}</span><span class="mono">${fmtT(d.time)}</span></div>`).join('')}</div>
    ${alerts.length ? `<div class="small muted">${ic('alert')} ${plural(alerts.length, 'info')} trafic en cours sur les lignes de cet arrêt.</div>` : ''}
    <div class="actions">${button({ html: "Partir d'ici", action: 'from-here', data: { stop: id }, cls: 'sm primary' })}
      ${button({ html: 'Arriver ici', action: 'to-here', data: { stop: id }, cls: 'sm' })}
      ${button({ html: 'Tous les passages', action: 'board-here', data: { stop: id }, cls: 'sm' })}</div></div>`;
}

/* ---------- QR codes : bibliothèque chargée uniquement quand un [data-qr] est affiché ---------- */
const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';

function drawQRCodes(size = 104, scope = document) {
  const targets = [...scope.querySelectorAll('[data-qr]')];
  if (!targets.length) return;
  const fallback = el => { el.textContent = el.dataset.qr; };
  loadScript(QR_LIB).then(() => targets.forEach(el => {
    el.innerHTML = '';
    try { new QRCode(el, { text: el.dataset.qr, width: size, height: size, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M }); }
    catch (e) { fallback(el); }
  })).catch(() => targets.forEach(fallback));
}

/** Adresse directe des prochains passages d'un arrêt (ouverte par le QR code de l'arrêt). */
const stopLink = id => `${location.href.split('#')[0]}#departs?stop=${encodeURIComponent(id)}`;
