"use client";

import { useEffect, useState } from "react";
import {
  addUser,
  getUsers,
  removeUser,
  updateUser,
  saveUsers,
  syncAddUserRemote,
  syncUpdateUserRemote,
  syncRemoveUserRemote,
  syncFetchUsersRemote,
  type AppUser,
  type UserRole,
} from "@/lib/users";
import { useStore } from "@/lib/store";
import { isAdmin } from "@/lib/auth-client";
import { UserPlus, KeyRound, UserX, UserCheck, Trash2, X, RefreshCw } from "lucide-react";

type DialogKind = "add" | "password" | "remove" | null;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Dialog state
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [targetUser, setTargetUser] = useState<AppUser | null>(null);

  // Add-user form
  const [form, setForm] = useState({
    username: "",
    email: "",
    displayName: "",
    role: "member" as UserRole,
    password: "",
  });

  // Password-reset form
  const [newPassword, setNewPassword] = useState("");

  // Remove confirmation
  const [typedEmail, setTypedEmail] = useState("");

  // Remote-first loader: pull truth from Supabase, mirror to localStorage,
  // then render. Falls back to local cache if the network/server is down.
  // This prevents admin/server drift (e.g. when Supabase auth auto-creates
  // a row via findOrCreateUserByEmail on a different browser).
  async function loadUsers(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    try {
      const remote = await syncFetchUsersRemote();
      if (remote.ok) {
        // Preserve local-only passwordHash if the server returned an empty one
        // (the registry table doesn't always store it for magic-link users).
        const localById = new Map(getUsers().map((u) => [u.id, u]));
        const merged = remote.users.map((r) => {
          const local = localById.get(r.id);
          return r.passwordHash ? r : { ...r, passwordHash: local?.passwordHash ?? "" };
        });
        saveUsers(merged);
        setUsers(merged);
      } else {
        setUsers(getUsers());
        if (!opts?.silent) {
          flash("err", `Server fetch failed (${remote.error}) — showing local cache.`);
        }
      }
    } catch (e) {
      setUsers(getUsers());
      setMsg({ kind: "err", text: `Failed to load users: ${String(e)}` });
    }
    setLoading(false);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  // Admin-only guard (UI level — server-side guard is not applicable here since this is client-rendered)
  useEffect(() => {
    if (!loading && !isAdmin()) {
      setMsg({ kind: "err", text: "Admin access required" });
    }
  }, [loading]);

  function flash(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  }

  function closeDialog() {
    setDialog(null);
    setTargetUser(null);
    setTypedEmail("");
    setNewPassword("");
    setForm({ username: "", email: "", displayName: "", role: "member", password: "" });
  }

  // Zustand sync-status setters so the progress bar reacts to registry edits
  const setLocalSyncStatus = useStore((s) => s.setLocalSyncStatus);
  const setRemoteSyncStatus = useStore((s) => s.setRemoteSyncStatus);

  // ── ADD USER ─────────────────────────────────────────────────────────────
  async function doAdd() {
    setBusy(true);
    // 1) Local registry (localStorage) — instant
    setLocalSyncStatus("saving");
    const result = await addUser(form);
    if (!result.ok) {
      setLocalSyncStatus("error");
      setBusy(false);
      flash("err", result.error);
      return;
    }
    setLocalSyncStatus("completed");

    // 2) Remote registry + Supabase Auth provisioning. We pass the plaintext
    //    password so the server can call auth.admin.createUser() — without
    //    this, signInWithPassword would reject the new user (auth.users row
    //    would never have been created).
    setRemoteSyncStatus("saving");
    const remote = await syncAddUserRemote(result.user, form.password);
    if (!remote.ok) {
      // Roll back the local add so the two stays in sync on failure
      removeUser(result.user.id);
      setRemoteSyncStatus("error", `Add user failed: ${remote.error}`);
      setBusy(false);

      // For "*_taken" conflicts the row already exists server-side but may
      // not be in the admin's local view — refresh from server and explain.
      const isConflict =
        remote.error === "email_taken" ||
        remote.error === "username_taken" ||
        remote.error === "id_taken";
      if (isConflict) {
        await loadUsers({ silent: true });
        const which =
          remote.error === "email_taken" ? "email"
          : remote.error === "username_taken" ? "username"
          : "id";
        flash(
          "err",
          `This ${which} already exists on the server. The list has been refreshed — review existing rows before retrying.`,
        );
      } else {
        flash("err", `Added locally but remote sync failed: ${remote.error}. Rolled back.`);
        loadUsers();
      }
      return;
    }
    setRemoteSyncStatus("completed");

    setBusy(false);
    flash("ok", `Added ${result.user.email} (synced to server)`);
    closeDialog();
    loadUsers();
  }

  // ── RESET PASSWORD ───────────────────────────────────────────────────────
  async function doResetPassword() {
    if (!targetUser) return;
    if (newPassword.length < 6) {
      flash("err", "Password must be at least 6 characters");
      return;
    }
    setBusy(true);
    try {
      // 🔐 SECURITY FIX (2026-07-02): No local passwordHash write anymore —
      // that field was never checked at login (see users.ts docblock). The
      // ONLY thing that actually resets the user's credential is the
      // Supabase Auth update below: signInWithPassword() validates against
      // auth.users, not app_users.password_hash.
      setRemoteSyncStatus("saving");
      const remote = await syncUpdateUserRemote(targetUser.id, {}, newPassword);
      if (!remote.ok) {
        setRemoteSyncStatus("error", `Password reset failed: ${remote.error}`);
        flash("err", `Password reset failed: ${remote.error}`);
        setBusy(false);
        return;
      }
      setRemoteSyncStatus("completed");

      flash("ok", `Password reset for ${targetUser.email}`);
      closeDialog();
      loadUsers();
    } catch (e) {
      setLocalSyncStatus("error", `Password reset failed: ${String(e)}`);
      flash("err", String(e));
    }
    setBusy(false);
  }

  // ── DEACTIVATE / REACTIVATE ──────────────────────────────────────────────
  async function doToggleActive(u: AppUser) {
    if (u.role === "admin" && u.isActive) {
      flash("err", "Cannot deactivate an admin account");
      return;
    }
    setBusy(true);
    // Local
    setLocalSyncStatus("saving");
    updateUser(u.id, { isActive: !u.isActive });
    setLocalSyncStatus("completed");

    // Remote
    setRemoteSyncStatus("saving");
    const remote = await syncUpdateUserRemote(u.id, { isActive: !u.isActive });
    if (!remote.ok) {
      // Roll back local change to keep them in sync
      updateUser(u.id, { isActive: u.isActive });
      setRemoteSyncStatus("error", `Toggle active failed: ${remote.error}`);
      setBusy(false);
      flash("err", `Remote sync failed: ${remote.error}. Rolled back.`);
      loadUsers();
      return;
    }
    setRemoteSyncStatus("completed");
    setBusy(false);
    flash("ok", `${u.isActive ? "Deactivated" : "Reactivated"} ${u.email} (synced)`);
    loadUsers();
  }

  // ── REMOVE ───────────────────────────────────────────────────────────────
  async function doRemove() {
    if (!targetUser) return;
    if (typedEmail !== targetUser.email) return;
    setBusy(true);

    // 1) Remote first — if the server says no (e.g. admin), don't touch local
    setRemoteSyncStatus("saving");
    const remote = await syncRemoveUserRemote(targetUser.id);
    if (!remote.ok) {
      setRemoteSyncStatus("error", `Remove user failed: ${remote.error}`);
      setBusy(false);
      flash("err", `Failed to remove on server: ${remote.error}`);
      return;
    }
    setRemoteSyncStatus("completed");

    // 2) Local registry (localStorage) — mirror the server
    setLocalSyncStatus("saving");
    const ok = removeUser(targetUser.id);
    setLocalSyncStatus(ok ? "completed" : "error");

    setBusy(false);
    if (ok) {
      flash("ok", `Removed ${targetUser.email} (synced to server)`);
      closeDialog();
      loadUsers();
    } else {
      flash("err", "Removed on server but failed to update local cache");
      loadUsers();
    }
  }

  // ── RENDER ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4 text-foreground">Admin — User Management</h1>
        <div className="text-muted-foreground">Loading users…</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto text-foreground">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Admin — User Management</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadUsers()}
            disabled={busy || loading}
            title="Pull latest user list from server"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-foreground text-sm font-semibold hover:bg-accent disabled:opacity-50 transition"
          >
            <RefreshCw size={16} /> Refresh
          </button>
          <button
            onClick={() => setDialog("add")}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition"
          >
            <UserPlus size={16} /> Add User
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`mb-4 p-3 rounded text-sm ${
            msg.kind === "ok"
              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
              : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
          }`}
        >
          {msg.kind === "ok" ? "✓ " : "✗ "}
          {msg.text}
        </div>
      )}

      <div className="overflow-x-auto border border-border rounded-lg bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted border-b border-border text-foreground">
            <tr>
              <th className="p-3 text-left font-semibold">Email</th>
              <th className="p-3 text-left font-semibold">Username</th>
              <th className="p-3 text-left font-semibold">Name</th>
              <th className="p-3 text-center font-semibold">Role</th>
              <th className="p-3 text-center font-semibold">Status</th>
              <th className="p-3 text-center font-semibold">Joined</th>
              <th className="p-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>

          <tbody className="text-foreground">
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border hover:bg-accent/40">
                <td className="p-3">{u.email}</td>
                <td className="p-3 font-mono text-xs">{u.username}</td>
                <td className="p-3">{u.displayName}</td>
                <td className="p-3 text-center">
                  <span
                    className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                      u.role === "admin"
                        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200"
                        : u.role === "member"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                          : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="p-3 text-center">
                  <span
                    className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                      u.isActive
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                        : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {u.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="p-3 text-center text-muted-foreground">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td className="p-3 text-right">
                  <div className="inline-flex gap-1 justify-end">
                    <button
                      title="Reset password"
                      onClick={() => {
                        setTargetUser(u);
                        setDialog("password");
                      }}
                      className="p-1.5 rounded hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-700 dark:text-amber-400 transition"
                    >
                      <KeyRound size={15} />
                    </button>

                    {u.role !== "admin" && (
                      <button
                        title={u.isActive ? "Deactivate" : "Reactivate"}
                        onClick={() => doToggleActive(u)}
                        className={`p-1.5 rounded transition ${
                          u.isActive
                            ? "hover:bg-accent text-muted-foreground"
                            : "hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                        }`}
                      >
                        {u.isActive ? <UserX size={15} /> : <UserCheck size={15} />}
                      </button>
                    )}

                    {u.role !== "admin" && (
                      <button
                        title="Remove user"
                        onClick={() => {
                          setTargetUser(u);
                          setDialog("remove");
                        }}
                        className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-700 dark:text-red-400 transition"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── ADD USER DIALOG ─────────────────────────────────────────────── */}
      {dialog === "add" && (
        <Modal title="Add new user" onClose={closeDialog}>
          <div className="space-y-3 text-sm">
            <Field label="Username">
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full border border-border rounded-lg p-2 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="e.g. johndoe"
                autoFocus
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-border rounded-lg p-2 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="user@example.com"
              />
            </Field>
            <Field label="Display name">
              <input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                className="w-full border border-border rounded-lg p-2 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="John Doe"
              />
            </Field>
            <Field label="Role">
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                className="w-full border border-border rounded-lg p-2 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="member">Member</option>
                <option value="demo">Demo</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            <Field label="Initial password (min 6 chars)">
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full border border-border rounded-lg p-2 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="••••••••"
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={closeDialog}
                className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                disabled={busy}
                onClick={doAdd}
                className="px-4 py-2 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {busy ? "Adding…" : "Add user"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── RESET PASSWORD DIALOG ───────────────────────────────────────── */}
      {dialog === "password" && targetUser && (
        <Modal title="Reset password" onClose={closeDialog}>
          <p className="text-sm text-muted-foreground mb-4">
            Set a new password for <strong>{targetUser.displayName}</strong> ({targetUser.email}).
          </p>
          <Field label="New password (min 6 chars)">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full border border-border rounded-lg p-2 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
          </Field>
          <div className="flex justify-end gap-2 pt-4">
            <button
              onClick={closeDialog}
              className="px-4 py-2 rounded border border-border text-foreground hover:bg-accent transition"
            >
              Cancel
            </button>
            <button
              disabled={busy || newPassword.length < 6}
              onClick={doResetPassword}
              className="px-4 py-2 rounded bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-50 transition"
            >
              {busy ? "Saving…" : "Reset password"}
            </button>
          </div>
        </Modal>
      )}

      {/* ── REMOVE CONFIRM DIALOG ───────────────────────────────────────── */}
      {dialog === "remove" && targetUser && (
        <Modal title="⚠️ Confirm user removal" onClose={closeDialog}>
          <p className="text-sm text-muted-foreground mb-4">
            This will permanently delete <strong>{targetUser.displayName}</strong> ({targetUser.email}) and clear all their data.
          </p>
          <p className="text-sm text-muted-foreground mb-2">
            Type <code className="bg-muted text-foreground px-2 py-1 rounded">{targetUser.email}</code> to confirm:
          </p>
          <input
            type="text"
            className="w-full border border-border rounded-lg p-2 mb-4 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            value={typedEmail}
            onChange={(e) => setTypedEmail(e.target.value)}
            placeholder="type email here"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={closeDialog}
              className="px-4 py-2 rounded border border-border text-foreground hover:bg-accent transition"
            >
              Cancel
            </button>
            <button
              disabled={busy || typedEmail !== targetUser.email}
              onClick={doRemove}
              className="px-4 py-2 rounded bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50 transition"
            >
              {busy ? "Removing…" : "Confirm removal"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── SMALL HELPERS ────────────────────────────────────────────────────────
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card text-card-foreground rounded-xl p-6 w-full max-w-md shadow-xl border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}

