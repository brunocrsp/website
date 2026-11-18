/**
 * Tests for src/worker/handlers/demo-invite.js : le lien personnel écrit dans
 * un courriel à un intégrateur ouvre la démo sans le formulaire, avec le même
 * laissez-passer, et prévient l'éditeur de qui l'a ouvert. Un lien faux ou
 * abîmé retombe sur le formulaire.
 */
import { beforeAll, describe, it, expect, vi } from 'vitest';
import { handleDemoInvite, inviteSeal, SEAL_HEX } from '../../src/worker/handlers/demo-invite.js';
import { b64urlDecode, b64urlEncode, PASS_TTL_S } from '../../src/worker/demo-pass.js';
import worker from '../../src/worker.js';

const NOW = Date.UTC(2026, 10, 18, 9, 0, 0);
const SECRET = 'un-secret-de-test';

let privateKey = '';
let publicKey: CryptoKey;

beforeAll(async () => {
  const kp = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  privateKey = b64urlEncode(new Uint8Array((await crypto.subtle.exportKey('pkcs8', kp.privateKey)) as ArrayBuffer));
  publicKey = kp.publicKey;
});

async function claims(pass: string) {
  const [payload, sig] = pass.split('.');
  const bytes = b64urlDecode(payload);
  const ok = await crypto.subtle.verify({ name: 'Ed25519' }, publicKey, b64urlDecode(sig), bytes);
  return { ok, ...JSON.parse(new TextDecoder().decode(bytes)) };
}

function makeFetch(status = 200) {
  const calls: Array<{ body: Record<string, unknown> }> = [];
  const fn = vi.fn(async (_url: string, init?: RequestInit) => {
    calls.push({ body: JSON.parse(String(init?.body ?? '{}')) });
    return new Response(JSON.stringify(status === 200 ? { id: 're_1' } : { error: 'boom' }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
  return { fn, calls };
}

function makeMemory() {
  const refs = new Set<string>();
  return { seen: async (ref: string) => refs.has(ref), remember: async (ref: string) => void refs.add(ref) };
}

const env = () => ({ RESEND_API_KEY: 're_test', DEMO_ACCESS_KEY: privateKey, DEMO_INVITE_KEY: SECRET });

async function link(ref: string, secret = SECRET) {
  return `https://meshvise.com/i/${ref}-${await inviteSeal(secret, ref)}`;
}

function request(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers: { 'User-Agent': 'Mozilla/5.0 (essai)', ...headers } });
}

describe('GET /i/<invitation>', () => {
  it('ouvre la démo avec un laissez-passer de trente jours et prévient l’éditeur', async () => {
    const { fn, calls } = makeFetch();
    const res = await handleDemoInvite(request(await link('atelier-dupont')), env(), {
      fetch: fn,
      now: () => NOW,
      memory: makeMemory(),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const url = new URL(res.headers.get('location')!);
    expect(url.origin + url.pathname).toBe('https://demo.meshvise.com/');
    expect(await claims(url.searchParams.get('acces')!)).toEqual({ ok: true, aud: 'demo', exp: NOW / 1000 + PASS_TTL_S });

    expect(calls).toHaveLength(1);
    const b = calls[0].body;
    expect(b.to).toEqual(['contact@meshvise.com']);
    expect(b.subject).toBe('Meshvise · Invitation ouverte · atelier-dupont');
    expect(b.text).toContain('Navigateur : Mozilla/5.0 (essai)');
  });

  it('n’écrit qu’une fois par destinataire tant que la mémoire le garde, et ouvre à chaque fois', async () => {
    const { fn, calls } = makeFetch();
    const deps = { fetch: fn, now: () => NOW, memory: makeMemory() };
    for (let i = 0; i < 3; i++) {
      const res = await handleDemoInvite(request(await link('atelier-dupont')), env(), deps);
      expect(res.headers.get('location')).toContain('acces=');
    }
    await handleDemoInvite(request(await link('autre-atelier')), env(), deps);
    expect(calls.map((c) => c.body.subject)).toEqual([
      'Meshvise · Invitation ouverte · atelier-dupont',
      'Meshvise · Invitation ouverte · autre-atelier',
    ]);
  });

  it('renvoie au formulaire, dans la langue du navigateur, un lien faux, abîmé ou d’un autre secret', async () => {
    const good = await link('atelier-dupont');
    const cases = [
      good.slice(0, -1) + (good.endsWith('0') ? '1' : '0'),
      good.slice(0, -2),
      good.replace('atelier-dupont', 'atelier-durand'),
      await link('atelier-dupont', 'un-autre-secret'),
      'https://meshvise.com/i/',
      'https://meshvise.com/i/Atelier-' + '0'.repeat(SEAL_HEX),
      'https://meshvise.com/i/' + '0'.repeat(SEAL_HEX),
    ];
    for (const url of cases) {
      const { fn, calls } = makeFetch();
      const res = await handleDemoInvite(request(url, { 'Accept-Language': 'en-GB' }), env(), {
        fetch: fn,
        now: () => NOW,
        memory: makeMemory(),
      });
      expect(res.status, url).toBe(302);
      expect(res.headers.get('location'), url).toBe('https://meshvise.com/en/demo/');
      expect(calls, url).toHaveLength(0);
    }
  });

  it('renvoie au formulaire quand un des deux secrets manque', async () => {
    for (const missing of ['DEMO_INVITE_KEY', 'DEMO_ACCESS_KEY']) {
      const e: Record<string, string> = env();
      delete e[missing];
      const res = await handleDemoInvite(request(await link('atelier-dupont')), e, { fetch: makeFetch().fn, memory: makeMemory() });
      expect(res.headers.get('location'), missing).toBe('https://meshvise.com/fr/demo/');
    }
  });

  it('ouvre la démo même si le courriel ne part pas, et garde l’ouverture au journal', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await handleDemoInvite(request(await link('atelier-dupont')), env(), {
        fetch: makeFetch(500).fn,
        now: () => NOW,
        memory: makeMemory(),
      });
      expect(res.headers.get('location')).toContain('https://demo.meshvise.com/?acces=');
      expect(JSON.stringify(error.mock.calls)).toContain('atelier-dupont');
    } finally {
      error.mockRestore();
    }
  });

  it('suit DEMO_URL quand le Worker la porte (une prévisualisation)', async () => {
    const res = await handleDemoInvite(
      request(await link('atelier-dupont')),
      { ...env(), DEMO_URL: 'https://abc123-meshvise-demo.meshvise.workers.dev' },
      { fetch: makeFetch().fn, now: () => NOW, memory: makeMemory() },
    );
    expect(res.headers.get('location')).toMatch(/^https:\/\/abc123-meshvise-demo\.meshvise\.workers\.dev\/\?acces=/);
  });

  it('est routé par le worker, en lecture seulement', async () => {
    const seen: string[] = [];
    const e = {
      ...env(),
      ASSETS: {
        async fetch(r: Request) {
          seen.push(new URL(r.url).pathname);
          return new Response('', { status: 404 });
        },
      },
    };
    const post = await worker.fetch(new Request(await link('atelier-dupont'), { method: 'POST' }), e);
    expect(post.status).toBe(405);
    const res = await worker.fetch(new Request('https://meshvise.com/i/nimporte-quoi'), e);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://meshvise.com/fr/demo/');
    expect(seen).toEqual([]);
  });
});
