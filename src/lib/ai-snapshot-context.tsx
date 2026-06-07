"use client";

/**
 * AiSnapshotContext
 *
 * Lets individual pages register a rich, page-shaped financial snapshot
 * (+ a one-line label and quick-action prompts) that the GLOBAL floating AI
 * avatar (mounted once in layout.tsx) consumes. This is what makes "one
 * avatar, available everywhere" possible without every page needing to know
 * about the avatar's UI — pages just describe "what's on screen right now".
 *
 * Pattern: a small registration stack keyed by a stable per-hook id. The
 * most-recently-registered entry wins, which in the App Router is always the
 * current page (previous pages unmount — and therefore unregister — on
 * navigation). Falls back to `null` (→ a generic snapshot) when no page has
 * registered anything, e.g. on pages that haven't opted in yet.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface AiQuickAction {
  label: string;
  sub?: string;
  prompt: string;
}

export interface AiSnapshotRegistration {
  snapshot: unknown;
  label?: string | null;
  quickActions?: AiQuickAction[];
}

interface StackEntry {
  id: string;
  reg: AiSnapshotRegistration;
}

interface AiSnapshotContextValue {
  registration: AiSnapshotRegistration | null;
  register: (id: string, reg: AiSnapshotRegistration) => void;
  unregister: (id: string) => void;
}

const noop = () => {};
const FALLBACK_VALUE: AiSnapshotContextValue = { registration: null, register: noop, unregister: noop };

const AiSnapshotContext = createContext<AiSnapshotContextValue | null>(null);

export function AiSnapshotProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<StackEntry[]>([]);

  const register = useCallback((id: string, reg: AiSnapshotRegistration) => {
    setStack(prev => {
      const without = prev.filter(e => e.id !== id);
      return [...without, { id, reg }];
    });
  }, []);

  const unregister = useCallback((id: string) => {
    setStack(prev => (prev.some(e => e.id === id) ? prev.filter(e => e.id !== id) : prev));
  }, []);

  const registration = stack.length > 0 ? stack[stack.length - 1].reg : null;

  const value = useMemo<AiSnapshotContextValue>(
    () => ({ registration, register, unregister }),
    [registration, register, unregister],
  );

  return <AiSnapshotContext.Provider value={value}>{children}</AiSnapshotContext.Provider>;
}

/** Read the currently-active registration (used by the global avatar widget). */
export function useAiSnapshotContext(): AiSnapshotContextValue {
  const ctx = useContext(AiSnapshotContext);
  return ctx ?? FALLBACK_VALUE;
}

let regIdCounter = 0;

/**
 * Registers this page's financial snapshot with the global AI avatar.
 *
 * Pass `snapshot: null` (or omit it) while data is still loading — the hook
 * simply won't register until you have something real, so the global widget
 * keeps showing its generic snapshot in the meantime. Automatically
 * unregisters on unmount (i.e., when the user navigates away).
 */
export function useRegisterAiSnapshot(
  snapshot: unknown | null | undefined,
  label?: string | null,
  quickActions?: AiQuickAction[],
) {
  const { register, unregister } = useAiSnapshotContext();
  const idRef = useRef<string | null>(null);
  if (idRef.current === null) idRef.current = `ai-snap-${++regIdCounter}`;
  const id = idRef.current;

  const reg = useMemo<AiSnapshotRegistration | null>(() => {
    if (snapshot == null) return null;
    return { snapshot, label: label ?? null, quickActions };
  }, [snapshot, label, quickActions]);

  useEffect(() => {
    if (!reg) {
      unregister(id);
      return;
    }
    register(id, reg);
  }, [id, reg, register, unregister]);

  // Always unregister on unmount, regardless of the latest `reg` value.
  useEffect(() => () => unregister(id), [id, unregister]);
}
