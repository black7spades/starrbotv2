import type { FunctionManifest, FunctionInstance } from "../registry/types";
import { SlashCommandBuilder } from "discord.js";

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
  commands: [
    new SlashCommandBuilder()
      .setName("ticket")
      .setDescription("Create a new support ticket")
      .addStringOption((opt) =>
        opt.setName("subject").setDescription("Ticket subject").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("description").setDescription("Ticket description").setRequired(false)
      )
      .toJSON() as any,
  ],
  async createInstance(config: Record<string, unknown>): Promise<FunctionInstance> {
    const currentConfig = { ...config };
    return {
      name: "tickets",
      config: currentConfig,
      async onLoad(bot: any) {
        console.log("[tickets] Loaded, admin channel:", currentConfig.adminChannelId);
      },
      async onUnload() {},
      async onConfigChange(newConfig: Record<string, unknown>) {
        Object.assign(currentConfig, newConfig);
      },
      async handleCommand(interaction: any) {
        if (interaction.commandName !== "ticket") return;
        const subject = interaction.options.getString("subject", true);
        const description = interaction.options.getString("description") || "No description provided";

        // TODO: implement actual ticket creation
        await interaction.reply({ content: `🎫 Ticket created: ${subject}\n${description}`, ephemeral: true });
      },
      getStats() {
        return { ticketsCreated: 0 };
      },
    };
  },
};

export { ticketsManifest };