import type { FunctionManifest, FunctionInstance } from "../registry/types";
import { SlashCommandBuilder } from "discord.js";

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
  commands: [
    new SlashCommandBuilder()
      .setName("updates")
      .setDescription("Manage RSS feed updates")
      .addSubcommand((sub) =>
        sub.setName("check").setDescription("Manually check for new updates")
      )
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("Add a new RSS source")
          .addStringOption((opt) => opt.setName("url").setDescription("RSS feed URL").setRequired(true))
          .addStringOption((opt) => opt.setName("label").setDescription("Display label").setRequired(false))
      )
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("Remove an RSS source")
          .addStringOption((opt) => opt.setName("url").setDescription("RSS feed URL to remove").setRequired(true))
      )
      .addSubcommand((sub) => sub.setName("list").setDescription("List configured RSS sources"))
      .toJSON() as any,
  ],
  async createInstance(config: Record<string, unknown>): Promise<FunctionInstance> {
    const currentConfig = { ...config };
    return {
      name: "updates",
      config: currentConfig,
      async onLoad(bot: any) {
        console.log("[updates] Loaded, monitoring channel:", currentConfig.channelId);
      },
      async onUnload() {},
      async onConfigChange(newConfig: Record<string, unknown>) {
        Object.assign(currentConfig, newConfig);
      },
      async handleCommand(interaction: any) {
        if (interaction.commandName !== "updates") return;
        const sub = interaction.options.getSubcommand();

        if (sub === "check") {
          await interaction.reply({ content: "🔄 Checking for updates...", ephemeral: true });
          // TODO: implement actual check
        } else if (sub === "add") {
          const url = interaction.options.getString("url", true);
          const label = interaction.options.getString("label") || url;
          const sources = (currentConfig.sources as any[]) || [];
          sources.push({ url, label });
          currentConfig.sources = sources;
          await interaction.reply({ content: `✅ Added source: ${label} (${url})`, ephemeral: true });
        } else if (sub === "remove") {
          const url = interaction.options.getString("url", true);
          const sources = ((currentConfig.sources as any[]) || []).filter((s) => s.url !== url);
          currentConfig.sources = sources;
          await interaction.reply({ content: `✅ Removed source: ${url}`, ephemeral: true });
        } else if (sub === "list") {
          const sources = (currentConfig.sources as any[]) || [];
          if (!sources.length) {
            await interaction.reply({ content: "No sources configured.", ephemeral: true });
            return;
          }
          const list = sources.map((s, i) => `${i + 1}. ${s.label} - ${s.url}`).join("\n");
          await interaction.reply({ content: `📋 Sources:\n${list}`, ephemeral: true });
        }
      },
      getStats() {
        return { sources: ((currentConfig.sources as any[]) || []).length };
      },
    };
  },
};

export { updatesManifest };