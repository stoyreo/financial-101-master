"use client";

/**
 * AiChatPanel
 *
 * Chat surface for the AI Avatar — ported from OTIF_AI_Chat_Panel.html's
 * #messages / quick-actions / input bar, but wired to a REAL streaming
 * Claude backend (/api/ai/chat) instead of OTIF's local pattern-matching
 * `generateResponse()` typed out char-by-char to *look* like streaming.
 *
 * Renders true incremental tokens as they arrive from the server.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, Send, X, RotateCcw } from "lucide-react";
import { useAiStatus } from "@/lib/ai-status";
import type { ThrowTarget } from "./HumanoidDragAgent";

export interface AiChatPanelProps {
  /** Compact financial snapshot forwarded to the model as `context`. */
  snapshot?: unknown;
  /** One-line description of what the snapshot covers, shown in the header. */
  snapshotLabel?: string | null;
  /** Set when the avatar lands on something — seeds a contextual turn. */
  pendingTarget?: ThrowTarget | null;
  /** Called once the pending target has been consumed (sent or discarded). */
  onConsumeTarget?: () => void;
  /** Quick-action prompts shown above the input. */
  quickActions?: Array<{ label: string; sub?: string; prompt: string }>;
  /** AI provider to use ("ollama" | "claude"). Defaults to "ollama". */
  provider?: "ollama" | "claude";
  /** Ollama model name. Defaults to "gemma4". */
  ollamaModel?: string;
  /** Hide the inner panel header (use when the parent already renders a title). */
  hideHeader?: boolean;
}

type Role = "user" | "assistant";
interface ChatMsg { id: string; role: Role; content: string; pending?: boolean; error?: boolean; }

const DEFAULT_QUICK_ACTIONS: AiChatPanelProps["quickActions"] = [
  { label: "Where am I overspending?", sub: "scan this month", prompt: "Looking at this month, where am I overspending the most — and by how much?" },
  { label: "How do I close the gap?", sub: "savings target", prompt: "What's the fastest realistic way to close my savings gap this month without touching essentials?" },
  { label: "What's trending?", sub: "last 6 months", prompt: "What's the trend in my spending over the last few months — anything I should worry about?" },
  { label: "Top merchants", sub: "biggest line items", prompt: "Which merchants are eating the most of my budget this month, and are any of them worth cutting?" },
];

let idCounter = 0;
const nextId = () => `m${Date.now()}_${idCounter++}`;

/** Tiny markdown-lite renderer — bold, bullet lists, paragraphs. No deps, no dangerouslySetInnerHTML. */
function MarkdownLite({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter(l => l.trim().length > 0);
        const isList = lines.length > 0 && lines.every(l => /^[-*]\s+/.test(l.trim()));
        if (isList) {
          return (
            <ul key={bi} className="list-disc pl-4 space-y-0.5 my-1">
              {lines.map((l, li) => <li key={li}>{renderInline(l.replace(/^[-*]\s+/, ""))}</li>)}
            </ul>
          );
        }
        return <p key={bi} className="my-1 first:mt-0 last:mb-0">{lines.map((l, li) => <span key={li}>{li > 0 && <br />}{renderInline(l)}</span>)}</p>;
      })}
    </>
  );
}

function renderInline(line: string) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) {
      return <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>;
    }
    if (p.startsWith("_") && p.endsWith("_") && p.length > 2) {
      return <em key={i} className="opacity-70">{p.slice(1, -1)}</em>;
    }
    return <span key={i}>{p}</span>;
  });
}

