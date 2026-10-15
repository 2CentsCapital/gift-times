import { describe, it, expect } from "vitest";
import { postEmail, maskEmail } from "../scripts/lib/resend.mjs";

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
