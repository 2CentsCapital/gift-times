import crypto from "crypto";
import { getSupabaseFresh } from "@/lib/supabase";

// ---- config ---------------------------------------------------------------
export const ISSUER = "https://giftcitytimes.com";
export const MCP_RESOURCE = `${ISSUER}/api/mcp`;
export const SCOPE = "giftcity";
const SECRET = process.env.CONNECTOR_JWT_SECRET || "";

export const db = () => getSupabaseFresh();
const rand = (n = 24) => crypto.randomBytes(n).toString("base64url");

// ---- access-token JWT (HS256, stateless) ----------------------------------
export function signAccessToken(accountId: string, ttlSec = 3600): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ sub: accountId, iss: ISSUER, aud: MCP_RESOURCE, iat: now, exp: now + ttlSec })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

export function verifyAccessToken(token: string | null): string | null {
  if (!SECRET || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  const a = Buffer.from(s);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.sub as string;
  } catch {
    return null;
  }
}

export function pkceVerify(verifier: string, challenge: string): boolean {
  const h = crypto.createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(h);
  const b = Buffer.from(challenge || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- accounts -------------------------------------------------------------
export async function getOrCreateAccount(email: string) {
  const supa = db();
  const e = email.trim().toLowerCase();
  const { data: existing } = await supa.from("connector_accounts").select("*").eq("email", e).maybeSingle();
  if (existing) return existing;
  const { data } = await supa.from("connector_accounts").insert({ email: e }).select("*").single();
  return data;
}
export async function getAccount(id: string) {
  const { data } = await db().from("connector_accounts").select("*").eq("id", id).maybeSingle();
  return data;
}

// ---- OAuth client registration (DCR) --------------------------------------
export async function registerClient(redirectUris: string[], name?: string) {
  const client_id = `gct_${rand(12)}`;
  const client_secret = rand(24);
  await db().from("oauth_clients").insert({
    client_id,
    client_secret,
    redirect_uris: redirectUris,
    client_name: name || "MCP Client",
  });
  return { client_id, client_secret, redirect_uris: redirectUris };
}
export async function getClient(clientId: string) {
  const { data } = await db().from("oauth_clients").select("*").eq("client_id", clientId).maybeSingle();
  return data;
}

// ---- magic-link login (carries the OAuth request through email verify) -----
export async function createLogin(fields: {
  email: string; client_id: string; redirect_uri: string; code_challenge: string; state: string; scope: string;
}) {
  const token = rand(24);
  await db().from("connector_login").insert({
    token, ...fields, expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
  return token;
}
export async function consumeLogin(token: string) {
  const supa = db();
  const { data } = await supa.from("connector_login").select("*").eq("token", token).maybeSingle();
  if (data) await supa.from("connector_login").delete().eq("token", token);
  if (!data || new Date(data.expires_at) < new Date()) return null;
  return data;
}

// ---- authorization codes --------------------------------------------------
export async function createAuthCode(fields: {
  client_id: string; account_id: string; redirect_uri: string; code_challenge: string; scope: string;
}) {
  const code = rand(24);
  await db().from("oauth_codes").insert({
    code, ...fields, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  return code;
}
export async function consumeAuthCode(code: string) {
  const supa = db();
  const { data } = await supa.from("oauth_codes").select("*").eq("code", code).maybeSingle();
  if (data) await supa.from("oauth_codes").delete().eq("code", code);
  if (!data || new Date(data.expires_at) < new Date()) return null;
  return data;
}

// ---- refresh tokens -------------------------------------------------------
export async function createRefresh(accountId: string, clientId: string) {
  const token = rand(32);
  await db().from("oauth_refresh").insert({ token, account_id: accountId, client_id: clientId });
  return token;
}
export async function lookupRefresh(token: string) {
  const { data } = await db().from("oauth_refresh").select("*").eq("token", token).maybeSingle();
  return data;
}
