"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

// ── Card ─────────────────────────────────────────────────
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-border bg-card text-card-foreground shadow-sm", className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-semibold leading-none tracking-tight", className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}
export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center p-6 pt-0", className)} {...props} />;
}

// ── Badge ────────────────────────────────────────────────
export function Badge({ className, variant = "default", ...props }: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "success" | "warning" | "danger" | "outline";
}) {
  const variants = {
    default: "bg-primary/10 text-primary",
    success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    danger: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    outline: "border border-border text-muted-foreground",
  };
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
      variants[variant], className
    )} {...props} />
  );
}

// ── Button ───────────────────────────────────────────────
export function Button({
  className, variant = "default", size = "default", ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "destructive" | "success";
  size?: "default" | "sm" | "lg" | "icon";
}) {
  const variants = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    success: "bg-emerald-600 text-white hover:bg-emerald-700",
  };
  const sizes = {
    default: "h-9 px-4 py-2 text-sm",
    sm: "h-7 px-3 text-xs",
    lg: "h-11 px-8 text-base",
    icon: "h-9 w-9",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant], sizes[size], className
      )}
      {...props}
    />
  );
}

// ── Input ────────────────────────────────────────────────
export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1",
        "text-sm shadow-sm transition-colors placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

// ── NumberInput ───────────────────────────────────────────
// Fixes the "can't delete 0" UX: holds a local string draft while the user
// is typing, only commits a parsed number on blur (or when value is valid).
export function NumberInput({
  value,
  onChange,
  className,
  min,
  max,
  step,
  placeholder,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  min?: number;
  max?: number;
  step?: number | string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = React.useState<string | null>(null);

  const display = draft !== null ? draft : (value === 0 ? "" : String(value));

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      placeholder={placeholder ?? "0"}
      value={display}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        const parsed = parseFloat(draft ?? "");
        const clamped = isNaN(parsed) ? 0 : (
          min !== undefined && parsed < min ? min :
          max !== undefined && parsed > max ? max :
          parsed
        );
        onChange(clamped);
        setDraft(null);
      }}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1",
        "text-sm shadow-sm transition-colors placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    />
  );
}

// ── Label ────────────────────────────────────────────────
export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)}
      {...props}
    />
  );
}

// ── Select ───────────────────────────────────────────────
export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1",
        "text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

// ── Textarea ─────────────────────────────────────────────
export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2",
        "text-sm shadow-sm placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50 resize-none",
        className
      )}
      {...props}
    />
  );
}

// ── Switch ───────────────────────────────────────────────
export function Switch({
  checked, onCheckedChange, disabled, className,
}: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; className?: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked ? "bg-primary" : "bg-input",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <span className={cn(
        "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
        checked ? "translate-x-4" : "translate-x-0"
      )} />
    </button>
  );
}

// ── Progress ─────────────────────────────────────────────
export function Progress({ value, className, color = "bg-primary" }: {
  value: number; className?: string; color?: string;
}) {
  return (
    <div className={cn("relative h-2 w-full overflow-hidden rounded-full bg-secondary", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500", color)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

// ── Separator ────────────────────────────────────────────
export function Separator({ className, orientation = "horizontal" }: {
  className?: string; orientation?: "horizontal" | "vertical";
}) {
  return (
    <div
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className
      )}
    />
  );
}

// ── Tabs ─────────────────────────────────────────────────
export function Tabs({ value, onValueChange, children, className }: {
  value: string; onValueChange: (v: string) => void;
  children: React.ReactNode; className?: string;
}) {
  return (
    <div className={className} data-value={value} data-onchange={onValueChange as any}>
      {React.Children.map(children, child => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(child as React.ReactElement<any>, { _tabsValue: value, _tabsOnChange: onValueChange });
      })}
    </div>
  );
}

export function TabsList({ children, className, _tabsValue, _tabsOnChange }: {
  children: React.ReactNode; className?: string; _tabsValue?: string; _tabsOnChange?: (v: string) => void;
}) {
  return (
    <div className={cn("inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground", className)}>
      {React.Children.map(children, child => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(child as React.ReactElement<any>, { _tabsValue, _tabsOnChange });
      })}
    </div>
  );
}

export function TabsTrigger({ value, children, className, _tabsValue, _tabsOnChange }: {
  value: string; children: React.ReactNode; className?: string; _tabsValue?: string; _tabsOnChange?: (v: string) => void;
}) {
  const active = _tabsValue === value;
  return (
    <button
      onClick={() => _tabsOnChange?.(value)}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium",
        "ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-background text-foreground shadow"
          : "hover:bg-background/50 hover:text-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, children, className, _tabsValue }: {
  value: string; children: React.ReactNode; className?: string; _tabsValue?: string;
}) {
  if (_tabsValue !== value) return null;
  return <div className={cn("mt-4", className)}>{children}</div>;
}

