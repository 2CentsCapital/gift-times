import { describe, it, expect } from "vitest";
import {
  createResendSender,
  retryDelayMs,
  maskEmail,
  parseAddressList,
} from "../scripts/lib/mailer.mjs";
import { lastEditionWindow } from "../scripts/lib/newsletter.mjs";

// Fake clock: sleep() moves time forward instead of waiting.
function fakeClock() {
  let t = 0;
  const sleeps = [];
  return {
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

function response(status, body = {}, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  };
}

describe("createResendSender", () => {
  it("keeps the gap between requests so a loop stays under the rate limit", async () => {
    const clock = fakeClock();
    const at = [];
    const send = createResendSender({
      apiKey: "k",
      now: clock.now,
      sleep: clock.sleep,
      gapMs: 250,
      fetchImpl: async () => {
        at.push(clock.now());
        return response(200, { id: "x" });
      },
    });
    for (let i = 0; i < 5; i++) await send({ to: `a${i}@x.com` });
    expect(at).toEqual([0, 250, 500, 750, 1000]);
  });

  it("retries a 429, honouring retry-after, then succeeds", async () => {
    const clock = fakeClock();
    const replies = [response(429, {}, { "retry-after": "2" }), response(200, { id: "ok" })];
    const send = createResendSender({
      apiKey: "k",
      now: clock.now,
      sleep: clock.sleep,
      fetchImpl: async () => replies.shift(),
    });
    await expect(send({ to: "a@x.com" })).resolves.toEqual({ id: "ok" });
    expect(clock.sleeps).toContain(2000);
  });

  it("gives up after maxAttempts 429s", async () => {
    const clock = fakeClock();
    let calls = 0;
    const send = createResendSender({
      apiKey: "k",
      now: clock.now,
      sleep: clock.sleep,
      maxAttempts: 3,
      fetchImpl: async () => {
        calls++;
        return response(429, { message: "Too many requests" });
      },
    });
    await expect(send({ to: "a@x.com" })).rejects.toThrow(/Resend 429 after 3 attempt/);
    expect(calls).toBe(3);
  });

  it("does not retry other errors", async () => {
    const clock = fakeClock();
    let calls = 0;
    const send = createResendSender({
      apiKey: "k",
      now: clock.now,
      sleep: clock.sleep,
      fetchImpl: async () => {
        calls++;
        return response(422, { message: "Invalid to" });
      },
    });
    await expect(send({ to: "bad" })).rejects.toThrow(/Resend 422/);
    expect(calls).toBe(1);
  });

  it("sends the key and the JSON body to Resend", async () => {
    let seen;
    const send = createResendSender({
      apiKey: "secret",
      sleep: async () => {},
      fetchImpl: async (url, init) => {
        seen = { url, init };
        return response(200, {});
      },
    });
    await send({ to: "a@x.com", subject: "s" });
    expect(seen.url).toBe("https://api.resend.com/emails");
    expect(seen.init.headers.Authorization).toBe("Bearer secret");
    expect(JSON.parse(seen.init.body)).toEqual({ to: "a@x.com", subject: "s" });
  });
});

describe("retryDelayMs", () => {
  it("uses retry-after seconds, capped at 30s", () => {
    expect(retryDelayMs("1", 1)).toBe(1000);
    expect(retryDelayMs("120", 1)).toBe(30_000);
  });
  it("backs off 1s, 2s, 4s without a header, capped at 10s", () => {
    expect(retryDelayMs(null, 1)).toBe(1000);
    expect(retryDelayMs(null, 2)).toBe(2000);
    expect(retryDelayMs(null, 3)).toBe(4000);
    expect(retryDelayMs("junk", 9)).toBe(10_000);
  });
});

describe("maskEmail", () => {
  it("keeps the first letter and the domain only", () => {
    expect(maskEmail("rashi@axiomsync.com")).toBe("r***@axiomsync.com");
    expect(maskEmail("not-an-address")).toBe("***");
  });
});

describe("parseAddressList", () => {
  it("splits on commas, spaces and new lines, lowercases and dedupes", () => {
    expect(parseAddressList("A@x.com, b@y.com\nc@z.com;a@X.com  junk")).toEqual([
      "a@x.com",
      "b@y.com",
      "c@z.com",
    ]);
    expect(parseAddressList(undefined)).toEqual([]);
  });
});

describe("lastEditionWindow", () => {
  const rows = [
    { send_date: "2026-10-15", sent_at: "2026-10-15T10:40:00Z", recipient_count: 0 },
    { send_date: "2026-10-15", sent_at: "2026-10-15T01:05:59Z", recipient_count: 30 },
    { send_date: "2026-10-14", sent_at: "2026-10-14T11:02:00Z", recipient_count: 0 },
    { send_date: "2026-10-14", sent_at: "2026-10-14T01:10:00Z", recipient_count: 44 },
  ];
  it("skips empty runs and spans from the send before the edition to the edition", () => {
    expect(lastEditionWindow(rows)).toEqual({
      since: "2026-10-14T11:02:00Z",
      until: "2026-10-15T01:05:59Z",
      sendDate: "2026-10-15",
    });
  });
  it("falls back to 24h before the edition when it is the first send", () => {
    expect(lastEditionWindow([rows[3]])).toEqual({
      since: "2026-10-13T01:10:00.000Z",
      until: "2026-10-14T01:10:00Z",
      sendDate: "2026-10-14",
    });
  });
  it("returns null when no edition has gone out", () => {
    expect(lastEditionWindow([rows[0]])).toBeNull();
    expect(lastEditionWindow([])).toBeNull();
  });
});
