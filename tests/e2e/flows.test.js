'use strict';
/* Parcours utilisateur critiques, dans un vrai navigateur. Chaque test repart d'un stockage vide. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../helpers/browser');

let env;
test.before(async () => { env = await setup(); });
test.after(async () => {
  assert.deepEqual(env.errors, [], 'aucune erreur JavaScript pendant les parcours');
  await env.teardown();
});

/** Navigue via le menu et attend que la vue soit affichée (le changement de hash est asynchrone). */
async function goTo(page, hash) {
  await page.click(`#nav a[href="#${hash}"]`);
  await page.waitForSelector(`#nav a[href="#${hash}"][aria-current="page"]`);
}

/** Nombre de billets vendus affiché dans le registre des ventes. */
const soldCount = async page => Number(await page.textContent('[aria-label="Ventes de billets"] .stats b >> nth=0'));

/** Lance une recherche d'itinéraire avec une heure fixe (indépendante de l'heure réelle). */
async function search(page, from, to, { pmr = false } = {}) {
  await page.fill('#pFrom', from); await page.fill('#pTo', to);
  await page.selectOption('#pWhen', 'at'); await page.fill('#pTime', '08:30');
  await page.setChecked('#pPmr', pmr);
  await page.click('#planForm button[type=submit]');
}

test('navigation : chaque page se charge et le titre suit', async () => {
  const page = await env.newPage();
  const routes = { lignes: 'Lignes et horaires', departs: 'Prochains passages', carte: 'Plan du réseau', billets: 'Tarifs et billets', tableau: 'Tableau de bord', infos: 'Infos trafic', aide: 'Aide et contact' };
  for (const [hash, title] of Object.entries(routes)) {
    await goTo(page, hash);
    assert.equal(await page.textContent('#app h1'), title);
    assert.equal(await page.getAttribute(`#nav a[href="#${hash}"]`, 'aria-current'), 'page');
  }
  await page.goto(env.url + '#inconnue');
  assert.equal(await page.textContent('#app h1'), 'Où allez-vous ?', 'une adresse inconnue renvoie à l\'accueil');
});

test('itinéraire : recherche réussie avec détail, durée et correspondances', async () => {
  const page = await env.newPage();
  await search(page, 'Plateau', 'Guédiawaye');
  assert.ok(await page.locator('.jcard').count() >= 1);
  assert.match(await page.textContent('.jcard'), /Sans correspondance|correspondance/);
  assert.match(await page.textContent('.jcard'), /Plateau/);
  await search(page, 'Almadies', 'Cambérène');
  assert.match(await page.textContent('.jcard'), /Correspondance à/);
});

test('itinéraire : erreurs de saisie expliquées, champ en erreur ciblé', async () => {
  const page = await env.newPage();
  await search(page, '', 'Hann');
  assert.match(await page.textContent('#pErr'), /départ/);
  assert.equal(await page.getAttribute('#pFrom', 'aria-invalid'), 'true');
  await search(page, 'Plateau', 'Xyz');
  assert.match(await page.textContent('#pErr'), /introuvable/);
  await search(page, 'Plateau', 'Plateau');
  assert.match(await page.textContent('#pErr'), /identiques/);
  await search(page, 'Sandaga', 'Plateau', { pmr: true });
  assert.match(await page.textContent('#pErr'), /pas accessible/);
  assert.equal(await page.locator('.jcard').count(), 0);
});

test('itinéraire : inverser départ et arrivée', async () => {
  const page = await env.newPage();
  await page.fill('#pFrom', 'Plateau'); await page.fill('#pTo', 'Hann');
  await page.click('[data-action=swap]');
  assert.equal(await page.inputValue('#pFrom'), 'Hann');
  assert.equal(await page.inputValue('#pTo'), 'Plateau');
});

test('trajets favoris : enregistrer, retrouver après rechargement, relancer, supprimer', async () => {
  const page = await env.newPage();
  await search(page, 'Plateau', 'Hann');
  await page.click('[data-action=save-trip] >> nth=0');
  assert.equal(await page.locator('.chip.has-x').count(), 1);
  await page.reload();
  assert.equal(await page.locator('.chip.has-x').count(), 1, 'persiste après rechargement');
  await page.click('.chip.has-x [data-action=use-trip]');
  assert.ok(await page.locator('.jcard').count() >= 1, 'un clic relance la recherche');
  await page.click('[data-action=del-trip]');
  assert.equal(await page.locator('.chip.has-x').count(), 0);
});

