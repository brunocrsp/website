// POST /api/contact : la demande du formulaire de la page Contact, envoyée
// par courriel à contact@meshvise.com. Remplace, depuis le 2026-09-23, le
// lien mailto: qui ne partait que si le visiteur avait un logiciel de
// messagerie configuré, et perdait la demande en silence sinon.
//
// Défenses contre le spam, sans service tiers : un champ piège invisible
// (`website`) qu'un humain laisse vide, et le limiteur de débit natif du
// Worker (3 requêtes par minute et par IP). Turnstile pourra s'y ajouter si
// le spam passe.
//
// Les effets de bord (fetch) sont injectables pour les tests.

import { jsonResponse, badRequest, tooManyRequests, serverError, isValidEmail, normaliseEmail } from '../json.js';
import { checkNativeRateLimit } from '../rate.js';
import { sendResend } from '../resend.js';

const TOPICS = {
  licence: { fr: 'Licence On-Premise', en: 'On-Premise licence' },
  exploitation: { fr: 'Exploitation déléguée', en: 'Managed operations' },
  essai: { fr: 'Essai sur vos équipements', en: 'Trial on your equipment' },
  demo: { fr: 'Démonstration', en: 'Demonstration' },
  autre: { fr: 'Autre question', en: 'Other question' },
};

export const DEFAULTS = {
  to: 'contact@meshvise.com',
  from: 'Formulaire Meshvise <formulaire@meshvise.com>',
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Le corps du courriel : les champs en tableau, puis le message. Partagé
 *  avec le formulaire d'accès à la démo. */
export function mailBody(lignes, message) {
  const text = [...lignes.map(([k, v]) => `${k} : ${v}`), '', message].join('\n');
  const html = [
    '<table style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;font-size:14px;color:#161b23;border-collapse:collapse">',
    ...lignes.map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#4b5462">${k}</td><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`),
    '</table>',
    `<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;color:#161b23;white-space:pre-wrap;margin-top:16px">${escapeHtml(message)}</p>`,
  ].join('');
  return { text, html };
}

export async function handleContactRequest(request, env, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch;

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('bad-json', 'Body is not valid JSON.');
  }
  if (!body || typeof body !== 'object') {
    return badRequest('bad-body', 'Body is not an object.');
  }

  // Le piège : rempli, c'est un robot. On répond comme si tout allait bien
  // pour ne pas lui apprendre à contourner, et on n'envoie rien.
  if ((body.website ?? '').toString().trim() !== '') {
    return jsonResponse({ ok: true });
  }

  const topic = Object.hasOwn(TOPICS, body.topic) ? body.topic : 'autre';
  const name = (body.name ?? '').toString().trim();
  const company = (body.company ?? '').toString().trim();
  const email = normaliseEmail(body.email);
  const install = (body.install ?? '').toString().trim();
  const lang = body.lang === 'en' ? 'en' : 'fr';

  if (!name || name.length > 200) return badRequest('bad-name', 'Name is required (1..200 chars).');
  if (!company || company.length > 200) return badRequest('bad-company', 'Company is required (1..200 chars).');
  if (!isValidEmail(email)) return badRequest('bad-email', 'Email is invalid.');
  if (install.length > 5000) return badRequest('bad-install', 'Message is too long (5000 chars max).');

  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Real-IP') || 'unknown';
  const rate = await checkNativeRateLimit(env.CONTACT_RATE_LIMITER, `contact:${ip}`);
  if (!rate.allowed) {
    return tooManyRequests('rate-limit', 'Too many requests. Try again in a minute.');
  }

  // Sans clé Resend, l'envoi est impossible : on le dit, et la page propose
  // alors le courriel prérempli au lieu d'afficher un faux succès.
  if (!env.RESEND_API_KEY) {
    console.error('handleContactRequest: RESEND_API_KEY missing');
    return serverError('email-unavailable', 'Email sending is unavailable.');
  }

  const libelle = TOPICS[topic].fr;
  const lignes = [
    ['Demande', `${libelle}${lang === 'en' ? ' (page anglaise)' : ''}`],
    ['Nom', name],
    ['Entreprise', company],
    ['Courriel', email],
  ];
  const { text, html } = mailBody(lignes, install || '(pas de message)');

  const res = await sendResend({
    apiKey: env.RESEND_API_KEY,
    from: env.CONTACT_FROM_EMAIL || DEFAULTS.from,
    to: env.CONTACT_TO_EMAIL || DEFAULTS.to,
    replyTo: email,
    subject: `Meshvise · ${libelle} · ${company}`,
    html,
    text,
    fetchImpl,
  });

  if (!res.ok) {
    console.error('handleContactRequest: send failed', res);
    return serverError('email-failed', 'Could not send the message.');
  }
  return jsonResponse({ ok: true });
}
