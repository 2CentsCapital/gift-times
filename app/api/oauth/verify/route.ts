import { NextResponse } from "next/server";
import { consumeLogin, getOrCreateAccount, createAuthCode } from "@/lib/connector/core";

export const runtime = "nodejs";

function errPage(msg: string) {
  const html = `<!doctype html><meta charset="utf-8"><title>Link error</title>
  <div style="font-family:Georgia,serif;max-width:440px;margin:12vh auto;padding:0 24px;text-align:center;color:#1a1712;">
    <div style="font:700 12px/1 Arial;letter-spacing:2px;text-transform:uppercase;color:#7a1f1f;">GIFT City Times</div>
    <h1 style="font-size:24px;margin:12px 0 10px;">Link problem</h1>
    <p style="color:#4a453c;">${msg}</p></div>`;
  return new NextResponse(html, { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  const login = await consumeLogin(token);
  if (!login) return errPage("This link is invalid or has expired. Please reconnect from Claude.");

  const account = await getOrCreateAccount(login.email);
  const code = await createAuthCode({
    client_id: login.client_id,
    account_id: account.id,
    redirect_uri: login.redirect_uri,
    code_challenge: login.code_challenge,
    scope: login.scope,
  });

  const url = new URL(login.redirect_uri);
  url.searchParams.set("code", code);
  if (login.state) url.searchParams.set("state", login.state);
  return NextResponse.redirect(url.toString(), 302);
}
