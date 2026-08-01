// Pass 2: label the ReportPublication category tabs + confirm other feeds.
const BASE = "https://ifsca.gov.in";
const H = { "X-Requested-With": "XMLHttpRequest", "User-Agent": "Mozilla/5.0 discover" };

async function json(url) {
  try { const r = await fetch(url, { headers: H }); return { s: r.status, j: await r.json() }; }
  catch (e) { return { s: "ERR", j: null, e: e.message }; }
}
async function text(url) {
  try { const r = await fetch(url, { headers: H }); return { s: r.status, t: await r.text() }; }
  catch (e) { return { s: "ERR", t: "", e: e.message }; }
}
function p(len, enc, extra = {}) {
  return new URLSearchParams({ draw: "1", start: "0", length: String(len),
    "order[0][column]": "0", "order[0][dir]": "desc", PageNumber: "1", PageSize: String(len),
    SearchText: "", EncryptedId: enc, ...extra }).toString();
}

console.log("===== ReportPublication category tabs (label by sample titles) =====");
const rpIds = ["aadg9ruDI%20M=", "sKCVtbX6J9o=", "E4H-JzPpHlE=", "zcGvy-Iqfcg=",
  "wF6kttc1JR8=", "mizvnmwVAgs=", "MEdJSLhva0M="];
for (const enc of rpIds) {
  const { s, j } = await json(`${BASE}/ReportPublication/GetReportPublicationData?${p(3, enc)}`);
  const list = j?.data?.reportandPublicationModels || [];
  const total = list[0]?.PaginationRequest?.TotalRecord ?? list.length;
  const titles = list.slice(0, 3).map((x) => (x.Title || "").trim().slice(0, 55));
  console.log(`\n[${enc}] status=${s} total=${total}`);
  titles.forEach((t) => console.log("   • " + t));
}

console.log("\n\n===== Other candidate controllers: find their data endpoint via CustomJS =====");
for (const ctrl of ["InformalGuidance", "Speeches", "Career", "AlertsAgainstScams", "Alert", "Orders", "Enforcement"]) {
  const { s, t } = await text(`${BASE}/${ctrl}/Index`);
  if (s !== 200) { console.log(`\n${ctrl}/Index -> ${s}`); continue; }
  const js = [...new Set((t.match(/\/CustomJS\/[A-Za-z0-9_]+\.js/g) || []))];
  const endpoints = [...new Set((t.match(/[A-Za-z]+\/Get[A-Za-z]+Data/g) || []))];
  console.log(`\n${ctrl}/Index -> 200 | inline endpoints: ${endpoints.join(", ") || "-"} | customJS: ${js.join(", ") || "-"}`);
  // pull endpoint refs from the CustomJS files too
  for (const j of js) {
    const { t: jt } = await text(`${BASE}${j}`);
    const eps = [...new Set((jt.match(/[A-Za-z]+\/Get[A-Za-z]+[A-Za-z]*Data/g) || []))];
    if (eps.length) console.log(`     ${j} -> ${eps.join(", ")}`);
  }
}

console.log("\n===== DONE =====");
