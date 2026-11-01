'use strict';
/* Données du réseau fictif : arrêts, lignes, tarifs, alertes, et index dérivés calculés une seule fois. */

/* ---------- Paramètres du modèle ---------- */
const UNITS_PER_MIN = 34;      // unités du plan parcourues par minute de bus
const KM_PER_UNIT = 0.034;     // kilomètres par unité du plan (distance routière approximative)
const PEAK_PERIODS = [[390, 570], [990, 1170]]; // 06:30–09:30 et 16:30–19:30
const EVENING_START = 1230;    // 20:30
const REVERSE_DELAY = 12;      // décalage du premier départ dans le sens retour
const MIN_HEADWAY = 4;
const roundTo1 = n => Math.round(n * 10) / 10;

/* ---------- Arrêts : id, nom, x, y sur le plan, accessible PMR, côté de l'étiquette ---------- */
const STOPS = {};
[
  ['plateau', 'Plateau', 110, 520, 1, 'r'], ['sandaga', 'Sandaga', 170, 480, 0, 'r'], ['medina', 'Médina', 215, 440, 1, 'r'],
  ['colobane', 'Colobane', 290, 410, 1, 'b'], ['granddakar', 'Grand Dakar', 350, 370, 1, 'r'], ['liberte6', 'Liberté 6', 440, 260, 1, 'r'],
  ['grandyoff', 'Grand Yoff', 470, 290, 1, 'r'], ['parcelles', 'Parcelles Assainies', 560, 210, 1, 't'], ['guediawaye', 'Guédiawaye', 720, 250, 1, 'r'],
  ['almadies', 'Almadies', 90, 100, 1, 'r'], ['ngor', 'Ngor', 150, 150, 1, 'r'], ['ouakam', 'Ouakam', 150, 225, 1, 'r'],
  ['mermoz', 'Mermoz', 210, 290, 1, 'r'], ['pointe', 'Point E', 250, 335, 1, 'r'], ['hann', 'Hann', 400, 450, 1, 'b'],
  ['baux', 'Baux Maraîchers', 510, 470, 1, 'b'], ['pikine', 'Pikine', 640, 400, 1, 'b'], ['thiaroye', 'Thiaroye', 760, 430, 0, 'b'],
  ['rufisque', 'Rufisque', 900, 520, 1, 'b'], ['aeroport', 'Aéroport', 400, 70, 1, 'r'], ['yoff', 'Yoff', 300, 110, 1, 't'],
  ['sacrecoeur', 'Sacré-Cœur', 330, 250, 1, 't'], ['fann', 'Fann', 170, 380, 0, 'l'], ['camberene', 'Cambérène', 620, 110, 0, 'r'],
  ['pattedoie', "Patte d'Oie", 410, 190, 1, 'l'], ['golfsud', 'Golf Sud', 610, 300, 1, 'l'], ['keurmassar', 'Keur Massar', 840, 340, 1, 'r'],
  ['diamniadio', 'Diamniadio', 960, 430, 1, 'b']
].forEach(([id, name, x, y, acc, lab]) => { STOPS[id] = { id, name, x, y, acc: !!acc, lab }; });

/* ---------- Lignes : hw = intervalle entre bus (minutes) en pointe, creux, soirée ---------- */
const LINES = [
  { id: 'L1', name: 'Plateau – Guédiawaye', stops: ['plateau', 'sandaga', 'medina', 'colobane', 'granddakar', 'liberte6', 'grandyoff', 'parcelles', 'guediawaye'], hw: { peak: 6, off: 10, eve: 18 }, first: '05:30', last: '22:30' },
  { id: 'L2', name: 'Almadies – Rufisque', stops: ['almadies', 'ngor', 'ouakam', 'mermoz', 'pointe', 'colobane', 'hann', 'baux', 'pikine', 'thiaroye', 'rufisque'], hw: { peak: 8, off: 12, eve: 20 }, first: '05:30', last: '22:30' },
  { id: 'L3', name: 'Aéroport – Plateau', stops: ['aeroport', 'yoff', 'sacrecoeur', 'mermoz', 'fann', 'plateau'], hw: { peak: 10, off: 15, eve: 24 }, first: '05:30', last: '22:30' },
  { id: 'L4', name: 'Cambérène – Hann', stops: ['camberene', 'parcelles', 'pattedoie', 'liberte6', 'granddakar', 'hann'], hw: { peak: 12, off: 18, eve: 30 }, first: '05:30', last: '22:30' },
  { id: 'L5', name: 'Guédiawaye – Diamniadio', stops: ['guediawaye', 'golfsud', 'pikine', 'thiaroye', 'keurmassar', 'diamniadio'], hw: { peak: 12, off: 20, eve: 30 }, first: '05:30', last: '22:30' }
];
const LINE = Object.fromEntries(LINES.map(l => [l.id, l]));

const dist = (a, b) => Math.hypot(STOPS[a].x - STOPS[b].x, STOPS[a].y - STOPS[b].y);
const segMin = (a, b) => Math.max(2, Math.round(dist(a, b) / UNITS_PER_MIN));
const segKm = (a, b) => Math.max(0.5, roundTo1(dist(a, b) * KM_PER_UNIT));
/** Cumul d'une grandeur le long d'un sens de circulation. */
const cumulate = (order, step, round = n => n) => order.reduce((acc, id, i) => (acc.push(i ? round(acc[i - 1] + step(order[i - 1], id)) : 0), acc), []);