test('trajets favoris : un stockage corrompu ne casse pas la page', async () => {
  const page = await env.newPage();
  await page.evaluate(() => localStorage.setItem('yoon:trips', JSON.stringify([null, { from: 'zzz', to: 'x' }, { from: 'plateau', to: 'hann' }])));
  await page.reload();
  assert.equal(await page.locator('.chip.has-x').count(), 1, 'seul le trajet valide reste');
});

test('arrêts favoris et prochains passages', async () => {
  const page = await env.newPage();
  await goTo(page, 'departs');
  await page.selectOption('#bStop', 'colobane');
  assert.ok(await page.locator('#boardRows .brow').count() >= 1);
  await page.click('[data-action=fav]');
  assert.equal(await page.locator('[data-action=fav][aria-pressed=true]').count(), 1);
  await page.click('[data-action=board-filter][data-line=L1]');
  const badges = await page.locator('#boardRows .lb').allTextContents();
  assert.ok(badges.length && badges.every(b => b === 'L1'), 'le filtre de ligne s\'applique');
  await goTo(page, 'itineraire');
  assert.equal(await page.locator('[data-action=use-stop]').count(), 1, 'le favori est proposé dans le calculateur');
});

test('QR code d\'arrêt : le code pointe vers les passages de l\'arrêt et le lien direct l\'ouvre', async () => {
  const page = await env.newPage();
  await goTo(page, 'departs');
  await page.selectOption('#bStop', 'colobane');
  const link = await page.getAttribute('.stopqr [data-qr]', 'data-qr');
  assert.match(link, /#departs\?stop=colobane$/);
  const other = await env.newPage();
  await other.goto(link);
  await other.waitForSelector('#bStop');
  assert.equal(await other.inputValue('#bStop'), 'colobane', 'le lien direct sélectionne l\'arrêt');
  await other.goto(link.replace('colobane', 'inconnu'));
  await other.waitForSelector('#bStop');
  assert.ok(await other.locator('#boardRows .brow').count() >= 1, 'un arrêt inconnu ne casse pas la page');
});

test('appli installable : bouton Installer affiché sur invitation du navigateur, aucun service worker en développement', async () => {
  const page = await env.newPage();
  assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0, 'pas de cache en développement');
  assert.ok(await page.locator('#installBtn').isHidden());
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    window.__prompted = 0; e.prompt = () => { window.__prompted++; }; e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
  await page.waitForSelector('#installBtn:visible');
  await page.click('#installBtn');
  assert.equal(await page.evaluate(() => window.__prompted), 1, 'l\'invitation du navigateur est déclenchée');
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await page.waitForSelector('#installBtn', { state: 'hidden' });
});

