// Sends the 6am daily digest via Resend.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
//      FROM_EMAIL (e.g. "The GIFT Times <onboarding@resend.dev>"),
//      OWNER_EMAIL, SITE_URL, [SEND_EMPTY=false]
// Run: node scripts/send-newsletter.mjs [--force]

import { supa } from "./lib/supabase.mjs";
import { buildNewsletter } from "./lib/newsletter.mjs";

const FORCE = process.argv.includes("--force");
const SITE_URL = (process.env.SITE_URL || "https://gift-times.vercel.app").replace(/\/$/, "");
const FROM = process.env.FROM_EMAIL || "The GIFT Times <onboarding@resend.dev>";
const SEND_EMPTY = (process.env.SEND_EMPTY || "false").toLowerCase() === "true";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
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

async function sendEmail(to, subject, html) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  if (!process.env.RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");
  const today = todayIso();

  if (!FORCE) {
    const { data: prior } = await supa
      .from("newsletter_sends")
      .select("id")
      .eq("send_date", today)
      .maybeSingle();
    if (prior) {
      console.log(`Already sent for ${today}. Use --force to resend.`);
      return;
    }
  }

  // changes from the last 24h (yesterday + today, deduped by row).
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { data: changes, error } = await supa
    .from("changes")
    .select("*")
    .gte("occurred_on", since)
    .order("desk", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;

  if (!changes.length && !SEND_EMPTY) {
    console.log("No changes in the last 24h — skipping send (set SEND_EMPTY=true to send anyway).");
    await supa.from("newsletter_sends").upsert(
      { send_date: today, recipient_count: 0, change_count: 0 },
      { onConflict: "send_date" }
    );
    return;
  }

  const to = await recipients();
  if (!to.length) {
    console.log("No recipients configured (set OWNER_EMAIL or add confirmed subscribers).");
    return;
  }

  const { subject, html } = buildNewsletter(changes, SITE_URL, today);

  // send individually so one bad address doesn't nuke the batch
  let sent = 0;
  for (const addr of to) {
    try {
      await sendEmail(addr, subject, html);
      sent++;
    } catch (e) {
      console.error(`  ! send failed to ${addr}: ${e.message}`);
    }
  }
  console.log(`Sent "${subject}" to ${sent}/${to.length} recipient(s).`);

  await supa.from("newsletter_sends").upsert(
    { send_date: today, recipient_count: sent, change_count: changes.length },
    { onConflict: "send_date" }
  );
}

main().catch((e) => {
  console.error("NEWSLETTER ERROR:", e);
  process.exit(1);
});
