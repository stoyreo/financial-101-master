"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useStore } from "@/lib/store";
import {
  setupBackupFolder, startAutoBackup, runBackup,
  onBackupStatus, isBackupSupported, type BackupStatus,
} from "@/lib/backup";
import {
  getGoogleDriveClient, onSyncStatus, type SyncStatus,
  type GoogleDriveConfig,
} from "@/lib/google-drive";
import { CloudUpload, CheckCircle, AlertTriangle, FolderOpen, RefreshCw, LogOut, X, Download, Upload } from "lucide-react";

export function BackupWidget({ compact = false }: { compact?: boolean }) {
  const { exportData, exportDataXlsx, importDataXlsx } = useStore();
  const [useGoogleDrive, setUseGoogleDrive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backupStatus, setBackupStatus] = useState<BackupStatus>({
    configured: false, lastBackup: null, lastFile: null, error: null,
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    authenticated: false, lastSync: null, lastFileName: null, error: null, syncing: false,
  });
  const [running, setRunning] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const getData = useCallback(() => exportData(), [exportData]);

  useEffect(() => {
    // Check if Google Drive is configured
    const gdConfig = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (gdConfig) setUseGoogleDrive(true);

    // Set up listeners based on selected method
    if (useGoogleDrive) {
      const gdClient = getGoogleDriveClient();
      if (gdClient && gdClient.isAuthenticated()) {
        gdClient.startAutoSync(getData);
        const unsub = onSyncStatus(setSyncStatus);
        return () => { unsub(); };
      }
    } else {
      if (!isBackupSupported()) return;
      startAutoBackup(getData);
      const unsub = onBackupStatus(setBackupStatus);
      return () => { unsub(); };
    }
  }, [getData, useGoogleDrive]);

  const handleGoogleDriveAuth = async () => {
    const config: GoogleDriveConfig = {
      clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "",
      redirectUri: process.env.NEXT_PUBLIC_GOOGLE_DRIVE_REDIRECT_URI || `${window.location.origin}/auth/google-drive`,
      folderId: process.env.NEXT_PUBLIC_GOOGLE_DRIVE_FOLDER_ID,
    };

    const client = getGoogleDriveClient(config);
    await client.authenticate();
  };

  const handleSetup = async () => {
    if (useGoogleDrive) {
      await handleGoogleDriveAuth();
    } else {
      const ok = await setupBackupFolder();
      if (ok) await handleBackupNow();
    }
  };

  const handleBackupNow = async () => {
    setRunning(true);
    try {
      if (useGoogleDrive) {
        const client = getGoogleDriveClient();
        await client?.autoSyncData(getData());
        setSuccessMessage("Backup uploaded to Google Drive");
      } else {
        await runBackup(getData);
        setSuccessMessage("Backup saved successfully");
      }
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      setSuccessMessage("Backup failed: " + (error instanceof Error ? error.message : "Unknown error"));
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }
    setRunning(false);
  };

  const handleSignOut = async () => {
    if (useGoogleDrive) {
      const client = getGoogleDriveClient();
      await client?.signOut();
    }
  };

  const handleXlsxExport = () => {
    const blob = exportDataXlsx();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financial101_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    setSuccessMessage("XLSX exported successfully");
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const handleXlsxImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ok = await importDataXlsx(file);
    if (ok) {
      setSuccessMessage("XLSX imported successfully");
    } else {
      setSuccessMessage("XLSX import failed — check console");
    }
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const isConfigured = useGoogleDrive ? syncStatus.authenticated : backupStatus.configured;
  const lastTime = useGoogleDrive ? syncStatus.lastSync : backupStatus.lastBackup;
  const isSyncing = useGoogleDrive ? syncStatus.syncing : false;
  const lastFileName = useGoogleDrive ? syncStatus.lastFileName : null;
  const statusError = useGoogleDrive ? syncStatus.error : backupStatus.error;
  const serviceLabel = useGoogleDrive ? "Google Drive" : "OneDrive";

  const fmtTime = (iso: string | null) => {
    if (!iso) return "Never";
    const d = new Date(iso);
    const now = new Date();
    const diffMin = Math.round((now.getTime() - d.getTime()) / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffMin < 1440) return `${Math.floor(diffMin/60)}h ago`;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  };

  if (!isBackupSupported() && !useGoogleDrive) return null;

  // Success popup overlay
  const successPopup = showSuccess && (
    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
      <div className="bg-emerald-500 text-white rounded-lg shadow-lg px-6 py-4 flex items-center gap-3 animate-in fade-in duration-300 pointer-events-auto">
        <CheckCircle size={20} className="shrink-0" />
        <span className="font-medium">{successMessage}</span>
        <button onClick={() => setShowSuccess(false)} className="ml-2 hover:opacity-80">
          <X size={16} />
        </button>
      </div>
    </div>
  );

  if (compact) {
    // Sidebar compact version
    return (
      <>
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] w-full">
        {isConfigured ? (
          <>
            {statusError ? (
              <AlertTriangle size={12} className="text-amber-500 shrink-0" />
            ) : (
              <CheckCircle size={12} className="text-emerald-500 shrink-0" />
            )}
            <span className="text-muted-foreground truncate flex-1">
              {serviceLabel} {statusError ? "error" : fmtTime(lastTime)}
            </span>
            <button onClick={handleBackupNow} disabled={running || isSyncing}
              className="hover:text-foreground text-muted-foreground shrink-0" title="Backup now">
              <RefreshCw size={11} className={running || isSyncing ? "animate-spin" : ""} />
            </button>
          </>
        ) : (
          <button onClick={handleSetup}
            className="flex items-center gap-1.5 text-amber-600 hover:text-amber-700 w-full">
            <FolderOpen size={12} className="shrink-0" />
            <span className="truncate">Setup {serviceLabel}</span>
          </button>
        )}
      </div>
      {successPopup}
      </>
    );
  }

  // Full card version (for settings or standalone)
  return (
    <>
    <div className={`rounded-xl border p-4 text-sm space-y-3
      ${isConfigured && !statusError
        ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20"
        : statusError
        ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
        : "border-border bg-muted/30"}`}>
      <div className="flex items-center gap-2">
        <CloudUpload size={16} className={isConfigured && !statusError ? "text-emerald-600" : "text-muted-foreground"} />
        <span className="font-medium">{serviceLabel} Auto-Backup</span>
        {isConfigured && !statusError && (
          <span className="ml-auto text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-2 py-0.5 rounded-full">Active</span>
        )}
      </div>

      {isConfigured ? (
        <>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-background/60 rounded-lg p-2">
              <div className="text-muted-foreground">Last sync</div>
              <div className="font-medium">{fmtTime(lastTime)}</div>
            </div>
            <div className="bg-background/60 rounded-lg p-2">
              <div className="text-muted-foreground">Frequency</div>
              <div className="font-medium">Every 30 min</div>
            </div>
          </div>
          {lastFileName && (
            <div className="text-[11px] text-muted-foreground font-mono truncate">{lastFileName}</div>
          )}
          {statusError && (
            <div className="text-xs text-amber-700 dark:text-amber-300">{statusError}</div>
          )}
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button onClick={handleBackupNow} disabled={running || isSyncing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50 flex-1">
                <RefreshCw size={12} className={running || isSyncing ? "animate-spin" : ""} />
                {running || isSyncing ? "Syncing…" : "Sync Now"}
              </button>
              {useGoogleDrive ? (
                <button onClick={handleSignOut}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-accent transition-colors text-muted-foreground">
                  <LogOut size={12} /> Sign Out
                </button>
              ) : (
                <button onClick={handleSetup}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-accent transition-colors text-muted-foreground">
                  <FolderOpen size={12} /> Change Folder
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={handleXlsxExport}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-accent transition-colors text-muted-foreground flex-1">
                <Download size={12} /> Export XLSX
              </button>
              <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-accent transition-colors text-muted-foreground cursor-pointer flex-1">
                <Upload size={12} /> Import XLSX
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  onChange={handleXlsxImport}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Auto-saves your data to <strong>{serviceLabel}</strong> every 30 minutes and when you close the tab. Keeps the last 30 backups.
          </p>
          <button onClick={handleSetup}
            className="flex items-center gap-2 px-4 py-2 text-xs rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            <FolderOpen size={13} /> Connect {serviceLabel}
          </button>
        </>
      )}
    </div>
    {successPopup}
    </>
  );
}
