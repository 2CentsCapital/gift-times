// Renders the daily digest into a sectioned newspaper-style HTML email.

const DESK_ORDER = [
  "SEZ Approvals",
  "Brokers",
  "FMEs",
  "Insurance",
  "Fintech",
  "Banking",
  "Circulars",
  "Regulations",
  "News",
  "Tenders",
  "Consultations",
  "Reports",
  "Guidance",
  "Speeches",
  "Careers",
  "Surrendered",
  "Other",
];

const DESK_LABEL = {
  "SEZ Approvals": "SEZ / UAC Approvals",
  Brokers: "Broker Desk",
  FMEs: "Fund Management",
  Insurance: "Insurance",
  Fintech: "Fintech & Sandbox",
  Banking: "Banking & Finance",
  Circulars: "Circulars",
  Regulations: "Regulations & Notices",
  News: "News & Press",
  Tenders: "Tenders & Procurement",
  Consultations: "Consultation Papers",
  Reports: "Reports & Studies",
  Guidance: "Informal Guidance",
  Speeches: "Speeches",
  Careers: "Careers & Vacancies",
  Surrendered: "Surrenders & Cancellations",
  Other: "Other",
};

function esc(s) {
  return String(s || "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function itemLink(change, siteUrl) {
  const u = change.url || "";
  return u.startsWith("http") ? u : `${siteUrl}${u || "/"}`;
}

// changes: rows from `changes`. Returns { subject, html }.
export function buildNewsletter(changes, siteUrl, editionDate) {
  const byDesk = {};
  for (const c of changes) {
    const d = c.desk || "Other";
    (byDesk[d] ||= []).push(c);
  }

  const dateLabel = fmtDate(editionDate) || fmtDate(new Date().toISOString());
  const total = changes.length;

  const sections = DESK_ORDER.filter((d) => byDesk[d]?.length).map((desk) => {
    const rows = byDesk[desk]
      .map((c) => {
        const date = c.detail?.date_of_registration || c.detail?.publish_date;
        const meta = [c.category, fmtDate(date)].filter(Boolean).join(" · ");
        return `
        <tr><td style="padding:14px 0;border-bottom:1px solid #e8e3d8;">
          <div style="font:600 16px/1.4 Georgia,serif;color:#1a1a1a;">${esc(c.headline)}</div>
          ${meta ? `<div style="font:400 13px/1.4 Georgia,serif;color:#8a8272;margin-top:3px;">${esc(meta)}</div>` : ""}
          <a href="${esc(itemLink(c, siteUrl))}" style="display:inline-block;margin-top:8px;font:600 12px/1 Arial,sans-serif;color:#7a1f1f;text-decoration:none;">Read in full →</a>
        </td></tr>`;
      })
      .join("");
    return `
      <tr><td style="padding:26px 0 6px;">
        <div style="font:700 12px/1 Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#7a1f1f;border-bottom:2px solid #7a1f1f;padding-bottom:8px;">
          ${esc(DESK_LABEL[desk] || desk)} <span style="color:#b7ad99;font-weight:400;">(${byDesk[desk].length})</span>
        </div>
      </td></tr>
      <tr><td><table width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>`;
  });

  const subject =
    total === 0
      ? `GIFT City Times — ${dateLabel} (quiet day)`
      : `GIFT City Times — ${dateLabel}: ${total} update${total > 1 ? "s" : ""} across GIFT IFSC`;

  const body =
    total === 0
      ? `<tr><td style="padding:40px 0;text-align:center;font:400 16px/1.5 Georgia,serif;color:#8a8272;">No new registrations, circulars or notices in the last 24 hours.</td></tr>`
      : sections.join("");

  const html = `<!doctype html><html><body style="margin:0;background:#f4f1ea;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 12px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fbf9f3;border:1px solid #e0d9c8;">
        <tr><td style="padding:28px 32px 8px;text-align:center;border-bottom:3px double #1a1a1a;">
          <div style="font:700 34px/1 Georgia,serif;letter-spacing:1px;color:#1a1a1a;">GIFT City Times</div>
          <div style="font:400 10px/1 Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#a89e88;margin-top:5px;">by <a href="https://valura.ai" style="color:#7a1f1f;text-decoration:none;">valura.ai</a></div>
          <div style="font:400 12px/1 Arial,sans-serif;letter-spacing:3px;text-transform:uppercase;color:#8a8272;margin-top:8px;">Daily intelligence on GIFT IFSC · ${esc(dateLabel)}</div>
        </td></tr>
        <tr><td style="padding:0 32px;"><table width="100%" cellpadding="0" cellspacing="0">${body}</table></td></tr>
        <tr><td style="padding:28px 32px;text-align:center;">
          <a href="${esc(siteUrl)}" style="display:inline-block;background:#1a1a1a;color:#fbf9f3;font:600 13px/1 Arial,sans-serif;letter-spacing:1px;text-decoration:none;padding:14px 28px;">READ TODAY’S EDITION →</a>
        </td></tr>
        <tr><td style="padding:16px 32px 28px;border-top:1px solid #e0d9c8;text-align:center;font:400 11px/1.5 Arial,sans-serif;color:#a89e88;">
          GIFT City Times · Automated from IFSCA public disclosures · <a href="${esc(siteUrl)}" style="color:#7a1f1f;">${esc(siteUrl.replace(/^https?:\/\//, ""))}</a>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;

  return { subject, html };
}
