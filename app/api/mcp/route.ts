import { NextResponse } from "next/server";
import { verifyAccessToken, getAccount, db, ISSUER } from "@/lib/connector/core";
import { buildBrief, gradeQuiz, levelFor } from "@/lib/connector/brief";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROTOCOL = "2025-06-18";
const SERVER = { name: "GIFT City Times", version: "1.0.0" };
const RESOURCE_META = `${ISSUER}/.well-known/oauth-protected-resource`;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Expose-Headers": "WWW-Authenticate",
};

function unauthorized() {
  return new NextResponse(JSON.stringify({ error: "invalid_token" }), {
    status: 401,
    headers: {
      ...CORS,
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer resource_metadata="${RESOURCE_META}"`,
    },
  });
}

function rpc(id: any, result: any) {
  return NextResponse.json({ jsonrpc: "2.0", id, result }, { headers: CORS });
}
function rpcErr(id: any, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { headers: CORS });
}
const textResult = (id: any, text: string, isError = false) =>
  rpc(id, { content: [{ type: "text", text }], isError });

// ---- tool catalogue -------------------------------------------------------
const TOOLS = [
  {
    name: "get_morning_brief",
    description:
      "Get the reader's personalised GIFT City (GIFT IFSC) morning brief: today's regulatory news, a fun fact, their streak and points, and the daily quiz. Call this first thing each day.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "answer_quiz",
    description:
      "Submit the reader's answer to today's GIFT City quiz. A correct answer earns 20 points and keeps the streak alive.",
    inputSchema: {
      type: "object",
      properties: { answer: { type: "string", description: "The reader's chosen answer (usually a number)." } },
      required: ["answer"],
      additionalProperties: false,
    },
  },
  {
    name: "verify_entity",
    description:
      "Check whether a company or person is registered/licensed in GIFT IFSC and return its status, category and registration details. Use for due-diligence questions like 'is X regulated in GIFT City?'.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "Company or entity name to look up." } },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "set_interests",
    description:
      "Set which desks the reader's brief should focus on. Pass an empty array to follow everything. Example desks: Banking, Capital Markets, Funds, Insurance, Fintech, Bullion, Aircraft Leasing, Ship Leasing, Legal & Advisory.",
    inputSchema: {
      type: "object",
      properties: { desks: { type: "array", items: { type: "string" }, description: "Desk names to follow." } },
      required: ["desks"],
      additionalProperties: false,
    },
  },
];

// ---- tool implementations -------------------------------------------------
async function callTool(name: string, args: any, account: any): Promise<{ text: string; isError?: boolean }> {
  if (name === "get_morning_brief") {
    const b = await buildBrief(account);
    return { text: b.markdown };
  }

  if (name === "answer_quiz") {
    const r = await gradeQuiz(account, String(args?.answer ?? ""));
    if (r.alreadyAnswered) {
      return { text: `You've already answered today's quiz — it was ${r.wasCorrect ? "correct ✅" : "incorrect ❌"} (answer: **${r.correctAnswer}**). You have **${r.points} pts**. Come back tomorrow for a new one!` };
    }
    const lvl = r.level || levelFor(r.points);
    const head = r.wasCorrect ? `✅ Correct! +${r.gained} pts.` : `❌ Not quite — the answer was **${r.correctAnswer}**. +${r.gained} pts for playing.`;
    return { text: `${head}\nYou now have **${r.points} pts** · **${lvl.name}**${lvl.next ? ` (${lvl.next.min - r.points} to ${lvl.next.name})` : " — max level!"}` };
  }

  if (name === "verify_entity") {
    const raw = String(args?.name ?? "").slice(0, 80);
    const safe = raw.replace(/[,()*"\\%]/g, " ").trim();
    if (!safe) return { text: "Please provide an entity name to look up.", isError: true };
    const { data } = await db()
      .from("entities")
      .select("name,category,subcategory,desk,status,registration_number,date_of_registration,validity_to")
      .ilike("name", `%${safe}%`)
      .limit(8);
    if (!data || !data.length) {
      return { text: `No entity matching **"${raw}"** is in the GIFT IFSC register. That means it isn't currently listed by IFSCA — it may not be regulated in GIFT City, or the name differs. Search the full register: ${ISSUER}` };
    }
    const lines = [`Found ${data.length} match${data.length === 1 ? "" : "es"} in the GIFT IFSC register:\n`];
    for (const e of data as any[]) {
      const bits = [
        `**${e.name}**`,
        e.status ? `— ${e.status}` : "",
      ].filter(Boolean).join(" ");
      const meta = [
        e.category || e.desk,
        e.registration_number ? `Reg: ${e.registration_number}` : "",
        e.date_of_registration ? `Registered: ${e.date_of_registration}` : "",
        e.validity_to ? `Valid to: ${e.validity_to}` : "",
      ].filter(Boolean).join(" · ");
      lines.push(`- ${bits}${meta ? `\n  ${meta}` : ""}`);
    }
    return { text: lines.join("\n") };
  }

  if (name === "set_interests") {
    const desks = Array.isArray(args?.desks) ? args.desks.map((d: any) => String(d).trim()).filter(Boolean).slice(0, 20) : [];
    await db().from("connector_accounts").update({ interests: desks }).eq("id", account.id);
    return { text: desks.length ? `Done — your brief will now focus on: **${desks.join(", ")}**.` : "Done — your brief will follow all GIFT IFSC desks." };
  }

  return { text: `Unknown tool: ${name}`, isError: true };
}

// ---- JSON-RPC dispatch ----------------------------------------------------
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  const accountId = verifyAccessToken(token);
  if (!accountId) return unauthorized();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return rpcErr(null, -32700, "Parse error");
  }

  // Notifications (no id) → acknowledge with 202, no body.
  if (body && body.method && typeof body.id === "undefined") {
    return new NextResponse(null, { status: 202, headers: CORS });
  }

  const { id, method, params } = body || {};

  if (method === "initialize") {
    return rpc(id, {
      protocolVersion: params?.protocolVersion || PROTOCOL,
      capabilities: { tools: {}, resources: {}, prompts: {} },
      serverInfo: SERVER,
      instructions:
        "GIFT City Times is your daily companion for GIFT IFSC (India's international financial centre). Use get_morning_brief for the day's news, quiz and streak; verify_entity to check if a firm is regulated there.",
    });
  }

  if (method === "ping") return rpc(id, {});

  if (method === "tools/list") return rpc(id, { tools: TOOLS });

  if (method === "resources/list") {
    return rpc(id, {
      resources: [
        {
          uri: "giftcity://brief/today",
          name: "Today's GIFT City brief",
          description: "Your personalised GIFT IFSC morning brief, quiz and streak.",
          mimeType: "text/markdown",
        },
      ],
    });
  }

  if (method === "resources/read") {
    const uri = params?.uri;
    if (uri !== "giftcity://brief/today") return rpcErr(id, -32602, `Unknown resource: ${uri}`);
    const account = await getAccount(accountId);
    if (!account) return unauthorized();
    const b = await buildBrief(account);
    return rpc(id, { contents: [{ uri, mimeType: "text/markdown", text: b.markdown }] });
  }

  if (method === "prompts/list") {
    return rpc(id, {
      prompts: [
        { name: "morning_brief", description: "Show my GIFT City Times morning brief with news, fun fact, streak and quiz." },
      ],
    });
  }

  if (method === "prompts/get") {
    if (params?.name !== "morning_brief") return rpcErr(id, -32602, "Unknown prompt");
    return rpc(id, {
      description: "Show my GIFT City Times morning brief.",
      messages: [
        {
          role: "user",
          content: { type: "text", text: "Give me my GIFT City Times morning brief for today — call get_morning_brief and present it nicely." },
        },
      ],
    });
  }

  if (method === "tools/call") {
    const account = await getAccount(accountId);
    if (!account) return unauthorized();
    const name = params?.name;
    if (!TOOLS.some((t) => t.name === name)) return rpcErr(id, -32602, `Unknown tool: ${name}`);
    try {
      const r = await callTool(name, params?.arguments || {}, account);
      return textResult(id, r.text, r.isError);
    } catch (e: any) {
      return textResult(id, `Something went wrong: ${e?.message || "unknown error"}`, true);
    }
  }

  return rpcErr(id, -32601, `Method not found: ${method}`);
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  if (!verifyAccessToken(token)) return unauthorized();
  // Stateless server: no SSE stream to open.
  return new NextResponse("Method Not Allowed", { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
