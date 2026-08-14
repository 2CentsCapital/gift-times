import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { verifyToken } from "@/lib/token";
import { actionPage } from "@/lib/page-response";

export const runtime = "nodejs";

async function unsubscribe(email: string, token: string): Promise<boolean> {
  if (!email || !verifyToken("unsub", email, token)) return false;
  const supa = getSupabase();
  const { error } = await supa
    .from("subscribers")
    .update({ unsubscribed_at: new Date().toISOString(), confirmed: false })
    .eq("email", email);
  return !error;
}

// Link click.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = (searchParams.get("e") || "").trim().toLowerCase();
  const ok = await unsubscribe(email, searchParams.get("t") || "");
  return ok
    ? actionPage("You’ve been unsubscribed", "You won’t receive GIFT City Times any more. You can re-subscribe anytime from the homepage.")
    : actionPage("Invalid unsubscribe link", "This link is invalid or has expired.", 400);
}

// One-click (RFC 8058) — Gmail/Apple Mail unsubscribe button.
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = (searchParams.get("e") || "").trim().toLowerCase();
  const ok = await unsubscribe(email, searchParams.get("t") || "");
  return new NextResponse(ok ? "unsubscribed" : "invalid", { status: ok ? 200 : 400 });
}
