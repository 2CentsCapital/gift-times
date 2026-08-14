import crypto from "crypto";

// Signed tokens for email actions (confirm / unsubscribe). Deterministic per
// (action,email) so links stay valid, but unforgeable without UNSUB_SECRET.
const SECRET = process.env.UNSUB_SECRET || "";

export function makeToken(action: "confirm" | "unsub", email: string): string {
  return crypto
    .createHmac("sha256", SECRET)
    .update(`${action}:${email.trim().toLowerCase()}`)
    .digest("base64url")
    .slice(0, 24);
}

export function verifyToken(action: "confirm" | "unsub", email: string, token: string): boolean {
  if (!SECRET || !token) return false;
  const expected = Buffer.from(makeToken(action, email));
  const got = Buffer.from(token);
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}
