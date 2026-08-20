import { NextResponse } from "next/server";
import { ISSUER, MCP_RESOURCE } from "@/lib/connector/core";

export const runtime = "nodejs";
export const dynamic = "force-static";

// RFC 9728 — tells MCP clients which authorization server protects the resource.
export async function GET() {
  return NextResponse.json({
    resource: MCP_RESOURCE,
    authorization_servers: [ISSUER],
    scopes_supported: ["giftcity"],
    bearer_methods_supported: ["header"],
  });
}
