'use strict';
/* Vue « Itinéraire » : formulaire, résultats détaillés et plan synchronisé. */

const journeyAlerts = j => [...new Set(j.legs.flatMap(l => alertsForLines([l.line.id]).map(a => a.id)))];
const MAX_SAVED_TRIPS = 10;
const tripLabel = t => `${esc(STOPS[t.from].name)} → ${esc(STOPS[t.to].name)}${t.pmr ? ' · PMR' : ''}`;
const sameTrip = (a, b) => a.from === b.from && a.to === b.to && !!a.pmr === !!b.pmr;

/** Trajets enregistrés, nettoyés : arrêts inconnus, doublons et données corrompues sont écartés. */
function savedTrips() {
  const raw = store.get('trips', []), out = [];
  for (const t of Array.isArray(raw) ? raw : []) {
    if (t && STOPS[t.from] && STOPS[t.to] && t.from !== t.to && !out.some(o => sameTrip(o, t))) out.push({ from: t.from, to: t.to, pmr: !!t.pmr });
  }
  return out.slice(0, MAX_SAVED_TRIPS);
}
const currentTrip = p => ({ from: p.fromId, to: p.toId, pmr: !!p.pmr });

/** Une étape du trajet : horaire, arrêt de montée, ligne, arrêts intermédiaires. */
function legHtml(leg, index, journey) {
  const prev = journey.legs[index - 1], last = index === journey.legs.length - 1;
  const dest = STOPS[leg.line.order[leg.dir].at(-1)].name, count = leg.toIdx - leg.fromIdx, mid = leg.stops.slice(1, -1);
  const style = `--lc:${lineVar(leg.line.id)}`;
  return `${prev ? `<div class="xfer">Correspondance à ${esc(STOPS[leg.stops[0]].name)} · attente ${Math.round(leg.dep - prev.arr)} min</div>` : ''}
    <div class="leg" style="${style}"><div class="t">${fmtT(leg.dep)}</div><div class="stem"><i></i></div>
      <div class="body"><strong>${esc(STOPS[leg.stops[0]].name)}</strong>
        <div class="ride">${lineBadge(leg.line.id)}<span class="small muted">direction ${esc(dest)} · ${plural(count, 'arrêt')} · ${fmtKm(leg.km)} · ${Math.round(leg.arr - leg.dep)} min</span></div>
        ${mid.length ? `<details><summary>Arrêts desservis (${mid.length})</summary><ul>${mid.map(id => `<li>${esc(STOPS[id].name)}</li>`).join('')}</ul></details>` : ''}</div></div>
    ${last ? `<div class="leg" style="${style}"><div class="t">${fmtT(leg.arr)}</div><div class="stem"><i></i></div><div class="body last"><strong>${esc(STOPS[leg.stops.at(-1)].name)}</strong></div></div>` : ''}`;
}

function journeyCard(j, i, isSaved) {
  const total = Math.round(j.arr - j.dep), wait = Math.round(j.dep - j.start), changes = j.legs.length - 1;
  const alerts = journeyAlerts(j);
  return `<article class="card jcard${i === state.plan.sel ? ' sel' : ''}" aria-label="Itinéraire ${i + 1}">
    <div class="jtop"><div>${tag(j.label, i === 0 ? 'ok' : '')}
      <div class="jdur">${total} <small>min</small></div>
      <div class="small muted mono">${fmtT(j.dep)} → ${fmtT(j.arr)}${wait > 0 ? ` · départ dans ${wait} min` : ''}</div></div>
      <div class="jlegs">${j.legs.map((l, k) => (k ? ic('arrow') : '') + lineBadge(l.line.id)).join('')}</div></div>
    <div class="small muted">${changes ? plural(changes, 'correspondance') : 'Sans correspondance'} · ${fmtKm(j.km)} · ticket ${money(PRODUCT[SINGLE_TICKET].price)}</div>
    ${alerts.length ? banner('alert', `${plural(alerts.length, 'info')} trafic sur ce trajet. <a href="#infos">Voir les détails</a>`) : ''}
    <div class="legs">${j.legs.map((l, k) => legHtml(l, k, j)).join('')}</div>
    <div class="actions">
      ${button({ html: 'Voir sur la carte', action: 'show-map', data: { i }, cls: 'sm' })}
      ${button({ html: `${ic('star', isSaved ? 'fill' : '')} ${isSaved ? 'Trajet enregistré' : 'Enregistrer le trajet'}`, action: 'save-trip', cls: 'sm', pressed: isSaved })}
      ${button({ html: `${ic('copy')} Copier`, action: 'copy-trip', data: { i }, cls: 'sm' })}
      ${button({ html: 'Acheter un ticket', action: 'buy-ticket', cls: 'sm primary' })}</div></article>`;
}

