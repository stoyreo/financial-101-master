"use client";
import { ReactNode, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ForecastCollapseProps {
  storageId: string;
  defaultExpanded?: boolean;
  children: ReactNode;
  summary: ReactNode;
}

/**
 * Wraps forecast card body in a collapsible region.
 * Stores expanded state in sessionStorage (cleared on logout).
 * Displays a summary row when collapsed.
 */
export function ForecastCollapse({
  storageId,
  defaultExpanded = false,
  children,
  summary,
}: ForecastCollapseProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(storageId);
      if (stored !== null) {
        setExpanded(stored === "true");
      } else {
        setExpanded(defaultExpanded);
      }
    } catch {
      // sessionStorage not available (SSR)
    }
    setMounted(true);
  }, [storageId, defaultExpanded]);

  const handleToggle = () => {
    const newState = !expanded;
    setExpanded(newState);
    try {
      sessionStorage.setItem(storageId, String(newState));
    } catch {
      // quota exceeded — ignore
    }
  };

  if (!mounted) {
    // SSR: render expanded by default until hydration
    return <>{children}</>;
  }

  return (
    <div>
      {/* Collapse toggle button */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between gap-2 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>{expanded ? "Hide details" : "Show details"}</span>
        <ChevronDown
          size={14}
          className={cn("transition-transform", expanded && "rotate-180")}
        />
      </button>

      {/* Summary row (visible when collapsed) */}
      {!expanded && (
        <div className="py-3 border-t border-border">
          {summary}
        </div>
      )}

      {/* Full content (visible when expanded) */}
      {expanded && (
        <div className="space-y-4 pt-3 border-t border-border">
          {children}
        </div>
      )}
    </div>
  );
}
