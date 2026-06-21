/**
 * POST /api/ai/chat
 *
 * Streaming chat endpoint for the AI Avatar panel (the "drag-and-throw"
 * assistant on /expenses/actuals and friends).
 *
 * Unlike the OTIF reference implementation — which only *simulated*
 * streaming by typing out a locally pattern-matched string — this route
 * makes a REAL call to Claude and streams the response back token-by-token.
 * The API key never leaves the server (same secure pattern as
 * /api/ai/status and /api/expenses/suggest-cuts: read from
 * process.env.ANTHROPIC_API_KEY, used only inside the Node runtime).
 *
 * Body:
 * {
 *   messages: [{ role: "user" | "assistant", content: string }],
 *   context?: {
 *     // compact financial snapshot for the active account/month — see
 *     // buildChatSnapshot() in src/lib/ai-chat-context.ts
 *     billingMonth, totals, rows, topMerchants, recentMonths, ...
 *   },
 *   action?: { type: string; label?: string; context?: string }  // optional
 *     // structured "throw" event — e.g. user dragged the avatar onto a
 *     // StatCard or table row; we fold it into the user turn server-side
 * }
 *
 * Response: text/plain, chunked — raw assistant text deltas as they arrive.
 * The client reads via response.body.getReader() and appends chunks to the
 * bubble in place (see AiChatPanel.tsx).
 *
 * On any failure (no key, auth, rate limit, credits) we return a normal
 * (non-streamed) JSON error so the panel can fall back to its offline
 * "local insight" mode instead of hanging on a broken stream.
 */

import { aiStream, AiUnavailableError } from "@/lib/ai-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE_SYSTEM_PROMPT = `You are "Fin", the in-app AI assistant for Financial 101
Master — a personal finance planner for a Thai household. You live inside the
app as a friendly floating avatar that users can drag onto charts, stat cards,
and table rows to ask about what they're looking at.

Ground rules:
- You are a knowledgeable peer, not a licensed advisor. Never present your
  output as formal financial, investment, tax, or legal advice — you can
  explain trade-offs and options, but defer final decisions to the user
  (and a licensed professional for anything regulatory or high-stakes).
- Always reason from the FINANCIAL SNAPSHOT block in the user's message when
  one is present. Cite real numbers from it (THB amounts, percentages,
  category names, months). Never invent figures that aren't in the snapshot.
- If a USER PROFILE block is present, use it to personalise your answers —
  address the user by name, factor in their age, retirement timeline, risk
  profile, and goals when giving advice.
- If the user "throws" you at a specific UI element, you'll see a CONTEXT
  note describing what they dropped you on (e.g. a stat card, a chart, a
  table row). Open by acknowledging that specific thing, then answer.
- Be conversational, warm, and concise — 2-5 short paragraphs max, or a short
  list when comparing options. Use markdown sparingly (bold for key numbers,
  short bullet lists when genuinely clearer than prose).
- Currency is THB (฿). Thailand-aware where relevant (PVD/RMF/SSF, Thai
  inflation, Bangkok cost of living, Thai tax brackets).
