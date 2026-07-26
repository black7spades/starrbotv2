import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark" | "system";

interface UIState {
  theme: Theme;
  sidebarOpen: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  initTheme: () => void;
}

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

let mediaQueryCleanup: (() => void) | null = null;

function watchSystemTheme() {
  if (mediaQueryCleanup) mediaQueryCleanup();
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => {
    const current = useUIStore.getState().theme;
    if (current === "system") applyTheme("system");
  };
  mq.addEventListener("change", handler);
  mediaQueryCleanup = () => mq.removeEventListener("change", handler);
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      theme: "system",
      sidebarOpen: true,

      toggleTheme: () => set((state) => {
        const next = state.theme === "dark" ? "light" : state.theme === "light" ? "system" : "dark";
        applyTheme(next);
        return { theme: next };
      }),
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      initTheme: () => {
        applyTheme(get().theme);
        watchSystemTheme();
      },
    }),
    {
      name: "ui-storage",
    }
  )
);