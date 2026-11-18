/**
 * Cloudflare Worker entry. Routes:
 *   POST /api/contact     → handleContactRequest (the Contact page form)
 *   POST /api/demo-access → handleDemoAccessRequest (the Demo page form:
 *                           emails the visitor's details, answers the demo
 *                           URL with a signed access pass, since 2026-10-26)
 *   GET /i/<invitation>   → handleDemoInvite (the personal link written in
 *                           an email to an integrator: opens the demo
 *                           without the form and tells the publisher who
 *                           opened it, since 2026-11-18)
 *   /                     → handleRoot (302 to /fr/ or /en/, from the
 *                           browser's language, since 2026-10-26)
 *   *                     → env.ASSETS.fetch (static site from ./dist)
 *
 * Same-origin form POST, so no CORS / OPTIONS handling needed.
 *
 * POST /api/trial (ADR-0006: trial licence signed and emailed with a
 * compose file) was removed on 2026-10-23: no page had called it since the
 * trial went on quote (2026-09-22), and the compose it emailed could not
 * start (DEP-16). The code is in the git history before that date.
 */

import { handleContactRequest } from './worker/handlers/contact.js';
import { handleDemoAccessRequest } from './worker/handlers/demo-access.js';
import { handleDemoInvite, INVITE_PREFIX } from './worker/handlers/demo-invite.js';
import { handleRoot } from './worker/root.js';

const ROUTES = {
  '/api/contact': handleContactRequest,
  '/api/demo-access': handleDemoAccessRequest,
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const handler = ROUTES[url.pathname];
    if (handler) {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { allow: 'POST' },
        });
      }
      return handler(request, env);
    }
    if (url.pathname.startsWith(INVITE_PREFIX)) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
      }
      return handleDemoInvite(request, env);
    }
    if (url.pathname === '/') return handleRoot(request);
    return env.ASSETS.fetch(request);
  },
};
