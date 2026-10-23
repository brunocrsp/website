// Tiny JSON / Response helpers for the worker handlers. No deps.

export function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init.headers ?? {}),
    },
  });
}

export function badRequest(code, message) {
  return jsonResponse({ ok: false, code, message }, { status: 400 });
}

export function tooManyRequests(code, message) {
  return jsonResponse({ ok: false, code, message }, { status: 429 });
}

export function serverError(code, message) {
  return jsonResponse({ ok: false, code, message }, { status: 500 });
}

// Strict-ish email regex. Not RFC 5322 compliant, just rejects obviously
// broken input. Real validation happens server-side at email send time.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_RE.test(value) && value.length <= 254;
}

export function normaliseEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}
