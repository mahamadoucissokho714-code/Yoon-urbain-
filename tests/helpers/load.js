'use strict';
/* Charge les scripts du site (scripts classiques, portée globale partagée) dans un contexte Node isolé,
   sans navigateur. Le contexte n'a ni `document` ni `localStorage` : le code testé ici doit rester pur. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');

/**
 * @param {string[]} files  chemins relatifs à la racine, dans l'ordre de chargement du site
 * @param {string[]} names  identifiants de premier niveau à exposer aux tests
 * @returns {object} les valeurs demandées
 */
function load(files, names) {
  const source = files.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const context = vm.createContext({ console });
  return vm.runInContext(`${source}\n;({ ${names.join(', ')} })`, context, { filename: 'yoon-bundle.js' });
}

/** Les objets venant du contexte vm ont d'autres prototypes : on les normalise avant deepEqual. */
const plain = value => JSON.parse(JSON.stringify(value));

module.exports = { load, plain };
