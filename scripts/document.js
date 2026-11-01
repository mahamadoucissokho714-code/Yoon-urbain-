'use strict';
/* index.html est un fragment (titre, liens, corps) : le même fichier se publie tel quel comme page hébergée.
   Pour un vrai site, on l'enveloppe dans un document complet : doctype, langue, encodage, viewport. */
const MARKER = /<link rel="stylesheet" href="css\/styles\.css(\?[^"]*)?">/; // dernière balise de l'en-tête (avec ou sans version)

function toDocument(fragment) {
  if (/^\s*<!doctype/i.test(fragment)) return fragment;
  const match = MARKER.exec(fragment);
  if (!match) throw new Error('index.html doit contenir <link rel="stylesheet" href="css/styles.css"> pour séparer l\'en-tête du corps');
  const end = match.index + match[0].length;
  return `<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${fragment.slice(0, end)}\n</head>\n<body>${fragment.slice(end)}\n</body>\n</html>\n`;
}

module.exports = { toDocument };
