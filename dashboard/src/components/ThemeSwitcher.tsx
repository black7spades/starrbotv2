import { useUIStore, THEME_PRESETS, type ThemeMode } from "../store/uiStore";
import Icon, { type IconName } from "./Icon";

const MODES: { id: ThemeMode; label: string; icon: IconName }[] = [
  { id: "light", label: "Light", icon: "sun" },
  { id: "dark", label: "Dark", icon: "moon" },
  { id: "system", label: "Auto", icon: "monitor" },
];

/**
 * Preset + light/dark picker. The two axes are shown separately because they
 * are independent: every preset works in both modes.
 */
export default function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { preset, mode, setPreset, setMode } = useUIStore();

  return (
    <div className="space-y-3">
      <div>
        {!compact && <span className="label">Theme</span>}
        <div className="grid grid-cols-3 gap-2">
          {THEME_PRESETS.map((p) => {
            const active = p.id === preset;
            return (
              <button
                key={p.id}
                onClick={() => setPreset(p.id)}
                title={`${p.label} — ${p.blurb}`}
                aria-pressed={active}
                className="glass glass-hover p-2 flex flex-col items-center gap-1.5 text-center"
                style={active ? { borderColor: "var(--accent)" } : undefined}
              >
                <span
                  className="flex h-6 w-full overflow-hidden"
                  style={{ borderRadius: "var(--radius-sm)" }}
                  aria-hidden="true"
                >
                  {p.swatch.map((c) => (
                    <span key={c} className="flex-1" style={{ background: c }} />
                  ))}
                </span>
                <span className="text-[10px] leading-tight font-medium text-ink">{p.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        {!compact && <span className="label">Appearance</span>}
        <div className="glass p-1 grid grid-cols-3 gap-1">
          {MODES.map((m) => {
            const active = m.id === mode;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                aria-pressed={active}
                className="flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium transition-colors"
                style={{
                  borderRadius: "var(--radius-sm)",
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "var(--accent-contrast)" : "var(--text-muted)",
                }}
              >
                <Icon name={m.icon} size={14} />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
