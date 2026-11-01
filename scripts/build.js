'use strict';
/* Construit dist/ : copie le site, versionne les ressources (cache long), écrit la configuration d'environnement,
   injecte la politique de sécurité et génère les fichiers d'hébergement. Aucune dépendance.

   Variables d'environnement (toutes facultatives) :
     YOON_ENV         production | staging            (défaut : production)
     YOON_RELEASE     identifiant de version          (défaut : GITHUB_SHA court, sinon horodatage)
     YOON_REPORT_URL  adresse qui reçoit les erreurs et mesures de performance (https, vide = désactivé)
     YOON_PAYMENT_API adresse https du serveur de paiement (vide = mode démo : paiements simulés)
     YOON_SITE_URL    adresse publique du site, pour robots.txt et le sitemap */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildCsp, securityHeaders } = require('./security');
const { toDocument } = require('./document');

const ROOT = path.resolve(__dirname, '..');
const DIST = process.env.YOON_DIST ? path.resolve(process.env.YOON_DIST) : path.join(ROOT, 'dist');
const env = process.env;

const config = {
  env: env.YOON_ENV || 'production',
  release: env.YOON_RELEASE || (env.GITHUB_SHA ? env.GITHUB_SHA.slice(0, 7) : 'local-' + new Date().toISOString().slice(0, 16).replace(/\D/g, '')),
  reportUrl: env.YOON_REPORT_URL || '',
  paymentApi: (env.YOON_PAYMENT_API || '').replace(/\/$/, ''),
  siteUrl: (env.YOON_SITE_URL || '').replace(/\/$/, '')
};

function fail(message) { console.error('Build impossible : ' + message); process.exit(1); }
if (!['production', 'staging'].includes(config.env)) fail(`YOON_ENV invalide « ${config.env} » (production ou staging)`);
let reportOrigin = '';
if (config.reportUrl) {
  try { const u = new URL(config.reportUrl); if (u.protocol !== 'https:') throw new Error(); reportOrigin = u.origin; }
  catch { fail('YOON_REPORT_URL doit être une adresse https valide'); }
}
let paymentOrigin = '';
if (config.paymentApi) {
  try { const u = new URL(config.paymentApi); if (u.protocol !== 'https:') throw new Error(); paymentOrigin = u.origin; }
  catch { fail('YOON_PAYMENT_API doit être une adresse https valide'); }
}
if (config.siteUrl && !/^https:\/\/[^/\s]+/.test(config.siteUrl)) fail('YOON_SITE_URL doit commencer par https://');

/* ---------- Copie ---------- */
fs.rmSync(DIST, { recursive: true, force: true });
const copyDir = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name), dst = path.join(to, entry.name);
    entry.isDirectory() ? copyDir(src, dst) : fs.copyFileSync(src, dst);
  }
};
copyDir(path.join(ROOT, 'css'), path.join(DIST, 'css'));
copyDir(path.join(ROOT, 'js'), path.join(DIST, 'js'));
copyDir(path.join(ROOT, 'icons'), path.join(DIST, 'icons'));
fs.copyFileSync(path.join(ROOT, 'manifest.webmanifest'), path.join(DIST, 'manifest.webmanifest'));

/* ---------- Configuration d'environnement (remplace config.js du dépôt) ---------- */
const publicConfig = { env: config.env, release: config.release, reportUrl: config.reportUrl, paymentApi: config.paymentApi };
fs.writeFileSync(path.join(DIST, 'config.js'), `window.YOON_CONFIG = ${JSON.stringify(publicConfig)};\n`);

/* ---------- Version des ressources : empreinte du contenu ---------- */
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(DIST, file))).digest('hex').slice(0, 10);
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
html = html.replace(/(src|href)="((?:css|js)\/[^"?]+)"/g, (_, attr, file) => `${attr}="${file}?v=${hash(file)}"`);

/* ---------- Sécurité : balise CSP, avant tout autre contenu ---------- */
const csp = buildCsp({ reportOrigin, paymentOrigin });
html = html.replace('<title>', `<meta http-equiv="Content-Security-Policy" content="${csp}">\n<title>`);
if (config.env === 'staging') html = html.replace('</title>', ' (préproduction)</title>').replace('<meta name="robots" content="index,follow">', '<meta name="robots" content="noindex,nofollow">');
fs.writeFileSync(path.join(DIST, 'index.html'), toDocument(html));

