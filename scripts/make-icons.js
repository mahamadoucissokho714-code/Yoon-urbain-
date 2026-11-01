'use strict';
/* Génère les icônes de l'application (icons/*.png) à partir du logo. À relancer seulement si le logo change : npm run icons */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const SIGNAL = '#F6B500', INK = '#1A1400';
/** Logo sur fond plein ; `pad` laisse une marge de sécurité (icône « maskable » : Android rogne les bords). */
const svg = (pad, round) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34" width="100%" height="100%">
  <rect width="34" height="34" ${round ? 'rx="8"' : ''} fill="${SIGNAL}"/>
  <g transform="translate(${17 - 17 * pad} ${17 - 17 * pad}) scale(${pad})">
    <path d="M9 24c0-6 16-4 16-11" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="9" cy="24" r="3.5" fill="#fff" stroke="${INK}" stroke-width="2.5"/><circle cx="25" cy="11" r="3.5" fill="#fff" stroke="${INK}" stroke-width="2.5"/></g></svg>`;

const ICONS = [
  ['icon-192.png', 192, 0.8, true], ['icon-512.png', 512, 0.8, true],
  ['icon-maskable-512.png', 512, 0.6, false], // fond plein jusqu'aux bords, logo dans la zone sûre
  ['apple-touch-icon.png', 180, 0.7, false]   // iOS arrondit lui-même les angles
];

(async () => {
  const out = path.resolve(__dirname, '../icons');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(), page = await browser.newPage();
  for (const [name, size, pad, round] of ICONS) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<body style="margin:0;background:transparent">${svg(pad, round)}</body>`);
    await page.screenshot({ path: path.join(out, name), omitBackground: true });
    console.log(`icons/${name} (${size}×${size})`);
  }
  await browser.close();
})();
