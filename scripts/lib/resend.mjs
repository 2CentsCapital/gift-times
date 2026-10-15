// Resend API helpers: throttled, retrying sends.
//
// Resend caps the API at 10 requests/second. A plain loop over subscribers
// exceeds that and every send past the cap fails with 429, so sends are
// spaced out (SEND_GAP_MS) and 429s are retried with backoff.

export const SEND_GAP_MS = 150; // ~6.6 req/s, safely under the 10/s cap
const MAX_ATTEMPTS = 5;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Subscriber addresses must not land in (public) Actions logs.
export function maskEmail(addr) {
  const [user, domain] = String(addr).split("@");
  if (!domain) return "***";
  return `${user.slice(0, 1)}***@${domain}`;
}

// POST one email. Retries on 429 (honouring Retry-After) and 5xx; any other
// error is thrown immediately.
export async function postEmail(body, { apiKey, fetchFn = fetch, wait = sleep } = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      throw new Error(`Resend ${res.status}: ${await res.text()}`);
    }
    const retryAfter = Number(res.headers?.get?.("retry-after"));
    await wait(retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** (attempt - 1));
  }
}
