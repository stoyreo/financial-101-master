/**
 * Central AI provider abstraction for Financial 101 Master.
 *
 * Default provider is the user's LOCAL Ollama running Google's Gemma 4
 * (`gemma4`) on their Mac — reached over HTTP at OLLAMA_BASE_URL
 * (default http://localhost:11434). Anthropic Claude is kept as an
 * automatic FALLBACK so nothing breaks when Ollama is offline (laptop
 * asleep, model not pulled, etc.) or when running on a server that can't
 * see localhost.
 *
 * Provider order is controlled by AI_PROVIDER:
 *   - "ollama" (default) → try Ollama Gemma 4 first, then Claude
 *   - "claude"           → try Claude first, then Ollama
 *
 * Every AI-powered analysis route in the app should go through here instead
 * of constructing an Anthropic client directly, so the provider choice and
 * fallback behaviour live in exactly one place.
 *
 * No new npm dependency: Ollama is spoken to via plain `fetch` against its
 * native /api/chat endpoint; Claude continues to use @anthropic-ai/sdk.
 */

import Anthropic from "@anthropic-ai/sdk";

export type ProviderMessage = { role: "user" | "assistant"; content: string };
export type AiSource = "ollama-gemma4" | "claude-live";
type ProviderId = "ollama" | "claude";

// ---------------------------------------------------------------------------
// Config (read once at module load)
// ---------------------------------------------------------------------------

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma4";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PREFERRED: ProviderId = (process.env.AI_PROVIDER || "ollama").toLowerCase() === "claude" ? "claude" : "ollama";

/** Exposed so /api/ai/status and debugging can report what's configured. */
export const aiConfig = {
  ollamaBaseUrl: OLLAMA_BASE_URL,
  ollamaModel: OLLAMA_MODEL,
  preferred: PREFERRED,
  hasAnthropicKey: !!ANTHROPIC_API_KEY,
} as const;

/** Order in which we try providers, given the configured preference. */
function providerOrder(): ProviderId[] {
  return PREFERRED === "claude" ? ["claude", "ollama"] : ["ollama", "claude"];
}

export class AiUnavailableError extends Error {
  reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = "AiUnavailableError";
    this.reason = reason;
  }
}

// ---------------------------------------------------------------------------
// Shared options
// ---------------------------------------------------------------------------

export interface AiRequest {
  system: string;
  /**
   * Optional static instructions block that is a *prefix* of `system`. When
   * set, the Claude transport splits `system` into this cacheable prefix
   * (marked with an ephemeral `cache_control` breakpoint) plus the remaining
   * dynamic suffix (e.g. per-user profile/plan context) sent uncached. This
   * lets routes that prepend per-request data to a fixed instructions block
   * still benefit from prompt caching on the part that never changes.
   * Ignored by the Ollama transport (no caching concept there).
   */
  cacheableSystemPrefix?: string;
  messages: ProviderMessage[];
  /** Max tokens to generate. */
  maxTokens?: number;
  /** Sampling temperature. Defaults: 0.2 for JSON, 0.6 for prose. */
  temperature?: number;
  /** Ask the model to emit strict JSON (Ollama `format:"json"`). */
  json?: boolean;
  /** Claude model to use when falling back. Defaults to Haiku 4.5. */
  claudeModel?: string;
  /** Override the Ollama model (e.g. "gemma3", "mistral"). Falls back to OLLAMA_MODEL env. */
  ollamaModel?: string;
  /**
   * For growing multi-turn conversations (e.g. the chat avatar): mark the
   * last message of the *previous* turns with an ephemeral `cache_control`
   * breakpoint so resending the full history on each new turn reuses the
   * cached prefix instead of reprocessing it. Ignored by Ollama and when
   * there's only one message.
   */
  cacheConversation?: boolean;
}

export interface AiCompletion {
  text: string;
  source: AiSource;
}

// ---------------------------------------------------------------------------
// Ollama transport (default)
// ---------------------------------------------------------------------------

function ollamaBody(req: AiRequest, stream: boolean) {
  return JSON.stringify({
    model: req.ollamaModel ?? OLLAMA_MODEL,
    stream,
    ...(req.json ? { format: "json" } : {}),
    options: {
      num_predict: req.maxTokens ?? 1024,
      temperature: req.temperature ?? (req.json ? 0.2 : 0.6),
    },
    messages: [{ role: "system", content: req.system }, ...req.messages],
  });
}

async function ollamaComplete(req: AiRequest): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: ollamaBody(req, false),
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ollama_http_${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const data = (await res.json()) as { message?: { content?: string } };
  return data?.message?.content ?? "";
}

