'use strict';
/* Politique de sécurité unique : la balise CSP de index.html, _headers, nginx.conf et les tests la partagent. */

/** Content-Security-Policy. `reportOrigin` autorise l'envoi des rapports d'erreurs, `paymentOrigin` le serveur de paiement (facultatifs). */
function buildCsp({ reportOrigin = '', paymentOrigin = '' } = {}) {
  return [
    "default-src 'self'",
    "script-src 'self' https://cdnjs.cloudflare.com",          // QR code : seul script externe
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // 'unsafe-inline' : attributs style générés par les vues
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data:",
    `connect-src 'self'${[reportOrigin, paymentOrigin].filter(Boolean).map(o => ' ' + o).join('')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');
}

/** En-têtes HTTP à poser sur l'hébergement (impossibles à poser sur GitHub Pages : la balise CSP prend le relais). */
function securityHeaders(options) {
  return {
    'Content-Security-Policy': `${buildCsp(options)}; frame-ancestors 'none'`,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
  };
}

module.exports = { buildCsp, securityHeaders };
