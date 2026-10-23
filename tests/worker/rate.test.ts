/**
 * Tests for src/worker/rate.js. The native rate limiter is mocked with a
 * counter.
 */
import { describe, it, expect } from 'vitest';
import { checkNativeRateLimit } from '../../src/worker/rate.js';

function makeRateLimiter(allowedSequence: boolean[]) {
  let i = 0;
  return {
    calls: [] as Array<{ key: string }>,
    async limit(args: { key: string }) {
      this.calls.push(args);
      const success = allowedSequence[i] ?? allowedSequence[allowedSequence.length - 1] ?? true;
      i += 1;
      return { success };
    },
  };
}

describe('checkNativeRateLimit', () => {
  it('returns allowed=true when binding is missing', async () => {
    const res = await checkNativeRateLimit(undefined, 'k');
    expect(res).toEqual({ allowed: true });
  });

  it('forwards the result from the native binding', async () => {
    const limiter = makeRateLimiter([true, true, false]);
    const a = await checkNativeRateLimit(limiter, 'ip:1.2.3.4');
    const b = await checkNativeRateLimit(limiter, 'ip:1.2.3.4');
    const c = await checkNativeRateLimit(limiter, 'ip:1.2.3.4');
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
    expect(c.allowed).toBe(false);
    expect(limiter.calls).toHaveLength(3);
    expect(limiter.calls[0]).toEqual({ key: 'ip:1.2.3.4' });
  });

  it('fails open if the binding throws', async () => {
    const limiter = {
      async limit() { throw new Error('boom'); },
    };
    const res = await checkNativeRateLimit(limiter, 'k');
    expect(res.allowed).toBe(true);
    expect(res.error).toContain('boom');
  });
});
