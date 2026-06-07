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

import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are "Fin", the in-app AI assistant for Financial 101
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

  if (messages.length === 0) {
    return jsonError(400, "bad_request", "No messages provided.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return jsonError(503, "no_api_key", "ANTHROPIC_API_KEY is not configured. The avatar will use local insights instead.");
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

  const client = new Anthropic({ apiKey });

  let stream: ReturnType<Anthropic["messages"]["stream"]>;
  try {
    stream = client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: apiMessages as any,
    });
  } catch (e: any) {
    return jsonError(500, "stream_init_failed", String(e?.message ?? "Failed to start AI stream."));
  }

  const encoder = new TextEncoder();
  const body_stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        stream.on("text", (delta: string) => {
          controller.enqueue(encoder.encode(delta));
        });
        await stream.finalMessage();
        controller.close();
      } catch (e: any) {
        const raw = String(e?.message ?? "");
        // Surface a readable in-band error so the UI can show *something*
        // even mid-stream (better than a silent cutoff).
        let note = "\n\n_⚠️ The connection to Claude dropped before finishing. Please try again._";
        if (/credit balance is too low|insufficient_quota/i.test(raw)) {
          note = "\n\n_⚠️ Anthropic credits are exhausted — switching to local insights would help here._";
        } else if (/invalid x-api-key|authentication/i.test(raw)) {
          note = "\n\n_⚠️ AI authentication failed server-side. Local insights are still available._";
        } else if (/rate limit|429/i.test(raw)) {
          note = "\n\n_⚠️ Claude is rate-limiting requests right now — give it a moment and try again._";
        }
        controller.enqueue(encoder.encode(note));
        controller.close();
      }
    },
    cancel() {
      stream.controller.abort();
    },
  });

  return new Response(body_stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-ai-source": "claude-live",
    },
  });
}
