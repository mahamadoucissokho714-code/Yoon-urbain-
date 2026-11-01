'use strict';
/* Vue « Aide » : questions fréquentes et formulaire de contact enregistré localement. */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_MESSAGE = 20;
const REASONS = ['Objet perdu', 'Réclamation', 'Suggestion', 'Question sur un billet', 'Autre'];

const requestRow = r => `<div class="dep two"><span><strong>${esc(r.ref)}</strong> · ${esc(r.reason)}${r.line ? ` · ${esc(r.line)}` : ''}<br>
  <span class="small muted">${esc(r.msg.slice(0, 90))}${r.msg.length > 90 ? '…' : ''}</span></span><span class="small muted">${new Date(r.at).toLocaleDateString('fr-FR')}</span></div>`;

const helpView = {
  render(root) {
    const requests = store.get('requests', []);
    root.innerHTML = `${pageHead('Aide et contact')}
      <div class="split">
        <section class="card"><h2>Questions fréquentes</h2>${FAQ.map(([q, a]) => `<details class="faq"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section>
        <section class="stack">
          <form class="card form" id="contactForm" data-form="contact" novalidate><h2>Nous écrire</h2>
            ${field('kName', 'Nom', '<input type="text" id="kName" autocomplete="name">')}
            ${field('kMail', 'Adresse e-mail', '<input type="email" id="kMail" autocomplete="email">')}
            <div class="row">${field('kReason', 'Motif', `<select id="kReason">${REASONS.map(r => `<option>${r}</option>`).join('')}</select>`)}
              ${field('kLine', 'Ligne concernée', `<select id="kLine"><option value="">Aucune</option>${LINES.map(l => `<option>${l.id}</option>`).join('')}</select>`)}</div>
            ${field('kMsg', 'Message', '<textarea id="kMsg"></textarea>')}
            <div class="err" id="kErr" role="alert"></div>
            ${button({ html: 'Enregistrer ma demande', type: 'submit', cls: 'primary' })}
            <p class="small muted">Ce site de démonstration enregistre votre demande uniquement sur cet appareil. Elle n'est transmise à personne.</p></form>
          ${requests.length ? `<div class="card stack"><h3>Mes demandes</h3>${requests.map(requestRow).join('')}</div>` : ''}
        </section>
      </div>`;
  },

  submit() {
    $$('#contactForm [aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    const name = $('#kName').value.trim(), mail = $('#kMail').value.trim(), msg = $('#kMsg').value.trim();
    const problem = name.length < 2 ? ['#kName', 'Indiquez votre nom.']
      : !EMAIL_PATTERN.test(mail) ? ['#kMail', 'Adresse e-mail invalide. Exemple : nom@exemple.com']
      : msg.length < MIN_MESSAGE ? ['#kMsg', `Décrivez votre demande en au moins ${MIN_MESSAGE} caractères.`] : null;
    $('#kErr').textContent = problem ? problem[1] : '';
    if (problem) { $(problem[0]).setAttribute('aria-invalid', 'true'); $(problem[0]).focus(); return; }
    const requests = store.get('requests', []);
    store.set('requests', [{ ref: `DEM-${String(requests.length + 1).padStart(4, '0')}`, reason: $('#kReason').value, line: $('#kLine').value, msg, at: Date.now() }, ...requests]);
    toast('Demande enregistrée sur cet appareil'); rerender();
  }
};

FORMS.contact = () => helpView.submit();
