import type { FunctionManifest, FunctionInstance } from "../registry/types";
import { SlashCommandBuilder } from "discord.js";

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
  commands: [
    new SlashCommandBuilder()
      .setName("socials")
      .setDescription("Post a message to configured social media platforms")
      .addStringOption((opt) =>
        opt.setName("message").setDescription("Message to post").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("platforms").setDescription("Comma-separated platforms (twitter,bluesky,mastodon)").setRequired(false)
      )
      .toJSON() as any,
  ],
  async createInstance(config: Record<string, unknown>): Promise<FunctionInstance> {
    const currentConfig = { ...config };
    return {
      name: "socials",
      config: currentConfig,
      async onLoad(bot: any) {
        console.log("[socials] Loaded, monitoring channel:", currentConfig.channelId);
      },
      async onUnload() {},
      async onConfigChange(newConfig: Record<string, unknown>) {
        Object.assign(currentConfig, newConfig);
      },
      async onMessage(message: any, bot: any, context: any) {
        const cfg = currentConfig;
        if (!cfg.autoPost || message.channelId !== cfg.channelId) return;
        if (message.author?.bot) return;

        const content = message.content;
        if (!content) return;

        // TODO: implement actual posting to platforms
        console.log("[socials] Would post to:", cfg.platforms, "message:", content);
        // await postToPlatforms(cfg.platforms, content, cfg);
      },
      async handleCommand(interaction: any) {
        if (interaction.commandName !== "socials") return;
        const message = interaction.options.getString("message", true);
        const platformsOpt = interaction.options.getString("platforms");
        const cfg = currentConfig;
        const platforms = platformsOpt ? platformsOpt.split(",").map((p) => p.trim()) : cfg.platforms;

        if (!platforms.length) {
          await interaction.reply({ content: "No platforms configured. Please configure the function first.", ephemeral: true });
          return;
        }

        // TODO: implement actual posting
        await interaction.reply({ content: `📱 Would post to ${platforms.join(", ")}: ${message}`, ephemeral: true });
      },
      getStats() {
        return { postsSent: 0 };
      },
    };
  },
};

export { socialsManifest };