// ── Dialog / Modal ────────────────────────────────────────
export function Modal({ open, onClose, title, children, className }: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; className?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={cn(
        "relative z-10 w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-2xl max-h-[90vh] overflow-y-auto",
        className
      )}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Info Tooltip ──────────────────────────────────────────
export function InfoTooltip({ content, side = "top" }: {
  content: React.ReactNode;
  side?: "top" | "bottom" | "right";
}) {
  return (
    <span className="relative group/infotip inline-flex items-center shrink-0 ml-1">
      <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full border border-muted-foreground/40 text-muted-foreground/60 hover:border-primary/70 hover:text-primary cursor-help transition-colors text-[9px] font-bold leading-none select-none">
        i
      </span>
      <span className={cn(
        "absolute z-[60] w-72 max-w-xs p-3 text-xs leading-relaxed rounded-lg border shadow-2xl",
        "bg-popover text-popover-foreground whitespace-pre-line",
        "opacity-0 group-hover/infotip:opacity-100 pointer-events-none transition-opacity duration-150",
        side === "top" && "bottom-full left-1/2 -translate-x-1/2 mb-2",
        side === "bottom" && "top-full left-1/2 -translate-x-1/2 mt-2",
        side === "right" && "left-full top-1/2 -translate-y-1/2 ml-2",
      )}>
        {content}
        {side === "top" && (
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border" />
        )}
        {side === "bottom" && (
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-border" />
        )}
      </span>
    </span>
  );
}

// ── AI Token Meter ─────────────────────────────────────────
const SESSION_TOKEN_BUDGET = 100_000;
const TOKEN_STORAGE_KEY = "ai_token_usage_v1";

export function recordTokenUsage(tokens: number) {
  if (typeof window === "undefined") return;
  const current = parseInt(sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? "0", 10);
  sessionStorage.setItem(TOKEN_STORAGE_KEY, String(current + tokens));
}

export function AITokenMeter({ estimatedTokens, label }: {
  estimatedTokens: number;
  label?: string;
}) {
  const [used, setUsed] = React.useState(0);

  React.useEffect(() => {
    const read = () => setUsed(parseInt(sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? "0", 10));
    read();
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, []);

  const remaining = Math.max(0, SESSION_TOKEN_BUDGET - used);
  const pctUsed = Math.min(100, (used / SESSION_TOKEN_BUDGET) * 100);
  const canAfford = remaining >= estimatedTokens;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium border",
        canAfford
          ? "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800"
          : "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
      )}>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
        ~{estimatedTokens.toLocaleString()} tokens
        {label && <span className="opacity-70">· {label}</span>}
      </span>
      <span className="flex items-center gap-1">
        <div className="w-14 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", pctUsed > 80 ? "bg-red-500" : pctUsed > 50 ? "bg-amber-400" : "bg-violet-500")}
            style={{ width: `${pctUsed}%` }}
          />
        </div>
        <span className={cn("font-medium tabular-nums", !canAfford && "text-red-600")}>
          {(remaining / 1000).toFixed(0)}K left
        </span>
      </span>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────
export function StatCard({ title, value, subtitle, icon: Icon, trend, trendLabel, color = "blue", className, tooltip }: {
  title: string; value: string; subtitle?: string;
  icon?: React.ComponentType<any>;
  trend?: "up" | "down" | "neutral"; trendLabel?: string;
  color?: "blue" | "green" | "red" | "amber" | "purple"; className?: string;
  tooltip?: string;
}) {
  const colors = {
    blue: "text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400",
    green: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400",
    red: "text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400",
    amber: "text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400",
    purple: "text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400",
  };
  const trendColors = {
    up: "text-emerald-600 dark:text-emerald-400",
    down: "text-red-600 dark:text-red-400",
    neutral: "text-muted-foreground",
  };
  return (
    <Card className={cn("p-5 hover:shadow-md transition-shadow", className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-0.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">{title}</p>
            {tooltip && <InfoTooltip content={tooltip} />}
          </div>
          <p className="text-2xl font-bold tabular-nums mt-1 leading-tight">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          {trendLabel && (
            <p className={cn("text-xs mt-1 font-medium", trendColors[trend ?? "neutral"])}>{trendLabel}</p>
          )}
        </div>
        {Icon && (
          <div className={cn("p-2 rounded-lg ml-3 shrink-0", colors[color])}>
            <Icon size={18} />
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Section Header ────────────────────────────────────────
export function PageHeader({ title, subtitle, actions }: {
  title: string; subtitle?: string; actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────
export function EmptyState({ icon: Icon, title, description, action }: {
  icon: React.ComponentType<any>;
  title: string; description: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="p-4 rounded-full bg-muted mb-4">
        <Icon size={32} className="text-muted-foreground" />
      </div>
      <h3 className="font-semibold text-lg mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-4">{description}</p>
      {action}
    </div>
  );
}

// ── Tooltip wrapper (simple) ──────────────────────────────
export function Tooltip({ content, children }: { content: string; children: React.ReactNode }) {
  return (
    <div className="relative group inline-flex">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs bg-popover text-popover-foreground rounded-md border shadow-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
        {content}
      </div>
    </div>
  );
}

// ── Alert ─────────────────────────────────────────────────
export function Alert({ variant = "default", children, className }: {
  variant?: "default" | "warning" | "danger" | "success";
  children: React.ReactNode; className?: string;
}) {
  const variants = {
    default: "bg-muted border-border text-foreground",
    warning: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200",
    danger: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
    success: "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-200",
  };
  return (
    <div className={cn("rounded-lg border p-4 text-sm", variants[variant], className)}>
      {children}
    </div>
  );
}