- If the snapshot is missing or doesn't cover what's asked, say so plainly
  and answer from general financial knowledge instead of guessing at THB
  figures.`;

function buildServerSystemPrompt(profile: Record<string, unknown> | null | undefined, fullPlanContext?: string | null): string {
  if (!profile) return BASE_SYSTEM_PROMPT;
  const lines: string[] = [];
  if (profile.fullName) lines.push(`Name: ${profile.fullName}`);
  if (profile.dateOfBirth) {
    const age = Math.floor((Date.now() - new Date(String(profile.dateOfBirth)).getTime()) / (365.25 * 24 * 3600 * 1000));
    lines.push(`Age: ${age} (DOB: ${profile.dateOfBirth})`);
  }
  if (profile.retirementAge) lines.push(`Target retirement age: ${profile.retirementAge}`);
  if (profile.lifeExpectancy) lines.push(`Life expectancy: ${profile.lifeExpectancy}`);
  if (profile.maritalStatus) lines.push(`Marital status: ${profile.maritalStatus}`);
  if (profile.country) lines.push(`Country: ${profile.country}`);
  if (profile.riskProfile) lines.push(`Risk profile: ${profile.riskProfile}`);
  if (profile.emergencyFundTargetMonths) lines.push(`Emergency fund target: ${profile.emergencyFundTargetMonths} months`);
  if (profile.targetMinCashBalance) lines.push(`Min cash balance target: ฿${Number(profile.targetMinCashBalance).toLocaleString()}`);
  if (profile.currentCashBalance) lines.push(`Current cash balance: ฿${Number(profile.currentCashBalance).toLocaleString()}`);
  if (profile.householdNotes) lines.push(`Household notes: ${profile.householdNotes}`);
  if (profile.notes) lines.push(`Personal notes: ${profile.notes}`);
  const profileBlock = lines.length > 0 ? `[USER PROFILE]\n${lines.join("\n")}` : "";
  return [BASE_SYSTEM_PROMPT, profileBlock, fullPlanContext ?? ""].filter(Boolean).join("\n\n");
}

type ChatMessage = { role: "user" | "assistant"; content: string };

function buildUserTurn(
  text: string,
  context: unknown,
  action: { type?: string; label?: string; context?: string } | undefined,
): string {
  const parts: string[] = [];

  if (action?.type) {
    const label = action.label ? ` "${action.label}"` : "";
    const ctx = action.context ? ` — ${action.context}` : "";
    parts.push(
      `[CONTEXT: The user dragged the assistant avatar and dropped it on a ${action.type}${label}${ctx}. Open by acknowledging this specific thing.]`,
    );
  }

  if (context && typeof context === "object") {
    parts.push(`[FINANCIAL SNAPSHOT — current account/month, THB]\n${JSON.stringify(context)}`);
  }

  parts.push(text?.trim() || "(no message — just react to the context above)");
  return parts.join("\n\n");
}

function jsonError(status: number, reason: string, message: string) {
  return new Response(JSON.stringify({ error: "ai_unavailable", reason, message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "bad_request", "Invalid JSON body.");
  }

  const messages: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];
  const context = body?.context;
  const action = body?.action;
  const clientProvider: string | undefined = body?.provider; // "ollama" | "claude"
  const clientModel: string | undefined = body?.model;
  const profile: Record<string, unknown> | null = body?.profile ?? null;
  const fullPlanContext: string | null = body?.fullPlanContext ?? null;

  if (messages.length === 0) {
    return jsonError(400, "bad_request", "No messages provided.");
  }

  // Fold context/action into the *last* user turn only — keeps prior turns
  // clean for the model and avoids re-sending the (potentially large)
  // snapshot on every message in the conversation.
  const apiMessages = messages.map((m, i) => {
    const isLastUser = i === messages.length - 1 && m.role === "user";
    return {
      role: m.role,
      content: isLastUser ? buildUserTurn(m.content, context, action) : (m.content || ""),
    };
  });

  // Default provider is the user's local Ollama Gemma 4; Claude is the
  // automatic fallback (see src/lib/ai-provider.ts). If neither is reachable
  // we return a JSON error so the panel drops to its offline "local insight"
  // mode instead of hanging on a broken stream.
  let stream: ReadableStream<Uint8Array>;
  let source: string;
  try {
    const result = await aiStream(
      {
        system: buildServerSystemPrompt(profile, fullPlanContext),
        // BASE_SYSTEM_PROMPT is fixed across every user/request; only the
        // profile/plan context appended after it changes. Splitting it out
        // lets Claude cache that static prefix instead of reprocessing it
        // on every single chat turn.
        cacheableSystemPrefix: BASE_SYSTEM_PROMPT,
        // Conversations grow turn over turn and we resend the full history
        // each time — cache everything before the newest user turn.
        cacheConversation: true,
        messages: apiMessages,
        maxTokens: 1024,
        claudeModel: "claude-sonnet-4-6",
        ollamaModel: clientModel,
      },
      clientProvider === "claude" ? "claude" : clientProvider === "ollama" ? "ollama" : undefined,
    );
    stream = result.stream;
    source = result.source;
  } catch (e) {
    if (e instanceof AiUnavailableError) {
      return jsonError(503, e.reason, e.message);
    }
    return jsonError(500, "stream_init_failed", String((e as any)?.message ?? "Failed to start AI stream."));
  }

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-ai-source": source,
    },
  });
}
