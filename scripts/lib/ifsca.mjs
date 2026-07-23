// IFSCA data-access layer.
// The ifsca.gov.in listings are backed by internal DataTables JSON APIs.
// This module wraps every feed we ingest for The GIFT Times.
//
// Node 22+ (global fetch). No external deps.

const BASE = "https://ifsca.gov.in";

// Legal-framework categories (label -> EncryptedId), from the site menu.
export const LEGAL_CATEGORIES = {
  Regulations: "ogGPf3wx5GE=",
  Circular: "wF6kttc1JR8=",
  Notification: "zcGvy-Iqfcg=",
  Rules: "E4H-JzPpHlE=",
  Guidelines: "mizvnmwVAgs=",
  "AML/CFT/KYC": "TCce8MyOmco=",
};
export const PRESS_RELEASE_ID = "MEdJSLhva0M="; // News / Press Releases
export const CONSULTATION_ID = "sKCVtbX6J9o="; // Public consultation papers

const HEADERS = {
  "X-Requested-With": "XMLHttpRequest",
  "User-Agent": "Mozilla/5.0 (Macintosh) gift-times-ingest",
};

async function getJson(path, params) {
  const url = `${BASE}/${path}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

function baseParams(length) {
  return {
    draw: "1",
    "order[0][column]": "0",
    "order[0][dir]": "desc",
    start: "0",
    length: String(length),
    "search[value]": "",
    "search[regex]": "false",
    PageNumber: "1",
    PageSize: String(length),
  };
}

// Build a stable public URL to an IFSCA-hosted document.
export function fileUrl(photoFileId, fileName) {
  if (!photoFileId || !fileName) return null;
  return `${BASE}/CommonDirect/ViewFile?id=${encodeURIComponent(
    photoFileId
  )}&fileName=${encodeURIComponent(fileName)}`;
}

// Parse IFSCA "DD/MM/YYYY" into ISO "YYYY-MM-DD" (or null).
export function toIsoDate(s) {
  if (!s || typeof s !== "string") return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// ---- Directory of Regulated Entities -------------------------------------

// Lightweight list of every entity (name + category + the EncryptedId we
// need to fetch full detail). ~2000 rows in one request.
export async function fetchEntityList() {
  const p = {
    ...baseParams(5000),
    Id: "0",
    ParentTypeId: "0",
    EntityFilter: "",
    CategoryFilter: "0",
    SubCategoryFilter: "0",
  };
  const d = await getJson("DirectoryList/DirectoryGetList", p);
  const rows = d.data || [];
  return rows
    .map((r) => ({
      encryptedId: r.EncryptedId || null,
      name: (r.Title || "").trim(),
      category: r.DirParentCategoryName || null,
      subcategory: r.DirSubCategoryName || null,
    }))
    .filter((r) => r.name && r.encryptedId);
}

// Full detail for a single entity.
export async function fetchEntityDetail(encryptedId) {
  const d = await getJson("DirectoryList/DirectoryDetailGet", {
    EncryptedId: encryptedId,
  });
  const r = (d && d.data) || d || {};
  return {
    encryptedId,
    dfId: r.DfID ?? null,
    name: (r.Title || "").trim(),
    category: null, // filled from list (parent category name)
    subcategory: (r.DfType || "").trim() || null,
    registrationNumber: r.RegistrationNumber || null,
    dateOfRegistration: toIsoDate(r.DateOfRegistration),
    validityTo: toIsoDate(r.ValidityToDate),
    registeredAddress: (r.RegisteredAddress || "").trim() || null,
    contactPerson: (r.NameofContactPerson || "").trim() || null,
    email: (r.Email || "").trim() || null,
    website: (r.Website || "").trim() || null,
    remarks: (r.Remarks || "").trim() || null,
    isActive: r.IsActive === true,
    modifiedOn: r.ModifiedOn || null,
    createdOn: r.CreatedOn || null,
  };
}

// ---- Publications (circulars / regulations / news / consultations) -------

function mapLegalRows(rows) {
  return (rows || [])
    .map((r) => ({
      ifscaId: r.LegalId ?? null,
      title: (r.Title || "").trim(),
      publishDate: toIsoDate(r.PublishDate),
      fileUrl: fileUrl(r.PhotoFileID, r.PhotoFileName),
    }))
    .filter((r) => r.title);
}

async function fetchLegalLike(path, encryptedId) {
  const p = { ...baseParams(3000), EncryptedId: encryptedId };
  const d = await getJson(path, p);
  const data = (d && d.data) || {};
  return mapLegalRows(data.LegalMasterModelList);
}

// One legal category (Circular, Regulations, Notification, ...).
export async function fetchLegalCategory(encryptedId) {
  return fetchLegalLike("Legal/GetLegalData", encryptedId);
}

// News / Press Releases.
export async function fetchNews() {
  return fetchLegalLike("PressRelease/GetLegalData", PRESS_RELEASE_ID);
}

// Public consultation papers (different controller + list key).
export async function fetchConsultations() {
  const p = { ...baseParams(3000), EncryptedId: CONSULTATION_ID, SearchText: "" };
  const d = await getJson("ReportPublication/GetReportPublicationData", p);
  const data = (d && d.data) || {};
  const rows = data.reportandPublicationModels || [];
  return rows
    .map((r) => ({
      ifscaId: r.RPId ?? null,
      title: (r.Title || "").trim(),
      publishDate: toIsoDate(r.PublishDate),
      fileUrl: fileUrl(r.PhotoFileID, r.PhotoFileName),
    }))
    .filter((r) => r.title);
}

// Convenience: every publication feed keyed by kind.
export async function fetchAllPublications() {
  const out = {};
  for (const [label, enc] of Object.entries(LEGAL_CATEGORIES)) {
    out[label] = await fetchLegalCategory(enc);
  }
  out["News"] = await fetchNews();
  out["Consultation"] = await fetchConsultations();
  return out;
}
