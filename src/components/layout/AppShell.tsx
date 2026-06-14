"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useStore } from "@/lib/store";
import { cn, calcAge } from "@/lib/utils";
import { migrateLegacyImports } from "@/lib/migration";
import { VersionPanel } from "./VersionPanel";
import { Logo } from "@/components/brand/Logo";
// BackupWidget removed from sidebar on 2026-04-18 (user request). If you need
// Google Drive backup UI, import and render <BackupWidget /> on a dedicated
// settings page. See src/components/layout/BackupWidget.tsx.
// import { BackupWidget } from "./BackupWidget";
import { VersionUpdateNotification } from "../VersionUpdateNotification";
import { SyncStatusBadge } from "./SyncStatusBadge";
import { getSession, isAdmin, clearSession } from "@/lib/auth-client";
import { getUserById } from "@/lib/users";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import {
  LayoutDashboard, User, Users, TrendingUp, CreditCard, PiggyBank,
  Calculator, Sliders, BarChart3, Moon, Sun, Menu, X,
  Download, Upload, RefreshCw, ChevronRight, MoreHorizontal, LogOut,
  CheckCircle, AlertCircle, Loader2, Cloud, HardDrive, ClipboardList,
} from "lucide-react";
import { logAuditEvent } from "@/lib/audit-log";

// Nav type includes optional adminOnly flag
const NAV: { href: string; label: string; icon: any; adminOnly?: boolean }[] = [
  { href: "/",            label: "Dashboard",      icon: LayoutDashboard },
  { href: "/income",      label: "Income",          icon: TrendingUp },
  { href: "/expenses",    label: "Expenses",        icon: CreditCard },
  { href: "/debts",       label: "Debts",           icon: PiggyBank },
  { href: "/investments", label: "Investments",     icon: BarChart3 },
  { href: "/tax",         label: "Tax",             icon: Calculator },
  { href: "/scenarios",   label: "Scenarios",       icon: Sliders },
  { href: "/forecast",    label: "Forecast",        icon: BarChart3 },
  { href: "/profile",     label: "Profile",         icon: User },
  { href: "/audit-log",   label: "Audit Log",       icon: ClipboardList },
  { href: "/admin/users", label: "Admin",           icon: Users, adminOnly: true },
];

// Bottom nav shows first 4 + "More" drawer
const BOTTOM_NAV = NAV.slice(0, 4);

