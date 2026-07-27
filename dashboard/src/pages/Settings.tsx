import { useState, useEffect } from "react";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useUIStore } from "../store/uiStore";
import { useGuildStore } from "../store/guildStore";

export default function Settings() {
  const { user } = useAuthStore();
  const { theme, setTheme } = useUIStore();
  const { discordUser, guilds, clearDiscord } = useGuildStore();
  const [users, setUsers] = useState<Array<{ id: string; username: string; role: string }>>([]);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "viewer">("viewer");
  const [editRole, setEditRole] = useState<"admin" | "viewer">("viewer");
  const [editPassword, setEditPassword] = useState("");

  useEffect(() => {
    api.getUsers().then(setUsers).catch(() => {});
  }, []);

  const handleThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const t = e.target.value as "light" | "dark" | "system";
    setTheme(t);
    api.updateSettings({ theme: t }).catch(() => {});
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createUser({ username: newUsername, password: newPassword, role: newRole });
      setNewUsername(""); setNewPassword(""); setNewRole("viewer");
      setShowCreateUser(false);
      api.getUsers().then(setUsers);
    } catch (err: any) {
      alert(err.message || "Failed to create user");
    }
  };

  const updateUser = async (id: string) => {
    try {
      await api.updateUser(id, { role: editRole, ...(editPassword ? { password: editPassword } : {}) });
      setEditingUser(null);
      setEditPassword("");
      api.getUsers().then(setUsers);
    } catch (err: any) {
      alert(err.message || "Failed to update user");
    }
  };

  const deleteUser = async (id: string) => {
    if (id === user?.id) return alert("Cannot delete yourself");
    if (!confirm("Delete this user?")) return;
    try {
      await api.deleteUser(id);
      api.getUsers().then(setUsers);
    } catch (err: any) {
      alert(err.message || "Failed to delete user");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* General Settings */}
      <section className="p-6 bg-discord-card rounded-xl border border-discord-border">
        <h2 className="text-lg font-semibold mb-4">General</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Theme</label>
            <select
              value={theme}
              onChange={handleThemeChange}
              className="w-full max-w-xs px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent"
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
          </div>
        </div>
      </section>

      {/* Discord Connection */}
      <section className="p-6 bg-discord-card rounded-xl border border-discord-border">
        <h2 className="text-lg font-semibold mb-4">Discord Connection</h2>
        {discordUser ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {discordUser.avatar ? (
                <img src={discordUser.avatar} alt="" className="w-10 h-10 rounded-full" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-discord-accent flex items-center justify-center text-white font-medium">
                  {discordUser.username.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-medium">{discordUser.username}</p>
                <p className="text-sm text-discord-muted">{guilds.length} server{guilds.length !== 1 ? "s" : ""} found</p>
              </div>
            </div>
            <button
              onClick={() => { if (confirm("Disconnect Discord account?")) clearDiscord(); }}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-discord-red/10 text-discord-red hover:bg-discord-red/20 transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-discord-muted mb-3">Connect your Discord account to detect your servers and manage bots per guild.</p>
            <a href={api.discordAuthUrl()} className="btn-primary inline-block">
              Connect Discord
            </a>
          </div>
        )}
      </section>

      {/* User Management */}
      <section className="p-6 bg-discord-card rounded-xl border border-discord-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">User Management</h2>
          <button
            onClick={() => { setShowCreateUser(true); setNewUsername(""); setNewPassword(""); setNewRole("viewer"); }}
            className="btn-primary"
          >
            + Add User
          </button>
        </div>

        {showCreateUser && (
          <form onSubmit={createUser} className="mb-6 p-4 bg-discord-input/50 rounded-lg space-y-4">
            <h3 className="font-semibold">Create New User</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium mb-1">Username</label>
                <input value={newUsername} onChange={e => setNewUsername(e.target.value)} required minLength={3} className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Role</label>
                <select value={newRole} onChange={e => setNewRole(e.target.value as "admin" | "viewer")} className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent">
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8} className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreateUser(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">Create User</button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-discord-muted border-b border-discord-border">
                <th className="pb-3">Username</th>
                <th className="pb-3">Role</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-discord-border/50">
                  <td className="py-3">{u.username}</td>
                  <td className="py-3">
                    <span className={`px-2 py-1 text-xs rounded ${u.role === "admin" ? "bg-discord-accent/20 text-discord-accent" : "bg-discord-muted/20 text-discord-muted"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      {u.id !== user?.id && (
                        <>
                          <button
                            onClick={() => { setEditingUser(u.id); setEditRole(u.role as "admin" | "viewer"); setEditPassword(""); }}
                            className="btn-secondary text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteUser(u.id)}
                            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-discord-red/10 text-discord-red hover:bg-discord-red/20 transition-colors"
                          >
                            Delete
                          </button>
                        </>
                      )}
                      {u.id === user?.id && <span className="text-xs text-discord-muted">(you)</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {editingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-discord-card rounded-xl border border-discord-border p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">Edit User: {users.find(u => u.id === editingUser)?.username}</h3>
              <form onSubmit={(e) => { e.preventDefault(); updateUser(editingUser); }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Role</label>
                  <select value={editRole} onChange={e => setEditRole(e.target.value as "admin" | "viewer")} className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent">
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">New Password (optional)</label>
                  <input type="password" value={editPassword} onChange={e => setEditPassword(e.target.value)} className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent" placeholder="Leave empty to keep current" />
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setEditingUser(null)} className="btn-secondary">Cancel</button>
                  <button type="submit" className="btn-primary">Save</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}