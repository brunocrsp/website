/**
 * Tests for src/worker/handlers/contact.js : la demande du formulaire de
 * contact part par Resend vers contact@meshvise.com, avec l'adresse du
 * visiteur en réponse. Resend et le limiteur de débit sont simulés.
 */
import { describe, it, expect, vi } from 'vitest';
import { handleContactRequest } from '../../src/worker/handlers/contact.js';

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
  return new Request('https://meshvise.com/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const VALIDE = {
  topic: 'licence',
  name: 'Jeanne Dupont',
  company: 'Usinage Dupont',
  email: 'Jeanne@Dupont.fr',
  install: 'Douze machines CN, <b>Fanuc</b> et Siemens.',
  lang: 'fr',
  website: '',
};

const ENV = { RESEND_API_KEY: 're_test' };

describe('POST /api/contact', () => {
  it('sends the request to contact@meshvise.com, reply-to the visitor', async () => {
    const { fn, calls } = makeFetch();
    const res = await handleContactRequest(request(VALIDE), ENV, { fetch: fn });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    const b = calls[0].body;
    expect(calls[0].url).toContain('api.resend.com/emails');
    expect(b.to).toEqual(['contact@meshvise.com']);
    expect(b.reply_to).toBe('jeanne@dupont.fr');
    expect(b.subject).toBe('Meshvise · Licence On-Premise · Usinage Dupont');
    expect(String(b.text)).toContain('Douze machines CN');
  });

  it('escapes the visitor text in the HTML body', async () => {
    const { fn, calls } = makeFetch();
    await handleContactRequest(request(VALIDE), ENV, { fetch: fn });
    expect(String(calls[0].body.html)).toContain('&lt;b&gt;Fanuc&lt;/b&gt;');
    expect(String(calls[0].body.html)).not.toContain('<b>Fanuc</b>');
  });

  it('treats an unknown topic as "other"', async () => {
    const { fn, calls } = makeFetch();
    await handleContactRequest(request({ ...VALIDE, topic: 'nimportequoi' }), ENV, { fetch: fn });
    expect(calls[0].body.subject).toBe('Meshvise · Autre question · Usinage Dupont');
  });

  it('answers ok to a filled honeypot but sends nothing', async () => {
    const { fn, calls } = makeFetch();
    const res = await handleContactRequest(request({ ...VALIDE, website: 'http://spam' }), ENV, { fetch: fn });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(0);
  });

  it.each([
    ['bad-name', { name: '' }],
    ['bad-company', { company: '' }],
    ['bad-email', { email: 'pas-une-adresse' }],
    ['bad-install', { install: 'x'.repeat(5001) }],
  ])('rejects invalid input (%s)', async (code, patch) => {
    const { fn, calls } = makeFetch();
    const res = await handleContactRequest(request({ ...VALIDE, ...patch }), ENV, { fetch: fn });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe(code);
    expect(calls).toHaveLength(0);
  });

  it('rejects a body that is not JSON', async () => {
    const res = await handleContactRequest(request('pas du json'), ENV, { fetch: makeFetch().fn });
    expect(res.status).toBe(400);
  });

  it('refuses when the rate limiter says no', async () => {
    const { fn, calls } = makeFetch();
    const env = { ...ENV, CONTACT_RATE_LIMITER: { limit: async () => ({ success: false }) } };
    const res = await handleContactRequest(request(VALIDE), env, { fetch: fn });
    expect(res.status).toBe(429);
    expect(calls).toHaveLength(0);
  });

  it('keys the rate limit on the contact form', async () => {
    const keys: string[] = [];
    const env = { ...ENV, CONTACT_RATE_LIMITER: { limit: async ({ key }: { key: string }) => { keys.push(key); return { success: true }; } } };
    await handleContactRequest(request(VALIDE), env, { fetch: makeFetch().fn });
    expect(keys).toEqual(['contact:1.2.3.4']);
  });

  it('reports an error instead of a fake success when Resend is not configured', async () => {
    const { fn, calls } = makeFetch();
    const res = await handleContactRequest(request(VALIDE), {}, { fetch: fn });
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe('email-unavailable');
    expect(calls).toHaveLength(0);
  });

  it('reports an error when Resend fails', async () => {
    const res = await handleContactRequest(request(VALIDE), ENV, { fetch: makeFetch(500).fn });
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe('email-failed');
  });
});
