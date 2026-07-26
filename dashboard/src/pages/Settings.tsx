import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useUIStore } from "../store/uiStore";

const SettingsSchema = z.object({
  commandPrefix: z.string().min(1).max(5),
  theme: z.enum(["light", "dark"]),
});

type SettingsForm = z.infer<typeof SettingsSchema>;

const UserSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).optional(),
  role: z.enum(["admin", "viewer"]),
});

type UserForm = z.infer<typeof UserSchema>;

export default function Settings() {
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useUIStore();
  const [settings, setSettings] = useState({ commandPrefix: "!", theme: "dark" as const });
  const [users, setUsers] = useState<Array<{ id: string; username: string; role: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<SettingsForm>({
    resolver: zodResolver(SettingsSchema),
    defaultValues: { commandPrefix: "!", theme: "dark" },
  });

  const {
    register: registerUser,
    handleSubmit: handleUserSubmit,
    reset: resetUserForm,
    formState: { errors: userErrors },
  } = useForm<UserForm>({
    resolver: zodResolver(UserSchema),
  });

  useEffect(() => {
    loadSettings();
    loadUsers();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await api.getSettings();
      setSettings(data);
      if (data.theme) setTheme(data.theme);
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (err) {
      console.error("Failed to load users:", err);
    }
  };

  const onSettingsSubmit = async (data: SettingsForm) => {
    try {
      await api.updateSettings(data);
      setSettings(data);
      if (data.theme) setTheme(data.theme);
      alert("Settings saved");
    } catch (err: any) {
      alert(err.message || "Failed to save settings");
    }
  };

  const onCreateUser = async (data: UserForm) => {
    try {
      await api.createUser(data);
      resetUserForm();
      setShowCreateUser(false);
      loadUsers();
    } catch (err: any) {
      alert(err.message || "Failed to create user");
    }
  };

  const onUpdateUser = async (id: string, data: Partial<UserForm>) => {
    try {
      await api.updateUser(id, data);
      setEditingUser(null);
      loadUsers();
    } catch (err: any) {
      alert(err.message || "Failed to update user");
    }
  };

  const deleteUser = async (id: string) => {
    if (id === user?.id) return alert("Cannot delete yourself");
    if (!confirm("Delete this user?")) return;
    try {
      await api.deleteUser(id);
      loadUsers();
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
        <form onSubmit={handleSubmit(onSettingsSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Command Prefix</label>
            <input
              {...register("commandPrefix")}
              className="w-full max-w-xs px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent"
            />
            {errors.commandPrefix && <p className="text-discord-red text-sm mt-1">{errors.commandPrefix.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Theme</label>
            <select
              {...register("theme")}
              className="w-full max-w-xs px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent"
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>

          <button type="submit" className="btn-primary">Save Settings</button>
        </form>
      </section>

      {/* User Management */}
      <section className="p-6 bg-discord-card rounded-xl border border-discord-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">User Management</h2>
          <button
            onClick={() => { setShowCreateUser(true); resetUserForm(); }}
            className="btn-primary"
          >
            + Add User
          </button>
        </div>

        {showCreateUser && (
          <form onSubmit={handleUserSubmit(onCreateUser)} className="mb-6 p-4 bg-discord-input/50 rounded-lg space-y-4">
            <h3 className="font-semibold">Create New User</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium mb-1">Username</label>
                <input
                  {...registerUser("username")}
                  className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent"
                />
                {userErrors.username && <p className="text-discord-red text-sm mt-1">{userErrors.username.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Role</label>
                <select
                  {...registerUser("role")}
                  className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent"
                >
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Password</label>
                <input
                  type="password"
                  {...registerUser("password")}
                  className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent"
                />
                {userErrors.password && <p className="text-discord-red text-sm mt-1">{userErrors.password.message}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setShowCreateUser(false); resetUserForm(); }} className="btn-secondary">
                Cancel
              </button>
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
                            onClick={() => { setEditingUser(u.id); }}
                            className="text-discord-muted hover:text-discord-text text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteUser(u.id)}
                            className="text-discord-red hover:text-discord-red/80 text-sm"
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
              <form onSubmit={(e) => { e.preventDefault(); onUpdateUser(editingUser!, { role: (e.target as any).role.value }); setEditingUser(null); }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Role</label>
                  <select
                    name="role"
                    defaultValue={users.find(u => u.id === editingUser)?.role}
                    className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">New Password (optional)</label>
                  <input
                    type="password"
                    name="password"
                    className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent"
                    placeholder="Leave empty to keep current"
                  />
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