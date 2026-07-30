import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "../store/authStore";
import { api } from "../api/client";
import Icon from "./Icon";
import ThemeSwitcher from "./ThemeSwitcher";

/** Client-side ceiling; the API enforces its own limit on the encoded value. */
const MAX_UPLOAD_BYTES = 256 * 1024;

function Avatar({ url, name, size = 32 }: { url?: string | null; name?: string; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="rounded-full grid place-items-center font-semibold display"
      style={{
        width: size,
        height: size,
        background: "var(--accent)",
        color: "var(--accent-contrast)",
        fontSize: size * 0.42,
      }}
    >
      {name?.charAt(0).toUpperCase() ?? "?"}
    </span>
  );
}

export default function ProfileMenu() {
  const { user, setUser } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"menu" | "profile" | "password">("menu");
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape — a menu that traps you is worse than
  // no menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setPanel("menu");
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="glass glass-hover flex items-center gap-2 pl-1.5 pr-2.5 py-1.5"
        style={{ borderRadius: 999 }}
      >
        <Avatar url={user?.avatarUrl} name={user?.username} size={28} />
        <span className="text-sm font-medium hidden sm:block text-ink">{user?.username}</span>
        <Icon name="chevron-down" size={14} className="text-ink-muted" />
      </button>

      {open && (
        <div
          role="menu"
          className="glass-strong absolute right-0 mt-2 w-80 p-3 z-50"
          style={{ borderRadius: "var(--radius-lg)" }}
        >
          {panel === "menu" && (
            <MenuPanel
              onProfile={() => setPanel("profile")}
              onPassword={() => setPanel("password")}
            />
          )}
          {panel === "profile" && (
            <ProfilePanel
              onBack={() => setPanel("menu")}
              onSaved={(u) => {
                setUser({ ...(user as any), ...u });
                setPanel("menu");
              }}
            />
          )}
          {panel === "password" && <PasswordPanel onBack={() => setPanel("menu")} />}
        </div>
      )}
    </div>
  );
}

function MenuPanel({ onProfile, onPassword }: { onProfile: () => void; onPassword: () => void }) {
  const { user } = useAuthStore();
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 px-1 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
        <Avatar url={user?.avatarUrl} name={user?.username} size={40} />
        <div className="min-w-0">
          <p className="font-semibold truncate text-ink">{user?.username}</p>
          <p className="text-xs capitalize text-ink-muted">{user?.role}</p>
        </div>
      </div>

      <div className="space-y-1">
        <MenuItem icon="user" label="Edit profile" onClick={onProfile} />
        <MenuItem icon="key" label="Change password" onClick={onPassword} />
      </div>

      <div className="pt-3 border-t" style={{ borderColor: "var(--border)" }}>
        <ThemeSwitcher />
      </div>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: "user" | "key";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left glass-hover text-ink-muted hover:text-ink"
      style={{ borderRadius: "var(--radius-sm)" }}
    >
      <Icon name={icon} size={16} />
      <span className="flex-1">{label}</span>
      <Icon name="chevron-right" size={14} />
    </button>
  );
}

function ProfilePanel({
  onBack,
  onSaved,
}: {
  onBack: () => void;
  onSaved: (u: { username: string; avatarUrl?: string | null }) => void;
}) {
  const { user } = useAuthStore();
  const [username, setUsername] = useState(user?.username ?? "");
  const [avatar, setAvatar] = useState<string | null>(user?.avatarUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFile = (file: File) => {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("That file is not an image");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Image must be under 256 KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatar(String(reader.result));
    reader.onerror = () => setError("Could not read that file");
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateProfile({ username, avatarUrl: avatar });
      onSaved(res.user);
    } catch (e: any) {
      setError(e.message || "Could not save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <PanelHeader title="Edit profile" onBack={onBack} />

      <div className="flex items-center gap-3">
        <Avatar url={avatar} name={username} size={56} />
        <div className="flex-1 space-y-1.5">
          <button className="btn-secondary w-full text-xs" onClick={() => fileRef.current?.click()}>
            <Icon name="image" size={14} />
            Upload image
          </button>
          {avatar && (
            <button className="btn-ghost w-full text-xs" onClick={() => setAvatar(null)}>
              Remove
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickFile(f);
            e.target.value = "";
          }}
        />
      </div>

      <div>
        <label className="label" htmlFor="profile-username">
          Username
        </label>
        <input
          id="profile-username"
          className="field"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          minLength={3}
          maxLength={32}
        />
      </div>

      {error && <ErrorNote message={error} />}

      <button className="btn-primary w-full" onClick={save} disabled={saving || username.length < 3}>
        {saving && <Icon name="spinner" size={14} />}
        Save changes
      </button>
    </div>
  );
}

function PasswordPanel({ onBack }: { onBack: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const valid = current.length > 0 && next.length >= 8 && next === confirm;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.changePassword(current, next);
      // The server revokes every session on a password change, so send the user
      // back to sign in rather than leaving a dead session in the tab.
      window.location.href = "/login";
    } catch (e: any) {
      setError(e.message || "Could not change password");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <PanelHeader title="Change password" onBack={onBack} />

      <div>
        <label className="label" htmlFor="pw-current">
          Current password
        </label>
        <input
          id="pw-current"
          type="password"
          className="field"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      <div>
        <label className="label" htmlFor="pw-new">
          New password
        </label>
        <input
          id="pw-new"
          type="password"
          className="field"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
        />
        <p className="text-[11px] mt-1 text-ink-faint">At least 8 characters.</p>
      </div>
      <div>
        <label className="label" htmlFor="pw-confirm">
          Confirm new password
        </label>
        <input
          id="pw-confirm"
          type="password"
          className="field"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
        {mismatch && <p className="text-[11px] mt-1" style={{ color: "var(--status-error)" }}>Passwords do not match.</p>}
      </div>

      {error && <ErrorNote message={error} />}

      <p className="text-[11px] text-ink-faint">
        Changing your password signs you out everywhere.
      </p>

      <button className="btn-primary w-full" onClick={save} disabled={!valid || saving}>
        {saving && <Icon name="spinner" size={14} />}
        Update password
      </button>
    </div>
  );
}

function PanelHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: "var(--border)" }}>
      <button onClick={onBack} className="btn-ghost !px-1.5 !py-1" aria-label="Back">
        <Icon name="chevron-right" size={16} className="rotate-180" />
      </button>
      <h3 className="text-sm font-semibold display text-ink">{title}</h3>
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      className="text-xs flex items-start gap-1.5 px-2.5 py-2"
      style={{
        color: "var(--status-error)",
        background: "var(--surface)",
        borderRadius: "var(--radius-sm)",
      }}
      role="alert"
    >
      <Icon name="alert" size={14} />
      {message}
    </p>
  );
}
