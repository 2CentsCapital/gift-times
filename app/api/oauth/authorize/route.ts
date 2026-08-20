import { NextResponse } from "next/server";
import { getClient, createLogin, ISSUER, SCOPE } from "@/lib/connector/core";

export const runtime = "nodejs";

const FROM = process.env.FROM_EMAIL || "GIFT City Times <updates@giftcitytimes.com>";

function esc(s: any) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function page(title: string, inner: string, status = 200) {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
  <div style="font-family:Georgia,serif;max-width:460px;margin:10vh auto;padding:0 24px;color:#1a1712;">
    <div style="font:700 12px/1 Arial;letter-spacing:2px;text-transform:uppercase;color:#7a1f1f;text-align:center;">GIFT City Times</div>
    <h1 style="font-size:26px;text-align:center;margin:12px 0 16px;">${esc(title)}</h1>
    ${inner}
  </div>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function validate(p: Record<string, string>): Promise<string | null> {
  if (p.response_type !== "code") return "Unsupported response type.";
  if (!p.code_challenge || p.code_challenge_method !== "S256") return "This client must use PKCE (S256).";
  const client = await getClient(p.client_id);
  if (!client) return "Unknown client. Please reconnect from Claude.";
  const uris: string[] = client.redirect_uris || [];
  if (uris.length && !uris.includes(p.redirect_uri)) return "This redirect URL is not registered.";
  return null;
}

async function sendMagicLink(email: string, url: string) {
  const html = `<!doctype html><body style="margin:0;background:#f4f1ea;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px;"><tr><td align="center">
    <table width="460" cellpadding="0" cellspacing="0" style="max-width:460px;background:#fbf9f3;border:1px solid #e0d9c8;">
      <tr><td style="padding:26px 30px;text-align:center;border-bottom:3px double #1a1a1a;"><div style="font:700 26px Georgia,serif;">GIFT City Times</div></td></tr>
      <tr><td style="padding:26px 30px;text-align:center;font-family:Georgia,serif;color:#1a1712;">
        <p style="font-size:16px;line-height:1.5;">Confirm connecting GIFT City Times to your Claude account.</p>
        <a href="${url}" style="display:inline-block;margin-top:14px;background:#3f1212;color:#f3e9e0;font:700 14px Arial;letter-spacing:1px;text-decoration:none;padding:13px 30px;">CONNECT TO CLAUDE</a>
        <p style="font:400 12px Arial;color:#a89e88;margin-top:22px;">If you didn't start this from Claude, ignore this email.</p>
      </td></tr>
    </table></td></tr></table></body>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: email, subject: "Connect GIFT City Times to Claude", html }),
  });
}

export async function GET(req: Request) {
  const p = Object.fromEntries(new URL(req.url).searchParams) as Record<string, string>;
  const err = await validate(p);
  if (err) return page("Can’t connect", `<p style="text-align:center;color:#4a453c;">${esc(err)}</p>`, 400);
  const hidden = ["client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "scope", "response_type"]
    .map((k) => `<input type="hidden" name="${k}" value="${esc(p[k] || "")}">`)
    .join("");
  return page(
    "Connect to Claude",
    `<p style="color:#4a453c;line-height:1.5;">Enter your email (the one you use for the newsletter) and we’ll send a one-tap link to finish connecting.</p>
     <form method="POST" action="/api/oauth/authorize">${hidden}
       <input type="email" name="email" required placeholder="you@example.com" style="width:100%;box-sizing:border-box;font:16px Georgia,serif;padding:12px 14px;border:1px solid #1a1712;margin-top:10px;">
       <button type="submit" style="width:100%;margin-top:10px;background:#3f1212;color:#f3e9e0;font:700 13px Arial;letter-spacing:1px;border:none;padding:13px;cursor:pointer;">SEND CONFIRMATION LINK</button>
     </form>
     <p style="font:12px Arial;color:#a89e88;margin-top:16px;line-height:1.5;">You’ll be able to ask Claude for your daily GIFT IFSC brief, verify entities, and build a streak.</p>`
  );
}

export async function POST(req: Request) {
  const form = await req.formData();
  const p = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)])) as Record<string, string>;
  const email = (p.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return page("Invalid email", `<p style="text-align:center;">Please go back and enter a valid email.</p>`, 400);
  }
  const err = await validate(p);
  if (err) return page("Can’t connect", `<p style="text-align:center;color:#4a453c;">${esc(err)}</p>`, 400);
  const token = await createLogin({
    email,
    client_id: p.client_id,
    redirect_uri: p.redirect_uri,
    code_challenge: p.code_challenge,
    state: p.state || "",
    scope: p.scope || SCOPE,
  });
  await sendMagicLink(email, `${ISSUER}/api/oauth/verify?token=${token}`);
  return page("Check your email", `<p style="text-align:center;color:#4a453c;line-height:1.5;">We’ve emailed <b>${esc(email)}</b> a link to finish connecting. Open it on this device.</p>`);
}