test('tableau de bord : vide au départ, ventes de démonstration, période, tableaux, info-bulle, retrait', async () => {
  const page = await env.newPage();
  await goTo(page, 'tableau');
  assert.equal(await page.textContent('.kpis .kpi:nth-child(1) b'), '0');
  assert.ok(await page.locator('#dayChart').count() === 0, 'pas de graphique sans vente');
  assert.match(await page.textContent('[aria-label="Moyens de paiement"]'), /Aucun paiement/);

  await page.click('[data-action=dash-demo]');
  await page.waitForSelector('#dayChart svg');
  assert.ok(Number(await page.textContent('.kpis .kpi:nth-child(1) b')) > 0);
  assert.ok(await page.locator('#dayChart .hitcol').count() === 7, 'une colonne par jour sur 7 jours');
  const labels = await page.locator('.barrows .bl').allTextContents();
  assert.deepEqual(labels.slice(0, 2), ['Orange Money', 'Wave'], 'moyens de paiement étiquetés (identité jamais portée par la couleur seule)');
  assert.match(await page.textContent('[aria-label="Moyens de paiement"] .barrow'), /FCFA · \d+ %/, 'valeur toujours visible');
  assert.ok(await page.locator('[aria-label="Dernières ventes"] tbody tr').count() === 10);

  await page.hover('#dayChart .hitcol >> nth=3');
  await page.waitForSelector('#dayChart .tip:not([hidden])');
  assert.match(await page.textContent('#dayChart .tip'), /FCFA/);
  await page.hover('[aria-label="Moyens de paiement"] .barrow');
  assert.match(await page.textContent('[aria-label="Moyens de paiement"] .tip'), /du total/);

  const week = Number(await page.textContent('.kpis .kpi:nth-child(1) b'));
  await page.click('[data-action=dash-range][data-value="30"]');
  await page.waitForSelector('#dayChart .hitcol >> nth=29');
  assert.ok(Number(await page.textContent('.kpis .kpi:nth-child(1) b')) > week, '30 jours contient plus de ventes que 7');

  await page.click('[data-action=dash-mode][data-value=table]');
  assert.equal(await page.locator('#dayChart').count(), 0, 'la vue tableau remplace les graphiques');
  assert.ok(await page.locator('[aria-label="Ventes par jour"] tbody tr').count() === 30);
  assert.match(await page.textContent('[aria-label="Moyens de paiement"] thead'), /Moyen.*Billets.*Montant.*Part/);

  await goTo(page, 'billets');
  assert.match(await page.textContent('[aria-label="Répartition par moyen de paiement"]'), /Orange Money : [1-9]/, 'les ventes de démonstration comptent aussi sur la page Billets');
  await goTo(page, 'tableau');
  await page.click('[data-action=dash-demo-clear]');
  assert.equal(await page.textContent('.kpis .kpi:nth-child(1) b'), '0');
});

test('tableau de bord : une vraie vente apparaît, avec son moyen de paiement, et survit à la démo retirée', async () => {
  const page = await env.newPage();
  await goTo(page, 'billets');
  await page.click('[data-action=add-cart][data-id=day]');
  await page.fill('#cName', 'Awa Diop'); await page.selectOption('#cMethod', 'orange'); await page.fill('#cPhone', '77 123 45 67');
  await page.click('#cSubmit');
  await page.waitForSelector('.tk[data-tk]', { timeout: 5000 });
  await goTo(page, 'tableau');
  assert.equal(await page.textContent('.kpis .kpi:nth-child(1) b'), '1');
  assert.match(await page.textContent('.kpis .kpi:nth-child(2) b'), /1\s?000 FCFA/);
  assert.match(await page.textContent('[aria-label="Dernières ventes"] tbody tr'), /Pass journée.*Orange Money/);
  await page.click('[data-action=dash-demo]');
  await page.click('[data-action=dash-demo-clear]');
  assert.equal(await page.textContent('.kpis .kpi:nth-child(1) b'), '1', 'seules les ventes de démonstration sont retirées');
});

test('tableau de bord : la carte État du site annonce le mode démo, puis le mode serveur', async () => {
  const page = await env.newPage();
  await goTo(page, 'tableau');
  const card = page.locator('[aria-label="État du site"]');
  assert.match(await card.textContent(), /paiements simulés/);
  assert.match(await card.textContent(), /Ouverte dans le navigateur/);
  const server = await env.newPage(undefined, { config: { paymentApi: 'https://paiement.exemple.test', release: 'v-test' } });
  await goTo(server, 'tableau');
  const text = await server.locator('[aria-label="État du site"]').textContent();
  assert.match(text, /paiement\.exemple\.test/);
  assert.match(text, /v-test/);
});

test('lignes et horaires : changer de ligne, de sens et de jour met la grille à jour', async () => {
  const page = await env.newPage();
  await goTo(page, 'lignes');
  const before = await page.textContent('table tbody');
  const other = page.locator('[data-action=day][aria-pressed=false]').first(); // un autre type de jour que celui d'aujourd'hui
  await other.click();
  assert.notEqual(await page.textContent('table tbody'), before, 'un autre type de jour change la grille');
  await page.click('[data-action=pick-line][data-line=L3]');
  assert.match(await page.textContent('.line-title'), /Aéroport/);
  await page.click('[data-action=dir][data-value="1"]');
  assert.match(await page.textContent('.layout-hours .card'), /Arrêts vers Aéroport/);
});

