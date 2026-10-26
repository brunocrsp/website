// Le laissez-passer de la démo publique (2026-10-26) : la démo, sur
// demo.meshvise.com, ne s'ouvre qu'à qui a rempli le formulaire de la page
// Démo. Ce module le signe ; le worker de la démo le vérifie
// (`apps/demo/src/access.ts` du repo produit).
//
// Contrat, décrit dans documentation/docs/01-architecture/interfaces-entre-repos.md :
// `<charge>.<signature>`, chacune en base64url ; la charge est le JSON
// `{"aud":"demo","exp":<secondes Unix, entier>}`, la signature Ed25519 de ses
// octets. La clé privée (PKCS#8 en base64url) est le secret DEMO_ACCESS_KEY
// du Worker ; la clé publique est dans le wrangler.jsonc de la démo.

/** L'adresse de la démo. Le Worker la prend dans `env.DEMO_URL` quand elle
 *  est posée (une prévisualisation), sinon ici ; la page Démo l'affiche
 *  pour qui est déjà inscrit. */
export const DEMO_URL = 'https://demo.meshvise.com';

/** Trente jours : le temps d'y revenir sans se réinscrire. */
export const PASS_TTL_S = 30 * 86_400;

const ED25519 = { name: 'Ed25519' };

export function b64urlEncode(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Signe un laissez-passer valable jusqu'à `expS` (secondes Unix, entier). */
export async function signDemoPass(privateKeyPkcs8, expS) {
  const key = await crypto.subtle.importKey('pkcs8', b64urlDecode(privateKeyPkcs8), ED25519, false, ['sign']);
  const payload = new TextEncoder().encode(JSON.stringify({ aud: 'demo', exp: expS }));
  const sig = new Uint8Array(await crypto.subtle.sign(ED25519, key, payload));
  return `${b64urlEncode(payload)}.${b64urlEncode(sig)}`;
}
