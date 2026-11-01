'use strict';
/* Socle partagé : sélecteurs DOM, formats, stockage local, icônes, notifications, registres d'actions. */

const MIN_PER_DAY = 1440;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = value => String(value).replace(/[&<>"']/g, c => ESC_MAP[c]);

const pad2 = n => String(n).padStart(2, '0');
const toMin = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
/** Formate des minutes depuis minuit en « HH:MM » (modulo 24 h). */
const fmtT = minutes => {
  const t = ((Math.floor(minutes) % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
  return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`;
};
const numberFmt = new Intl.NumberFormat('fr-FR');
const money = n => `${numberFmt.format(n)} FCFA`;
const fmtKm = km => `${km.toFixed(1).replace('.', ',')} km`;
const norm = text => String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
const dataAttrs = obj => Object.entries(obj).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
const genId = (prefix, len) => `${prefix}-${Math.random().toString(36).slice(2, 2 + len).toUpperCase()}`;

/** Met à jour un nœud seulement si son contenu a changé (évite des reflows chaque seconde). */
function setHTML(el, html) {
  if (el && el._html !== html) { el.innerHTML = html; el._html = html; }
}

/* ---------- Stockage local (tolère les environnements où il est indisponible) ---------- */
const memory = {};
const store = {
  get(key, fallback) {
    if (key in memory) return memory[key];
    try { const raw = localStorage.getItem('yoon:' + key); if (raw != null) return (memory[key] = JSON.parse(raw)); } catch (e) { /* stockage indisponible */ }
    return fallback;
  },
  set(key, value) {
    memory[key] = value;
    try { localStorage.setItem('yoon:' + key, JSON.stringify(value)); } catch (e) { /* stockage indisponible */ }
  },
  /** Ajoute ou retire une valeur d'une liste ; renvoie true si elle vient d'être ajoutée. */
  toggle(key, value) {
    const list = [...store.get(key, [])], i = list.indexOf(value);
    i < 0 ? list.push(value) : list.splice(i, 1);
    store.set(key, list);
    return i < 0;
  }
};

/* ---------- Icônes ---------- */
const ICONS = {
  swap: '<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  alert: '<path d="M12 3 2 20h20zM12 10v5M12 18v.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
  access: '<circle cx="12" cy="4.5" r="1.8"/><path d="M6 8.5h12M12 8.5V14l-3 6M12 14l3 6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'
};
const ic = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

/* ---------- Notifications et presse-papiers ---------- */
let toastTimer;
function toast(message) {
  const host = $('#toastHost');
  host.innerHTML = `<div class="toast">${esc(message)}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { host.innerHTML = ''; }, 3200);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copié dans le presse-papiers'); }
  catch (e) { toast('Copie impossible : sélectionnez le texte manuellement'); }
}

/* ---------- Chargement paresseux d'un script externe (mis en cache) ---------- */
const scriptCache = new Map();
function loadScript(src) {
  if (!scriptCache.has(src)) {
    scriptCache.set(src, new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src; el.onload = resolve;
      el.onerror = () => { scriptCache.delete(src); reject(new Error('Chargement impossible : ' + src)); };
      document.head.appendChild(el);
    }));
  }
  return scriptCache.get(src);
}

/* ---------- Registres alimentés par chaque vue ---------- */
const ACTIONS = {}; // data-action="nom"  -> fonction (élément, événement)
const FORMS = {};   // data-form="nom"    -> fonction ()