export function AiChatPanel({
  snapshot, snapshotLabel, pendingTarget, onConsumeTarget,
  quickActions = DEFAULT_QUICK_ACTIONS,
  provider = "ollama",
  ollamaModel = "gemma4",
  hideHeader = false,
}: AiChatPanelProps) {
  const { available: aiAvailable } = useAiStatus();
  const [messages, setMessages] = useState<ChatMsg[]>([{
    id: nextId(),
    role: "assistant",
    content: "Hey — I'm Fin. Drag my avatar onto any card or chart and let go to ask about it, or just type a question below. I can see this month's actuals, your budget gaps, and recent trends.",
  }]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const send = useCallback(async (text: string, action?: ThrowTarget | null) => {
    const trimmed = text.trim();
    if (!trimmed && !action) return;
    if (streaming) return;

    const userMsg: ChatMsg = { id: nextId(), role: "user", content: trimmed || `(landed on: ${action?.label})` };
    const assistantId = nextId();
    setMessages(prev => [...prev, userMsg, { id: assistantId, role: "assistant", content: "", pending: true }]);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: [...messages, userMsg]
            .filter(m => !m.pending)
            .map(m => ({ role: m.role, content: m.content })),
          context: snapshot ?? null,
          action: action ? { type: action.action, label: action.label, context: action.context } : undefined,
          provider,
          model: provider === "ollama" ? ollamaModel : undefined,
        }),
      });

      if (!res.ok || !res.body) {
        let reason = "unknown";
        try { reason = (await res.json())?.message ?? reason; } catch { /* ignore */ }
        setMessages(prev => prev.map(m => m.id === assistantId
          ? { ...m, pending: false, error: true, content: `I couldn't reach Claude just now (${reason}). Local insights are still available from the regular AI buttons on this page.` }
          : m));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: acc, pending: false } : m));
      }
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, pending: false } : m));
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setMessages(prev => prev.map(m => m.id === assistantId
        ? { ...m, pending: false, error: true, content: "Something interrupted that response — give it another try when you're ready." }
        : m));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [messages, snapshot, streaming, provider, ollamaModel]);

  // When the avatar lands on something, open a contextual turn automatically.
  useEffect(() => {
    if (!pendingTarget) return;
    const prompt = `What can you tell me about this — ${pendingTarget.label}?`;
    send(prompt, pendingTarget);
    onConsumeTarget?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTarget]);

  const stop = useCallback(() => { abortRef.current?.abort(); }, []);
  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([{ id: nextId(), role: "assistant", content: "Cleared — what would you like to dig into?" }]);
  }, []);

  const onSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  }, [input, send]);

  return (
    <div className="ai-chat-panel flex flex-col h-full min-h-0 rounded-xl overflow-hidden border" style={{ background: "rgba(15,23,42,0.55)", borderColor: "rgba(96,165,250,0.16)" }}>
      <style dangerouslySetInnerHTML={{ __html: "@keyframes aiDotPulse { 0%,80%,100% { opacity:.25; transform: translateY(0);} 40% { opacity:1; transform: translateY(-2px);} }" }} />
      {/* Header */}
      {!hideHeader && <div className="flex items-center justify-between px-3 py-2 border-b shrink-0" style={{ borderColor: "rgba(96,165,250,0.12)" }}>
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-3.5 w-3.5 shrink-0" style={{ color: "#60a5fa" }} />
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate" style={{ color: "#cbd5e1" }}>Fin — AI Assistant</div>
            {snapshotLabel && <div className="text-[10px] truncate" style={{ color: "#64748b" }}>{snapshotLabel}</div>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {streaming && (
            <button onClick={stop} className="rounded-md p-1.5 transition-colors hover:bg-white/10" title="Stop">
              <X className="h-3.5 w-3.5" style={{ color: "#94a3b8" }} />
            </button>
          )}
          <button onClick={reset} className="rounded-md p-1.5 transition-colors hover:bg-white/10" title="Clear conversation">
            <RotateCcw className="h-3.5 w-3.5" style={{ color: "#94a3b8" }} />
          </button>
        </div>
      </div>

      {!aiAvailable && (
        <div className="px-3 py-1.5 text-[10px] shrink-0" style={{ background: "rgba(245,158,11,0.1)", color: "#fbbf24", borderBottom: "1px solid rgba(245,158,11,0.2)" }}>
          Live AI looks unavailable right now — I'll still try, but local insights elsewhere on this page are a safe fallback.
        </div>
      )}

      {/* Messages */}
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 space-y-2.5 text-[12.5px] leading-relaxed">
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[88%] rounded-2xl px-3 py-2"
              style={m.role === "user"
                ? { background: "linear-gradient(135deg,#2563eb,#1d4ed8)", color: "#eff6ff", borderBottomRightRadius: 4 }
                : { background: "rgba(255,255,255,0.05)", color: m.error ? "#fca5a5" : "#e2e8f0", border: "1px solid rgba(255,255,255,0.06)", borderBottomLeftRadius: 4 }}
            >
              {m.content
                ? <MarkdownLite text={m.content} />
                : m.pending
                  ? <span className="inline-flex gap-1 items-center" style={{ color: "#64748b" }}>
                      <Dot /><Dot delay="0.15s" /><Dot delay="0.3s" />
                    </span>
                  : null}
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      {messages.length <= 2 && (
        <div className="px-3 pb-2 shrink-0">
          <div className="grid grid-cols-2 gap-1.5">
            {quickActions!.slice(0, 4).map((qa, i) => (
              <button
                key={i}
                disabled={streaming}
                onClick={() => send(qa.prompt)}
                className="text-left rounded-lg px-2.5 py-2 text-[10px] font-semibold transition-colors disabled:opacity-40"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(37,99,235,0.25)", color: "#93c5fd" }}
              >
                {qa.label}
                {qa.sub && <span className="block text-[9px] font-medium mt-0.5 truncate" style={{ color: "#475569" }}>{qa.sub}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={onSubmit} className="flex items-center gap-2 px-3 py-2.5 border-t shrink-0" style={{ borderColor: "rgba(96,165,250,0.12)" }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask Fin about your spending…"
          disabled={streaming}
          className="flex-1 min-w-0 rounded-full px-3.5 py-2 text-[12.5px] outline-none disabled:opacity-50"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="shrink-0 rounded-full p-2 transition-colors disabled:opacity-30"
          style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}
          title="Send"
        >
          <Send className="h-4 w-4 text-white" />
        </button>
      </form>
    </div>
  );
}

function Dot({ delay = "0s" }: { delay?: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{ background: "currentColor", animation: "aiDotPulse 1s ease-in-out infinite", animationDelay: delay }}
    />
  );
}
