import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "../api/client";

interface JWTPayload {
  id: string;
  username: string;
  role: "admin" | "viewer";
  avatarUrl?: string | null;
}

interface AuthState {
  user: JWTPayload | null;
  loading: boolean;
  initAuth: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Applies a profile change returned by the API to the cached session. */
  setUser: (user: JWTPayload) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      loading: true,

      initAuth: async () => {
        try {
          const res = await api.getMe();
          set({ user: (res.user as JWTPayload) || null, loading: false });
        } catch {
          set({ user: null, loading: false });
        }
      },

      login: async (username: string, password: string) => {
        const res = await api.login(username, password);
        set({ user: res.user as JWTPayload, loading: false });
      },

      logout: async () => {
        await api.logout();
        set({ user: null });
      },

      setUser: (user: JWTPayload) => set({ user }),
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ user: state.user }),
    }
  )
);