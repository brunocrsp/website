// Rate limit helper for the contact form: the native Cloudflare Rate
// Limiting binding, 3 requests per 60 s per key (see wrangler.jsonc).

// Native Workers Rate Limiting binding wrapper. Returns true if the
// request passes (under threshold), false otherwise. If the binding is
// missing (e.g. local vitest), returns true so logic downstream still
// runs.
export async function checkNativeRateLimit(rateLimiter, key) {
  if (!rateLimiter || typeof rateLimiter.limit !== 'function') return { allowed: true };
  try {
    const { success } = await rateLimiter.limit({ key });
    return { allowed: success === true };
  } catch (err) {
    // If the binding errors, fail open. Logged by caller.
    return { allowed: true, error: String(err) };
  }
}
