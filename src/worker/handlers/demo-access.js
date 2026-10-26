// POST /api/demo-access : le formulaire de la page Démo (2026-10-26, demande
// de Bruno : savoir qui ouvre la démo, pour le recontacter). Les coordonnées
// partent par courriel à contact@meshvise.com, comme une demande de contact ;
// la réponse porte l'adresse de la démo avec un laissez-passer de trente
// jours, que la page suit aussitôt.
//
// Mêmes défenses que le formulaire de contact : le champ piège `website` et
// le limiteur de débit natif (clé `demo:<ip>`).
//
// Un courriel qui ne part pas ne ferme pas la démo au visiteur : ses
// coordonnées sont alors écrites dans le journal du Worker (Workers Logs),
// où l'éditeur les retrouve. Sans clé de signature, en revanche, personne
// n'entre : la page le dit et propose la page Contact.
//
// Les effets de bord (fetch, horloge) sont injectables pour les tests.

import { jsonResponse, badRequest, tooManyRequests, serverError, isValidEmail, normaliseEmail } from '../json.js';
import { checkNativeRateLimit } from '../rate.js';
import { sendResend } from '../resend.js';
import { DEFAULTS, mailBody } from './contact.js';
import { DEMO_URL, PASS_TTL_S, signDemoPass } from '../demo-pass.js';

const PHONE_RE = /^[0-9+().\s-]{6,40}$/;

/** La page de la démo où revenir : un chemin local, rien d'autre. */
function demoTarget(base, suite) {
  const target = new URL('/', base);
  if (typeof suite === 'string' && /^\/(?![/\\])/.test(suite) && suite.length <= 300) {
    const asked = new URL(suite, base);
    if (asked.origin === target.origin) return asked;
  }
  return target;
}

export async function handleDemoAccessRequest(request, env, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('bad-json', 'Body is not valid JSON.');
  }
  if (!body || typeof body !== 'object') {
    return badRequest('bad-body', 'Body is not an object.');
  }

  const base = env.DEMO_URL || DEMO_URL;

  // Le piège : rempli, c'est un robot. Il reçoit l'adresse de la démo sans
  // laissez-passer, qui le renvoie au formulaire.
  if ((body.website ?? '').toString().trim() !== '') {
    return jsonResponse({ ok: true, url: new URL('/', base).toString() });
  }

  const name = (body.name ?? '').toString().trim();
  const company = (body.company ?? '').toString().trim();
  const email = normaliseEmail(body.email);
  const phone = (body.phone ?? '').toString().trim();
  const lang = body.lang === 'en' ? 'en' : 'fr';

  if (!name || name.length > 200) return badRequest('bad-name', 'Name is required (1..200 chars).');
  if (!company || company.length > 200) return badRequest('bad-company', 'Company is required (1..200 chars).');
  if (!isValidEmail(email)) return badRequest('bad-email', 'Email is invalid.');
  if (phone && !PHONE_RE.test(phone)) return badRequest('bad-phone', 'Phone is invalid.');

  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Real-IP') || 'unknown';
  const rate = await checkNativeRateLimit(env.CONTACT_RATE_LIMITER, `demo:${ip}`);
  if (!rate.allowed) {
    return tooManyRequests('rate-limit', 'Too many requests. Try again in a minute.');
  }

  if (!env.DEMO_ACCESS_KEY) {
    console.error('handleDemoAccessRequest: DEMO_ACCESS_KEY missing');
    return serverError('access-unavailable', 'Demo access is unavailable.');
  }
  let pass;
  try {
    pass = await signDemoPass(env.DEMO_ACCESS_KEY, Math.floor(now() / 1000) + PASS_TTL_S);
  } catch (err) {
    console.error('handleDemoAccessRequest: signing failed', String(err));
    return serverError('access-unavailable', 'Demo access is unavailable.');
  }

  const target = demoTarget(base, body.suite);
  const lignes = [
    ['Demande', `Accès à la démo${lang === 'en' ? ' (page anglaise)' : ''}`],
    ['Nom', name],
    ['Entreprise', company],
    ['Courriel', email],
    ['Téléphone', phone || '(non indiqué)'],
  ];
  if (target.pathname !== '/' || target.search) lignes.push(['Page demandée', target.pathname + target.search]);
  const { text, html } = mailBody(lignes, 'Le visiteur a reçu un accès de trente jours à la démo.');

  const res = await sendResend({
    apiKey: env.RESEND_API_KEY,
    from: env.CONTACT_FROM_EMAIL || DEFAULTS.from,
    to: env.CONTACT_TO_EMAIL || DEFAULTS.to,
    replyTo: email,
    subject: `Meshvise · Accès à la démo · ${company}`,
    html,
    text,
    fetchImpl,
  });
  if (!res.ok) {
    console.error('handleDemoAccessRequest: send failed, lead kept here', { ...res, lead: Object.fromEntries(lignes) });
  }

  target.searchParams.set('acces', pass);
  return jsonResponse({ ok: true, url: target.toString() });
}
