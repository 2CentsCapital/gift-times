import { NextResponse } from "next/server";
import { registerClient } from "@/lib/connector/core";

export const runtime = "nodejs";

// RFC 7591 Dynamic Client Registration.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const redirectUris: string[] = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  const client = await registerClient(redirectUris, body.client_name);
  return NextResponse.json(
    {
      client_id: client.client_id,
      client_secret: client.client_secret,
      redirect_uris: client.redirect_uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_id_issued_at: Math.floor(Date.now() / 1000),
    },
    { status: 201 }
  );
}
