import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Secret-gated on-demand ISR purge. POST /api/revalidate?secret=...&path=/&type=layout
// Forces Next to re-render the path from the current deployment, overwriting the
// durable ISR cache (which new deployments don't always invalidate on their own).
export async function POST(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (!process.env.REVALIDATE_SECRET || secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const path = url.searchParams.get("path") || "/";
  const type = url.searchParams.get("type") === "page" ? "page" : "layout";
  revalidatePath(path, type as "page" | "layout");
  return NextResponse.json({ revalidated: true, path, type });
}
