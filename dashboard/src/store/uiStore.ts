import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Theme is two independent axes: a preset (hue family) and a mode (light/dark,
 * or follow the OS). Three presets x light/dark gives the six looks without
 * needing six separate definitions.
 */
export type ThemePreset = "baby-pink" | "midnight-blue" | "emerald-tears";
export type ThemeMode = "light" | "dark" | "system";
type ViewMode = "table" | "cards";

export const THEME_PRESETS: {
  id: ThemePreset;
  label: string;
  blurb: string;
  /** Picker swatch: [base, accent, soft accent]. */
  swatch: [string, string, string];
}[] = [
  {
    id: "baby-pink",
    label: "Baby Pink",
    blurb: "Purple & light red",
    swatch: ["#1a0d1a", "#cc44cc", "#ff7777"],
  },
  {
    id: "midnight-blue",
    label: "Midnight Blue",
    blurb: "Blue & light blue",
    swatch: ["#05061c", "#0088ff", "#aaffee"],
  },
  {
    id: "emerald-tears",
    label: "Emerald Tears",
    blurb: "Green & cyan",
    swatch: ["#04160f", "#00cc55", "#aaffee"],
  },
];

interface UIState {
  preset: ThemePreset;
  mode: ThemeMode;
  viewMode: ViewMode;
  sidebarOpen: boolean;
  setPreset: (preset: ThemePreset) => void;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  toggleSidebar: () => void;
  toggleViewMode: () => void;
  initTheme: () => void;
}

function systemMode(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveMode(mode: ThemeMode): "light" | "dark" {
  return mode === "system" ? systemMode() : mode;
}

function applyTheme(preset: ThemePreset, mode: ThemeMode) {
  const root = document.documentElement;
  root.setAttribute("data-theme", preset);
  root.setAttribute("data-mode", resolveMode(mode));
}

let unwatch: (() => void) | null = null;

function watchSystem() {
  if (unwatch) unwatch();
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => {
    const { preset, mode } = useUIStore.getState();
    if (mode === "system") applyTheme(preset, mode);
  };
  mq.addEventListener("change", handler);
  unwatch = () => mq.removeEventListener("change", handler);
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      preset: "midnight-blue",
      mode: "dark",
      viewMode: "cards",
      sidebarOpen: true,

      setPreset: (preset) => {
        applyTheme(preset, get().mode);
        set({ preset });
      },
      setMode: (mode) => {
        applyTheme(get().preset, mode);
        set({ mode });
      },
      toggleMode: () =>
        set((state) => {
          // light -> dark -> system -> light
          const next: ThemeMode =
            state.mode === "light" ? "dark" : state.mode === "dark" ? "system" : "light";
          applyTheme(state.preset, next);
          return { mode: next };
        }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      toggleViewMode: () =>
        set((state) => ({ viewMode: state.viewMode === "table" ? "cards" : "table" })),
      initTheme: () => {
        const { preset, mode } = get();
        applyTheme(preset, mode);
        watchSystem();
      },
    }),
    {
      name: "starrbot-ui",
      // v1 persisted { theme: "light"|"dark"|"system" }. Carry it into `mode` so
      // an existing session keeps its light/dark choice instead of resetting.
      version: 2,
      migrate: (persisted: any, version) => {
        if (version < 2 && persisted && typeof persisted.theme === "string") {
          return {
            ...persisted,
            mode: persisted.theme as ThemeMode,
            preset: "midnight-blue" as ThemePreset,
          };
        }
        return persisted;
      },
    }
  )
);
