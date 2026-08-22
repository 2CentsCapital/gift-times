import { NextResponse } from "next/server";
import { getNetworkGraph } from "@/lib/network";

// The graph is derived from the whole register, so it is expensive to build and
// changes at most once per ingest. Serve it from the route cache and let the
// client fetch it after paint rather than inlining ~200KB of JSON into the page.
export const revalidate = 3600;

export async function GET() {
  try {
    const graph = await getNetworkGraph();
    return NextResponse.json(graph, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (err) {
    console.error("network graph:", err);
    return NextResponse.json({ error: "Could not build the network graph." }, { status: 500 });
  }
}
