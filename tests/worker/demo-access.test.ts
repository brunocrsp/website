/**
 * Tests for src/worker/handlers/demo-access.js : le formulaire de la page
 * Démo envoie les coordonnées du visiteur à contact@meshvise.com et lui rend
 * l'adresse de la démo avec un laissez-passer signé, que le worker de la
 * démo vérifie (apps/demo/src/access.ts du repo produit). La paire de clés
 * est tirée à chaque passage : aucune clé n'est écrite dans le dépôt.
 */
import { beforeAll, describe, it, expect, vi } from 'vitest';
import { handleDemoAccessRequest } from '../../src/worker/handlers/demo-access.js';
import { b64urlDecode, b64urlEncode, PASS_TTL_S } from '../../src/worker/demo-pass.js';
import worker from '../../src/worker.js';

const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);

let privateKey = '';
let publicKey: CryptoKey;

beforeAll(async () => {
  const kp = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  privateKey = b64urlEncode(new Uint8Array((await crypto.subtle.exportKey('pkcs8', kp.privateKey)) as ArrayBuffer));
  publicKey = kp.publicKey;
});

/** Ce que fait le worker de la démo : la signature, le public, l'échéance. */
async function claims(pass: string) {
  const [payload, sig] = pass.split('.');
  const bytes = b64urlDecode(payload);
  const ok = await crypto.subtle.verify({ name: 'Ed25519' }, publicKey, b64urlDecode(sig), bytes);
  return { ok, ...JSON.parse(new TextDecoder().decode(bytes)) };
}

function makeFetch(status = 200) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
    return new Response(JSON.stringify(status === 200 ? { id: 're_1' } : { error: 'boom' }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
  return { fn, calls };
}

function request(body: unknown) {
  return new Request('https://meshvise.com/api/demo-access', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const VALIDE = {
  name: 'Jeanne Dupont',
  company: 'Usinage <Dupont>',
  email: 'Jeanne@Dupont.fr',
  phone: '+33 6 12 34 56 78',
  lang: 'fr',
  website: '',
};

const env = () => ({ RESEND_API_KEY: 're_test', DEMO_ACCESS_KEY: privateKey });
const deps = (fn: ReturnType<typeof makeFetch>['fn']) => ({ fetch: fn, now: () => NOW });

describe('POST /api/demo-access', () => {
  it('envoie les coordonnées à contact@meshvise.com et rend la démo avec un laissez-passer de trente jours', async () => {
    const { fn, calls } = makeFetch();
    const res = await handleDemoAccessRequest(request(VALIDE), env(), deps(fn));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    const url = new URL(data.url);
    expect(url.origin + url.pathname).toBe('https://demo.meshvise.com/');
    expect(await claims(url.searchParams.get('acces')!)).toEqual({ ok: true, aud: 'demo', exp: NOW / 1000 + PASS_TTL_S });

    expect(calls).toHaveLength(1);
    const b = calls[0].body;
    expect(b.to).toEqual(['contact@meshvise.com']);
    expect(b.reply_to).toBe('jeanne@dupont.fr');
    expect(b.subject).toBe('Meshvise · Accès à la démo · Usinage <Dupont>');
    expect(b.text).toContain('Téléphone : +33 6 12 34 56 78');
    expect(b.html).toContain('Usinage &lt;Dupont&gt;');
    expect(b.html).not.toContain('<Dupont>');
  });

  it('ramène à la page de la démo que le visiteur avait demandée, jamais ailleurs', async () => {
    const cases: Array<[unknown, string]> = [
      ['/synoptics/broche-cu1?x=1', 'https://demo.meshvise.com/synoptics/broche-cu1?x=1'],
      ['//evil.example/', 'https://demo.meshvise.com/'],
      ['/\\evil.example', 'https://demo.meshvise.com/'],
      ['https://evil.example/', 'https://demo.meshvise.com/'],
      [42, 'https://demo.meshvise.com/'],
    ];
    for (const [suite, expected] of cases) {
      const res = await handleDemoAccessRequest(request({ ...VALIDE, suite }), env(), deps(makeFetch().fn));
      const url = new URL((await res.json()).url);
      url.searchParams.delete('acces');
      expect(url.toString(), String(suite)).toBe(expected);
    }
  });

  it('suit DEMO_URL quand le Worker la porte (une prévisualisation)', async () => {
    const res = await handleDemoAccessRequest(
      request(VALIDE),
      { ...env(), DEMO_URL: 'https://abc123-meshvise-demo.meshvise.workers.dev' },
      deps(makeFetch().fn),
    );
    expect((await res.json()).url).toMatch(/^https:\/\/abc123-meshvise-demo\.meshvise\.workers\.dev\/\?acces=/);
  });

  it('ouvre quand même la démo si le courriel ne part pas, et garde le visiteur au journal', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await handleDemoAccessRequest(request(VALIDE), env(), deps(makeFetch(500).fn));
      expect(res.status).toBe(200);
      expect((await res.json()).url).toContain('acces=');
      expect(JSON.stringify(error.mock.calls)).toContain('Usinage <Dupont>');
    } finally {
      error.mockRestore();
    }
  });

  it('ne laisse entrer personne sans clé de signature', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { fn, calls } = makeFetch();
      const res = await handleDemoAccessRequest(request(VALIDE), { RESEND_API_KEY: 're_test' }, deps(fn));
      expect(res.status).toBe(500);
      expect((await res.json()).code).toBe('access-unavailable');
      expect(calls).toHaveLength(0);
    } finally {
      error.mockRestore();
    }
  });

  it.each([
    ['bad-name', { name: '' }],
    ['bad-company', { company: ' ' }],
    ['bad-email', { email: 'pas-une-adresse' }],
    ['bad-phone', { phone: 'appelez-moi' }],
  ])('refuse un formulaire incomplet (%s)', async (code, patch) => {
    const { fn, calls } = makeFetch();
    const res = await handleDemoAccessRequest(request({ ...VALIDE, ...patch }), env(), deps(fn));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe(code);
    expect(calls).toHaveLength(0);
  });

  it('accepte un formulaire sans téléphone', async () => {
    const { fn, calls } = makeFetch();
    const res = await handleDemoAccessRequest(request({ ...VALIDE, phone: '' }), env(), deps(fn));
    expect(res.status).toBe(200);
    expect(calls[0].body.text).toContain('Téléphone : (non indiqué)');
  });

  it('ne donne pas de laissez-passer au piège à robots, et n’envoie rien', async () => {
    const { fn, calls } = makeFetch();
    const res = await handleDemoAccessRequest(request({ ...VALIDE, website: 'spam' }), env(), deps(fn));
    expect(await res.json()).toEqual({ ok: true, url: 'https://demo.meshvise.com/' });
    expect(calls).toHaveLength(0);
  });

  it('applique le limiteur de débit, sous sa propre clé', async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const { fn, calls } = makeFetch();
    const res = await handleDemoAccessRequest(request(VALIDE), { ...env(), CONTACT_RATE_LIMITER: { limit } }, deps(fn));
    expect(res.status).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: 'demo:1.2.3.4' });
    expect(calls).toHaveLength(0);
  });

  it('est une route POST du Worker', async () => {
    const res = await worker.fetch(new Request('https://meshvise.com/api/demo-access'), {
      ASSETS: { fetch: async () => new Response('not found', { status: 404 }) },
    });
    expect(res.status).toBe(405);
  });
});
