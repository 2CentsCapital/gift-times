import { NextResponse } from "next/server";
import { consumeAuthCode, pkceVerify, signAccessToken, createRefresh, lookupRefresh, SCOPE } from "@/lib/connector/core";

export const runtime = "nodejs";

function err(code: string, desc = "") {
  return NextResponse.json({ error: code, error_description: desc }, { status: 400 });
}

export async function POST(req: Request) {
  let p: Record<string, string> = {};
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    p = await req.json().catch(() => ({}));
  } else {
    const form = await req.formData().catch(() => null);
    if (form) p = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  }

  if (p.grant_type === "authorization_code") {
    const rec = await consumeAuthCode(p.code || "");
    if (!rec) return err("invalid_grant", "Authorization code invalid or expired.");
    if (p.redirect_uri && rec.redirect_uri && p.redirect_uri !== rec.redirect_uri) {
      return err("invalid_grant", "redirect_uri mismatch.");
    }
    if (!p.code_verifier || !pkceVerify(p.code_verifier, rec.code_challenge)) {
      return err("invalid_grant", "PKCE verification failed.");
    }
    const access_token = signAccessToken(rec.account_id);
    const refresh_token = await createRefresh(rec.account_id, rec.client_id);
    return NextResponse.json({
      access_token,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token,
      scope: rec.scope || SCOPE,
    });
  }

  if (p.grant_type === "refresh_token") {
    const rec = await lookupRefresh(p.refresh_token || "");
    if (!rec) return err("invalid_grant", "Refresh token invalid.");
    return NextResponse.json({
      access_token: signAccessToken(rec.account_id),
      token_type: "Bearer",
      expires_in: 3600,
      scope: SCOPE,
    });
  }

  return err("unsupported_grant_type", `Unsupported grant_type: ${p.grant_type || "(none)"}`);
}
