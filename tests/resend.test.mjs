import { describe, it, expect } from "vitest";
import { postEmail, maskEmail, maskEmailsIn } from "../scripts/lib/resend.mjs";
import { lastEditionWindow } from "../scripts/lib/newsletter.mjs";

const reply = (status, body = {}, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
});

describe("postEmail", () => {
  it("retries 429s, honouring Retry-After, then succeeds", async () => {
    const replies = [reply(429, {}, { "retry-after": "2" }), reply(429), reply(200, { id: "e1" })];
    const waits = [];
    const out = await postEmail({}, {
      apiKey: "k",
      fetchFn: async () => replies.shift(),
      wait: async (ms) => waits.push(ms),
    });
    expect(out).toEqual({ id: "e1" });
    expect(waits).toEqual([2000, 1000]);
  });

  it("does not retry a 4xx other than 429", async () => {
    let calls = 0;
    await expect(
      postEmail({}, { apiKey: "k", fetchFn: async () => (calls++, reply(422, { message: "bad" })), wait: async () => {} })
    ).rejects.toThrow("Resend 422");
    expect(calls).toBe(1);
  });

  it("gives up after 5 attempts", async () => {
    let calls = 0;
    await expect(
      postEmail({}, { apiKey: "k", fetchFn: async () => (calls++, reply(429)), wait: async () => {} })
    ).rejects.toThrow("Resend 429");
    expect(calls).toBe(5);
  });
});

describe("maskEmail", () => {
  it("hides the local part", () => {
    expect(maskEmail("rashi@axiomsync.com")).toBe("r***@axiomsync.com");
    expect(maskEmail("nonsense")).toBe("***");
  });
});

describe("maskEmailsIn", () => {
  it("masks every address inside an error body", () => {
    const body = 'Resend 422: {"message":"Invalid `to` field: bad.person@x.co.in, Ok <c@y.com>"}';
    const out = maskEmailsIn(body);
    expect(out).not.toContain("bad.person@");
    expect(out).toContain("b***@x.co.in");
    expect(out).toContain("<c***@y.com>");
    expect(maskEmailsIn("Too many requests")).toBe("Too many requests");
  });
});

describe("lastEditionWindow", () => {
  const edition = { send_date: "2026-10-15", sent_at: "2026-10-15T01:05:59Z", recipient_count: 30 };
  const before = { send_date: "2026-10-14", sent_at: "2026-10-14T11:02:00Z", recipient_count: 0 };
  it("spans from the send before the edition to the edition", () => {
    expect(lastEditionWindow([edition, before])).toEqual({
      since: "2026-10-14T11:02:00Z",
      until: "2026-10-15T01:05:59Z",
      sendDate: "2026-10-15",
    });
  });
  it("skips 0-recipient runs newer than the edition", () => {
    const empty = { send_date: "2026-10-16", sent_at: "2026-10-16T01:00:00Z", recipient_count: 0 };
    expect(lastEditionWindow([empty, edition, before]).until).toBe("2026-10-15T01:05:59Z");
  });
  it("falls back to 24h before the edition when it is the first send", () => {
    expect(lastEditionWindow([edition]).since).toBe("2026-10-14T01:05:59.000Z");
  });
  it("returns null when no edition has gone out", () => {
    expect(lastEditionWindow([before])).toBeNull();
    expect(lastEditionWindow([])).toBeNull();
  });
});
