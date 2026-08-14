import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFresh } from "@/lib/supabase";

// Document mirror: fetches an IFSCA-hosted PDF once, caches it in our own
// storage, and serves our copy thereafter — so links survive IFSCA outages.
export const runtime = "nodejs";

const BUCKET = "docs";
const IFSCA_HOST = "ifsca.gov.in";

function cacheKey(target: URL, raw: string): string {
  const id = target.searchParams.get("id");
  const base = id ? id.replace(/[^a-zA-Z0-9_-]/g, "") : null;
  return `${(base || Buffer.from(raw).toString("base64url")).slice(0, 120)}.pdf`;
}

function unavailable(raw: string) {
  const html = `<!doctype html><meta charset="utf-8"><title>Document unavailable</title>
  <div style="font-family:Georgia,serif;max-width:520px;margin:12vh auto;padding:0 20px;color:#1a1712;text-align:center;">
    <div style="font:700 12px/1 Arial;letter-spacing:2px;text-transform:uppercase;color:#7a1f1f;">GIFT City Times</div>
    <h1 style="font-size:26px;margin:14px 0 8px;">This document isn’t reachable right now</h1>
    <p style="color:#4a453c;line-height:1.5;">IFSCA’s server is temporarily unavailable, so we couldn’t fetch this file. It will be mirrored automatically once IFSCA is back. Please try again shortly.</p>
    <p style="margin-top:22px;"><a href="${raw.replace(/"/g, "&quot;")}" style="font:600 13px Arial;color:#7a1f1f;">Try opening it directly on ifsca.gov.in →</a></p>
    <p style="margin-top:8px;"><a href="/" style="font:600 13px Arial;color:#8a8272;text-decoration:none;">← Back to GIFT City Times</a></p>
  </div>`;
  return new NextResponse(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("u");
  if (!raw) return new NextResponse("Missing document URL", { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new NextResponse("Invalid URL", { status: 400 });
  }
  // SSRF guard: only ever fetch from IFSCA.
  if (target.protocol !== "https:" || target.hostname !== IFSCA_HOST) {
    return new NextResponse("Only IFSCA documents are proxied", { status: 400 });
  }

  const supa = getSupabaseFresh();
  const key = cacheKey(target, raw);
  const publicUrl = supa.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;

  // Already mirrored?
  try {
    const { data: found } = await supa.storage.from(BUCKET).list("", { search: key, limit: 1 });
    if (found && found.some((f) => f.name === key)) {
      return NextResponse.redirect(publicUrl, 302);
    }
  } catch {
    /* fall through to fetch */
  }

  // Fetch from IFSCA (with one retry), mirror, then redirect to our copy.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(target.toString(), {
        headers: { "User-Agent": "Mozilla/5.0 giftcitytimes-mirror" },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      const contentType = r.headers.get("content-type") || "application/pdf";
      await supa.storage.from(BUCKET).upload(key, buf, { contentType, upsert: true });
      return NextResponse.redirect(publicUrl, 302);
    } catch {
      if (attempt === 1) return unavailable(raw);
    }
  }
  return unavailable(raw);
}