const tripText = j => `Yoon Urbain · ${state.plan.from} → ${state.plan.to}\nDépart ${fmtT(j.dep)}, arrivée ${fmtT(j.arr)} (${Math.round(j.arr - j.dep)} min, ${fmtKm(j.km)})\n` +
  j.legs.map(l => `${l.line.id} : ${STOPS[l.stops[0]].name} (${fmtT(l.dep)}) → ${STOPS[l.stops.at(-1)].name} (${fmtT(l.arr)})`).join('\n');

const quickGroup = (label, chipsHtml) => `<div>${`<div class="lbl">${esc(label)}</div>`}<div class="chips">${chipsHtml}</div></div>`;

const planView = {
  map: null,

  render(root) {
    const p = state.plan, saved = savedTrips(), recents = store.get('recents', []), favs = store.get('favs', []);
    const stopInput = (id, value) => `<input type="text" id="${id}" list="stopList" autocomplete="off" placeholder="Nom d'un arrêt" value="${esc(value)}">`;
    const groups = [
      favs.length && quickGroup('Arrêts favoris', favs.map(f => chip({ html: `${ic('star', 'fill')} ${esc(STOPS[f].name)}`, action: 'use-stop', data: { stop: f } })).join('')),
      saved.length && quickGroup('Trajets enregistrés', saved.map((t, i) =>
        `<span class="chip has-x"><span data-action="use-trip"${dataAttrs({ from: t.from, to: t.to, pmr: t.pmr ? 1 : 0 })} role="button" tabindex="0">${tripLabel(t)}</span>${iconButton({ icon: 'x', action: 'del-trip', data: { i }, label: 'Supprimer ce trajet', cls: 'mini' })}</span>`).join('')),
      recents.length && quickGroup('Recherches récentes', recents.map(t => chip({ html: tripLabel(t), action: 'use-trip', data: { from: t.from, to: t.to, pmr: 0 } })).join(''))
    ].filter(Boolean);

    root.innerHTML = `
      <div class="head"><h1>Où allez-vous ?</h1>
        <div class="stats muted small">${stat(LINES.length, 'lignes')}${stat(STOP_LIST.length, 'arrêts')}${stat(ALERTS.filter(alertActive).length, "infos trafic aujourd'hui")}</div></div>
      <div class="split">
        <section class="stack" aria-label="Calcul d'itinéraire">
          <form class="card form" id="planForm" data-form="plan" novalidate>
            <div class="od">${field('pFrom', 'Départ', stopInput('pFrom', p.from))}
              ${iconButton({ icon: 'swap', action: 'swap', label: 'Inverser départ et arrivée' })}
              ${field('pTo', 'Arrivée', stopInput('pTo', p.to))}</div>
            <div class="row">
              ${field('pWhen', 'Horaire', `<select id="pWhen"><option value="now"${p.when === 'now' ? ' selected' : ''}>Partir maintenant</option><option value="at"${p.when === 'at' ? ' selected' : ''}>Partir à une heure précise</option></select>`)}
              ${field('pTime', 'Heure de départ', `<input type="time" id="pTime" value="${esc(p.time)}">`, { wrapId: 'pTimeWrap', hidden: p.when !== 'at' })}
              <label class="check"><input type="checkbox" id="pPmr"${p.pmr ? ' checked' : ''}> Accès PMR uniquement</label></div>
            <div class="err" id="pErr" role="alert">${esc(p.error)}</div>
            <button class="btn primary" type="submit">Rechercher un itinéraire</button>
          </form>
          ${groups.length ? `<div class="card flat stack">${groups.join('')}</div>` : ''}
          <div id="results" class="stack" aria-live="polite"></div>
        </section>
        <aside class="col-side">
          <div class="card map-card"><div id="mapMount" class="rel"></div>
            <div class="legend">${LINES.map(l => `<span>${lineBadge(l.id)} ${esc(l.name)}</span>`).join('')}</div></div>
          <div id="stopInfo"></div>
        </aside>
      </div>`;
    $('#pWhen').addEventListener('change', e => { $('#pTimeWrap').hidden = e.target.value !== 'at'; });
    this.map = NetworkMap($('#mapMount'), { onStop: id => { $('#stopInfo').innerHTML = stopCard(id); } });
    if (p.results) this.showResults();
  },

  /** Lit le formulaire et le range dans l'état. */
  readForm() {
    Object.assign(state.plan, { from: $('#pFrom').value, to: $('#pTo').value, when: $('#pWhen').value, time: $('#pTime').value, pmr: $('#pPmr').checked, error: '' });
  },

  /** Vérifie la saisie. Renvoie { from, to, start, tomorrow } ou { error, field }. */
  validate() {
    const p = state.plan, from = findStop(p.from), to = findStop(p.to);
    if (!from) return { field: '#pFrom', error: p.from.trim() ? `Arrêt de départ introuvable : « ${p.from.trim()} ». Choisissez un nom dans la liste proposée.` : 'Indiquez un arrêt de départ.' };
    if (!to) return { field: '#pTo', error: p.to.trim() ? `Arrêt d'arrivée introuvable : « ${p.to.trim()} ». Choisissez un nom dans la liste proposée.` : "Indiquez un arrêt d'arrivée." };
    if (from.id === to.id) return { field: '#pTo', error: "Le départ et l'arrivée sont identiques." };
    if (p.pmr && (!from.acc || !to.acc)) return { field: from.acc ? '#pTo' : '#pFrom', error: `L'arrêt ${(from.acc ? to : from).name} n'est pas accessible aux personnes à mobilité réduite.` };
    let start = Math.floor(nowMin()), tomorrow = false;
    if (p.when === 'at') {
      if (!p.time) return { field: '#pTime', error: "Indiquez l'heure de départ." };
      start = toMin(p.time);
      if (start < Math.floor(nowMin()) - 1) { start += MIN_PER_DAY; tomorrow = true; }
    }
    return { from, to, start, tomorrow };
  },

  submit() {
    this.readForm();
    $$('#planForm [aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    const fail = (message, fieldSel) => {
      Object.assign(state.plan, { error: message, results: null });
      $('#pErr').textContent = message; $('#results').innerHTML = ''; this.map.highlight(null);
      if (fieldSel) { const el = $(fieldSel); el.setAttribute('aria-invalid', 'true'); el.focus(); }
    };
    const v = this.validate();
    if (v.error) return fail(v.error, v.field);

    const p = state.plan;
    let { start, tomorrow } = v, results = planJourneys(v.from.id, v.to.id, start, p.pmr, dayFactor(start >= MIN_PER_DAY ? 1 : 0));
    if (!results.length && start < MIN_PER_DAY) { // plus de service ce soir : proposer demain matin
      results = planJourneys(v.from.id, v.to.id, MIN_PER_DAY + FIRST_SERVICE, p.pmr, dayFactor(1));
      tomorrow = results.length > 0;
    }
    if (!results.length) return fail("Aucun itinéraire trouvé à cette heure. Essayez un autre horaire ou désactivez l'option accès PMR.");

    Object.assign(p, { from: v.from.name, to: v.to.name, fromId: v.from.id, toId: v.to.id, tomorrow, results, sel: 0 });
    $('#pFrom').value = p.from; $('#pTo').value = p.to; $('#pErr').textContent = '';
    store.set('recents', [{ from: v.from.id, to: v.to.id }, ...store.get('recents', []).filter(r => !(r.from === v.from.id && r.to === v.to.id))].slice(0, 5));
    this.showResults();
  },

  showResults() {
    const p = state.plan, saved = savedTrips().some(t => sameTrip(t, currentTrip(p)));
    $('#results').innerHTML = `<h2>${esc(p.from)} ${ic('arrow')} ${esc(p.to)}</h2>` +
      (p.tomorrow ? "<p class=\"small muted\">Plus de service aujourd'hui sur ce trajet à cette heure : horaires du premier départ de demain.</p>" : '') +
      p.results.map((j, i) => journeyCard(j, i, saved)).join('');
    this.map.highlight(p.results[p.sel]);
  }
};

