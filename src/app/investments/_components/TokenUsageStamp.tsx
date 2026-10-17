"use client";

interface TokenUsageStampProps {
  inputTokens: number | null;
  outputTokens: number | null;
  remainingTokens: number | null;
  tokenLimit: number | null;
  /** Model id that produced the result (e.g. "gemini-2.5-flash"). Optional. */
  model?: string | null;
}

/**
 * Small footer-row component rendering token usage and rate-limit info.
 * Only renders if at least inputTokens is non-null.
 * Uses humanized number formatting and muted styling.
 */
export function TokenUsageStamp({
  inputTokens,
  outputTokens,
  remainingTokens,
  tokenLimit,
  model,
}: TokenUsageStampProps) {
  if (inputTokens === null) {
    return null;
  }

  const formatNum = (n: number | null): string => {
    if (n === null) return "—";
    return n.toLocaleString();
  };

  return (
    <div className="text-xs text-muted-foreground border-t border-border pt-2 mt-3 flex items-center justify-between flex-wrap gap-2">
      <span>
        Tokens: in {formatNum(inputTokens)} / out {formatNum(outputTokens)}
        {model ? <span className="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono">{model}</span> : null}
      </span>
      {remainingTokens !== null && tokenLimit !== null && (
        <span>
          Remaining: {formatNum(remainingTokens)} / {formatNum(tokenLimit)}
        </span>
      )}
    </div>
  );
}
