import { getSupabase } from "@/lib/supabase";
import { verifyToken } from "@/lib/token";
import { actionPage } from "@/lib/page-response";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = (searchParams.get("e") || "").trim().toLowerCase();
  const token = searchParams.get("t") || "";

  if (!email || !verifyToken("confirm", email, token)) {
    return actionPage("Invalid confirmation link", "This link is invalid or has expired. Please subscribe again.", 400);
  }

  const supa = getSupabase();
  const { error } = await supa
    .from("subscribers")
    .update({ confirmed: true, unsubscribed_at: null })
    .eq("email", email);
  if (error) {
    return actionPage("Something went wrong", "We couldn’t confirm your subscription. Please try again shortly.", 500);
  }

  return actionPage(
    "You’re subscribed ✓",
    "Confirmed. The next edition of GIFT City Times will land in your inbox, twice a day when there’s news."
  );
}