// Import status popup type
type ImportStatus = {
  show: boolean;
  phase: "parsing" | "local_saving" | "remote_syncing" | "done_success" | "done_error";
  fileName?: string;
  error?: string;
  localSaved?: boolean;
  remoteSaved?: boolean;
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawer, setMobileDrawer] = useState(false);
  const [importStatus, setImportStatus] = useState<ImportStatus>({ show: false, phase: "parsing" });
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { profile, recomputeForecast, exportData, exportDataXlsx, importDataXlsx, loadSeedData, saveUserNamespace, saveUserNamespaceAsync } = useStore();
  const router = useRouter();
  const handleLogout = async () => {
    const currentSession = getSession();
    if (currentSession?.userId) {
      logAuditEvent(currentSession.userId, "logout", `Signed out (${currentSession.email || currentSession.username})`);
    }
    useStore.getState().clearStore?.();
    clearSession();
    // Clear Fin's conversation memory so the next user starts fresh
    try { sessionStorage.removeItem("fin_chat_memory_v1"); } catch { /* noop */ }
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    router.push("/login");
  };
  const age = calcAge(profile.dateOfBirth);
  const session = getSession();
  const admin = isAdmin();
  const visibleNav = NAV.filter(n => !n.adminOnly || admin);

  // Sidebar identity label.
  // For non-demo accounts (admin / member), prefer the AppUser.displayName from
  // the registry - the profile.fullName field is user-editable and may still be
  // empty (or stuck on "Demo User") for a newly-created member.
  const appUser = session ? getUserById(session.userId) : undefined;
  const isDemoAccount = session?.role === "demo";
  const displayLabel = (() => {
    if (isDemoAccount) return `${profile.fullName || "Demo User"} \u00B7 Age ${age}`;
    const name = (profile.fullName && profile.fullName.trim() && profile.fullName !== "Demo User")
      ? profile.fullName
      : (appUser?.displayName || session?.username || "");
    return age ? `${name} \u00B7 Age ${age}` : name;
  })();

  // Migration: assign legacy transactions to Toy account (runs once)
  useEffect(() => {
    migrateLegacyImports();
  }, []);
  useEffect(() => { recomputeForecast(); }, []);
  // Close drawer on nav
  useEffect(() => { setMobileDrawer(false); }, [pathname]);

  // ── PER-USER THEME ───────────────────────────────────────────────────────
  // next-themes stores its current value under a single global localStorage
  // key ("theme"), so all accounts on the same browser would share a theme.
  // We layer a per-user key on top: on login (or user switch) we restore the
  // signed-in user's saved preference; whenever the theme changes we mirror
  // it to that user's key. A per-user saved value wins over the global one.
  const userThemeRef = useRef<string | null>(null);
  const userId = session?.userId ?? null;

  // Restore the current user's saved theme on mount and whenever userId changes.
  useEffect(() => {
    if (!userId) return;
    if (userThemeRef.current === userId) return; // already restored for this user
    userThemeRef.current = userId;
    try {
      const saved = localStorage.getItem(`theme:${userId}`);
      if (saved && saved !== theme) setTheme(saved);
    } catch {
      /* private-mode / quota — ignore */
    }
  }, [userId, theme, setTheme]);

  // Persist any theme change back to the signed-in user's key.
  useEffect(() => {
    if (!userId || !theme) return;
    try {
      localStorage.setItem(`theme:${userId}`, theme);
    } catch {
      /* ignore */
    }
  }, [theme, userId]);

  const handleExport = () => {
    const blob = exportDataXlsx();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `financial-plan_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  };
  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".xlsx,.json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      // Show import status popup
      setImportStatus({ show: true, phase: "parsing", fileName: file.name });

      try {
        // Detect file type by extension
        const isXlsx = file.name.endsWith(".xlsx");
        let success = false;

        if (isXlsx) {
          // Handle XLSX import
          success = await useStore.getState().importDataXlsx(file);
          if (!success) {
            setImportStatus({ show: true, phase: "done_error", fileName: file.name, error: "Invalid XLSX file or data format" });
            setTimeout(() => setImportStatus(prev => ({ ...prev, show: false })), 5000);
            return;
          }
        } else {
          // Handle JSON import
          const json = await file.text();
          success = useStore.getState().importData(json);
          if (!success) {
            setImportStatus({ show: true, phase: "done_error", fileName: file.name, error: "Invalid JSON or data format" });
            setTimeout(() => setImportStatus(prev => ({ ...prev, show: false })), 5000);
            return;
          }
        }

        // Save locally
        setImportStatus({ show: true, phase: "local_saving", fileName: file.name });
        useStore.getState().saveUserNamespace();

        // Sync to remote
        setImportStatus({ show: true, phase: "remote_syncing", fileName: file.name, localSaved: true });
        try {
          await useStore.getState().saveUserNamespaceAsync();
          setImportStatus({ show: true, phase: "done_success", fileName: file.name, localSaved: true, remoteSaved: true });
        } catch {
          setImportStatus({ show: true, phase: "done_success", fileName: file.name, localSaved: true, remoteSaved: false });
        }

        // Auto-dismiss after 6 seconds
        setTimeout(() => setImportStatus(prev => ({ ...prev, show: false })), 6000);
      } catch (err) {
        setImportStatus({ show: true, phase: "done_error", fileName: file.name, error: String(err) });
        setTimeout(() => setImportStatus(prev => ({ ...prev, show: false })), 5000);
      }
    };
    input.click();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Version Update Notification */}
      <VersionUpdateNotification />

      {/* DESKTOP SIDEBAR (hidden on mobile) */}
      <aside className={cn(
        "hidden md:flex flex-col border-r border-border bg-card shrink-0 transition-all duration-200",
        sidebarOpen ? "w-56" : "w-14"
      )}>
        {/* Logo */}
        <div className="flex items-center gap-2 px-3 py-4 border-b border-border">
          <Logo size={28} />
          {sidebarOpen && (
            <div className="flex-1 min-w-0">
              <div className="font-bold text-xs leading-tight truncate">Financial 101 Master crafted by Toy</div>
              <div className="text-[10px] text-muted-foreground">{displayLabel}</div>
            </div>
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-muted-foreground hover:text-foreground ml-auto">
            {sidebarOpen ? <X size={14} /> : <Menu size={14} />}
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {visibleNav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href}
                className={cn(
                  "flex items-center gap-2.5 mx-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  active && "bg-primary/10 text-primary",
                  !sidebarOpen && "justify-center px-0"
                )}
                title={!sidebarOpen ? label : undefined}
              >
                <Icon size={15} className="shrink-0" />
                {sidebarOpen && <span className="truncate">{label}</span>}
                {sidebarOpen && active && <ChevronRight size={12} className="ml-auto" />}
              </Link>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="p-2 border-t border-border space-y-1">
          {sidebarOpen ? (
            <>
              <div className="flex gap-1">
                <button onClick={handleExport} className="flex-1 flex items-center gap-1 px-2 py-1.5 text-[11px] rounded-md hover:bg-accent transition-colors"><Download size={12} /> Export</button>
                <button onClick={handleImport} className="flex-1 flex items-center gap-1 px-2 py-1.5 text-[11px] rounded-md hover:bg-accent transition-colors"><Upload size={12} /> Import</button>
              </div>
              <button onClick={loadSeedData} className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] rounded-md hover:bg-accent transition-colors text-muted-foreground">
                <RefreshCw size={12} /> Reset All Data
              </button>
              <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] rounded-md hover:bg-accent transition-colors">
                {theme === "dark" ? <Sun size={12} /> : <Moon size={12} />}
                {theme === "dark" ? "Light Mode" : "Dark Mode"}
              </button>
              {/* BackupWidget removed from bottom-left per user request (2026-04-18). */}
              <button onClick={handleLogout} className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] rounded-md hover:bg-destructive/10 text-destructive transition-colors"><LogOut size={12} /> Sign Out</button>
              <VersionPanel />
            </>
          ) : (
            <>
              <button onClick={handleExport} className="w-full flex justify-center p-2 hover:bg-accent rounded-md" title="Export"><Download size={14} /></button>
              <button onClick={handleImport} className="w-full flex justify-center p-2 hover:bg-accent rounded-md" title="Import"><Upload size={14} /></button>
              <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="w-full flex justify-center p-2 hover:bg-accent rounded-md">
                {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
              </button>
            </>
          )}
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-2">
            <Logo size={24} />
            <span className="font-bold text-sm">Financial 101 Master crafted by Toy</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="p-1.5 hover:bg-accent rounded-md">
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button onClick={() => setMobileDrawer(true)} className="p-1.5 hover:bg-accent rounded-md">
              <Menu size={18} />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          {children}
        </main>

        {/* MOBILE BOTTOM NAV */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-card border-t border-border z-40 pb-safe">
          <div className="flex items-center justify-around px-1 pt-1 pb-2">
            {BOTTOM_NAV.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link key={href} href={href}
                  className={cn(
                    "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl min-w-[60px] transition-colors",
                    active ? "text-primary" : "text-muted-foreground"
                  )}>
                  <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
                  <span className="text-[10px] font-medium">{label}</span>
                </Link>
              );
            })}
            {/* More button */}
            <button onClick={() => setMobileDrawer(true)}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl min-w-[60px] text-muted-foreground">
              <MoreHorizontal size={20} strokeWidth={1.8} />
              <span className="text-[10px] font-medium">More</span>
            </button>
          </div>
        </nav>
      </div>

      {/* MOBILE FULL-SCREEN DRAWER */}
      {mobileDrawer && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileDrawer(false)} />
          <div className="relative ml-auto w-72 h-full bg-card flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-4 border-b border-border">
              <span className="font-bold text-sm">Menu</span>
              <button onClick={() => setMobileDrawer(false)}><X size={18} /></button>
            </div>
            <nav className="flex-1 overflow-y-auto py-2">
              {visibleNav.map(({ href, label, icon: Icon }) => {
                const active = pathname === href;
                return (
                  <Link key={href} href={href}
                    className={cn(
                      "flex items-center gap-3 mx-2 px-3 py-3 rounded-xl text-sm font-medium transition-colors",
                      "active:bg-accent",
                      active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent"
                    )}>
                    <Icon size={18} className="shrink-0" />
                    {label}
                    {active && <ChevronRight size={14} className="ml-auto" />}
                  </Link>
                );
              })}
            </nav>
            <div className="p-4 border-t border-border space-y-2">
              <div className="flex gap-2">
                <button onClick={handleExport} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs rounded-xl border border-border hover:bg-accent transition-colors"><Download size={14} /> Export</button>
                <button onClick={handleImport} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs rounded-xl border border-border hover:bg-accent transition-colors"><Upload size={14} /> Import</button>
              </div>
              <button onClick={loadSeedData} className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs rounded-xl border border-border hover:bg-accent transition-colors text-muted-foreground">
                <RefreshCw size={14} /> Reset All Data
              </button>
              {/* BackupWidget removed from mobile drawer per user request (2026-04-18) */}
              <button onClick={handleLogout} className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] rounded-md hover:bg-destructive/10 text-destructive transition-colors"><LogOut size={12} /> Sign Out</button>
              <VersionPanel />
            </div>
          </div>
        </div>
      )}

      {/* Import Status Popup */}
      {importStatus.show && (
        <div className="fixed bottom-6 right-6 z-[100] w-80 bg-card border border-border rounded-2xl shadow-2xl p-4 animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
              importStatus.phase === "done_error" ? "bg-red-100 dark:bg-red-900/30" :
              importStatus.phase === "done_success" ? "bg-emerald-100 dark:bg-emerald-900/30" :
              "bg-blue-100 dark:bg-blue-900/30"
            )}>
              {importStatus.phase === "done_error" ? (
                <AlertCircle size={20} className="text-red-600 dark:text-red-400" />
              ) : importStatus.phase === "done_success" ? (
                <CheckCircle size={20} className="text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Loader2 size={20} className="text-blue-600 dark:text-blue-400 animate-spin" />
              )}
            </div>
            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">
                {importStatus.phase === "done_error" ? "Import Failed" :
                 importStatus.phase === "done_success" ? "Import Successful" :
                 "Importing Data…"}
              </div>
              {importStatus.fileName && (
                <div className="text-xs text-muted-foreground truncate mt-0.5">{importStatus.fileName}</div>
              )}
              {importStatus.phase === "done_error" && importStatus.error && (
                <div className="text-xs text-red-600 dark:text-red-400 mt-1">{importStatus.error}</div>
              )}
              {/* Sync status indicators */}
              {importStatus.phase !== "parsing" && importStatus.phase !== "done_error" && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <HardDrive size={12} className="shrink-0" />
                    <span>Local save</span>
                    <span className="ml-auto">
                      {importStatus.localSaved ? (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle size={11} /> Saved</span>
                      ) : importStatus.phase === "local_saving" ? (
                        <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Saving…</span>
                      ) : (
                        <span className="text-muted-foreground">Pending</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Cloud size={12} className="shrink-0" />
                    <span>Remote sync</span>
                    <span className="ml-auto">
                      {importStatus.remoteSaved ? (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle size={11} /> Synced</span>
                      ) : importStatus.remoteSaved === false && importStatus.phase === "done_success" ? (
                        <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1"><AlertCircle size={11} /> Offline</span>
                      ) : importStatus.phase === "remote_syncing" ? (
                        <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Syncing…</span>
                      ) : (
                        <span className="text-muted-foreground">Pending</span>
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
            {/* Dismiss */}
            {(importStatus.phase === "done_success" || importStatus.phase === "done_error") && (
              <button onClick={() => setImportStatus(prev => ({ ...prev, show: false }))}
                className="text-muted-foreground hover:text-foreground shrink-0">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Sync Status Badge */}
      <SyncStatusBadge />
    </div>
  );
}
