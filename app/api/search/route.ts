import { NextRequest, NextResponse } from "next/server";
import { searchAll } from "@/lib/queries";

// Type-ahead endpoint behind the search box. The heavy lifting is the same
// `search_all` RPC the results page uses, so the suggestions can never disagree
// with the page you land on.
export const dynamic = "force-dynamic";

const MAX_SUGGESTIONS = 8;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  // One- and two-character queries match almost everything; not worth a round trip.
  if (q.length < 2) return NextResponse.json({ q, results: [] });

  try {
    const rows = await searchAll(q);
    const results = (rows as any[]).slice(0, MAX_SUGGESTIONS).map((r) => ({
      type: r.result_type as string,
      id: r.id as string,
      title: r.title as string,
      subtitle: (r.subtitle as string) || null,
      desk: (r.desk as string) || null,
    }));
    return NextResponse.json(
      { q, results, total: (rows as any[]).length },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("search suggest:", err);
    return NextResponse.json({ q, results: [] }, { status: 200 });
  }
}