test('billets : panier, validation du paiement, achat, activation et ventes', async () => {
  const page = await env.newPage();
  await goTo(page, 'billets');
  assert.equal(await page.isDisabled('#cSubmit'), true, 'paiement impossible avec un panier vide');

  await page.click('[data-action=add-cart][data-id=t90]');
  await page.click('[data-action=add-cart][data-id=t90]');
  await page.click('[data-action=add-cart][data-id=day]');
  assert.match(await page.textContent('#checkoutForm'), /1\s?600 FCFA/, '2 × 300 + 1 000');
  await page.click('[data-action=qty][data-id=t90][data-d="-1"]');
  assert.match(await page.textContent('#checkoutForm'), /1\s?300 FCFA/);

  await page.click('#cSubmit');
  assert.match(await page.textContent('#cErr'), /nom du titulaire/);
  await page.fill('#cName', 'Awa Diop'); await page.fill('#cPhone', '12345');
  await page.click('#cSubmit');
  assert.match(await page.textContent('#cErr'), /Numéro Orange Money invalide/);

  await page.fill('#cPhone', '77 123 45 67');
  await page.click('#cSubmit');
  await page.waitForSelector('.tk[data-tk]', { timeout: 5000 });
  assert.equal(await page.locator('.tk[data-tk]').count(), 2, 'un billet par unité achetée');
  assert.match(await page.textContent('#walletSection'), /À activer/);
  assert.equal(await soldCount(page), 2, 'chaque paiement accepté alimente le registre des ventes');

  await page.click('[data-action=activate] >> nth=0');
  assert.match(await page.textContent('#walletSection'), /Actif/);
  assert.match(await page.textContent('#walletSection'), /Expire dans/);

  await page.click('[data-action=reset-sales]');
  assert.match(await page.textContent('[data-action=reset-sales]'), /Confirmer/, 'remise à zéro en deux temps');
  await page.click('[data-action=reset-sales]');
  assert.equal(await soldCount(page), 0);
});

test('billets : paiement Wave, numéro non Orange accepté, moyen enregistré et réparti dans les ventes', async () => {
  const page = await env.newPage();
  await goTo(page, 'billets');
  await page.click('[data-action=add-cart][data-id=day]');
  await page.fill('#cName', 'Awa Diop');
  await page.selectOption('#cMethod', 'orange');
  await page.fill('#cPhone', '70 123 45 67');
  await page.click('#cSubmit');
  assert.match(await page.textContent('#cErr'), /Orange Money invalide/, 'un numéro 70 n\'est pas un numéro Orange');
  await page.selectOption('#cMethod', 'wave');
  assert.equal(await page.getAttribute('#cPhone', 'placeholder'), '70 123 45 67');
  await page.click('#cSubmit');
  assert.match(await page.textContent('#cSubmit'), /Wave \(simulation\)/, 'le bouton indique le moyen de paiement pendant le traitement');
  await page.waitForSelector('.tk[data-tk]', { timeout: 5000 });
  assert.match(await page.textContent('.tk[data-tk]'), /payé avec Wave/);
  assert.match(await page.textContent('[aria-label="Répartition par moyen de paiement"]'), /Wave : 1/);
  assert.match(await page.textContent('[aria-label="Répartition par moyen de paiement"]'), /Orange Money : 0/);
});

test('billets : QR de paiement Orange Money / Wave selon le moyen choisi, absent pour l\'agence et le panier vide', async () => {
  const page = await env.newPage();
  await goTo(page, 'billets');
  assert.ok(await page.locator('#cQrWrap').isHidden(), 'pas de QR avec un panier vide');
  await page.click('[data-action=add-cart][data-id=t90]');
  await page.selectOption('#cMethod', 'orange');
  const orange = await page.getAttribute('#cQr', 'data-qr');
  assert.match(orange, /^YOONPAY\|orange\|\d+\|PAY-[A-Z0-9]+$/);
  await page.selectOption('#cMethod', 'wave');
  const wave = await page.getAttribute('#cQr', 'data-qr');
  assert.match(wave, /^YOONPAY\|wave\|/);
  assert.equal(orange.split('|')[3], wave.split('|')[3], 'même référence pour une même commande');
  await page.click('[data-action=add-cart][data-id=t90]');
  assert.notEqual((await page.getAttribute('#cQr', 'data-qr')).split('|')[2], wave.split('|')[2], 'le montant suit le panier');
  await page.selectOption('#cMethod', 'agence');
  assert.ok(await page.locator('#cQrWrap').isHidden(), 'pas de QR pour un paiement en agence');
  await page.selectOption('#cMethod', 'wave');
  await page.fill('#cName', 'Awa Diop'); await page.fill('#cPhone', '77 123 45 67');
  await page.click('#cSubmit');
  await page.waitForSelector('.tk[data-tk]', { timeout: 5000 });
  await page.click('[data-action=add-cart][data-id=t90]');
  assert.notEqual((await page.getAttribute('#cQr', 'data-qr')).split('|')[3], wave.split('|')[3], 'nouvelle référence après un achat');
});

