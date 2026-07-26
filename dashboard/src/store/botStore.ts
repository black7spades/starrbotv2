import { create } from "zustand";

interface BotStoreState {
  selectedBot: any | null;
  selectBot: (bot: any) => void;
}

export const useBotStore = create<BotStoreState>((set) => ({
  selectedBot: null,
  selectBot: (bot) => set({ selectedBot: bot }),
}));
