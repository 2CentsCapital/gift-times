// Sends an edition (morning / evening) via Resend.
//
// Sends every change LOGGED SINCE THE LAST SEND (a watermark), so multiple
// editions per day never duplicate items and never miss any.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
//      FROM_EMAIL (e.g. "GIFT City Times <onboarding@resend.dev>"),
//      OWNER_EMAIL, SITE_URL, UNSUB_SECRET, [SEND_EMPTY=false]
// Run: node scripts/send-newsletter.mjs [--force | --resend]
//   --force ignores the watermark and sends everything from the last 24h.
//   --resend re-sends the LATEST edition (same items) to the addresses in
//     RESEND_TO or the workflow_dispatch input `resend_to` (comma separated),
//     e.g. people a failed send missed. Only current subscribers/owners are
//     mailed, and the watermark is not touched.

import crypto from "crypto";
import { supa } from "./lib/supabase.mjs";
import { readFileSync } from "fs";
import { buildNewsletter } from "./lib/newsletter.mjs";
import { postEmail, maskEmail, sleep, SEND_GAP_MS } from "./lib/resend.mjs";

const FORCE = process.argv.includes("--force");
const RESEND = process.argv.includes("--resend");
const SITE_URL = (process.env.SITE_URL || "https://giftcitytimes.com").replace(/\/$/, "");
const FROM = process.env.FROM_EMAIL || "GIFT City Times <onboarding@resend.dev>";
const SEND_EMPTY = (process.env.SEND_EMPTY || "false").toLowerCase() === "true";
// OWNER_EMAIL may list several addresses, comma separated; each gets its own copy.
const OWNERS = (process.env.OWNER_EMAIL || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
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
  for (const o of OWNERS) set.add(o);
  const { data } = await supa
    .from("subscribers")
    .select("email")
    .eq("confirmed", true)
    .is("unsubscribed_at", null);
  // An owner who also subscribed gets one copy, the owner one.
  for (const r of data || []) if (!OWNERS.includes(r.email.trim().toLowerCase())) set.add(r.email);
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
  return postEmail(body, { apiKey: process.env.RESEND_API_KEY });
}

// Build per recipient so each carries its own unsubscribe link. The owner
// (added via OWNER_EMAIL, not a subscriber) gets no unsubscribe link.
async function sendEdition(changes, to, date) {
  const { subject } = buildNewsletter(changes, SITE_URL, date, null);
  let sent = 0;
  for (const [i, addr] of to.entries()) {
    if (i > 0) await sleep(SEND_GAP_MS);
    try {
      const isOwner = OWNERS.includes(addr.trim().toLowerCase());
      const unsub = isOwner ? null : unsubUrl(addr);
      const { html } = buildNewsletter(changes, SITE_URL, date, unsub);
      await sendEmail(addr, subject, html, unsub);
      sent++;
    } catch (e) {
      console.error(`  ! send failed to ${maskEmail(addr)}: ${e.message}`);
    }
  }
  console.log(`Sent "${subject}" (${changes.length} items) to ${sent}/${to.length} recipient(s).`);
  return sent;
}

function resendTargets() {
  let raw = process.env.RESEND_TO || "";
  // Read the dispatch input from the event payload rather than an env var, so
  // the addresses are never echoed into the public Actions log.
  if (!raw && process.env.GITHUB_EVENT_PATH) {
    const ev = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    raw = ev.inputs?.resend_to || "";
  }
  return [...new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))];
}

// Re-send the most recent edition to specific addresses. The edition is the
// changes between the previous send and the latest one: exactly what went out.
async function resendLatest() {
  const { data: sends, error: e1 } = await supa
    .from("newsletter_sends")
    .select("send_date, sent_at, change_count")
    .order("sent_at", { ascending: false })
    .limit(2);
  if (e1) throw e1;
  const [latest, prev] = sends || [];
  if (!latest || !prev) throw new Error("No previous edition to re-send.");

  const { data: changes, error: e2 } = await supa
    .from("changes")
    .select("*")
    .gt("created_at", prev.sent_at)
    .lte("created_at", latest.sent_at)
    .order("desk", { ascending: true })
    .order("created_at", { ascending: false });
  if (e2) throw e2;
  if (changes.length !== latest.change_count) {
    throw new Error(`Edition mismatch: found ${changes.length} items, ${latest.change_count} were sent. Aborting.`);
  }

  const allowed = new Set((await recipients()).map((r) => r.trim().toLowerCase()));
  const targets = resendTargets();
  const to = targets.filter((a) => allowed.has(a));
  const skipped = targets.length - to.length;
  if (skipped) console.log(`Skipping ${skipped} address(es) that are not current subscribers.`);
  if (!to.length) throw new Error("No valid re-send recipients.");

  console.log(`Re-sending the ${latest.send_date} edition (${changes.length} items) to ${to.length} recipient(s).`);
  const sent = await sendEdition(changes, to, latest.send_date);
  if (sent < to.length) process.exit(1);
}

async function main() {
  if (!process.env.RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");
  // Without it unsubUrl() returns null and subscribers get no unsubscribe link.
  if (!UNSUB_SECRET) throw new Error("Missing UNSUB_SECRET");
  if (RESEND) return resendLatest();
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

  const sent = await sendEdition(changes, to, today);

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
