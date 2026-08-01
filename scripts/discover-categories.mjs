// Pass 3: dump row shapes for InformalGuidance / Speeches / Career endpoints.
const BASE = "https://ifsca.gov.in";
const H = { "X-Requested-With": "XMLHttpRequest", "User-Agent": "Mozilla/5.0 discover" };

function params(len) {
  const p = new URLSearchParams({ draw: "1", start: "0", length: String(len),
    "order[0][column]": "0", "order[0][dir]": "desc", PageNumber: "1", PageSize: String(len), SearchText: "" });
  for (let i = 0; i < 3; i++) {
    p.set(`columns[${i}][data]`, ["RowNum", "PublishDate", "Title"][i]);
    p.set(`columns[${i}][searchable]`, "true"); p.set(`columns[${i}][orderable]`, "true");
    p.set(`columns[${i}][search][value]`, ""); p.set(`columns[${i}][search][regex]`, "false");
  }
  return p.toString();
}

async function dump(label, url) {
  console.log(`\n===== ${label} =====\n${url}`);
  try {
    const r = await fetch(`${url}?${params(3)}`, { headers: H });
    const j = await r.json();
    const d = j.data;
    let list = Array.isArray(d) ? d : (d?.informalGuidanceModels || d?.speechesMasterModels ||
      d?.SpeechesMasterModelList || d?.careerModels || d?.CareerMasterModelList || d?.LegalMasterModelList ||
      (d && typeof d === "object" ? Object.values(d).find((v) => Array.isArray(v) && v.length) : []));
    list = list || [];
    console.log("status", r.status, "| dataType", Array.isArray(d) ? "array" : "object",
      "| listLen", list.length);
    if (!Array.isArray(d) && d && typeof d === "object")
      console.log("data keys:", Object.keys(d).filter((k) => Array.isArray(d[k])).join(", ") || "(no array fields)");
    const row = list[0] || {};
    console.log("row keys:", Object.keys(row).filter((k) => !/^_|Pagination/.test(k)).join(", "));
    list.slice(0, 2).forEach((x) => console.log("  •", JSON.stringify(Object.fromEntries(
      Object.entries(x).filter(([k, v]) => v && typeof v !== "object" && /id|title|date|file|name|path|link|url/i.test(k))
    )).slice(0, 300)));
  } catch (e) { console.log("ERR", e.message); }
}

await dump("Informal Guidance", `${BASE}/InformalGuidance/GetInformalGuidanceListData`);
await dump("Speeches", `${BASE}/speeches/GetspeechesData`);
await dump("Career", `${BASE}/Career/GetCareerListData`);
console.log("\n===== DONE =====");
