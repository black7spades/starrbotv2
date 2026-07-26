import type { FunctionManifest, FunctionInstance } from "../registry/types";

const updatesManifest: FunctionManifest = {
  name: "updates",
  label: "Updates",
  description: "Monitor RSS feeds and post updates to Discord",
  icon: "📡",
  version: "2.0.0",
  configSchema: {
    type: "object",
    properties: {
      rsshubUrl: { type: "string", default: "http://rsshub:12000", description: "RSSHub base URL" },
      checkInterval: { type: "number", default: 15, minimum: 1, maximum: 1440, description: "Check interval in minutes" },
      channelId: { type: "string", description: "Discord channel ID to post updates" },
      sources: {
        type: "array",
        items: {
          type: "object",
          properties: {
            url: { type: "string", format: "uri" },
            label: { type: "string" },
          },
          required: ["url"],
        },
      },
    },
    required: ["channelId"],
  },
  defaultConfig: {
    rsshubUrl: "http://rsshub:12000",
    checkInterval: 15,
    channelId: "",
    sources: [],
  },
  commands: [],
  async createInstance(config: Record<string, unknown>): Promise<FunctionInstance> {
    const currentConfig = { ...config };
    return {
      name: "updates",
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

export { updatesManifest };
