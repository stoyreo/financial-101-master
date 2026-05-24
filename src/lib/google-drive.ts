/**
 * GOOGLE DRIVE INTEGRATION
 * OAuth2 authentication and sync for financial data to Google Drive.
 */

const IDB_DB = "fp_gdrive_db";
const IDB_STORE = "auth_tokens";
const IDB_AUTH_KEY = "gdrive_auth";
const MAX_BACKUPS = 30;
const SYNC_INTERVAL_MS = 30 * 60 * 1000;

export interface GoogleDriveConfig {
  clientId: string;
  redirectUri: string;
  folderId?: string;
}

export interface AuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  tokenType: "Bearer";
}

export interface BackupFile {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime: string;
  size: number;
}

async function openAuthDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function saveAuthToken(token: AuthToken) {
  const db = await openAuthDB();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(token, IDB_AUTH_KEY);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function loadAuthToken(): Promise<AuthToken | null> {
  try {
    const db = await openAuthDB();
    return new Promise((res) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(IDB_AUTH_KEY);
      req.onsuccess = () => res(req.result ?? null);
      req.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}

async function clearAuthToken() {
  const db = await openAuthDB();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(IDB_AUTH_KEY);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

function makeBackupFilename(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `financeplan_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.json`;
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const buffer = new TextEncoder().encode(codeVerifier);
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return btoa(String.fromCharCode(...hashArray))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function generateCodeVerifier(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let result = "";
  for (let i = 0; i < 128; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export interface SyncStatus {
  authenticated: boolean;
  lastSync: string | null;
  lastFileName: string | null;
  error: string | null;
  syncing: boolean;
}

let _syncStatus: SyncStatus = {
  authenticated: false,
  lastSync: null,
  lastFileName: null,
  error: null,
  syncing: false,
};

const isClient = typeof window !== "undefined";
const _listeners: Array<(s: SyncStatus) => void> = [];

export function onSyncStatus(cb: (s: SyncStatus) => void) {
  _listeners.push(cb);
  cb({ ..._syncStatus });
  return () => {
    const i = _listeners.indexOf(cb);
    if (i >= 0) _listeners.splice(i, 1);
  };
}

function emit(patch: Partial<SyncStatus>) {
  _syncStatus = { ..._syncStatus, ...patch };
  if (isClient) sessionStorage.setItem("fp_gdrive_status", JSON.stringify(_syncStatus));
  _listeners.forEach((cb) => cb({ ..._syncStatus }));
}

export class GoogleDriveClient {
  private config: GoogleDriveConfig;
  private token: AuthToken | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: GoogleDriveConfig) {
    this.config = config;
    this.loadCachedToken();
  }

  private async loadCachedToken() {
    this.token = await loadAuthToken();
    if (this.token && this.isTokenExpired()) {
      await this.refreshToken();
    }
    emit({ authenticated: !!this.token });
  }

  private isTokenExpired(): boolean {
    if (!this.token) return true;
    return Date.now() >= this.token.expiresAt - 60000;
  }

  private async refreshToken(): Promise<boolean> {
    if (!this.token?.refreshToken) return false;
    try {
      // 🔐 Call server endpoint instead of Google directly (client-side secret never exposed)
      const response = await fetch("/api/auth/google-drive-refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refreshToken: this.token.refreshToken,
        }),
      });

      if (!response.ok) throw new Error("Token refresh failed");

      const data = await response.json();
      this.token = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || this.token.refreshToken,
        expiresAt: Date.now() + data.expires_in * 1000,
        tokenType: "Bearer",
      };

      await saveAuthToken(this.token);
      return true;
    } catch (e) {
      emit({ error: `Token refresh failed: ${(e as Error).message}` });
      return false;
    }
  }

  async authenticate(): Promise<boolean> {
    if (!isClient) return false;

    try {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);

      sessionStorage.setItem("gdrive_code_verifier", codeVerifier);

      const params = new URLSearchParams({
        client_id: this.config.clientId,
        redirect_uri: this.config.redirectUri,
        response_type: "code",
        scope: "https://www.googleapis.com/auth/drive.file",
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        access_type: "offline",
        prompt: "consent",
      });

      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      return true;
    } catch (e) {
      emit({ error: `Authentication failed: ${(e as Error).message}` });
      return false;
    }
  }

  async handleAuthCallback(code: string): Promise<boolean> {
    try {
      const codeVerifier = sessionStorage.getItem("gdrive_code_verifier");
      if (!codeVerifier) throw new Error("No code verifier found");

      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: this.config.clientId,
          code,
          code_verifier: codeVerifier,
          grant_type: "authorization_code",
          redirect_uri: this.config.redirectUri,
        }),
      });

      if (!response.ok) throw new Error("Token exchange failed");

      const data = await response.json();
      this.token = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000,
        tokenType: "Bearer",
      };

      await saveAuthToken(this.token);
      sessionStorage.removeItem("gdrive_code_verifier");
      emit({ authenticated: true, error: null });
      return true;
    } catch (e) {
      emit({ error: `Callback handling failed: ${(e as Error).message}` });
      return false;
    }
  }

  async autoSyncData(data: string, fileName?: string): Promise<boolean> {
    if (!this.token || this.isTokenExpired()) {
      if (!(await this.refreshToken())) {
        emit({ error: "Not authenticated or token expired" });
        return false;
      }
    }

    emit({ syncing: true });

    try {
      const filename = fileName || makeBackupFilename();
      const metadata = {
        name: filename,
        mimeType: "application/json",
        parents: this.config.folderId ? [this.config.folderId] : undefined,
      };

      const form = new FormData();
      form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
      form.append("file", new Blob([data], { type: "application/json" }));

      const response = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        {
          method: "POST",
          headers: {
            Authorization: `${this.token!.tokenType} ${this.token!.accessToken}`,
          },
          body: form,
        }
      );

      if (!response.ok) throw new Error(`Upload failed: ${response.statusText}`);

      await this.pruneOldBackups();

      emit({
        authenticated: true,
        lastSync: new Date().toISOString(),
        lastFileName: filename,
        error: null,
        syncing: false,
      });

      return true;
    } catch (e) {
      emit({
        error: `Sync failed: ${(e as Error).message}`,
        syncing: false,
      });
      return false;
    }
  }

  async listBackups(): Promise<BackupFile[]> {
    if (!this.token || this.isTokenExpired()) {
      if (!(await this.refreshToken())) {
        emit({ error: "Not authenticated" });
        return [];
      }
    }

    try {
      const query = `name contains 'financeplan_' and trashed=false`;
      const parentQuery = this.config.folderId ? ` and '${this.config.folderId}' in parents` : "";

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query + parentQuery)}&orderBy=createdTime desc&spaces=drive&fields=files(id,name,createdTime,modifiedTime,size)&pageSize=50`,
        {
          headers: {
            Authorization: `${this.token!.tokenType} ${this.token!.accessToken}`,
          },
        }
      );

      if (!response.ok) throw new Error("Failed to list backups");

      const data = await response.json();
      return data.files || [];
    } catch (e) {
      emit({ error: `List backups failed: ${(e as Error).message}` });
      return [];
    }
  }

  private async pruneOldBackups() {
    const backups = await this.listBackups();
    if (backups.length <= MAX_BACKUPS) return;

    const toDelete = backups.slice(MAX_BACKUPS);
    for (const backup of toDelete) {
      try {
        await fetch(`https://www.googleapis.com/drive/v3/files/${backup.id}`, {
          method: "DELETE",
          headers: {
            Authorization: `${this.token!.tokenType} ${this.token!.accessToken}`,
          },
        });
      } catch {}
    }
  }

  async importDataFromDrive(fileId: string): Promise<string | null> {
    if (!this.token || this.isTokenExpired()) {
      if (!(await this.refreshToken())) {
        emit({ error: "Not authenticated" });
        return null;
      }
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
          headers: {
            Authorization: `${this.token!.tokenType} ${this.token!.accessToken}`,
          },
        }
      );

      if (!response.ok) throw new Error("Failed to download file");

      return await response.text();
    } catch (e) {
      emit({ error: `Import failed: ${(e as Error).message}` });
      return null;
    }
  }

  async deleteBackup(fileId: string): Promise<boolean> {
    if (!this.token || this.isTokenExpired()) {
      if (!(await this.refreshToken())) {
        emit({ error: "Not authenticated" });
        return false;
      }
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `${this.token!.tokenType} ${this.token!.accessToken}`,
          },
        }
      );

      if (!response.ok) throw new Error("Delete failed");

      return true;
    } catch (e) {
      emit({ error: `Delete failed: ${(e as Error).message}` });
      return false;
    }
  }

  startAutoSync(getData: () => string) {
    if (this.syncTimer) clearInterval(this.syncTimer);

    this.syncTimer = setInterval(() => {
      if (this.token && !this.isTokenExpired()) {
        this.autoSyncData(getData());
      }
    }, SYNC_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden" && this.token) {
        this.autoSyncData(getData());
      }
    };

    document.removeEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  stopAutoSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  async signOut(): Promise<void> {
    await clearAuthToken();
    this.token = null;
    this.stopAutoSync();
    emit({ authenticated: false, error: null });
  }

  isAuthenticated(): boolean {
    return !!this.token && !this.isTokenExpired();
  }
}

let _client: GoogleDriveClient | null = null;

export function getGoogleDriveClient(config?: GoogleDriveConfig): GoogleDriveClient {
  if (!_client && config) {
    _client = new GoogleDriveClient(config);
  }
  return _client!;
}

export function initializeGoogleDrive(config: GoogleDriveConfig): GoogleDriveClient {
  _client = new GoogleDriveClient(config);
  return _client;
}

if (isClient) {
  try {
    const raw = sessionStorage.getItem("fp_gdrive_status");
    if (raw) _syncStatus = { ..._syncStatus, ...JSON.parse(raw) };
  } catch {}
}