/* ---------- Pages et fichiers standards ---------- */
fs.writeFileSync(path.join(DIST, '404.html'), `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page introuvable – Yoon Urbain</title><body style="font:16px system-ui;max-width:32rem;margin:15vh auto;padding:0 1rem"><h1>Page introuvable</h1><p>Cette adresse n'existe pas.</p><p><a href="./">Retour à Yoon Urbain</a></p></body></html>\n`);
fs.writeFileSync(path.join(DIST, 'healthz'), 'ok\n');
const robots = config.env === 'staging' ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\n${config.siteUrl ? `Sitemap: ${config.siteUrl}/sitemap.xml\n` : ''}`;
fs.writeFileSync(path.join(DIST, 'robots.txt'), robots);
if (config.siteUrl && config.env === 'production') {
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${config.siteUrl}/</loc></url></urlset>\n`);
}

/* ---------- Fichiers de version et d'hébergement ---------- */
const headers = securityHeaders({ reportOrigin, paymentOrigin });
const headerBlock = o => Object.entries(o).map(([k, v]) => `  ${k}: ${v}`).join('\n');
fs.writeFileSync(path.join(DIST, '_headers'), [
  `/*\n${headerBlock(headers)}\n  Cache-Control: no-cache`,
  `/css/*\n  Cache-Control: public, max-age=31536000, immutable`,
  `/js/*\n  Cache-Control: public, max-age=31536000, immutable`
].join('\n\n') + '\n');
fs.writeFileSync(path.join(DIST, 'nginx.conf'), `# Généré par scripts/build.js : ne pas modifier à la main.
server {
  listen 8080;
  root /usr/share/nginx/html;
  index index.html;
  server_tokens off;
  gzip on;
  gzip_types text/css text/javascript application/json image/svg+xml;
${Object.entries(headers).map(([k, v]) => `  add_header ${k} "${v.replace(/"/g, '\\"')}" always;`).join('\n')}
  location = /healthz { access_log off; default_type text/plain; add_header Cache-Control "no-store" always; }
  location ~* ^/(css|js)/ { add_header Cache-Control "public, max-age=31536000, immutable" always;
${Object.entries(headers).map(([k, v]) => `    add_header ${k} "${v.replace(/"/g, '\\"')}" always;`).join('\n')}
  }
  location / { try_files $uri $uri/ =404; add_header Cache-Control "no-cache" always;
${Object.entries(headers).map(([k, v]) => `    add_header ${k} "${v.replace(/"/g, '\\"')}" always;`).join('\n')}
  }
  error_page 404 /404.html;
}
`);

/* ---------- Service worker : liste exacte des fichiers à mémoriser + version = empreinte de tout le site ---------- */
const builtHtml = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const precache = [...new Set(['index.html', ...[...builtHtml.matchAll(/(?:src|href)="((?!https?:|#|data:|mailto:)[^"]+)"/g)].map(m => m[1])])].sort();
for (const f of precache) if (!fs.existsSync(path.join(DIST, f.split('?')[0]))) fail(`fichier mémorisé hors ligne introuvable : ${f}`);
const siteHash = crypto.createHash('sha256');
(function walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const p = path.join(dir, e.name); e.isDirectory() ? walk(p) : siteHash.update(e.name).update(fs.readFileSync(p)); } })(DIST);
const swVersion = siteHash.digest('hex').slice(0, 12);
const swSource = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
if (!swSource.includes("'__VERSION__'") || !swSource.includes('/*__PRECACHE__*/[]')) fail('sw.js : marqueurs VERSION et PRECACHE introuvables');
fs.writeFileSync(path.join(DIST, 'sw.js'), swSource.replace("'__VERSION__'", JSON.stringify(swVersion)).replace('/*__PRECACHE__*/[]', JSON.stringify(precache)));

/* ---------- Inventaire et version (en dernier : liste aussi les fichiers d'hébergement) ---------- */
const files = [];
(function walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); e.isDirectory() ? walk(p) : files.push(path.relative(DIST, p)); } })(DIST);
files.push('version.json');
fs.writeFileSync(path.join(DIST, 'version.json'), JSON.stringify({ ...publicConfig, reportUrl: undefined, builtAt: new Date().toISOString(), files: files.sort() }, null, 2) + '\n');

const size = files.reduce((s, f) => s + fs.statSync(path.join(DIST, f)).size, 0);
console.log(`dist/ prêt : ${files.length} fichiers, ${(size / 1024).toFixed(0)} Ko · env=${config.env} · version=${config.release}${reportOrigin ? ' · rapports → ' + reportOrigin : ' · rapports désactivés'}${paymentOrigin ? ' · paiements → ' + paymentOrigin : ' · paiements simulés'} · hors ligne : ${precache.length} fichiers`);
