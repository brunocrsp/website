/**
 * Les routes du Worker : les deux formulaires et la racine ont un
 * traitement. Tout le reste, /api/trial compris depuis le 2026-10-23, part
 * vers les fichiers statiques, c'est-à-dire la page 404 du site.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import worker from '../../src/worker.js';
import { rootLang } from '../../src/worker/root.js';

function env() {
  const seen: string[] = [];
  return {
    seen,
    ASSETS: {
      async fetch(request: Request) {
        seen.push(new URL(request.url).pathname);
        return new Response('not found', { status: 404 });
      },
    },
  };
}

describe('Worker routes', () => {
  it('sends /api/trial to the static assets, no handler answers it', async () => {
    const e = env();
    const res = await worker.fetch(new Request('https://meshvise.com/api/trial', { method: 'POST', body: '{}' }), e);
    expect(res.status).toBe(404);
    expect(e.seen).toEqual(['/api/trial']);
  });

  it('keeps /api/contact as a POST-only route', async () => {
    const e = env();
    const res = await worker.fetch(new Request('https://meshvise.com/api/contact'), e);
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    expect(e.seen).toEqual([]);
  });

  it('redirects the root to the language of the browser, query kept, with no stub page in between', async () => {
    const cases: Array<[string | null, string]> = [
      [null, 'https://meshvise.com/fr/?utm_source=x'],
      ['fr-FR,fr;q=0.9,en;q=0.8', 'https://meshvise.com/fr/?utm_source=x'],
      ['en-GB,en;q=0.9', 'https://meshvise.com/en/?utm_source=x'],
      ['de-DE,en;q=0.7,fr;q=0.8', 'https://meshvise.com/fr/?utm_source=x'],
      ['de-DE', 'https://meshvise.com/fr/?utm_source=x'],
    ];
    for (const [accept, location] of cases) {
      const e = env();
      const headers: Record<string, string> = accept ? { 'Accept-Language': accept } : {};
      const res = await worker.fetch(new Request('https://meshvise.com/?utm_source=x', { headers }), e);
      expect(res.status, String(accept)).toBe(302);
      expect(res.headers.get('location'), String(accept)).toBe(location);
      expect(res.headers.get('vary')).toBe('Accept-Language');
      expect(e.seen).toEqual([]);
    }
  });

  it('keeps the host of the request on the root redirect (www stays www)', async () => {
    const res = await worker.fetch(new Request('https://www.meshvise.com/', { headers: { 'Accept-Language': 'en' } }), env());
    expect(res.headers.get('location')).toBe('https://www.meshvise.com/en/');
  });

  it('weighs the browser languages by their q value, ties to the first', () => {
    expect(rootLang('en;q=0.5,fr;q=0.5')).toBe('en');
    expect(rootLang('fr;q=0.2,en;q=0.9')).toBe('en');
    expect(rootLang('EN-us')).toBe('en');
    expect(rootLang('en;q=abc')).toBe('fr');
    expect(rootLang('')).toBe('fr');
  });

  it('sends the root to the worker before the static files (wrangler.jsonc)', () => {
    const config = readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8');
    expect(config).toMatch(/"run_worker_first":\s*\[\s*"\/"\s*\]/);
  });
});