async function ollamaStream(req: AiRequest): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: ollamaBody(req, true),
    cache: "no-store",
  });
  if (!res.ok || !res.body) {
    throw new Error(`ollama_http_${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  // Ollama streams newline-delimited JSON objects: {"message":{"content":"…"}}.
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const obj = JSON.parse(trimmed) as { message?: { content?: string } };
            const delta = obj?.message?.content;
            if (delta) controller.enqueue(encoder.encode(delta));
          } catch {
            /* partial / non-JSON keep-alive line — ignore */
          }
        }
      } catch (e) {
        controller.error(e);
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });
}

async function probeOllama(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Claude transport (fallback)
// ---------------------------------------------------------------------------

function claudeModelFor(req: AiRequest): string {
  return req.claudeModel || "claude-haiku-4-5-20251001";
}

// ---------------------------------------------------------------------------
// Prompt caching helpers
// ---------------------------------------------------------------------------
//
// Anthropic's prompt cache is opt-in per content block via
// `cache_control: { type: "ephemeral" }`. A block below the model's minimum
// cacheable size (1024 tokens for Sonnet/Opus, 2048 for Haiku) is simply
// processed normally — marking it is always safe, never an error. We mark:
//   1. The system prompt (or its static prefix, see `cacheableSystemPrefix`)
//      so repeated calls with the same instructions reuse the cached read.
//   2. The last message of the "previous turns" prefix in a growing
//      multi-turn conversation, so resending history each turn is cheap.

type TextBlock = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };

/** Builds the Claude `system` param, splitting off a cacheable prefix if one was provided. */
function claudeSystemParam(req: AiRequest): TextBlock[] {
  const prefix = req.cacheableSystemPrefix;
  if (prefix && req.system.startsWith(prefix)) {
    const suffix = req.system.slice(prefix.length).replace(/^\n+/, "");
    const blocks: TextBlock[] = [{ type: "text", text: prefix, cache_control: { type: "ephemeral" } }];
    if (suffix) blocks.push({ type: "text", text: suffix });
    return blocks;
  }
  // No split requested (or the prefix doesn't actually match) — cache the
  // whole system prompt as a single block.
  return [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }];
}

/** Builds the Claude `messages` param, optionally marking a cache breakpoint at the end of prior turns. */
function claudeMessagesParam(req: AiRequest): Array<{ role: "user" | "assistant"; content: string | TextBlock[] }> {
  const msgs: Array<{ role: "user" | "assistant"; content: string | TextBlock[] }> = req.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  if (req.cacheConversation && msgs.length > 1) {
    const idx = msgs.length - 2; // last message of the previous-turns prefix
    const prior = msgs[idx];
    msgs[idx] = {
      role: prior.role,
      content: [{ type: "text", text: prior.content as string, cache_control: { type: "ephemeral" } }],
    };
  }
  return msgs;
}

async function claudeComplete(req: AiRequest): Promise<string> {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY! });
  const msg = await client.messages.create({
    model: claudeModelFor(req),
    max_tokens: req.maxTokens ?? 1024,
    system: claudeSystemParam(req),
    messages: claudeMessagesParam(req) as any,
  });
  return msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as any).text)
    .join("");
}

function claudeStream(req: AiRequest): ReadableStream<Uint8Array> {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY! });
  const stream = client.messages.stream({
    model: req.claudeModel || "claude-sonnet-4-6",
    max_tokens: req.maxTokens ?? 1024,
    system: claudeSystemParam(req),
    messages: claudeMessagesParam(req) as any,
  });
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        stream.on("text", (delta: string) => controller.enqueue(encoder.encode(delta)));
        await stream.finalMessage();
        controller.close();
      } catch (e: any) {
        const raw = String(e?.message ?? "");
        let note = "\n\n_⚠️ The connection to the AI dropped before finishing. Please try again._";
        if (/credit balance is too low|insufficient_quota/i.test(raw)) {
          note = "\n\n_⚠️ Anthropic credits are exhausted and local Ollama is unreachable._";
        } else if (/invalid x-api-key|authentication/i.test(raw)) {
          note = "\n\n_⚠️ AI authentication failed server-side._";
        } else if (/rate limit|429/i.test(raw)) {
          note = "\n\n_⚠️ The AI is rate-limiting requests right now — give it a moment._";
        }
        controller.enqueue(encoder.encode(note));
        controller.close();
      }
    },
    cancel() {
      stream.controller.abort();
    },
  });
}

async function probeClaude(): Promise<boolean> {
  if (!ANTHROPIC_API_KEY) return false;
  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Non-streaming completion. Tries the preferred provider, then falls back.
 * Returns the raw assistant text plus which provider answered.
 */
export async function aiComplete(req: AiRequest): Promise<AiCompletion> {
  let lastErr = "";
  for (const p of providerOrder()) {
    try {
      if (p === "ollama") {
        return { text: await ollamaComplete(req), source: "ollama-gemma4" };
      }
      if (p === "claude") {
        if (!ANTHROPIC_API_KEY) continue;
        return { text: await claudeComplete(req), source: "claude-live" };
      }
    } catch (e: any) {
      lastErr = String(e?.message ?? e);
    }
  }
  throw new AiUnavailableError(
    ANTHROPIC_API_KEY ? "all_providers_failed" : "ollama_unreachable_no_fallback",
    lastErr || "No AI provider was reachable (local Ollama + Claude fallback both unavailable).",
  );
}

/**
 * Streaming completion. Returns a byte stream of raw text deltas plus the
 * provider that produced it. Falls back to Claude if Ollama can't be reached
 * at connection time.
 */
export async function aiStream(req: AiRequest, preferredOverride?: ProviderId): Promise<{ stream: ReadableStream<Uint8Array>; source: AiSource }> {
  const order: ProviderId[] = preferredOverride
    ? preferredOverride === "claude" ? ["claude", "ollama"] : ["ollama", "claude"]
    : providerOrder();
  let lastErr = "";
  for (const p of order) {
    try {
      if (p === "ollama") {
        return { stream: await ollamaStream(req), source: "ollama-gemma4" };
      }
      if (p === "claude") {
        if (!ANTHROPIC_API_KEY) continue;
        return { stream: claudeStream(req), source: "claude-live" };
      }
    } catch (e: any) {
      lastErr = String(e?.message ?? e);
    }
  }
  throw new AiUnavailableError(
    ANTHROPIC_API_KEY ? "all_providers_failed" : "ollama_unreachable_no_fallback",
    lastErr || "No AI provider was reachable (local Ollama + Claude fallback both unavailable).",
  );
}

export interface ProbeResult {
  available: boolean;
  provider?: AiSource;
  reason?: string;
  model: string;
  baseUrl: string;
}

/** Reports whether any provider is reachable, preferring the configured one. */
export async function probeProviders(): Promise<ProbeResult> {
  for (const p of providerOrder()) {
    if (p === "ollama" && (await probeOllama())) {
      return { available: true, provider: "ollama-gemma4", model: OLLAMA_MODEL, baseUrl: OLLAMA_BASE_URL };
    }
    if (p === "claude" && (await probeClaude())) {
      return { available: true, provider: "claude-live", model: "claude-haiku-4-5", baseUrl: OLLAMA_BASE_URL };
    }
  }
  return {
    available: false,
    reason: ANTHROPIC_API_KEY ? "no_provider_reachable" : "ollama_unreachable_and_no_api_key",
    model: OLLAMA_MODEL,
    baseUrl: OLLAMA_BASE_URL,
  };
}

/**
 * Pull a JSON value out of a model response. Handles the three cases that
 * routinely break a naive JSON.parse:
 *   1. ```json … ``` markdown fences,
 *   2. narration text BEFORE the JSON — common when the model used a tool
 *      (e.g. web_search) and emitted "Let me look this up…" text blocks that
 *      get concatenated ahead of the final JSON,
 *   3. trailing prose AFTER the closing brace.
 * Returns the best-effort JSON substring (still a string — the caller parses).
 */
export function extractJson(text: string): string {
  let s = (text ?? "").trim();

  // 1) Prefer the contents of a fenced code block if one is present anywhere.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  // 2) Slice from the first JSON opener to its balanced closer, ignoring
  //    braces/brackets that appear inside string literals.
  const objAt = s.indexOf("{");
  const arrAt = s.indexOf("[");
  const start = objAt === -1 ? arrAt : arrAt === -1 ? objAt : Math.min(objAt, arrAt);
  if (start === -1) return s;

  const open = s[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }

  // Unbalanced (likely truncated output) — return from the opener onward and
  // let the caller's JSON.parse surface the failure.
  return s.slice(start);
}

/**
 * Best-effort cleanup for near-miss JSON text that `JSON.parse` would
 * otherwise reject outright. Intended as a last-resort fallback layer AFTER
 * `extractJson` has already sliced out the JSON substring — not a full
 * parser, just fixes for the handful of mistakes small/fast models
 * (e.g. Haiku) routinely make when asked to emit strict JSON amid other
 * tool-use context:
 *   1. Smart/curly quotes (‘ ’ “ ”) → straight quotes.
 *   2. Trailing commas before a closing `}` or `]`.
 * Returns a new string; does not mutate the input.
 */
export function repairJsonLenient(text: string): string {
  let s = text ?? "";
  // Normalize smart quotes to straight quotes.
  s = s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  // Remove trailing commas before a closing brace/bracket (with optional
  // whitespace/newlines in between).
  s = s.replace(/,(\s*[}\]])/g, "$1");
  return s;
}
