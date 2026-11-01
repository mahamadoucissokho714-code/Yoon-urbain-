'use strict';
/* Serveur statique minimal (aucune dépendance). `npm start` ouvre le site sur http://localhost:8080.
   Les tests e2e l'utilisent via startServer() sur un port libre. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { toDocument } = require('../../scripts/document');
const { securityHeaders } = require('../../scripts/security');

/* SITE_ROOT=dist sert le site construit, avec les en-têtes de production ; sinon les sources, document complet assemblé à la volée. */
const ROOT = process.env.SITE_ROOT ? path.resolve(process.env.SITE_ROOT) : path.resolve(__dirname, '../..');
const BUILT = !!process.env.SITE_ROOT;
const DEV_FILES = /^\/(index\.html|config\.js|manifest\.webmanifest|sw\.js|icons\/[\w.-]+|css\/[\w.-]+|js\/[\w./-]+)$/;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

function startServer(port = 0) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]), pathname = url === '/' ? '/index.html' : url;
    const file = path.join(ROOT, pathname);
    const allowed = BUILT || DEV_FILES.test(pathname);
    if (!allowed || !file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      const page404 = BUILT && fs.existsSync(path.join(ROOT, '404.html')) ? fs.readFileSync(path.join(ROOT, '404.html')) : 'Not found';
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }).end(page404); return;
    }
    const headers = { 'Content-Type': TYPES[path.extname(file)] || 'text/plain; charset=utf-8', ...(BUILT ? securityHeaders() : {}) };
    if (path.basename(file) === 'index.html' && !BUILT) { res.writeHead(200, headers).end(toDocument(fs.readFileSync(file, 'utf8'))); return; }
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(port, () => resolve({ server, url: `http://localhost:${server.address().port}` })));
}

module.exports = { startServer };

if (require.main === module) {
  startServer(Number(process.env.PORT) || 8080).then(({ url }) => console.log(`Yoon Urbain : ${url}`));
}