/* Index dérivés : pour chaque arrêt, les (ligne, sens, rang) qui le desservent. */
const STOP_LD = {};
LINES.forEach(line => {
  line.order = [line.stops, [...line.stops].reverse()];
  line.cum = line.order.map(order => cumulate(order, segMin));
  line.km = line.order.map(order => cumulate(order, segKm, roundTo1));
  line.order.forEach((order, dir) => order.forEach((id, idx) => (STOP_LD[id] = STOP_LD[id] || []).push({ line, dir, idx })));
});
const STOP_LINES = Object.fromEntries(Object.keys(STOPS).map(id => [id, [...new Set(STOP_LD[id].map(x => x.line.id))]]));
const stopLines = id => STOP_LINES[id];
const lineVar = id => `var(--${id.toLowerCase()})`;
const STOP_LIST = Object.values(STOPS).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
const STOP_INDEX = STOP_LIST.map(stop => ({ key: norm(stop.name), stop }));

/* ---------- Jours de service ---------- */
const DAY_TYPES = [
  { key: 'wk', label: 'Lundi – vendredi', factor: 1 },
  { key: 'sa', label: 'Samedi', factor: 1.3 },
  { key: 'su', label: 'Dimanche et fériés', factor: 1.7 }
];
const todayType = (offset = 0) => { const d = (new Date().getDay() + offset) % 7; return d === 0 ? 2 : d === 6 ? 1 : 0; };
const dayFactor = (offset = 0) => DAY_TYPES[todayType(offset)].factor;

/* ---------- Titres de transport ---------- */
const PRODUCTS = [
  { id: 't90', name: 'Ticket 90 minutes', price: 300, minutes: 90, desc: "Correspondances illimitées pendant 90 minutes après l'activation." },
  { id: 'day', name: 'Pass journée', price: 1000, minutes: 1440, desc: 'Voyages illimités sur tout le réseau pendant 24 heures.' },
  { id: 'week', name: 'Pass semaine', price: 5000, minutes: 10080, desc: 'Voyages illimités pendant 7 jours consécutifs.' },
  { id: 'month', name: 'Pass mensuel', price: 17000, minutes: 43200, desc: 'Voyages illimités pendant 30 jours consécutifs.' },
  { id: 'stud', name: 'Pass mensuel étudiant', price: 9000, minutes: 43200, desc: "Tarif réduit sur présentation de la carte d'étudiant en cours de validité.", student: true }
];
const PRODUCT = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));
const SINGLE_TICKET = 't90';
const RESERVATION_HOURS = 48;

/* ---------- Infos trafic (dates relatives à aujourd'hui) ---------- */
const startOfDay = (offset = 0) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + offset); return d; };
const ALERTS = [
  { id: 'a1', lines: ['L3'], sev: 'crit', title: 'Interruption entre Mermoz et Fann', from: 1, to: 1, text: 'Demain de 05:30 à 09:00, la ligne L3 est interrompue entre Mermoz et Fann pour des travaux sur la chaussée. Utilisez la ligne L2 puis la ligne L1 pour rejoindre le Plateau.' },
  { id: 'a2', lines: ['L1'], sev: 'warn', title: 'Arrêt Colobane déplacé', from: -1, to: 6, text: "À cause de travaux de voirie, les bus s'arrêtent 200 m avant le carrefour, devant la station-service. Prévoyez 3 minutes de marche en plus." },
  { id: 'a3', lines: ['L3'], sev: 'warn', title: 'Ascenseur hors service à Fann', from: -3, to: 14, text: "L'arrêt Fann n'est pas accessible aux fauteuils roulants pendant la réparation. Le calculateur d'itinéraire en tient compte avec l'option accès PMR." },
  { id: 'a4', lines: ['L2'], sev: 'info', title: 'Fréquence renforcée aux heures de pointe', from: 0, to: 30, text: 'Un bus toutes les 8 minutes entre 06:30 et 09:30 et entre 16:30 et 19:30 sur toute la ligne.' },
  { id: 'a5', lines: ['L4'], sev: 'info', title: 'Montée côté nord à Liberté 6', from: -2, to: 10, text: "Les voyageurs en direction de Hann montent désormais du côté nord de l'avenue." },
  { id: 'a6', lines: ['L5'], sev: 'info', title: 'Nouvel abri voyageurs à Keur Massar', from: 2, to: 4, text: "L'arrêt reste en service pendant l'installation du nouvel abri. Les bus peuvent s'arrêter quelques mètres plus loin." }
].map(a => ({ ...a, start: startOfDay(a.from), end: startOfDay(a.to) }));
const alertActive = a => { const t = startOfDay(); return a.start <= t && t <= a.end; };
const alertsForLines = ids => ALERTS.filter(a => alertActive(a) && a.lines.some(l => ids.includes(l)));
const fmtDate = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

/* ---------- Aide ---------- */
const FAQ = [
  ['Comment valider mon ticket ?', "Activez-le depuis la page Billets juste avant de monter. Un code QR apparaît : présentez-le au valideur ou au contrôleur. Le décompte démarre à l'activation."],
  ['Puis-je me faire rembourser un billet non utilisé ?', "Un billet à activer n'a pas de limite de validité tant qu'il n'est pas activé. Un billet activé ne peut pas être remboursé."],
  ['Les bus sont-ils accessibles aux fauteuils roulants ?', "Tous les bus sont équipés d'une rampe, mais certains arrêts ne sont pas aménagés. Cochez « Accès PMR uniquement » dans le calculateur pour ne voir que les trajets praticables."],
  ['Que se passe-t-il les jours fériés ?', "Les horaires du dimanche s'appliquent. Choisissez « Dimanche et fériés » dans la page Lignes et horaires."],
  ['Les horaires affichés sont-ils en temps réel ?', 'Non. Ils sont théoriques et calculés à partir des fréquences de chaque ligne. Consultez les infos trafic pour les perturbations connues.'],
  ["J'ai oublié un objet dans un bus.", "Faites une demande avec le motif « Objet perdu » en indiquant la ligne, l'heure et une description précise de l'objet."]
];
