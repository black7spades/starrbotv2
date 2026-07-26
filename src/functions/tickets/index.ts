import type { FunctionManifest, FunctionInstance } from "../registry/types";
import { SlashCommandBuilder, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

let ticketCounter = 0;

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
    let ticketsCreated = 0;

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
        const channelId = currentConfig.adminChannelId as string;

        if (!channelId) {
          await interaction.reply({
            content: "❌ Tickets function is not configured. Please set an admin channel in the function settings.",
            ephemeral: true,
          });
          return;
        }

        await interaction.deferReply({ ephemeral: true });

        const channel = await interaction.client.channels.fetch(channelId);
        if (!channel || channel.type !== ChannelType.GuildText) {
          await interaction.editReply({ content: "❌ configured admin channel not found or is not a text channel." });
          return;
        }

        ticketCounter++;
        const ticketId = `TICKET-${String(ticketCounter).padStart(4, "0")}`;

        const embed = new EmbedBuilder()
          .setTitle(`${ticketId}: ${subject}`)
          .setDescription(description)
          .addFields(
            { name: "Opened by", value: `<@${interaction.user.id}>`, inline: true },
            { name: "Status", value: "Open", inline: true },
          )
          .setColor(0x5865f2)
          .setTimestamp();

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket:close:${ticketId}`)
            .setLabel("Close Ticket")
            .setStyle(ButtonStyle.Danger),
        );

        const thread = await channel.threads.create({
          name: `${ticketId} - ${subject}`,
          autoArchiveDuration: 10080,
          type: ChannelType.PrivateThread,
          reason: `Ticket from ${interaction.user.username}`,
        });

        await thread.send({ embeds: [embed], components: [row] });

        if (currentConfig.adminRoleId) {
          await thread.members.add(interaction.user.id);
          await thread.send(`<@&${currentConfig.adminRoleId}> New ticket from <@${interaction.user.id}>`);
        }

        ticketsCreated++;

        await interaction.editReply({
          content: `✅ Ticket created! <#${thread.id}>\n\n**${ticketId}**: ${subject}`,
        });
      },
      getStats() {
        return { ticketsCreated };
      },
    };
  },
};

export { ticketsManifest };
