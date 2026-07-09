"use client";

/**
 * AiChatPanel v2 — voice input, TTS, Ollama progress bar with soothing animation.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, Send, X, RotateCcw, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { useAiStatus } from "@/lib/ai-status";
import { useAiModelPref } from "@/lib/ai-model-pref";
import ModelPicker from "./ModelPicker";
import type { ThrowTarget } from "./HumanoidDragAgent";
import type { Profile } from "@/lib/types";

type Role = "user" | "assistant";
interface ChatMsg { id: string; role: Role; content: string; pending?: boolean; error?: boolean; }

export interface AiChatPanelProps {
  snapshot?: unknown;
  snapshotLabel?: string | null;
  pendingTarget?: ThrowTarget | null;
  onConsumeTarget?: () => void;
  quickActions?: Array<{ label: string; sub?: string; prompt: string }>;
  provider?: "ollama" | "gemini" | "claude";
  ollamaModel?: string;
  hideHeader?: boolean;
  autoActivateMic?: boolean;
  onMicConsumed?: () => void;
  /** User profile — injected into system prompt so Fin knows who it's talking to. */
  profile?: Profile | null;
  /** Full financial plan context (incomes, expenses, debts, investments, etc.) — blended
   *  directly into the system prompt memory layer so Gemma4 has all figures upfront. */
  fullPlanContext?: string;
}

// ── Conversation memory (sessionStorage) ─────────────────────────────────────
const MEMORY_KEY = "fin_chat_memory_v1";
const MAX_MEMORY_MSGS = 40;

function loadMemory(): ChatMsg[] {
  try {
    const raw = sessionStorage.getItem(MEMORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMsg[];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveMemory(msgs: ChatMsg[]) {
  try {
    sessionStorage.setItem(MEMORY_KEY, JSON.stringify(
      msgs.filter(m => !m.pending && !m.error).slice(-MAX_MEMORY_MSGS)
    ));
  } catch { /* quota exceeded — non-fatal */ }
}

export function clearFinMemory() {
  try { sessionStorage.removeItem(MEMORY_KEY); } catch { /* noop */ }
}

// ── System prompt builders ────────────────────────────────────────────────────
function buildProfileSection(profile: Profile | null | undefined): string {
  if (!profile) return "";
  const parts: string[] = [];
  if (profile.fullName) parts.push(`Name: ${profile.fullName}`);
  if (profile.dateOfBirth) {
    const age = Math.floor((Date.now() - new Date(profile.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000));
    parts.push(`Age: ${age} (DOB: ${profile.dateOfBirth})`);
  }
  if (profile.retirementAge) parts.push(`Target retirement age: ${profile.retirementAge}`);
  if (profile.lifeExpectancy) parts.push(`Life expectancy: ${profile.lifeExpectancy}`);
  if (profile.maritalStatus) parts.push(`Marital status: ${profile.maritalStatus}`);
  if (profile.country) parts.push(`Country: ${profile.country}`);
  if (profile.riskProfile) parts.push(`Risk profile: ${profile.riskProfile}`);
  if (profile.emergencyFundTargetMonths) parts.push(`Emergency fund target: ${profile.emergencyFundTargetMonths} months`);
  if (profile.targetMinCashBalance) parts.push(`Min cash balance target: ฿${profile.targetMinCashBalance.toLocaleString()}`);
  if (profile.currentCashBalance) parts.push(`Current cash balance: ฿${profile.currentCashBalance.toLocaleString()}`);
  if (profile.householdNotes) parts.push(`Household notes: ${profile.householdNotes}`);
  if (profile.notes) parts.push(`Personal notes: ${profile.notes}`);
  return parts.length > 0 ? `[USER PROFILE]\n${parts.join("\n")}` : "";
}

function buildMemorySection(msgs: ChatMsg[]): string {
  const prior = msgs.filter(m => m.role !== "assistant" || !m.content.startsWith("Hey — I'm Fin"));
  if (prior.length === 0) return "";
  const lines = prior.map(m =>
    `${m.role === "user" ? "User" : "Fin"}: ${m.content.slice(0, 300)}${m.content.length > 300 ? "…" : ""}`
  );
  return `[CONVERSATION MEMORY — earlier in this session]\n${lines.join("\n")}\n[End of memory]`;
}

const DEFAULT_QUICK_ACTIONS: AiChatPanelProps["quickActions"] = [
  { label: "Where am I overspending?", sub: "scan this month", prompt: "Looking at this month, where am I overspending the most — and by how much?" },
  { label: "How do I close the gap?", sub: "savings target", prompt: "What's the fastest realistic way to close my savings gap this month without touching essentials?" },
  { label: "What's trending?", sub: "last 6 months", prompt: "What's the trend in my spending over the last few months — anything I should worry about?" },
  { label: "Top merchants", sub: "biggest line items", prompt: "Which merchants are eating the most of my budget this month, and are any of them worth cutting?" },
];

const OLLAMA_WAIT_MESSAGES = [
  "Fin is reading your data…",
  "Running models locally — no cloud needed…",
  "Crunching numbers on your device…",
  "Almost there, thinking carefully…",
  "Local AI takes a moment — worth the privacy…",
  "Fin is piecing it all together…",
  "Processing your financial picture…",
  "Just a few more seconds…",
];

let idCounter = 0;
const nextId = () => `m${Date.now()}_${idCounter++}`;

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
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4)
      return <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>;
    if (p.startsWith("_") && p.endsWith("_") && p.length > 2)
      return <em key={i} className="opacity-70">{p.slice(1, -1)}</em>;
    return <span key={i}>{p}</span>;
  });
}

