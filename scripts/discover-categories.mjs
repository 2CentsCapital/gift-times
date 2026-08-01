// One-off discovery: enumerate IFSCA's site sections, controllers and any
// subscription/notification categories, so we can see what we don't track.
// Run on a network that can reach ifsca.gov.in (e.g. GitHub Actions).

const BASE = "https://ifsca.gov.in";
const H = { "X-Requested-With": "XMLHttpRequest", "User-Agent": "Mozilla/5.0 gift-times-discover" };

async function text(url, opts = {}) {
  try {
    const r = await fetch(url, { headers: H, ...opts });
    return { status: r.status, body: await r.text() };
  } catch (e) {
    return { status: "ERR", body: e.message };
  }
}

function uniq(a) { return [...new Set(a)]; }

// 1) Full menu (all sections + controllers)
console.log("\n===== MENU (BindMenu) =====");
{
  const { body } = await text(`${BASE}/Home/BindMenu`, { method: "POST" });
  const links = [];
  const re = /href=["']([^"']+)["'][^>]*>([^<]{2,60})</g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const url = m[1].trim(), txt = m[2].replace(/\s+/g, " ").trim();
    if (url && url !== "#" && txt) links.push(`${txt}  =>  ${url}`);
  }
  console.log(uniq(links).join("\n"));
}

// 2) Homepage: look for subscribe links + any "category" mentions
console.log("\n===== HOMEPAGE subscribe / category hints =====");
{
  const { body } = await text(`${BASE}/`);
  const hints = uniq(
    (body.match(/(subscrib|notification|category|categories|newsletter|alert)[^<>"']{0,40}/gi) || [])
      .map((s) => s.trim())
  ).slice(0, 40);
  console.log(hints.join("\n"));
  const subLinks = uniq((body.match(/href=["']([^"']*(subscrib|notif|categ)[^"']*)["']/gi) || []));
  console.log("\nsubscribe-ish links:", subLinks.join(" | ") || "(none in homepage HTML)");
}

// 3) Probe candidate subscription endpoints
console.log("\n===== SUBSCRIPTION ENDPOINT PROBES =====");
for (const path of [
  "Home/Subscribe", "Subscribe", "Subscription", "Home/Subscription",
  "Home/GetSubscriptionCategory", "Home/GetCategory", "Home/GetCategories",
  "Subscriber/Index", "Notification/Subscribe", "Home/NewSection",
]) {
  const { status, body } = await text(`${BASE}/${path}`);
  const looksJson = body.trim().startsWith("{") || body.trim().startsWith("[");
  console.log(`${path} -> ${status}${looksJson ? " [JSON] " + body.slice(0, 200) : ""}`);
}

// 4) ReportPublication: discover its category tabs (we only track consultations)
console.log("\n===== ReportPublication categories (tabs) =====");
{
  const { body } = await text(`${BASE}/ReportPublication/index/sKCVtbX6J9o=`);
  // tabs usually carry EncryptedId in hrefs like /ReportPublication/index/XXXX=
  const cats = uniq((body.match(/ReportPublication\/index\/[^"'\s>]+/gi) || []));
  console.log("report/pub category links:", cats.join("\n") || "(none found in HTML)");
  const tabTexts = uniq((body.match(/>([A-Z][A-Za-z &/,-]{3,45})</g) || []).map(s => s.replace(/[<>]/g, "").trim())).slice(0, 40);
  console.log("\nnearby labels:", tabTexts.join(" | "));
}

// 5) Legal: confirm all category tabs
console.log("\n===== Legal categories =====");
{
  const { body } = await text(`${BASE}/Legal/Index/wF6kttc1JR8=`);
  const cats = uniq((body.match(/Legal\/Index\/[^"'\s>]+/gi) || []));
  console.log(cats.join("\n") || "(none)");
}

console.log("\n===== DONE =====");
