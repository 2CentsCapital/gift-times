import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { makeToken } from "@/lib/token";

export const runtime = "nodejs";

const SITE_URL = (process.env.SITE_URL || "https://giftcitytimes.com").replace(/\/$/, "");
const FROM = process.env.FROM_EMAIL || "GIFT City Times <updates@giftcitytimes.com>";
const RATE_MAX = 5; // attempts
const RATE_WINDOW_MS = 10 * 60 * 1000;

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
}

async function sendConfirmation(email: string) {
  const url = `${SITE_URL}/api/confirm?e=${encodeURIComponent(email)}&t=${makeToken("confirm", email)}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f1ea;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px;"><tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fbf9f3;border:1px solid #e0d9c8;">
        <tr><td style="padding:26px 30px;text-align:center;border-bottom:3px double #1a1a1a;">
          <div style="font:700 26px Georgia,serif;color:#1a1a1a;">GIFT City Times</div></td></tr>
        <tr><td style="padding:26px 30px;text-align:center;font-family:Georgia,serif;color:#1a1712;">
          <p style="font-size:16px;line-height:1.5;">Confirm your subscription to get new licences, circulars, tenders and UAC approvals from GIFT IFSC, twice a day.</p>
          <a href="${url}" style="display:inline-block;margin-top:14px;background:#3f1212;color:#f3e9e0;font:700 14px Arial;letter-spacing:1px;text-decoration:none;padding:13px 30px;">CONFIRM SUBSCRIPTION</a>
          <p style="font:400 12px Arial;color:#a89e88;margin-top:22px;">If you didn’t request this, just ignore this email — you won’t be subscribed.</p>
        </td></tr>
      </table></td></tr></table></body></html>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: email, subject: "Confirm your GIFT City Times subscription", html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    const clean = String(email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean) || clean.length > 200) {
      return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
    }

    const supa = getSupabase();

    // Rate limit per IP.
    const ip = clientIp(req);
    const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const { count } = await supa
      .from("signup_attempts")
      .select("*", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", since);
    if ((count || 0) >= RATE_MAX) {
      return NextResponse.json({ error: "Too many attempts. Please try again in a bit." }, { status: 429 });
    }
    await supa.from("signup_attempts").insert({ ip });

    // Already an active confirmed subscriber → succeed quietly, don't re-email.
    const { data: existing } = await supa
      .from("subscribers")
      .select("confirmed, unsubscribed_at")
      .eq("email", clean)
      .maybeSingle();
    if (existing?.confirmed && !existing.unsubscribed_at) {
      return NextResponse.json({ ok: true });
    }

    // Double opt-in: store as unconfirmed and email a confirmation link.
    await supa
      .from("subscribers")
      .upsert({ email: clean, confirmed: false, unsubscribed_at: null }, { onConflict: "email" });
    await sendConfirmation(clean);

    return NextResponse.json({ ok: true, pending: true });
  } catch (e: any) {
    console.error("subscribe error:", e?.message);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
