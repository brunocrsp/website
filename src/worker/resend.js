// Thin wrapper around Resend's REST API. Tested by injecting a fetchImpl.
//
// API: https://resend.com/docs/api-reference/emails/send-email

const RESEND_URL = 'https://api.resend.com/emails';

export async function sendResend({ apiKey, from, to, replyTo, subject, html, text, fetchImpl = fetch }) {
  if (!apiKey) {
    return { ok: false, code: 'no-api-key' };
  }

  const body = {
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
  };
  if (replyTo) body.reply_to = replyTo;

  let res;
  try {
    res = await fetchImpl(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, code: 'network-error', detail: String(err) };
  }

  let payload;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, code: `http-${res.status}`, detail: 'non-JSON response' };
  }

  if (!res.ok) {
    return { ok: false, code: `http-${res.status}`, detail: payload };
  }

  return { ok: true, id: payload?.id ?? null };
}
