/**
 * Cloudflare Worker entry. Routes:
 *   POST /api/contact     → handleContactRequest (the Contact page form)
 *   POST /api/demo-access → handleDemoAccessRequest (the Demo page form:
 *                           emails the visitor's details, answers the demo
 *                           URL with a signed access pass, since 2026-10-26)
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
    return env.ASSETS.fetch(request);
  },
};
