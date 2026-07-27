import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  permissions: string;
}

export interface DiscordUser {
  id: string;
  username: string;
  avatar: string | null;
}

interface GuildState {
  discordUser: DiscordUser | null;
  guilds: DiscordGuild[];
  selectedGuildId: string | null;
  setDiscordData: (user: DiscordUser, guilds: DiscordGuild[]) => void;
  selectGuild: (guildId: string | null) => void;
  clearDiscord: () => void;
}

export const useGuildStore = create<GuildState>()(
  persist(
    (set) => ({
      discordUser: null,
      guilds: [],
      selectedGuildId: null,

      setDiscordData: (user, guilds) =>
        set({ discordUser: user, guilds, selectedGuildId: guilds[0]?.id ?? null }),

      selectGuild: (guildId) => set({ selectedGuildId: guildId }),

      clearDiscord: () =>
        set({ discordUser: null, guilds: [], selectedGuildId: null }),
    }),
    {
      name: "guild-storage",
      partialize: (state) => ({
        discordUser: state.discordUser,
        guilds: state.guilds,
        selectedGuildId: state.selectedGuildId,
      }),
    }
  )
);
