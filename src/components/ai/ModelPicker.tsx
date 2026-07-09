"use client";

/**
 * ModelPicker — compact dropdown rendered next to every AI trigger button so
 * the user can choose which model answers BEFORE hitting the button.
 *
 * The selection is shared app-wide via src/lib/ai-model-pref.ts (all pickers
 * stay in sync) and reaches the server as an `x-ai-provider` header.
 *
 * Options:
 *   auto   — server default fallback chain: Ollama → Gemini → Claude
 *   ollama — local Gemma via Ollama (hidden when `visionOnly`, no image support)
 *   gemini — Google Gemini Flash (free tier)
 *   claude — Anthropic Claude (paid API)
 */

import { Cpu } from "lucide-react";
import { useAiModelPref, type AiModelPref } from "@/lib/ai-model-pref";

export interface ModelPickerProps {
  /** Hide the local Ollama option (image/PDF routes — local Gemma is text-only). */
  visionOnly?: boolean;
  /** Extra classes for the wrapper. */
  className?: string;
  /** Hide the little CPU icon + label, select only. */
  bare?: boolean;
}

const LABELS: Record<AiModelPref, string> = {
  auto: "Auto",
  ollama: "Gemma (local)",
  gemini: "Gemini Flash (free)",
  claude: "Claude",
};

export default function ModelPicker({ visionOnly, className, bare }: ModelPickerProps) {
  const [pref, setPref] = useAiModelPref();
  const options: AiModelPref[] = visionOnly
    ? ["auto", "gemini", "claude"]
    : ["auto", "ollama", "gemini", "claude"];

  // If a text-only pick (ollama) is carried into a vision context, show Auto.
  const value = visionOnly && pref === "ollama" ? "auto" : pref;

  return (
    <label
      className={`inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 ${className ?? ""}`}
      title="Which AI model answers this request"
      onClick={(e) => e.stopPropagation()}
    >
      {!bare && <Cpu className="w-3.5 h-3.5 shrink-0" aria-hidden />}
      <select
        value={value}
        onChange={(e) => setPref(e.target.value as AiModelPref)}
        className="text-xs rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
        aria-label="AI model"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {LABELS[o]}
          </option>
        ))}
      </select>
    </label>
  );
}