test('billets : le tarif étudiant exige la carte, la réservation en agence ne demande pas de numéro', async () => {
  const page = await env.newPage();
  await goTo(page, 'billets');
  await page.click('[data-action=add-cart][data-id=stud]');
  await page.fill('#cName', 'Moussa Ba'); await page.fill('#cPhone', '771234567');
  await page.click('#cSubmit');
  assert.match(await page.textContent('#cErr'), /carte d'étudiant/);
  await page.selectOption('#cMethod', 'agence');
  assert.equal(await page.isHidden('#cPhoneWrap'), true);
  await page.check('#cStud');
  await page.click('#cSubmit');
  await page.waitForSelector('text=Réservation RS-', { timeout: 5000 });
  assert.equal(await soldCount(page), 0, 'une réservation n\'est pas une vente');
  await page.click('[data-action=cancel-resa]');
  assert.equal(await page.locator('text=Réservation RS-').count(), 0);
});

test('billets : la saisie du paiement survit à un ajout au panier', async () => {
  const page = await env.newPage();
  await goTo(page, 'billets');
  await page.fill('#cName', 'Fatou');
  await page.click('[data-action=add-cart][data-id=day]');
  assert.equal(await page.inputValue('#cName'), 'Fatou');
});

test('infos trafic : filtres et suivi de lignes', async () => {
  const page = await env.newPage();
  await goTo(page, 'infos');
  const all = await page.locator('article.alert').count();
  assert.ok(all >= 3);
  await page.click('[data-action=info-filter][data-f=L3]');
  const l3 = await page.locator('article.alert').count();
  assert.ok(l3 >= 1 && l3 < all);
  await page.click('[data-action=info-filter][data-f=mine]');
  assert.match(await page.textContent('.empty'), /ne suivez aucune ligne/);
  await page.click('[data-action=follow][data-line=L3]');
  assert.equal(await page.locator('article.alert').count(), l3, '« Mes lignes » = alertes de L3');
});

test('aide : validation du formulaire, enregistrement et historique des demandes', async () => {
  const page = await env.newPage();
  await goTo(page, 'aide');
  await page.click('#contactForm button[type=submit]');
  assert.match(await page.textContent('#kErr'), /nom/);
  await page.fill('#kName', 'Awa'); await page.fill('#kMail', 'pas-un-mail');
  await page.click('#contactForm button[type=submit]');
  assert.match(await page.textContent('#kErr'), /e-mail invalide/);
  await page.fill('#kMail', 'awa@exemple.com'); await page.fill('#kMsg', 'trop court');
  await page.click('#contactForm button[type=submit]');
  assert.match(await page.textContent('#kErr'), /20 caractères/);
  await page.fill('#kMsg', 'J\'ai perdu un sac bleu dans la ligne L2 hier soir.');
  await page.click('#contactForm button[type=submit]');
  assert.match(await page.textContent('#app'), /DEM-0001/);
  assert.equal(await page.inputValue('#kName'), '', 'formulaire vidé après envoi');
});

test('thème : bascule claire/sombre mémorisée', async () => {
  const page = await env.newPage();
  const before = await page.evaluate(() => document.documentElement.dataset.theme || '');
  await page.click('#themeBtn');
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  assert.notEqual(after, before);
  await page.reload();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), after, 'le choix persiste');
});

test('mobile : aucune barre de défilement horizontale sur chaque page', async () => {
  const page = await env.newPage({ width: 375, height: 800 });
  for (const hash of ['itineraire', 'lignes', 'departs', 'carte', 'billets', 'tableau', 'infos', 'aide']) {
    await page.goto(env.url + '#' + hash);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `débordement sur #${hash}`);
  }
});
