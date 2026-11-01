'use strict';
/* Vue « Billets » : tarifs, panier, paiement simulé, portefeuille de billets avec QR code, ventes. */


/* Moyens de paiement. `phone` : un numéro est demandé. Ajouter un moyen = ajouter une entrée ici (le reste s'adapte). */
const ORANGE_PATTERN = /^(\+?221)?7[78]\d{7}$/;            // numéros Orange : préfixes 77 et 78
const WAVE_PATTERN = /^(\+?221)?7[05-8]\d{7}$/;           // Wave accepte tout numéro mobile sénégalais
const PAYMENT_METHODS = [
  { id: 'orange', label: 'Orange Money', phone: true, pattern: ORANGE_PATTERN, example: '77 123 45 67', prefixes: '77 ou 78' },
  { id: 'wave', label: 'Wave', phone: true, pattern: WAVE_PATTERN, example: '70 123 45 67', prefixes: '70, 75, 76, 77 ou 78' },
  { id: 'agence', label: `Espèces en agence (réservation ${RESERVATION_HOURS} h)`, phone: false }
];
const PAYMENT = Object.fromEntries(PAYMENT_METHODS.map(m => [m.id, m]));
const methodLabel = id => (PAYMENT[id] ? PAYMENT[id].label : 'Mobile money'); // anciens billets : moyen non enregistré
const CHECKOUT_DELAY_MS = 1400;

const cartItems = () => Object.entries(state.cart).filter(([, qty]) => qty > 0);
const cartTotal = () => cartItems().reduce((sum, [id, qty]) => sum + PRODUCT[id].price * qty, 0);
const addUnits = (list, qty, make) => { for (let i = 0; i < qty; i++) list.push(make()); };

function ticketStatus(t) {
  if (!t.activatedAt) return { key: 'new', label: 'À activer', tone: 'info' };
  return Date.now() < t.expiresAt ? { key: 'active', label: 'Actif', tone: 'ok' } : { key: 'expired', label: 'Expiré', tone: 'crit' };
}
function remaining(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  return d ? `${d} j ${h} h` : h ? `${h} h ${pad2(m)} min` : `${pad2(m)} min ${pad2(s % 60)} s`;
}

const productCard = p => `<article class="card prod"><div><h3>${esc(p.name)}</h3><p class="small muted mt">${esc(p.desc)}</p></div>
  <div class="price">${numberFmt.format(p.price)} <small>FCFA</small></div>
  ${button({ html: `${ic('plus')} Ajouter`, action: 'add-cart', data: { id: p.id }, cls: p.id === SINGLE_TICKET ? 'primary' : '' })}</article>`;

function ticketCard(t) {
  const st = ticketStatus(t);
  const actions = st.key === 'new'
    ? `<div class="actions">${button({ html: 'Activer maintenant', action: 'activate', data: { id: t.id }, cls: 'sm primary' })}${button({ html: ic('trash'), action: 'del-ticket', data: { id: t.id }, cls: 'sm', label: 'Supprimer ce billet' })}</div>`
    : st.key === 'expired' ? button({ html: `${ic('trash')} Supprimer`, action: 'del-ticket', data: { id: t.id }, cls: 'sm' }) : '';
  const qr = st.key === 'active' ? `<div class="qr" data-qr="${esc(`YOON|${t.id}|${t.pid}|${t.expiresAt}`)}"></div>`
    : `<div class="qr off">${st.key === 'new' ? "Le code s'affiche à l'activation" : 'Code invalide'}</div>`;
  return `<article class="card tk" data-tk="${t.id}"><div class="stack tight">
    <div>${tag(st.label, st.tone)}</div><h3>${esc(PRODUCT[t.pid].name)}</h3>
    <p class="small muted">Titulaire : ${esc(t.name)} · payé avec ${esc(methodLabel(t.method))}<br><span class="mono">${esc(t.id)}</span></p>
    ${st.key === 'active' ? `<p class="mono small" data-expires="${t.expiresAt}">Expire dans ${remaining(t.expiresAt - Date.now())}</p>` : ''}${actions}</div>${qr}</article>`;
}

const reservationCard = r => `<div class="card tk"><div>${tag('À régler en agence', 'warn')}<h3 class="mt">Réservation ${esc(r.code)}</h3>
  <p class="small muted">${r.items.map(i => `${i.qty} × ${esc(PRODUCT[i.id].name)}`).join(', ')} · ${money(r.total)}<br>Pour ${esc(r.name)}, valable jusqu'au ${new Date(r.until).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p></div>
  ${button({ html: 'Annuler', action: 'cancel-resa', data: { code: r.code }, cls: 'sm' })}</div>`;

