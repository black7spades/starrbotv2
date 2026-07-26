import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { JWTPayload } from "../../src/config/schema.js";
import { authApi } from "./api/auth";

interface AuthState {
  user: JWTPayload | null;
  loading: boolean;
  initAuth: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      loading: true,

      initAuth: async () => {
        try {
          const res = await authApi.me();
          set({ user: res.user, loading: false });
        } catch {
          set({ user: null, loading: false });
        }
      },

      login: async (username: string, password: string) => {
        const res = await authApi.login(username, password);
        set({ user: res.user, loading: false });
      },

      logout: async () => {
        await authApi.logout();
        set({ user: null });
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ user: state.user }),
    }
  )
);