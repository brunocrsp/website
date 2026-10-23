/**
 * Les routes du Worker : seul /api/contact a un traitement. Tout le reste,
 * /api/trial compris depuis le 2026-10-23, part vers les fichiers statiques,
 * c'est-à-dire la page 404 du site.
 */
import { describe, it, expect } from 'vitest';
import worker from '../../src/worker.js';

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
});