const WAVE_HEIGHTS = [0.35, 0.65, 1, 0.8, 0.5, 0.9, 0.4, 0.75, 1, 0.6, 0.3, 0.7, 0.45];
const WAVE_COLORS = ["#3b82f6", "#22c55e", "#a78bfa", "#0ea5e9", "#34d399"];
const MIC_WAVE = [0.5, 1, 0.7, 0.9, 0.4, 0.8, 0.6];

export function AiChatPanel({
  snapshot, snapshotLabel, pendingTarget, onConsumeTarget,
  quickActions = DEFAULT_QUICK_ACTIONS,
  provider = "gemini",
  ollamaModel = "gemma4",
  hideHeader = false,
  autoActivateMic = false,
  onMicConsumed,
  profile,
  fullPlanContext,
}: AiChatPanelProps) {
  const { available: aiAvailable } = useAiStatus();

  // User's model choice from the shared ModelPicker. "auto" defers to the
  // `provider` prop; anything else overrides it for every send.
  const [modelPref] = useAiModelPref();
  const effProvider: "ollama" | "gemini" | "claude" = modelPref === "auto" ? provider : modelPref;

  const WELCOME_MSG: ChatMsg = {
    id: nextId(), role: "assistant",
    content: "Hey — I’m Fin. Drag my avatar onto any card or chart and let go to ask about it, or just type a question below. I can see this month’s actuals, your budget gaps, and recent trends.",
  };

  // Restore conversation from sessionStorage on first mount
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    const prior = loadMemory();
    return prior.length > 0 ? prior : [WELCOME_MSG];
  });

  // Persist messages to sessionStorage on every change
  useEffect(() => { saveMemory(messages); }, [messages]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [listening, setListening] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const srRef = useRef<{ stop: () => void } | null>(null);

  const [ollamaProgress, setOllamaProgress] = useState(0);
  const [ollamaMsg, setOllamaMsg] = useState("");
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  // ── Progress bar ───────────────────────────────────────────────
  const startProgressBar = useCallback(() => {
    setOllamaProgress(0);
    let p = 0, msgIdx = 0;
    setOllamaMsg(OLLAMA_WAIT_MESSAGES[0]);
    progressTimer.current = setInterval(() => {
      const inc = p < 30 ? 2.8 : p < 60 ? 1.4 : p < 80 ? 0.7 : p < 90 ? 0.2 : 0.04;
      p = Math.min(90, p + inc);
      setOllamaProgress(p);
    }, 120);
    msgTimer.current = setInterval(() => {
      msgIdx = (msgIdx + 1) % OLLAMA_WAIT_MESSAGES.length;
      setOllamaMsg(OLLAMA_WAIT_MESSAGES[msgIdx]);
    }, 2800);
  }, []);

  const stopProgressBar = useCallback((success = true) => {
    if (progressTimer.current) { clearInterval(progressTimer.current); progressTimer.current = null; }
    if (msgTimer.current) { clearInterval(msgTimer.current); msgTimer.current = null; }
    if (success) { setOllamaProgress(100); setTimeout(() => setOllamaProgress(0), 600); }
    else setOllamaProgress(0);
    setOllamaMsg("");
  }, []);

  // ── TTS ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ttsEnabled || streaming) return;
    const last = [...messages].reverse().find(m => m.role === "assistant" && !m.pending && m.content);
    if (!last?.content || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(last.content.replace(/\*\*/g, "").replace(/_/g, ""));
    utt.rate = 1.1;
    window.speechSynthesis.speak(utt);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, ttsEnabled, streaming]);

  // ── Voice input ────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    srRef.current?.stop();
    srRef.current = null;
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const sr = new SR() as any;
    sr.continuous = true;
    sr.interimResults = true;
    sr.lang = "th-TH,en-US";
    sr.onresult = (e: any) => {
      const t = Array.from(e.results as any[]).map((r: any) => r[0].transcript).join("");
      setInput(t);
    };
    sr.onend = () => setListening(false);
    sr.start();
    srRef.current = sr;
    setListening(true);
  }, []);

  const toggleMic = useCallback(() => {
    if (listening) stopListening(); else startListening();
  }, [listening, startListening, stopListening]);

  useEffect(() => {
    if (!autoActivateMic) return;
    onMicConsumed?.();
    const t = setTimeout(startListening, 450);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoActivateMic]);

  // ── Send ───────────────────────────────────────────────────────
  const send = useCallback(async (text: string, action?: ThrowTarget | null) => {
    const trimmed = text.trim();
    if (!trimmed && !action) return;
    if (streaming) return;
    if (listening) stopListening();

    const userMsg: ChatMsg = { id: nextId(), role: "user", content: trimmed || `(landed on: ${action?.label})` };
    const assistantId = nextId();
    setMessages(prev => [...prev, userMsg, { id: assistantId, role: "assistant", content: "", pending: true }]);
    setInput("");
    setStreaming(true);
    if (effProvider === "ollama") startProgressBar();

    const controller = new AbortController();
    abortRef.current = controller;

    const apiMessages = [...messages, userMsg]
      .filter(m => !m.pending)
      .map(m => ({ role: m.role, content: m.content }));

    function buildUserTurn(content: string): string {
      const parts: string[] = [];
      if (action?.action) {
        const label = action.label ? ` "${action.label}"` : "";
        const ctx = action.context ? ` — ${action.context}` : "";
        parts.push(`[CONTEXT: The user dragged the assistant avatar and dropped it on a ${action.action}${label}${ctx}. Open by acknowledging this specific thing.]`);
      }
      if (snapshot && typeof snapshot === "object")
        parts.push(`[FINANCIAL SNAPSHOT — current account/month, THB]\n${JSON.stringify(snapshot)}`);
      parts.push(content?.trim() || "(no message — just react to the context above)");
      return parts.join("\n\n");
    }

    const enrichedMessages = apiMessages.map((m, i) =>
      i === apiMessages.length - 1 && m.role === "user"
        ? { ...m, content: buildUserTurn(m.content) } : m
    );

    const profileSection = buildProfileSection(profile);
    const memorySection = buildMemorySection([...messages, userMsg].slice(0, -1));
    const SYSTEM_PROMPT = [
      `You are "Fin", the in-app AI assistant for Financial 101 Master — a personal finance planner for a Thai household. You live inside the app as a friendly floating avatar that users can drag onto charts, stat cards, and table rows to ask about what they're looking at.`,
      profileSection,
      fullPlanContext ?? "",
      memorySection,
      `Ground rules:\n- You are a knowledgeable peer, not a licensed advisor. Never present output as formal financial, investment, tax, or legal advice.\n- If USER PROFILE is present, address the user by name and factor in their age, retirement timeline, and risk profile.\n- If FINANCIAL PLAN is present, use ALL those figures to give precise, personalised answers — reference actual income sources, debt names, investment accounts, and scenario assumptions.\n- If CONVERSATION MEMORY is present, maintain continuity — don't repeat yourself or re-introduce yourself.\n- Always reason from the FINANCIAL SNAPSHOT block when present for the current month's actuals. Cite real THB numbers, never invent figures.\n- If dropped on a UI element, open by acknowledging that specific thing.\n- Be conversational, warm, and concise — 2-5 short paragraphs or a short list. Bold key numbers.\n- Currency is THB (฿). Thailand-aware (PVD/RMF/SSF, Thai inflation, Bangkok cost of living, Thai tax brackets).`,
    ].filter(Boolean).join("\n\n");

    try {
      if (effProvider === "ollama") {
        const res = await fetch("http://localhost:11434/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            model: ollamaModel, stream: true,
            options: { num_predict: 1024, temperature: 0.6 },
            messages: [{ role: "system", content: SYSTEM_PROMPT }, ...enrichedMessages],
          }),
        });

        if (!res.ok || !res.body) throw new Error(`Ollama returned ${res.status}.`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "", buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const t = line.trim();
            if (!t) continue;
            try {
              const obj = JSON.parse(t) as { message?: { content?: string } };
              const delta = obj?.message?.content;
              if (delta) {
                acc += delta;
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: acc, pending: false } : m));
              }
            } catch { /* partial line */ }
          }
        }
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, pending: false } : m));
        stopProgressBar(true);

      } else {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            messages: apiMessages, context: snapshot ?? null,
            action: action ? { type: action.action, label: action.label, context: action.context } : undefined,
            provider: effProvider, // "gemini" | "claude" — ollama path handled above
            profile: profile ?? null,
            fullPlanContext: fullPlanContext ?? null,
          }),
        });

        if (!res.ok || !res.body) {
          let reason = "unknown";
          try { reason = (await res.json())?.message ?? reason; } catch { /* ignore */ }
          setMessages(prev => prev.map(m => m.id === assistantId
            ? { ...m, pending: false, error: true, content: `I couldn't reach Claude just now (${reason}).` }
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
      }

    } catch (e: any) {
      if (e?.name === "AbortError") { stopProgressBar(false); return; }
      const isOllamaErr = effProvider === "ollama" &&
        (e?.message?.includes("Failed to fetch") || e?.message?.includes("Ollama") || e?.message?.includes("fetch"));
      stopProgressBar(false);
      setMessages(prev => prev.map(m => m.id === assistantId
        ? {
            ...m, pending: false, error: true,
            content: isOllamaErr
              ? `Ollama isn’t reachable at localhost:11434.\n\n**Why does local AI take time?** Ollama loads a full AI model into your computer’s RAM — first response can take 10–30 s while the model warms up, then it gets faster.\n\n**To fix:** open a terminal and run \`ollama serve\`, then set \`OLLAMA_ORIGINS=*\`. Or switch to **Anthropic Claude** in the dropdown — instant, no setup.`
              : "Something interrupted that response — give it another try.",
          }
        : m));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [messages, snapshot, streaming, effProvider, ollamaModel, listening, stopListening, startProgressBar, stopProgressBar]);

  useEffect(() => {
    if (!pendingTarget) return;
    send(`What can you tell me about this — ${pendingTarget.label}?`, pendingTarget);
    onConsumeTarget?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTarget]);

  const stop = useCallback(() => { abortRef.current?.abort(); stopProgressBar(false); }, [stopProgressBar]);
  const reset = useCallback(() => {
    abortRef.current?.abort();
    stopProgressBar(false);
    clearFinMemory();
    setMessages([{ id: nextId(), role: "assistant", content: "Memory cleared — fresh start. What would you like to dig into?" }]);
  }, [stopProgressBar]);

  const onSubmit = useCallback((e: React.FormEvent) => { e.preventDefault(); send(input); }, [input, send]);

  const showProgress = streaming && effProvider === "ollama" && ollamaProgress > 0 && ollamaProgress < 100;

  return (
    <div className="ai-chat-panel flex flex-col flex-1 min-h-0 rounded-xl overflow-hidden border" style={{ background: "rgba(15,23,42,0.55)", borderColor: "rgba(96,165,250,0.16)" }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes aiDotPulse{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}
        @keyframes aiProgressShimmer{0%{background-position:-200% center}100%{background-position:200% center}}
        @keyframes aiWaveBar{0%,100%{transform:scaleY(0.28)}50%{transform:scaleY(1)}}
        @keyframes aiMsgFade{0%{opacity:0;transform:translateY(3px)}100%{opacity:1;transform:translateY(0)}}
        @keyframes aiPulseRing{0%{transform:scale(1);opacity:.9}100%{transform:scale(2.4);opacity:0}}
      ` }} />

      {/* Header */}
      {!hideHeader && (
        <div className="flex items-center justify-between px-3 py-2 border-b shrink-0" style={{ borderColor: "rgba(96,165,250,0.12)" }}>
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-3.5 w-3.5 shrink-0" style={{ color: "#60a5fa" }} />
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate" style={{ color: "#cbd5e1" }}>Fin — AI Assistant</div>
              {snapshotLabel && <div className="text-[10px] truncate" style={{ color: "#64748b" }}>{snapshotLabel}</div>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <ModelPicker bare className="mr-1" />
            {streaming && (
              <button onClick={stop} className="rounded-md p-1.5 transition-colors hover:bg-white/10" title="Stop">
                <X className="h-3.5 w-3.5" style={{ color: "#94a3b8" }} />
              </button>
            )}
            <button onClick={() => setTtsEnabled(v => !v)} className="rounded-md p-1.5 transition-colors hover:bg-white/10" title={ttsEnabled ? "Mute" : "Read aloud"}>
              {ttsEnabled ? <Volume2 className="h-3.5 w-3.5" style={{ color: "#60a5fa" }} /> : <VolumeX className="h-3.5 w-3.5" style={{ color: "#475569" }} />}
            </button>
            <button onClick={reset} className="rounded-md p-1.5 transition-colors hover:bg-white/10" title="Clear">
              <RotateCcw className="h-3.5 w-3.5" style={{ color: "#94a3b8" }} />
            </button>
          </div>
        </div>
      )}

      {!aiAvailable && (
        <div className="px-3 py-1.5 text-[10px] shrink-0" style={{ background: "rgba(245,158,11,0.1)", color: "#fbbf24", borderBottom: "1px solid rgba(245,158,11,0.2)" }}>
          Live AI looks unavailable — I'll still try, but local insights on this page are a safe fallback.
        </div>
      )}

      {/* Ollama progress bar */}
      {showProgress && (
        <div className="shrink-0 px-3 pt-2.5 pb-2" style={{ borderBottom: "1px solid rgba(96,165,250,0.1)", background: "rgba(10,18,35,0.7)" }}>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="relative shrink-0" style={{ width: 10, height: 10 }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#22c55e", animation: "aiPulseRing 1.4s ease-out infinite" }} />
              <div style={{ position: "absolute", inset: 2, borderRadius: "50%", background: "#22c55e" }} />
            </div>
            <span key={ollamaMsg} className="text-[10px] flex-1 truncate" style={{ color: "#94a3b8", animation: "aiMsgFade 0.35s ease-out" }}>{ollamaMsg}</span>
            <span className="text-[10px] font-semibold tabular-nums shrink-0" style={{ color: "#22c55e" }}>{Math.round(ollamaProgress)}%</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.07)", overflow: "hidden", marginBottom: 7 }}>
            <div style={{
              height: "100%", borderRadius: 2, width: `${ollamaProgress}%`,
              transition: "width 0.12s linear",
              background: "linear-gradient(90deg,#1d4ed8,#0ea5e9,#22c55e,#0ea5e9,#1d4ed8)",
              backgroundSize: "200% 100%",
              animation: "aiProgressShimmer 1.8s linear infinite",
            }} />
          </div>
          <div className="flex items-end justify-center gap-[3px]" style={{ height: 18 }}>
            {WAVE_HEIGHTS.map((h, i) => (
              <div key={i} style={{
                width: 3, borderRadius: 2, height: `${Math.round(h * 15)}px`,
                background: WAVE_COLORS[i % 5],
                animation: `aiWaveBar ${0.72 + i * 0.08}s ease-in-out infinite`,
                animationDelay: `${i * 0.06}s`,
                transformOrigin: "bottom",
              }} />
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 space-y-2.5 text-[12.5px] leading-relaxed">
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[88%] rounded-2xl px-3 py-2"
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
              <button key={i} disabled={streaming} onClick={() => send(qa.prompt)}
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

      {/* Mic waveform */}
      {listening && (
        <div className="px-3 pb-1.5 shrink-0">
          <div className="flex items-center gap-2 rounded-lg px-3 py-1.5" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }}>
            <div className="flex items-end gap-[2px]" style={{ height: 14 }}>
              {MIC_WAVE.map((h, i) => (
                <div key={i} style={{
                  width: 3, borderRadius: 2, height: `${Math.round(h * 12)}px`, background: "#ef4444",
                  animation: `aiWaveBar ${0.5 + i * 0.07}s ease-in-out infinite`,
                  animationDelay: `${i * 0.05}s`, transformOrigin: "bottom",
                }} />
              ))}
            </div>
            <span className="text-[10px]" style={{ color: "#fca5a5" }}>Listening…</span>
            <button onClick={stopListening} className="ml-auto" style={{ color: "#ef4444" }} title="Stop mic"><X className="h-3 w-3" /></button>
          </div>
        </div>
      )}

      {/* Input bar */}
      <form onSubmit={onSubmit} className="flex items-center gap-1.5 px-3 py-2.5 border-t shrink-0" style={{ borderColor: "rgba(96,165,250,0.12)" }}>
        <button type="button" onClick={toggleMic} disabled={streaming}
          title={listening ? "Stop mic" : "Speak your question"}
          className="shrink-0 rounded-full p-2 transition-all disabled:opacity-30"
          style={{
            background: listening ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.05)",
            border: listening ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {listening
            ? <MicOff className="h-3.5 w-3.5" style={{ color: "#ef4444" }} />
            : <Mic className="h-3.5 w-3.5" style={{ color: "#64748b" }} />}
        </button>
        <input
          value={input} onChange={e => setInput(e.target.value)}
          placeholder={listening ? "Listening — speak now…" : "Ask Fin about your spending…"}
          disabled={streaming}
          className="flex-1 min-w-0 rounded-full px-3.5 py-2 text-[12.5px] outline-none disabled:opacity-50"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}
        />
        <button type="submit" disabled={streaming || !input.trim()}
          className="shrink-0 rounded-full p-2 transition-colors disabled:opacity-30"
          style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }} title="Send"
        >
          <Send className="h-4 w-4 text-white" />
        </button>
      </form>
    </div>
  );
}

function Dot({ delay = "0s" }: { delay?: string }) {
  return (
    <span className="inline-block h-1.5 w-1.5 rounded-full"
      style={{ background: "currentColor", animation: "aiDotPulse 1s ease-in-out infinite", animationDelay: delay }}
    />
  );
}
