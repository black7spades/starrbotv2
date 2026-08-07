import { useState, useEffect } from "react";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import ThemeSwitcher from "../components/ThemeSwitcher";
import { useGuildStore } from "../store/guildStore";

interface SettingsData {
  baseUrl: string;
  discordClientId: string;
  discordClientSecret: string;
  discordClientSecretSet: boolean;
  twitchClientId: string;
  twitchClientSecret: string;
  twitchClientSecretSet: boolean;
  twitchEventsubSecret: string;
  twitchEventsubSecretSet: boolean;
}

function SecretField({
  label,
  value,
  isSet,
  onChange,
  placeholder,
  description,
}: {
  label: string;
  value: string;
  isSet: boolean;
  onChange: (v: string) => void;
  placeholder?: string;
  description?: string;
}) {
  const [visible, setVisible] = useState(false);
  const isMasked = value.startsWith("••••");

  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {description && (
        <p className="text-xs text-discord-muted mb-1.5">{description}</p>
      )}
      <div className="relative">
        <input
          type={visible || isMasked ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (isMasked) onChange("");
          }}
          placeholder={placeholder || (isSet ? "Saved — click to change" : "Not set")}
          className="w-full px-3 py-2 pr-10 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent font-mono text-sm"
        />
        {!isMasked && value && (
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-discord-muted hover:text-discord-text transition-colors"
            title={visible ? "Hide" : "Show"}
          >
            {visible ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuthStore();
  const { discordUser, guilds, clearDiscord } = useGuildStore();
  const [users, setUsers] = useState<Array<{ id: string; username: string; role: string }>>([]);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "viewer">("viewer");
  const [editRole, setEditRole] = useState<"admin" | "viewer">("viewer");
  const [editPassword, setEditPassword] = useState("");

  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [draft, setDraft] = useState<Partial<SettingsData>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getUsers().then(setUsers).catch(() => {});
    api.getSettings().then((s: SettingsData) => {
      setSettings(s);
      setDraft({
        baseUrl: s.baseUrl,
        discordClientId: s.discordClientId,
        discordClientSecret: s.discordClientSecret,
        twitchClientId: s.twitchClientId,
        twitchClientSecret: s.twitchClientSecret,
        twitchEventsubSecret: s.twitchEventsubSecret,
      });
    }).catch(() => {});
  }, []);

  const setField = (key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const hasChanges = settings && draft && (
    draft.baseUrl !== settings.baseUrl ||
    draft.discordClientId !== settings.discordClientId ||
    draft.discordClientSecret !== settings.discordClientSecret ||
    draft.twitchClientId !== settings.twitchClientId ||
    draft.twitchClientSecret !== settings.twitchClientSecret ||
    draft.twitchEventsubSecret !== settings.twitchEventsubSecret
  );

  const saveIntegration = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const updated = await api.updateSettings(draft) as SettingsData;
      setSettings(updated);
      setDraft({
        baseUrl: updated.baseUrl,
        discordClientId: updated.discordClientId,
        discordClientSecret: updated.discordClientSecret,
        twitchClientId: updated.twitchClientId,
        twitchClientSecret: updated.twitchClientSecret,
        twitchEventsubSecret: updated.twitchEventsubSecret,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      alert(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
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
          <div className="max-w-sm">
            <ThemeSwitcher />
          </div>
        </div>
      </section>

      {/* Integration Settings */}
      {settings && draft && (
        <section className="p-6 bg-discord-card rounded-xl border border-discord-border">
          <h2 className="text-lg font-semibold mb-1">Integration</h2>
          <p className="text-sm text-discord-muted mb-6">
            Credentials for Discord OAuth and Twitch EventSub. These can also be
            set via environment variables — dashboard values take priority.
          </p>

          <div className="space-y-6">
            {/* Base URL */}
            <div>
              <label className="block text-sm font-medium mb-1">Base URL</label>
              <p className="text-xs text-discord-muted mb-1.5">
                Your public URL. Used for Discord OAuth redirect and Twitch EventSub callback.
              </p>
              <input
                type="url"
                value={draft.baseUrl ?? ""}
                onChange={(e) => setField("baseUrl", e.target.value)}
                placeholder="https://bot.yourdomain.com"
                className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent font-mono text-sm"
              />
            </div>

            <hr className="border-discord-border" />

            {/* Discord */}
            <div>
              <h3 className="text-sm font-semibold text-discord-muted uppercase tracking-wider mb-3">Discord</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1">Client ID</label>
                  <input
                    type="text"
                    value={draft.discordClientId ?? ""}
                    onChange={(e) => setField("discordClientId", e.target.value)}
                    placeholder="Not set"
                    className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent font-mono text-sm"
                  />
                </div>
                <SecretField
                  label="Client Secret"
                  value={draft.discordClientSecret ?? ""}
                  isSet={settings.discordClientSecretSet}
                  onChange={(v) => setField("discordClientSecret", v)}
                />
              </div>
            </div>

            <hr className="border-discord-border" />

            {/* Twitch */}
            <div>
              <h3 className="text-sm font-semibold text-discord-muted uppercase tracking-wider mb-3">Twitch</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1">Client ID</label>
                  <p className="text-xs text-discord-muted mb-1.5">
                    From dev.twitch.tv/console/apps
                  </p>
                  <input
                    type="text"
                    value={draft.twitchClientId ?? ""}
                    onChange={(e) => setField("twitchClientId", e.target.value)}
                    placeholder="Not set"
                    className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent font-mono text-sm"
                  />
                </div>
                <SecretField
                  label="Client Secret"
                  value={draft.twitchClientSecret ?? ""}
                  isSet={settings.twitchClientSecretSet}
                  onChange={(v) => setField("twitchClientSecret", v)}
                />
              </div>
              <div className="mt-4">
                <SecretField
                  label="EventSub Secret"
                  value={draft.twitchEventsubSecret ?? ""}
                  isSet={settings.twitchEventsubSecretSet}
                  onChange={(v) => setField("twitchEventsubSecret", v)}
                  description="Signing secret for webhook callbacks. Auto-generated in Docker if unset."
                />
              </div>
            </div>
          </div>

          {/* Save bar */}
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-discord-border">
            {saved && (
              <span className="text-sm text-green-400">Saved</span>
            )}
            <button
              onClick={saveIntegration}
              disabled={saving || !hasChanges}
              className="btn-primary disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </section>
      )}

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
            <p className="text-sm text-discord-muted mb-3">Connect your Discord account to detect your servers and manage bots per server.</p>
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
