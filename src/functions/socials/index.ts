import type { FunctionManifest, FunctionInstance } from "../registry/types";

const socialsManifest: FunctionManifest = {
  name: "socials",
  label: "Socials Updater",
  description: "Post updates to social media platforms from Discord",
  icon: "📱",
  version: "1.0.0",
  configSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "Discord channel to monitor for posts" },
      platforms: {
        type: "array",
        items: { type: "string", enum: ["twitter", "bluesky", "mastodon"] },
        description: "Platforms to post to",
      },
      twitterBearerToken: { type: "string", description: "Twitter/X Bearer Token (optional)" },
      postFormat: { type: "string", default: "{message}", description: "Post format template" },
      autoPost: { type: "boolean", default: true, description: "Auto-post when a message is sent" },
    },
    required: ["channelId"],
  },
  defaultConfig: {
    channelId: "",
    platforms: [],
    twitterBearerToken: "",
    postFormat: "{message}",
    autoPost: true,
  },
  commands: [],
  async createInstance(config: Record<string, unknown>): Promise<FunctionInstance> {
    const currentConfig = { ...config };
    return {
      name: "socials",
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

export { socialsManifest };
