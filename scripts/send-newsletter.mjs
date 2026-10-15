// Sends an edition (morning / evening) via Resend.
//
// Sends every change LOGGED SINCE THE LAST SEND (a watermark), so multiple
// editions per day never duplicate items and never miss any.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
//      FROM_EMAIL (e.g. "GIFT City Times <onboarding@resend.dev>"),
//      OWNER_EMAIL, SITE_URL, UNSUB_SECRET, [SEND_EMPTY=false], [DRY_RUN=false],
//      [RESEND_TO] (for --resend-last)
// Run: node scripts/send-newsletter.mjs [--force] [--resend-last] [--dry-run]
//   --force ignores the watermark and sends everything from the last 24h.
//   --resend-last sends the last edition again, only to the addresses in
//     RESEND_TO (comma or newline separated) that are still subscribed or are
//     owners. The watermark is left alone. For subscribers a send missed.
//   --dry-run (or DRY_RUN=true) shows what would go out; sends and writes nothing.
//
// The Actions logs of this repo are public: addresses are masked in output,
// and the full list of anyone a send missed is mailed to the owners instead.

import crypto from "crypto";
import { supa } from "./lib/supabase.mjs";
import { buildNewsletter, lastEditionWindow } from "./lib/newsletter.mjs";
import { createResendSender, maskEmail, maskEmailsIn, parseAddressList } from "./lib/mailer.mjs";

const FORCE = process.argv.includes("--force");
const RESEND_LAST = process.argv.includes("--resend-last");
const DRY_RUN =
  process.argv.includes("--dry-run") || (process.env.DRY_RUN || "false").toLowerCase() === "true";
const SITE_URL = (process.env.SITE_URL || "https://giftcitytimes.com").replace(/\/$/, "");
const FROM = process.env.FROM_EMAIL || "GIFT City Times <onboarding@resend.dev>";
const SEND_EMPTY = (process.env.SEND_EMPTY || "false").toLowerCase() === "true";
// OWNER_EMAIL may list several addresses, comma separated; each gets its own copy.
const OWNERS = (process.env.OWNER_EMAIL || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const UNSUB_SECRET = process.env.UNSUB_SECRET || "";

// Paced under Resend's 10 requests a second, retries a 429.
const resendSend = createResendSender({ apiKey: process.env.RESEND_API_KEY });

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
  const { data, error } = await supa
    .from("subscribers")
    .select("email")
    .eq("confirmed", true)
    .is("unsubscribed_at", null);
  // A failed lookup must stop the run: carrying on with owners only would move
  // the watermark and every subscriber would lose this edition.
  if (error) throw error;
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
  return resendSend(body);
}

// Build per recipient so each carries its own unsubscribe link. The owner
// (added via OWNER_EMAIL, not a subscriber) gets no unsubscribe link.
async function sendEdition(to, changes, editionDate) {
  const { subject } = buildNewsletter(changes, SITE_URL, editionDate, null);
  const missed = [];
  let sent = 0;
  for (const addr of to) {
    try {
      const isOwner = OWNERS.includes(addr.trim().toLowerCase());
      const unsub = isOwner ? null : unsubUrl(addr);
      const { html } = buildNewsletter(changes, SITE_URL, editionDate, unsub);
      await sendEmail(addr, subject, html, unsub);
      sent++;
    } catch (e) {
      missed.push(addr);
      console.error(`  ! send failed to ${maskEmail(addr)}: ${maskEmailsIn(e.message)}`);
    }
  }
  console.log(`Sent "${subject}" (${changes.length} items) to ${sent}/${to.length} recipient(s).`);
  return { subject, sent, missed };
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Mails the owners who an edition missed, in full and ready to resend, since
// the run log only shows masked addresses. Fails the run either way.
async function reportMissed(subject, missed) {
  process.exitCode = 1;
  if (!OWNERS.length) {
    console.error(`${missed.length} missed; set OWNER_EMAIL to get their addresses by mail.`);
    return;
  }
  const html = `<p>${missed.length} recipient(s) did not get "${escapeHtml(subject)}", even after retries.</p>
<p>To send it to just them: put the list below in the repo secret NEWSLETTER_RESEND_TO, then run the
daily workflow by hand with resend_last ticked (leave dry_run ticked first to check).</p>
<pre>${missed.map(escapeHtml).join("\n")}</pre>`;
  try {
    await resendSend({
      from: FROM,
      to: OWNERS[0],
      cc: OWNERS.slice(1),
      subject: `Missed: ${subject}`,
      html,
    });
    console.log(`The ${missed.length} missed address(es) were mailed to the owner(s).`);
  } catch (e) {
    console.error(`  ! could not mail the missed list: ${maskEmailsIn(e.message)}`);
  }
}

// --resend-last: the last edition again, to RESEND_TO only.
async function resendLast() {
  const wanted = parseAddressList(process.env.RESEND_TO);
  if (!wanted.length) throw new Error("--resend-last needs RESEND_TO (the addresses to send to)");

  // The last edition that went out, however many empty runs came after it,
  // and the send just before it (the watermark it used).
  const { data: edition, error: editionError } = await supa
    .from("newsletter_sends")
    .select("send_date, sent_at, recipient_count")
    .gt("recipient_count", 0)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (editionError) throw editionError;
  if (!edition) throw new Error("No edition has gone out yet; nothing to resend.");
  const { data: prev, error: prevError } = await supa
    .from("newsletter_sends")
    .select("send_date, sent_at, recipient_count")
    .lt("sent_at", edition.sent_at)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (prevError) throw prevError;
  const win = lastEditionWindow(prev ? [edition, prev] : [edition]);

  const { data: changes, error } = await supa
    .from("changes")
    .select("*")
    .gt("created_at", win.since)
    .lte("created_at", win.until)
    .order("desk", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;

  // Only people still subscribed (or owners): someone who unsubscribed since,
  // or a typo in RESEND_TO, gets nothing.
  const current = new Map((await recipients()).map((e) => [e.trim().toLowerCase(), e]));
  const to = wanted.filter((e) => current.has(e)).map((e) => current.get(e));
  const skipped = wanted.length - to.length;
  console.log(
    `Last edition ${win.sendDate}: ${changes.length} item(s) logged in (${win.since}, ${win.until}]. ` +
      `Sending to ${to.length} of ${wanted.length} listed` +
      (skipped ? ` (${skipped} not subscribed now, skipped).` : "."),
  );
  if (!changes.length || !to.length) return;
  if (DRY_RUN) {
    console.log(`Dry run, nothing sent. Would send to: ${to.map(maskEmail).join(", ")}`);
    return;
  }
  const { subject, missed } = await sendEdition(to, changes, win.sendDate);
  if (missed.length) await reportMissed(subject, missed);
}

async function main() {
  if (!process.env.RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");
  // Without it unsubUrl() returns null and subscribers get no unsubscribe link.
  if (!UNSUB_SECRET) throw new Error("Missing UNSUB_SECRET");
  if (RESEND_LAST) return resendLast();

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
    if (DRY_RUN) return;
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
  if (DRY_RUN) {
    console.log(`Dry run, nothing sent: ${changes.length} item(s) to ${to.length} recipient(s).`);
    return;
  }

  const { subject, sent, missed } = await sendEdition(to, changes, today);

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

  // Some missed: most got it, so the watermark moved on; the rest can be sent
  // the same edition with --resend-last.
  if (missed.length) await reportMissed(subject, missed);
}

main().catch((e) => {
  console.error("NEWSLETTER ERROR:", e);
  process.exit(1);
});
