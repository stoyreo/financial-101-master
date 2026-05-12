"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession, sha256, isAdmin } from "@/lib/auth";
import { getUsers, saveUsers, updateUser, getStartingSnapshot,
  persistUserData, type AppUser } from "@/lib/users";
import { Card, CardHeader, CardTitle, CardContent, Button, Input,
  Label, Badge, Modal, PageHeader, Alert } from "@/components/ui";
import { Users, Edit, RefreshCw, CheckCircle, Shield, Eye, Lock } from "lucide-react";

export default function AccountsPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [newPass, setNewPass] = useState("");
  const [newPass2, setNewPass2] = useState("");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success" | "danger">("success");
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPass, setCreatePass] = useState("");
  const session = getSession();

  useEffect(() => {
    if (!isAdmin()) { router.replace("/"); return; }
    setUsers(getUsers());
  }, []);

  const flash = (text: string, type: "success" | "danger" = "success") => {
    setMsg(text); setMsgType(type); setTimeout(() => setMsg(""), 4000);
  };

  const handleSaveUser = async () => {
    if (!editUser) return;
    if (newPass) {
      if (newPass !== newPass2) { flash("Passwords don't match.", "danger"); return; }
      if (newPass.length < 8) { flash("Password must be at least 8 characters.", "danger"); return; }
      const hash = await sha256(newPass);
      updateUser(editUser.id, { ...editUser, passwordHash: hash });
    } else {
      updateUser(editUser.id, editUser);
    }
    setUsers(getUsers());
    setEditUser(null);
    setNewPass(""); setNewPass2("");
    flash("Account updated.");
  };

  const handleResetDemo = (user: AppUser) => {
    if (!confirm(`Reset ${user.displayName}'s data? This cannot be undone.`)) return;
    persistUserData(user.storageKey, getStartingSnapshot(user.role, user.username || ""));
    flash(`${user.displayName}'s data reset.`);
  };

  const handleToggleActive = (user: AppUser) => {
    if (user.role === "admin") { flash("Cannot deactivate admin.", "danger"); return; }
    updateUser(user.id, { isActive: !user.isActive });
    setUsers(getUsers());
    flash(`${user.displayName} ${user.isActive ? "deactivated" : "activated"}.`);
  };

  const handleCreateUser = async () => {
    if (!createName.trim()) { flash("Name required.", "danger"); return; }
    if (!createEmail.trim()) { flash("Email required.", "danger"); return; }
    if (createPass.length < 8) { flash("Password min 8 characters.", "danger"); return; }

    const hash = await sha256(createPass);
    const newUserId = createName.toLowerCase().replace(/\s+/g, "-");
    const username = createEmail.split("@")[0];
    const newUser: AppUser = {
      id: newUserId,
      username,
      displayName: createName,
      email: createEmail,
      passwordHash: hash,
      role: "member",
      isActive: true,
      dataMode: "own",
      storageKey: `financial-planner-data-${newUserId}`,
      createdAt: new Date().toISOString(),
      lastLogin: undefined,
    };

    const allUsers = getUsers();
    saveUsers([...allUsers, newUser]);
    setUsers(getUsers());
    setShowCreateUser(false);
    setCreateName(""); setCreateEmail(""); setCreatePass("");
    flash(`✓ User "${createName}" created with isolated data.`);
    persistUserData(newUser.storageKey, getStartingSnapshot(newUser.role, newUser.username || ""));
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <PageHeader title="Account Management" subtitle="Admin only — manage app users and access" />

      {msg && <Alert variant={msgType} className="mb-4"><div className="flex items-center gap-2"><CheckCircle size={14} />{msg}</div></Alert>}

      {/* Create new user button */}
      <div className="mb-6">
        <Button onClick={() => setShowCreateUser(true)} className="gap-2">
          <Users size={14} /> Create New User
        </Button>
      </div>

      <div className="space-y-3">
        {users.map(user => {
          const isSelf = session?.userId === user.id;
          return (
            <Card key={user.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-primary font-bold text-lg">{user.displayName[0]}</span>
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{user.displayName}</span>
                      {isSelf && <Badge variant="default" className="text-[10px]">You</Badge>}
                      <Badge variant={user.role === "admin" ? "default" : "outline"} className="text-[10px]">
                        {user.role === "admin" ? <><Shield size={9} className="mr-0.5" />Admin</> : <><Eye size={9} className="mr-0.5" />Member</>}
                      </Badge>
                      <Badge variant={user.isActive ? "success" : "warning"} className="text-[10px]">
                        {user.isActive ? "Active" : "Inactive"}
                      </Badge>
                      <Badge variant={user.dataMode === "real" ? "default" : "outline"} className="text-[10px]">
                        {user.dataMode === "real" ? "Real data" : "Demo data"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{user.email}</div>
                    {user.lastLogin && (
                      <div className="text-xs text-muted-foreground">
                        Last login: {new Date(user.lastLogin).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                      </div>
                    )}
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {user.dataMode === "own" && (
                      <Button size="sm" variant="outline" onClick={() => handleResetDemo(user)} title="Reset to demo data">
                        <RefreshCw size={12} />
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => handleToggleActive(user)}
                      className={user.isActive ? "text-amber-600" : "text-emerald-600"}>
                      {user.isActive ? "Disable" : "Enable"}
                    </Button>
                    <Button size="sm" onClick={() => { setEditUser({ ...user }); setNewPass(""); setNewPass2(""); }}>
                      <Edit size={12} /> Edit
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Info box */}
      <div className="mt-6 p-4 rounded-xl bg-muted/50 border border-border text-xs text-muted-foreground space-y-1.5">
        <div className="font-medium text-foreground mb-2">Account rules</div>
        <div>• Each user has an isolated data namespace — changes in one account never affect the other.</div>
        <div>• <strong>Demo data</strong> accounts see seed data and can reset it any time.</div>
        <div>• Only the Admin account can access this page.</div>
        <div>• Demo account default password: <code className="bg-background px-1.5 py-0.5 rounded border">Demo@2024</code></div>
      </div>

      {/* Create new user modal */}
      <Modal open={showCreateUser} onClose={() => setShowCreateUser(false)} title="Create New User">
        <div className="space-y-4">
          <div>
            <Label>Display Name</Label>
            <Input value={createName} onChange={e => setCreateName(e.target.value)} className="mt-1" placeholder="e.g., John Doe" />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={createEmail} onChange={e => setCreateEmail(e.target.value)} className="mt-1" placeholder="john@example.com" type="email" />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" value={createPass} onChange={e => setCreatePass(e.target.value)} className="mt-1" placeholder="Min 8 characters" />
          </div>
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
            ✓ New user will have <strong>isolated data</strong> and start with demo data
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setShowCreateUser(false)}>Cancel</Button>
            <Button onClick={handleCreateUser}>Create User</Button>
          </div>
        </div>
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Edit Account">
        {editUser && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Display Name</Label>
                <Input value={editUser.displayName} onChange={e => setEditUser({ ...editUser, displayName: e.target.value })} className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label>Email</Label>
                <Input value={editUser.email} onChange={e => setEditUser({ ...editUser, email: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div className="p-3 rounded-lg border border-border bg-muted/30">
              <div className="flex items-center gap-2 text-xs font-medium mb-3">
                <Lock size={12} /> Change Password (leave blank to keep current)
              </div>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">New Password</Label>
                  <Input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} className="mt-1" placeholder="Min 8 characters" />
                </div>
                <div>
                  <Label className="text-xs">Confirm Password</Label>
                  <Input type="password" value={newPass2} onChange={e => setNewPass2(e.target.value)} className="mt-1" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
              <Button onClick={handleSaveUser}>Save Changes</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
