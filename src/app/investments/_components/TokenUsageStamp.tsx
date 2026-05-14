"use client";

interface TokenUsageStampProps {
  inputTokens: number | null;
  outputTokens: number | null;
  remainingTokens: number | null;
  tokenLimit: number | null;
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
      </span>
      {remainingTokens !== null && tokenLimit !== null && (
        <span>
          Remaining: {formatNum(remainingTokens)} / {formatNum(tokenLimit)}
        </span>
      )}
    </div>
  );
}