function cartRow([id, qty]) {
  const p = PRODUCT[id];
  const step = (delta, icon, verb) => `<button type="button" data-action="qty" data-id="${id}" data-d="${delta}" aria-label="${verb} un ${esc(p.name)}">${ic(icon)}</button>`;
  return `<div class="cartrow"><div><strong>${esc(p.name)}</strong><div class="small muted">${money(p.price)}</div></div>
    <div class="qty">${step(-1, 'minus', 'Retirer')}<span class="mono" aria-live="polite">${qty}</span>${step(1, 'plus', 'Ajouter')}</div><span class="mono">${money(p.price * qty)}</span></div>`;
}

function checkoutPanel() {
  const items = cartItems();
  return `<form class="card form" id="checkoutForm" data-form="checkout" novalidate><h2>Panier</h2>
    ${items.length ? items.map(cartRow).join('') + `<div class="jtop"><strong>Total</strong><span class="price sm">${money(cartTotal())}</span></div>` : emptyState('Votre panier est vide.')}
    ${items.some(([id]) => PRODUCT[id].student) ? "<label class=\"check\"><input type=\"checkbox\" id=\"cStud\"> Je possède une carte d'étudiant valide</label>" : ''}
    ${field('cName', 'Nom du titulaire', '<input type="text" id="cName" autocomplete="name" placeholder="Prénom Nom">')}
    ${field('cMethod', 'Moyen de paiement', `<select id="cMethod">${PAYMENT_METHODS.map(m => `<option value="${m.id}">${esc(m.label)}</option>`).join('')}</select>`)}
    ${field('cPhone', 'Numéro de mobile', '<input type="tel" id="cPhone" inputmode="tel" autocomplete="tel" placeholder="77 123 45 67">', { wrapId: 'cPhoneWrap' })}
    <div class="payqr" id="cQrWrap" hidden><div class="qr" id="cQr"></div>
      <p class="small muted" id="cQrNote"></p></div>
    <div class="err" id="cErr" role="alert"></div>
    ${button({ html: `Payer ${items.length ? money(cartTotal()) : ''}`, type: 'submit', id: 'cSubmit', cls: 'primary', disabled: !items.length })}
    <p class="small muted">${paymentServerOn()
      ? 'Votre billet est délivré dès que le serveur de paiement reçoit la confirmation de l\'opérateur.'
      : 'Paiement simulé : Orange Money et Wave ne sont pas contactés, aucun débit n\'est effectué et aucune donnée n\'est envoyée.'}</p></form>`;
}

/** Tableau de bord des ventes, calculé à partir du registre local. */
function salesPanel() {
  const sales = store.get('sales', []), t0 = startOfDay().getTime();
  const sum = list => list.reduce((acc, s) => acc + s.price, 0);
  const total = sum(sales), today = sales.filter(s => s.at >= t0);
  const rows = PRODUCTS.map(p => { const mine = sales.filter(s => s.pid === p.id), ca = sum(mine); return { p, n: mine.length, ca, share: total ? Math.round(ca / total * 100) : 0 }; });
  const methods = PAYMENT_METHODS.filter(m => m.phone).map(m => { const mine = sales.filter(x => x.method === m.id); return { label: m.label, n: mine.length, ca: sum(mine) }; });
  const legacy = sales.filter(x => !PAYMENT[x.method]);
  if (legacy.length) methods.push({ label: 'Mobile money (ancien)', n: legacy.length, ca: sum(legacy) });
  return `<section class="card stack" aria-label="Ventes de billets">
    <div class="jtop"><h2>Ventes de billets</h2>${button({ html: state.salesArmed ? 'Confirmer la remise à zéro' : 'Remettre à zéro', action: 'reset-sales', cls: 'sm', disabled: !sales.length })}</div>
    <p class="small muted">Calculées automatiquement à chaque paiement accepté. Les chiffres sont enregistrés sur cet appareil uniquement.</p>
    <div class="stats">${stat(sales.length, 'billets vendus')}${stat(money(total), "chiffre d'affaires")}${stat(today.length, `vendus aujourd'hui (${money(sum(today))})`)}</div>
    <div class="chips" aria-label="Répartition par moyen de paiement">${methods.map(m => `<span class="tag">${esc(m.label)} : ${m.n} · ${money(m.ca)}</span>`).join('')}</div>
    <div class="tablewrap"><table><thead><tr><th>Titre</th><th>Prix</th><th>Vendus</th><th>Montant</th><th>Part</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.p.name)}</td><td class="mono">${money(r.p.price)}</td><td class="mono">${r.n}</td><td class="mono">${money(r.ca)}</td><td class="mono">${r.share} %</td></tr>`).join('')}
      <tr><td><strong>Total</strong></td><td></td><td class="mono"><strong>${sales.length}</strong></td><td class="mono"><strong>${money(total)}</strong></td><td class="mono">${total ? 100 : 0} %</td></tr></tbody></table></div></section>`;
}

