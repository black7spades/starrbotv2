import type { FunctionManifest, FunctionInstance } from "../registry/types";

const ticketsManifest: FunctionManifest = {
  name: "tickets",
  label: "Tickets",
  description: "Support ticket system with Discord threads and DM relay",
  icon: "🎫",
  version: "2.0.0",
  configSchema: {
    type: "object",
    properties: {
      adminChannelId: { type: "string", description: "Channel where tickets are created" },
      adminRoleId: { type: "string", description: "Role that can manage tickets (optional)" },
    },
    required: ["adminChannelId"],
  },
  defaultConfig: {
    adminChannelId: "",
    adminRoleId: "",
  },
  commands: [],
  async createInstance(config: Record<string, unknown>): Promise<FunctionInstance> {
    const currentConfig = { ...config };
    return {
      name: "tickets",
      config: currentConfig,
      async onLoad(bot: any) {},
      async onUnload() {},
      async onConfigChange(newConfig: Record<string, unknown>) {
        Object.assign(currentConfig, newConfig);
      },
      getStats() {
        return {};
      },
    };
  },
};

export { ticketsManifest };
