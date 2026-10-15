// Resend sender with pacing and 429 retry, plus small address helpers.
//
// Resend allows 10 requests a second per team. Sending in a tight loop trips
// it: on 15 Oct 2026 the morning edition reached only 30 of 49 subscribers,
// the other 19 got "Resend 429: Too many requests".

const RESEND_URL = "https://api.resend.com/emails";

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wait before retry attempt `attempt` (1 = first retry). Honours Resend's
// retry-after header (seconds) when present, else backs off 1s, 2s, 4s, 8s.
export function retryDelayMs(retryAfter, attempt) {
  const s = Number(retryAfter);
  if (retryAfter != null && Number.isFinite(s) && s > 0) return Math.min(s * 1000, 30_000);
  return Math.min(1000 * 2 ** (attempt - 1), 10_000);
}

// Returns send(body) that keeps at least gapMs between requests (250 ms = 4 a
// second, leaving room under the limit) and retries a 429 up to maxAttempts.
export function createResendSender({
  apiKey,
  fetchImpl = fetch,
  sleep = defaultSleep,
  now = Date.now,
  gapMs = 250,
  maxAttempts = 5,
}) {
  let last = -Infinity;
  async function pace() {
    const wait = last + gapMs - now();
    if (wait > 0) await sleep(wait);
    last = now();
  }
  return async function send(body) {
    for (let attempt = 1; ; attempt++) {
      await pace();
      const res = await fetchImpl(RESEND_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return res.json();
      const text = await res.text();
      if (res.status !== 429 || attempt >= maxAttempts) {
        throw new Error(`Resend ${res.status} after ${attempt} attempt(s): ${text}`);
      }
      await sleep(retryDelayMs(res.headers.get("retry-after"), attempt));
    }
  };
}

// The Actions logs of this repo are public, so addresses never go to stdout
// in full: "rashi@axiomsync.com" -> "r***@axiomsync.com".
export function maskEmail(email) {
  const [local, domain] = String(email).split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

// "a@x.com, B@y.com\nc@z.com" -> ["a@x.com", "b@y.com", "c@z.com"], deduped.
export function parseAddressList(text) {
  const out = new Set();
  for (const part of String(text || "").split(/[\s,;]+/)) {
    const e = part.trim().toLowerCase();
    if (e.includes("@")) out.add(e);
  }
  return [...out];
}