const ticketsView = {
  render(root) {
    // Le formulaire de paiement est reconstruit à chaque rendu : on conserve la saisie en cours.
    const kept = ['#cName', '#cPhone', '#cMethod'].map(sel => $(sel)?.value), keptStudent = $('#cStud')?.checked;
    const wallet = store.get('tickets', []), reservations = store.get('resa', []);
    root.innerHTML = `${pageHead('Tarifs et billets', "Achetez vos titres de transport, puis activez-les au moment de monter dans le bus. Paiement simulé : rien n'est débité.")}
      <div class="split wide-left">
        <div class="stack">
          <div class="grid">${PRODUCTS.map(productCard).join('')}</div>
          <section class="stack" id="walletSection"><h2>Mes billets</h2>
            ${reservations.map(reservationCard).join('')}
            ${wallet.length ? wallet.map(ticketCard).join('') : reservations.length ? '' : emptyState("Vous n'avez pas encore de billet. Ajoutez un titre au panier pour commencer.")}
          </section>
          ${salesPanel()}
        </div>
        <aside class="col-side">${checkoutPanel()}</aside>
      </div>`;
    ['#cName', '#cPhone', '#cMethod'].forEach((sel, i) => { if (kept[i]) $(sel).value = kept[i]; });
    if (keptStudent && $('#cStud')) $('#cStud').checked = true;
    const syncPhone = () => {
      const method = PAYMENT[$('#cMethod').value];
      $('#cPhoneWrap').hidden = !method.phone;
      if (method.phone) $('#cPhone').placeholder = method.example;
      this.showPayQR(method);
    };
    $('#cMethod').addEventListener('change', syncPhone); syncPhone();
    drawQRCodes();
  },

  /** QR de paiement : référence + montant à scanner dans l'appli de l'opérateur (simulation, format non officiel). */
  showPayQR(method) {
    const wrap = $('#cQrWrap'), total = cartTotal();
    wrap.hidden = !(method.phone && total);
    if (wrap.hidden) return;
    state.payRef = state.payRef || genId('PAY', 8);
    const qr = $('#cQr');
    qr.dataset.qr = `YOONPAY|${method.id}|${total}|${state.payRef}`;
    $('#cQrNote').innerHTML = `Ou scannez avec l'appli ${esc(method.label)} pour payer <b>${money(total)}</b>. Référence : <span class="mono">${state.payRef}</span>.<br>Démonstration : ce code n'est pas au format officiel de ${esc(method.label)}, il ne déclenche aucun débit ; validez avec « Payer ».`;
    drawQRCodes(112, wrap);
  },

  tick() {
    let expired = false;
    $$('[data-expires]').forEach(el => {
      const left = +el.dataset.expires - Date.now();
      left <= 0 ? (expired = true) : (el.textContent = `Expire dans ${remaining(left)}`);
    });
    if (expired) rerender();
  },

  /** Vérifie le formulaire. Renvoie { name, method } ou { error, field }. */
  validateCheckout() {
    const name = $('#cName').value.trim(), method = $('#cMethod').value, phone = $('#cPhone').value.replace(/[\s.-]/g, ''), pay = PAYMENT[method];
    if (!cartItems().length) return { error: 'Ajoutez au moins un titre au panier.' };
    if (name.length < 3) return { field: '#cName', error: 'Indiquez le nom du titulaire (3 caractères minimum).' };
    if ($('#cStud') && !$('#cStud').checked) return { field: '#cStud', error: "Le tarif étudiant nécessite une carte d'étudiant valide." };
    if (pay.phone && !pay.pattern.test(phone)) return { field: '#cPhone', error: `Numéro ${pay.label} invalide. Exemple : ${pay.example} (préfixes ${pay.prefixes}).` };
    return { name, method };
  },

  checkout() {
    if (state.ticketBusy) return;
    $$('#checkoutForm [aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    const v = this.validateCheckout();
    $('#cErr').textContent = v.error || '';
    if (v.error) { if (v.field) { $(v.field).setAttribute('aria-invalid', 'true'); $(v.field).focus(); } return; }

    state.ticketBusy = true;
    const pay = PAYMENT[v.method], items = cartItems(), total = cartTotal();
    const btn = $('#cSubmit'); btn.disabled = true;
    const busy = text => { btn.innerHTML = `<span class="spinner"></span> ${esc(text)}`; };
    const release = message => {
      state.ticketBusy = false; $('#cErr').textContent = message || '';
      btn.disabled = false; btn.textContent = `Payer ${money(total)}`;
    };

    if (pay.phone && paymentServerOn()) {
      busy(`En attente de ${pay.label}…`);
      this.payWithServer(v, total).then(
        () => { state.ticketBusy = false; this.finalize(v, items, total); },
        e => {
          if (e instanceof PaymentError && e.kind === 'failed') state.payRef = null; // refus définitif : nouvelle référence au prochain essai
          release(e instanceof PaymentError ? e.message : 'Erreur inattendue pendant le paiement.');
        });
      return;
    }
    busy(pay.phone ? `Confirmation ${pay.label} (simulation)` : 'Enregistrement');
    setTimeout(() => { state.ticketBusy = false; this.finalize(v, items, total); }, CHECKOUT_DELAY_MS);
  },

  /** Mode serveur : enregistre le paiement puis attend la confirmation de l'opérateur. */
  async payWithServer({ method }, total) {
    state.payRef = state.payRef || genId('PAY', 8);
    const phone = $('#cPhone').value.replace(/[\s.-]/g, '').replace(/^\+?221/, '');
    await createPayment({ ref: state.payRef, amount: total, method, phone });
    await waitForPayment(state.payRef);
  },

  /** Enregistre la commande : billets + ventes (mobile money) ou réservation (agence). */
  finalize({ name, method }, items, total) {
    if (PAYMENT[method].phone) {
      const fresh = [], sales = store.get('sales', []).slice(), now = Date.now();
      items.forEach(([id, qty]) => {
        addUnits(fresh, qty, () => ({ id: genId('YU', 6), pid: id, name, createdAt: now, method, activatedAt: null, expiresAt: null }));
        addUnits(sales, qty, () => ({ pid: id, price: PRODUCT[id].price, method, at: now }));
      });
      store.set('tickets', [...fresh.reverse(), ...store.get('tickets', [])]); // les nouveaux billets en tête
      store.set('sales', sales);
      toast(`Paiement ${PAYMENT[method].label} simulé accepté : billets ajoutés`);
    } else {
      store.set('resa', [{ code: genId('RS', 5), name, total, items: items.map(([id, qty]) => ({ id, qty })), until: Date.now() + RESERVATION_HOURS * 3600e3 }, ...store.get('resa', [])]);
      toast(`Réservation enregistrée pour ${RESERVATION_HOURS} heures`);
    }
    state.cart = {}; state.payRef = null;
    rerender();
  }
};

FORMS.checkout = () => ticketsView.checkout();

Object.assign(ACTIONS, {
  'add-cart'(el) { const id = el.dataset.id; state.cart[id] = (state.cart[id] || 0) + 1; toast(`${PRODUCT[id].name} ajouté au panier`); rerender(); },
  qty(el) { const id = el.dataset.id, next = Math.max(0, (state.cart[id] || 0) + +el.dataset.d); next ? (state.cart[id] = next) : delete state.cart[id]; rerender(); },
  activate(el) {
    const wallet = store.get('tickets', []).map(t => ({ ...t })), t = wallet.find(x => x.id === el.dataset.id);
    if (!t) return;
    t.activatedAt = Date.now(); t.expiresAt = t.activatedAt + PRODUCT[t.pid].minutes * 60000;
    store.set('tickets', wallet); toast('Billet activé'); rerender();
  },
  'del-ticket'(el) { store.set('tickets', store.get('tickets', []).filter(t => t.id !== el.dataset.id)); rerender(); },
  'cancel-resa'(el) { store.set('resa', store.get('resa', []).filter(r => r.code !== el.dataset.code)); toast('Réservation annulée'); rerender(); },
  'reset-sales'() {
    if (!state.salesArmed) { state.salesArmed = true; rerender(); return; }
    state.salesArmed = false; store.set('sales', []); toast('Ventes remises à zéro'); rerender();
  }
});
