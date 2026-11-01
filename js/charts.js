'use strict';
/* Graphiques du tableau de bord : fonctions qui dessinent dans un conteneur. Le survol est partagé (attachTips). */

const CHART_H = 240, CHART_M = { l: 46, r: 8, t: 10, b: 26 };

/** Plus petit maximum « rond » ≥ v, choisi pour que 4 intervalles donnent des repères lisibles (jamais 18,75 k). */
const NICE_STEPS = [1, 1.2, 1.6, 2, 2.4, 2.8, 3.2, 4, 4.8, 6, 8, 10];
const niceMax = v => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v)), f = v / p;
  return (NICE_STEPS.find(n => n >= f - 1e-9) || 10) * p;
};
const shortNumber = n => n >= 1000 ? String(Math.round(n / 100) / 10).replace('.', ',') + ' k' : String(Math.round(n));

/** Info-bulle commune : tout élément [data-tip-title][data-tip] du conteneur l'affiche au survol ou au toucher. */
function attachTips(host) {
  const tip = $('.tip', host);
  if (!tip) return;
  const show = e => {
    const el = e.target.closest('[data-tip]');
    if (!el || !host.contains(el)) return hide();
    tip.innerHTML = `<b>${esc(el.dataset.tipTitle || '')}</b>${el.dataset.tip.split('|').map(l => `<div>${esc(l)}</div>`).join('')}`;
    tip.hidden = false;
    const box = host.getBoundingClientRect(), r = el.getBoundingClientRect(), half = tip.offsetWidth / 2;
    tip.style.left = Math.min(Math.max(r.left - box.left + r.width / 2, half + 4), box.width - half - 4) + 'px';
    tip.style.top = Math.max(r.top - box.top, 0) + 'px';
  };
  const hide = () => { tip.hidden = true; };
  host.addEventListener('pointerover', show);
  host.addEventListener('pointerdown', show);
  host.addEventListener('pointerleave', hide);
}

/** Histogramme vertical : une colonne par jour, valeur en FCFA. `days` : [{ ts, n, ca }]. */
function columnChart(host, days, { label, color = 'var(--s1)' }) {
  const w = Math.max(host.clientWidth, 280), h = CHART_H, m = CHART_M, n = days.length;
  const iw = w - m.l - m.r, ih = h - m.t - m.b, yMax = niceMax(Math.max(...days.map(d => d.ca)));
  const y = v => m.t + ih - v / yMax * ih, step = iw / n, barW = Math.max(2, Math.min(30, step * .62));
  const dayText = d => new Date(d.ts).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  let svg = '';
  for (let i = 0; i <= 4; i++) {
    const v = yMax / 4 * i;
    svg += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule)"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${shortNumber(v)}</text>`;
  }
  const every = Math.ceil(n / (w < 420 ? 4 : 7));
  days.forEach((d, i) => {
    const cx = m.l + step * (i + .5), bh = d.ca / yMax * ih, x = cx - barW / 2, r = Math.min(4, bh / 2, barW / 2), top = y(d.ca);
    if (bh > 0) svg += `<path d="M${x} ${top + bh}V${top + r}Q${x} ${top} ${x + r} ${top}H${x + barW - r}Q${x + barW} ${top} ${x + barW} ${top + r}V${top + bh}Z" fill="${color}"/>`;
    if (i % every === 0) svg += `<text x="${cx}" y="${h - 7}" text-anchor="middle">${new Date(d.ts).getDate()}/${new Date(d.ts).getMonth() + 1}</text>`;
    svg += `<rect class="hitcol" x="${m.l + step * i}" y="${m.t}" width="${step}" height="${ih}" data-tip-title="${esc(dayText(d))}" data-tip="${esc(`${money(d.ca)}|${plural(d.n, 'billet')} vendu${d.n > 1 ? 's' : ''}`)}"/>`;
  });
  host.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${svg}</svg><div class="tip" hidden></div>`;
  attachTips(host);
}

/** Barres horizontales étiquetées (HTML) : une ligne par entité, couleur fixe par entité, valeur toujours visible. */
function barRows(items, { unit = money } = {}) {
  const max = Math.max(...items.map(i => i.ca), 0);
  return `<div class="barrows">${items.map(i => `<div class="barrow" data-tip-title="${esc(i.label)}" data-tip="${esc(`${unit(i.ca)}|${plural(i.n, 'billet')}|${i.share} % du total`)}">
    <span class="bl">${esc(i.label)}</span>
    <span class="track"><span class="fill" style="width:${max ? Math.max(i.ca / max * 100, i.ca ? 1.5 : 0) : 0}%;background:${i.color || 'var(--s1)'}"></span></span>
    <span class="bv mono">${unit(i.ca)}<small> · ${i.share} %</small></span></div>`).join('')}</div><div class="tip" hidden></div>`;
}