FORMS.plan = () => planView.submit();

/** Pré-remplit un champ du formulaire sans lancer la recherche. */
function fillStop(which, stopId) {
  const p = state.plan, name = STOPS[stopId].name;
  p[which] = name; p.results = null;
  if (app.name === 'itineraire') { $(which === 'from' ? '#pFrom' : '#pTo').value = name; toast(`${which === 'from' ? 'Départ' : 'Arrivée'} : ${name}`); }
  else go('itineraire');
}

Object.assign(ACTIONS, {
  swap() { const a = $('#pFrom'), b = $('#pTo'); [a.value, b.value] = [b.value, a.value]; },
  'use-stop'(el) {
    const a = $('#pFrom'), b = $('#pTo'), name = STOPS[el.dataset.stop].name;
    (a.value.trim() ? b : a).value = name;
  },
  'use-trip'(el) {
    const { from, to, pmr } = el.dataset;
    if (!STOPS[from] || !STOPS[to]) return toast('Cet arrêt n\'existe plus sur le réseau');
    const p = state.plan;
    p.from = STOPS[from].name; p.to = STOPS[to].name;
    $('#pFrom').value = p.from; $('#pTo').value = p.to;
    if (pmr === '1') $('#pPmr').checked = true; // un trajet PMR enregistré garde son option ; les autres respectent la case actuelle
    planView.submit();
  },
  'del-trip'(el) {
    const trips = savedTrips();
    trips.splice(+el.dataset.i, 1);
    store.set('trips', trips); toast('Trajet supprimé'); rerender();
  },
  'from-here'(el) { fillStop('from', el.dataset.stop); },
  'to-here'(el) { fillStop('to', el.dataset.stop); },
  'show-map'(el) { state.plan.sel = +el.dataset.i; planView.showResults(); $('#mapMount').scrollIntoView({ block: 'center', behavior: 'smooth' }); },
  'save-trip'() {
    const p = state.plan, trips = savedTrips(), i = trips.findIndex(t => sameTrip(t, currentTrip(p)));
    if (i < 0 && trips.length >= MAX_SAVED_TRIPS) return toast(`Limite de ${MAX_SAVED_TRIPS} trajets atteinte : supprimez-en un d'abord`);
    i < 0 ? trips.unshift(currentTrip(p)) : trips.splice(i, 1);
    store.set('trips', trips); toast(i < 0 ? 'Trajet enregistré' : 'Trajet retiré'); rerender();
  },
  'copy-trip'(el) { copyText(tripText(state.plan.results[+el.dataset.i])); },
  'buy-ticket'() { state.cart[SINGLE_TICKET] = (state.cart[SINGLE_TICKET] || 0) + 1; go('billets'); }
});
