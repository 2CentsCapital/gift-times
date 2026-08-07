// Once-a-day subscriber report to the owner only (not to subscribers).
// Consolidated: one email listing the day's new sign-ups + the running total.
// To avoid inbox clutter it stays silent on days with no new sign-ups
// (set ALERT_ALWAYS=true to send the total every day regardless).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
//      FROM_EMAIL, OWNER_EMAIL, SITE_URL, [ALERT_ALWAYS=false]
// Run: node scripts/subscriber-alert.mjs

import { supa } from "./lib/supabase.mjs";

const FROM = process.env.FROM_EMAIL || "GIFT City Times <updates@giftcitytimes.com>";
const OWNER = (process.env.OWNER_EMAIL || "").trim();
const SITE_URL = (process.env.SITE_URL || "https://giftcitytimes.com").replace(/\/$/, "");
const ALWAYS = (process.env.ALERT_ALWAYS || "false").toLowerCase() === "true";

function esc(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

async function sendEmail(to, subject, html) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  if (!OWNER) return console.log("No OWNER_EMAIL set — skipping subscriber report.");
  if (!process.env.RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");

  const { count: total } = await supa
    .from("subscribers")
    .select("*", { count: "exact", head: true })
    .eq("confirmed", true)
    .is("unsubscribed_at", null);

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: fresh } = await supa
    .from("subscribers")
    .select("email, created_at")
    .gte("created_at", since)
    .is("unsubscribed_at", null)
    .order("created_at", { ascending: false });
  const newList = fresh || [];

  if (newList.length === 0 && !ALWAYS) {
    console.log(`No new subscribers in the last 24h (total ${total}). Skipping owner report.`);
    return;
  }

  const subject =
    newList.length > 0
      ? `GIFT City Times · +${newList.length} subscriber${newList.length > 1 ? "s" : ""} (now ${total})`
      : `GIFT City Times · ${total} subscribers`;

  const rows = newList
    .map(
      (s) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #e8e3d8;font:400 14px/1.4 Georgia,serif;color:#1a1a1a;">${esc(
          s.email
        )}<span style="color:#8a8272;font:400 12px Arial,sans-serif;"> · ${esc(
          new Date(s.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
        )}</span></td></tr>`
    )
    .join("");

  const html = `<!doctype html><html><body style="margin:0;background:#f4f1ea;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 12px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fbf9f3;border:1px solid #e0d9c8;">
        <tr><td style="padding:24px 28px 6px;border-bottom:2px solid #3f1212;">
          <div style="font:700 12px/1 Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#7a1f1f;">Subscriber report</div>
          <div style="font:700 40px/1 Georgia,serif;color:#1a1a1a;margin-top:8px;">${total}</div>
          <div style="font:400 13px Arial,sans-serif;color:#8a8272;">confirmed subscribers${
            newList.length ? ` · ${newList.length} new in the last 24h` : ""
          }</div>
        </td></tr>
        ${
          newList.length
            ? `<tr><td style="padding:8px 28px 4px;"><div style="font:700 11px Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;color:#7a1f1f;padding-bottom:4px;">New today</div><table width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>`
            : ""
        }
        <tr><td style="padding:18px 28px 24px;font:400 11px/1.5 Arial,sans-serif;color:#a89e88;">
          Internal report for the editor. <a href="${esc(SITE_URL)}" style="color:#7a1f1f;">${esc(
    SITE_URL.replace(/^https?:\/\//, "")
  )}</a>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;

  await sendEmail(OWNER, subject, html);
  console.log(`Subscriber report sent to ${OWNER}: total ${total}, +${newList.length} new.`);
}

main().catch((e) => {
  console.error("SUBSCRIBER ALERT ERROR:", e);
  process.exit(1);
});
