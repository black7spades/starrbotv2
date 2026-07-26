import type { FunctionManifest, FunctionInstance } from "../registry/types";
import {
  SlashCommandBuilder,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
} from "discord.js";

let ticketCounter = 0;

const ticketsManifest: FunctionManifest = {
  name: "tickets",
  label: "Tickets",
  description: "Support ticket system with Discord threads",
  icon: "🎫",
  version: "2.1.0",
  configSchema: {
    type: "object",
    properties: {
      adminChannelId: { type: "string", description: "Channel where tickets are created" },
      adminRoleId: { type: "string", description: "Role that can manage tickets" },
    },
    required: ["adminChannelId", "adminRoleId"],
  },
  defaultConfig: {
    adminChannelId: "",
    adminRoleId: "",
  },
  commands: [
    new SlashCommandBuilder()
      .setName("ticket")
      .setDescription("Support ticket system")
      .addSubcommand((sub) =>
        sub
          .setName("create")
          .setDescription("Create a new support ticket")
          .addStringOption((opt) => opt.setName("subject").setDescription("Ticket subject").setRequired(true))
          .addStringOption((opt) => opt.setName("message").setDescription("Describe your issue").setRequired(true))
      )
      .addSubcommand((sub) =>
        sub.setName("close").setDescription("Close this ticket (admin only)")
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .toJSON() as any,
  ],
  async createInstance(config: Record<string, unknown>): Promise<FunctionInstance> {
    const currentConfig = { ...config };
    let ticketsCreated = 0;

    async function sendRatingPrompt(thread: any, submitterId: string, closerId: string) {
      const ratingEmbed = new EmbedBuilder()
        .setTitle("Rate Your Experience")
        .setDescription(
          "How satisfied were you with the support you received?\n\n" +
          "React with a number below:\n" +
          "1️⃣ — Unsatisfied\n" +
          "2️⃣ — Not happy\n" +
          "3️⃣ — Okay\n" +
          "4️⃣ — Satisfied\n" +
          "5️⃣ — Overjoyed",
        )
        .setColor(0xfee75c)
        .setFooter({ text: "This thread will archive after you rate." });

      const ratingMsg = await thread.send({ content: `<@${submitterId}>`, embeds: [ratingEmbed] });

      const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];
      for (const emoji of emojis) {
        await ratingMsg.react(emoji);
      }

      const collector = ratingMsg.createReactionCollector({
        filter: (reaction: any, user: any) => user.id === submitterId && emojis.includes(reaction.emoji.name),
        max: 1,
        time: 86400000,
      });

      collector.on("collect", async (reaction: any) => {
        const rating = emojis.indexOf(reaction.emoji.name) + 1;
        const ratingLabels = ["", "Unsatisfied", "Not happy", "Okay", "Satisfied", "Overjoyed"];

        await thread.send({
          embeds: [
            new EmbedBuilder()
              .setDescription(`Thank you! Rating: **${rating}/5** — ${ratingLabels[rating]}`)
              .setColor(0x57f287),
          ],
        });

        await thread.setArchived(true, `Rated ${rating}/5 by submitter`);
      });

      collector.on("end", async (collected: any) => {
        if (collected.size === 0) {
          await thread.send({
            embeds: [
              new EmbedBuilder()
                .setDescription("No rating submitted. Thread archived.")
                .setColor(0x95a5a6),
            ],
          });
          await thread.setArchived(true, "No rating submitted");
        }
      });
    }

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

        const sub = interaction.options.getSubcommand();
        const channelId = currentConfig.adminChannelId as string;
        const adminRoleId = currentConfig.adminRoleId as string;

        if (!channelId || !adminRoleId) {
          await interaction.reply({
            content: "❌ Tickets function is not fully configured. Set admin channel and admin role in function settings.",
            ephemeral: true,
          });
          return;
        }

        if (sub === "create") {
          const subject = interaction.options.getString("subject", true);
          const message = interaction.options.getString("message", true);

          await interaction.deferReply({ ephemeral: true });

          const channel = await interaction.client.channels.fetch(channelId);
          if (!channel || channel.type !== ChannelType.GuildText) {
            await interaction.editReply({ content: "❌ Admin channel not found or is not a text channel." });
            return;
          }

          ticketCounter++;
          const ticketId = `TICKET-${String(ticketCounter).padStart(4, "0")}`;

          const embed = new EmbedBuilder()
            .setTitle(`${ticketId}: ${subject}`)
            .setDescription(message)
            .addFields(
              { name: "Opened by", value: `<@${interaction.user.id}>`, inline: true },
              { name: "Status", value: "Open", inline: true },
            )
            .setColor(0x5865f2)
            .setTimestamp();

          const thread = await channel.threads.create({
            name: `${ticketId} — ${subject}`,
            autoArchiveDuration: 10080,
            reason: `Ticket from ${interaction.user.username}`,
          });

          await thread.members.add(interaction.user.id);
          await thread.send({ embeds: [embed] });
          await thread.send(`<@&${adminRoleId}> New ticket from <@${interaction.user.id}>`);

          ticketsCreated++;

          await interaction.editReply({
            content: `✅ Ticket created!\n\n**${ticketId}**: ${subject}\n<#${thread.id}>`,
          });
        } else if (sub === "close") {
          const thread = interaction.channel;
          if (!thread?.isThread()) {
            await interaction.reply({ content: "❌ This command can only be used inside a ticket thread.", ephemeral: true });
            return;
          }

          const hasRole = interaction.member?.roles?.cache?.has(adminRoleId);
          if (!hasRole) {
            await interaction.reply({ content: "❌ Only admins can close tickets.", ephemeral: true });
            return;
          }

          await interaction.deferReply();

          const openerMatch = thread.name.match(/^TICKET-\d+/);
          const ticketName = openerMatch ? openerMatch[0] : thread.name;

          const closeEmbed = new EmbedBuilder()
            .setTitle(`${ticketName} — Closed`)
            .setDescription(`Closed by <@${interaction.user.id}>. Thank you for reaching out!`)
            .setColor(0xed4245)
            .setTimestamp();

          await interaction.editReply({ embeds: [closeEmbed] });

          const opener = await thread.members.fetch().then((m: any) => {
            return m.find((mem: any) => !mem.user.bot && mem.id !== interaction.user.id);
          });

          const submitterId = opener?.id || thread.ownerId;
          if (submitterId) {
            await sendRatingPrompt(thread, submitterId, interaction.user.id);
          } else {
            await thread.setArchived(true, "Closed — could not identify submitter for rating");
          }
        }
      },
      getStats() {
        return { ticketsCreated };
      },
    };
  },
};

export { ticketsManifest };
