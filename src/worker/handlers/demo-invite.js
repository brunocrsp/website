// GET /i/<invitation> : le lien personnel que l'éditeur écrit dans un
// courriel à un intégrateur (2026-11-18, demande de Bruno). Il ouvre la démo
// sans passer par le formulaire de la page Démo, et prévient l'éditeur que
// ce destinataire-là l'a ouverte.
//
// L'invitation : `<ref>-<sceau>`. `ref` désigne le destinataire, en
// minuscules, chiffres et tirets ; le sceau est le début, en hexadécimal, du
// HMAC-SHA256 de `invite:<ref>` sous le secret DEMO_INVITE_KEY du Worker. Les
// liens sont fabriqués hors du dépôt, avec ce secret : aucun nom de
// destinataire n'entre dans ce repo, qui est public.
//
// Une invitation valable reçoit le même laissez-passer de trente jours que
// le formulaire (`demo-pass.js`) et part vers la démo. Tout le reste (sceau
// faux, secret absent) part vers la page Démo et son formulaire : un lien
// abîmé ne laisse personne devant une erreur.
//
// Un courriel par destinataire et par heure : les passerelles de messagerie
// ouvrent les liens avant leur destinataire, et un visiteur revient. L'agent
// du navigateur est dans le courriel pour distinguer l'un de l'autre.
//
// Les effets de bord (fetch, horloge, mémoire des envois) sont injectables
// pour les tests.

import { sendResend } from '../resend.js';
import { DEFAULTS, mailBody } from './contact.js';
import { DEMO_URL, PASS_TTL_S, signDemoPass } from '../demo-pass.js';
import { rootLang } from '../root.js';

export const INVITE_PREFIX = '/i/';
/** Vingt caractères hexadécimaux : quatre-vingts bits, hors de portée d'un essai. */
export const SEAL_HEX = 20;
const INVITE_RE = new RegExp(`^([a-z0-9]+(?:-[a-z0-9]+)*)-([0-9a-f]{${SEAL_HEX}})$`);
const NOTIFY_EVERY_S = 3600;

/** Le sceau d'un destinataire. Sert ici à vérifier, et au script qui
 *  fabrique les liens. */
export async function inviteSeal(secret, ref) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`invite:${ref}`)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, SEAL_HEX);
}

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function redirect(location) {
  return new Response(null, {
    status: 302,
    headers: {
      location,
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-robots-tag': 'noindex',
    },
  });
}

/** La mémoire des envois, dans le cache du point de présence : assez pour
 *  ne pas écrire dix fois de suite, sans rien stocker ailleurs. */
const edgeMemory = {
  async seen(ref) {
    if (typeof caches === 'undefined' || !caches.default) return false;
    return Boolean(await caches.default.match(`https://invite.internal/${ref}`));
  },
  async remember(ref) {
    if (typeof caches === 'undefined' || !caches.default) return;
    await caches.default.put(
      `https://invite.internal/${ref}`,
      new Response('1', { headers: { 'cache-control': `max-age=${NOTIFY_EVERY_S}` } }),
    );
  },
};

export async function handleDemoInvite(request, env, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const memory = deps.memory ?? edgeMemory;

  const url = new URL(request.url);
  const lang = rootLang(request.headers.get('Accept-Language'));
  const form = new URL(`/${lang}/demo/`, url).toString();

  const match = INVITE_RE.exec(url.pathname.slice(INVITE_PREFIX.length));
  if (!match || !env.DEMO_INVITE_KEY || !env.DEMO_ACCESS_KEY) return redirect(form);
  const [, ref, seal] = match;
  if (!sameText(seal, await inviteSeal(env.DEMO_INVITE_KEY, ref))) return redirect(form);

  let pass;
  try {
    pass = await signDemoPass(env.DEMO_ACCESS_KEY, Math.floor(now() / 1000) + PASS_TTL_S);
  } catch (err) {
    console.error('handleDemoInvite: signing failed', String(err));
    return redirect(form);
  }

  try {
    if (!(await memory.seen(ref))) {
      await memory.remember(ref);
      const lignes = [
        ['Invitation', ref],
        ['Navigateur', (request.headers.get('User-Agent') || '(non indiqué)').slice(0, 300)],
        ['Pays', request.cf?.country || '(non indiqué)'],
      ];
      const { text, html } = mailBody(
        lignes,
        "Ce lien d'invitation vient d'être ouvert. Une passerelle de messagerie peut l'ouvrir avant son destinataire : le navigateur ci-dessus aide à faire la différence.",
      );
      const res = await sendResend({
        apiKey: env.RESEND_API_KEY,
        from: env.CONTACT_FROM_EMAIL || DEFAULTS.from,
        to: env.CONTACT_TO_EMAIL || DEFAULTS.to,
        subject: `Meshvise · Invitation ouverte · ${ref}`,
        html,
        text,
        fetchImpl,
      });
      if (!res.ok) console.error('handleDemoInvite: send failed, opening kept here', { ...res, ref });
    }
  } catch (err) {
    // Prévenir l'éditeur ne doit jamais fermer la démo à l'invité.
    console.error('handleDemoInvite: notification failed', String(err), { ref });
  }

  const target = new URL('/', env.DEMO_URL || DEMO_URL);
  target.searchParams.set('acces', pass);
  return redirect(target.toString());
}
