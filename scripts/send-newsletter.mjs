// Sends an edition (morning / evening) via Resend.
//
// Sends every change LOGGED SINCE THE LAST SEND (a watermark), so multiple
// editions per day never duplicate items and never miss any.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
//      FROM_EMAIL (e.g. "GIFT City Times <onboarding@resend.dev>"),
//      OWNER_EMAIL, SITE_URL, [SEND_EMPTY=false]
// Run: node scripts/send-newsletter.mjs [--force]
//   --force ignores the watermark and sends everything from the last 24h.

import crypto from "crypto";
import { supa } from "./lib/supabase.mjs";
import { buildNewsletter } from "./lib/newsletter.mjs";

const FORCE = process.argv.includes("--force");
const SITE_URL = (process.env.SITE_URL || "https://giftcitytimes.com").replace(/\/$/, "");
const FROM = process.env.FROM_EMAIL || "GIFT City Times <onboarding@resend.dev>";
const SEND_EMPTY = (process.env.SEND_EMPTY || "false").toLowerCase() === "true";
const OWNER = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
const UNSUB_SECRET = process.env.UNSUB_SECRET || "";

// Same scheme as lib/token.ts (must match so links verify).
function unsubUrl(email) {
  if (!UNSUB_SECRET) return null;
  const t = crypto
    .createHmac("sha256", UNSUB_SECRET)
    .update(`unsub:${email.trim().toLowerCase()}`)
    .digest("base64url")
    .slice(0, 24);
  return `${SITE_URL}/api/unsubscribe?e=${encodeURIComponent(email)}&t=${t}`;
}

// Timestamp of the previous send = our watermark. Changes created after this
// are what's "new" for this edition.
async function lastSendAt() {
  const { data } = await supa
    .from("newsletter_sends")
    .select("sent_at")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.sent_at || null;
}

async function recipients() {
  const set = new Set();
  if (process.env.OWNER_EMAIL) set.add(process.env.OWNER_EMAIL.trim());
  const { data } = await supa
    .from("subscribers")
    .select("email")
    .eq("confirmed", true)
    .is("unsubscribed_at", null);
  for (const r of data || []) set.add(r.email);
  return [...set];
}

async function sendEmail(to, subject, html, listUnsub) {
  const body = { from: FROM, to, subject, html };
  if (listUnsub) {
    // RFC 8058 one-click unsubscribe — improves Gmail/Apple deliverability.
    body.headers = {
      "List-Unsubscribe": `<${listUnsub}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  if (!process.env.RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");
  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  // Watermark: everything logged since the previous send. --force falls back
  // to a 24h window regardless of the watermark (for manual re-sends).
  const watermark = await lastSendAt();
  const since = FORCE
    ? new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    : watermark || new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const { data: changes, error } = await supa
    .from("changes")
    .select("*")
    .gt("created_at", since)
    .order("desk", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;

  if (!changes.length && !SEND_EMPTY) {
    console.log(`No new changes since ${since} — skipping send.`);
    // Advance the watermark so the next edition starts from now.
    await supa.from("newsletter_sends").insert({
      send_date: today,
      sent_at: nowIso,
      recipient_count: 0,
      change_count: 0,
    });
    return;
  }

  const to = await recipients();
  if (!to.length) {
    console.log("No recipients configured (set OWNER_EMAIL or add confirmed subscribers).");
    return;
  }

  // Build per recipient so each carries its own unsubscribe link. The owner
  // (added via OWNER_EMAIL, not a subscriber) gets no unsubscribe link.
  const { subject } = buildNewsletter(changes, SITE_URL, today, null);
  let sent = 0;
  for (const addr of to) {
    try {
      const isOwner = addr.trim().toLowerCase() === OWNER;
      const unsub = isOwner ? null : unsubUrl(addr);
      const { html } = buildNewsletter(changes, SITE_URL, today, unsub);
      await sendEmail(addr, subject, html, unsub);
      sent++;
    } catch (e) {
      console.error(`  ! send failed to ${addr}: ${e.message}`);
    }
  }
  console.log(`Sent "${subject}" (${changes.length} items) to ${sent}/${to.length} recipient(s).`);

  // M-2: if every send failed (e.g. Resend outage), do NOT advance the
  // watermark — otherwise these items are lost from all future editions.
  // Leave it for the next run to retry, and fail loudly.
  if (sent === 0) {
    console.error("All sends failed — watermark NOT advanced; items will retry next run.");
    process.exit(1);
  }

  await supa.from("newsletter_sends").insert({
    send_date: today,
    sent_at: nowIso,
    recipient_count: sent,
    change_count: changes.length,
  });
}

main().catch((e) => {
  console.error("NEWSLETTER ERROR:", e);
  process.exit(1);
});
