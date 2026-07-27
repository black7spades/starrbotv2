import type { FunctionManifest, FunctionInstance } from "../registry/types";
import {
  SlashCommandBuilder,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { configStore } from "config/store";
import { systemLog } from "utils/systemLog";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const DATA_DIR = join(__dirname, "../../../data");
const COUNTER_FILE = join(DATA_DIR, "ticket-counter.json");

function log(level: "info" | "warn" | "error", msg: string) {
  systemLog.add(level, msg, "tickets");
}

function loadTicketCounter(): number {
  try {
    if (existsSync(COUNTER_FILE)) {
      const data = JSON.parse(readFileSync(COUNTER_FILE, "utf8"));
      return data.counter || 0;
    }
  } catch {}
  return 0;
}

function saveTicketCounter(counter: number): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(COUNTER_FILE, JSON.stringify({ counter }));
  } catch {}
}

let ticketCounter = loadTicketCounter();

const ticketsManifest: FunctionManifest = {
  name: "tickets",
  label: "Tickets",
  description: "Support ticket system with Discord threads",
  icon: "🎫",
  version: "2.2.0",
  configSchema: {
    type: "object",
    properties: {
      adminChannelId: { type: "string", description: "Channel where tickets are created" },
      adminRoleId: { type: "string", description: "Role that can manage tickets" },
      logChannelId: { type: "string", description: "Channel for ticket outcome summaries (optional)" },
    },
    required: ["adminChannelId", "adminRoleId"],
  },
  defaultConfig: {
    adminChannelId: "",
    adminRoleId: "",
    logChannelId: "",
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
    let clientRef: any = null;

    async function sendLogSummary(
      ticketId: string,
      thread: any,
      submitterId: string,
      closedBy: string,
      rating: number,
      ratingLabel: string,
    ) {
      const logChannelId = currentConfig.logChannelId as string;
      log("info", `sendLogSummary: logChannelId="${logChannelId}" clientRef=${!!clientRef}`);
      if (!logChannelId || !clientRef) {
        log("warn", "sendLogSummary: skipping — no logChannelId or clientRef");
        return;
      }

      try {
        const logChannel = await clientRef.channels.fetch(logChannelId);
        log("info", `sendLogSummary: fetched channel type=${logChannel?.type} textBased=${logChannel?.isTextBased?.()}`);
        if (!logChannel?.isTextBased()) {
          log("warn", "sendLogSummary: channel not text-based or not found");
          return;
        }

        const ratingField = rating > 0
          ? { name: "Rating", value: `${"⭐".repeat(rating)} (${rating}/5 — ${ratingLabel})`, inline: true }
          : { name: "Rating", value: "No response", inline: true };

        const summaryEmbed = new EmbedBuilder()
          .setTitle(`${ticketId} — Summary`)
          .addFields(
            { name: "Thread", value: `<#${thread.id}>`, inline: true },
            { name: "Opened by", value: `<@${submitterId}>`, inline: true },
            { name: "Closed by", value: `<@${closedBy}>`, inline: true },
            ratingField,
          )
          .setColor(rating >= 4 ? 0x57f287 : rating >= 3 ? 0xfee75c : rating > 0 ? 0xed4245 : 0x95a5a6)
          .setTimestamp();

        await logChannel.send({ embeds: [summaryEmbed] });
        log("info", `sendLogSummary: posted to ${logChannelId}`);
      } catch (err: any) {
        log("error", `sendLogSummary failed: ${err.message}`);
      }
    }

    async function sendRatingPrompt(thread: any, submitterId: string, closerId: string) {
      log("info", `sendRatingPrompt: thread=${thread.id} submitter=${submitterId} closer=${closerId}`);
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
      log("info", `sendRatingPrompt: rating message sent id=${ratingMsg.id}`);

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
        log("info", `collector.collect: emoji=${reaction.emoji.name} user=${reaction.users.cache.last()?.id}`);
        const rating = emojis.indexOf(reaction.emoji.name) + 1;
        const ratingLabels = ["", "Unsatisfied", "Not happy", "Okay", "Satisfied", "Overjoyed"];

        await thread.send({
          embeds: [
            new EmbedBuilder()
              .setDescription(`Thank you! Rating: **${rating}/5** — ${ratingLabels[rating]}`)
              .setColor(0x57f287),
          ],
        });

        const ticketIdMatch = thread.name.match(/^(TICKET-\d+)/);
        const ticketId = ticketIdMatch ? ticketIdMatch[1] : thread.name;

        configStore.logTicket({
          ticketId,
          threadName: thread.name,
          threadId: thread.id,
          submitterId,
          closedBy: closerId,
          rating,
        });

        await sendLogSummary(ticketId, thread, submitterId, closerId, rating, ratingLabels[rating]);

        collector.stop();

        try {
          await thread.setLocked(true, "Ticket closed — rated by submitter");
          await thread.members.remove(submitterId, "Ticket closed — access revoked").catch(() => {});
          await thread.setArchived(true, `Rated ${rating}/5 by submitter`);
          log("info", `ticket ${ticketId} archived after rating`);
        } catch (err: any) {
          log("error", `Failed to archive ticket thread: ${err.message}`);
          await thread.send({
            embeds: [
              new EmbedBuilder()
                .setDescription("⚠️ Could not archive this thread. Please archive it manually.")
                .setColor(0xed4245),
            ],
          });
        }
      });

      collector.on("end", async (collected: any) => {
        log("info", `collector.end: collected=${collected.size}`);
        if (collected.size === 0) {
          const ticketIdMatch = thread.name.match(/^(TICKET-\d+)/);
          const ticketId = ticketIdMatch ? ticketIdMatch[1] : thread.name;

          configStore.logTicket({
            ticketId,
            threadName: thread.name,
            threadId: thread.id,
            submitterId,
            closedBy: closerId,
            rating: 0,
          });

          await sendLogSummary(ticketId, thread, submitterId, closerId, 0, "No response");

          await thread.send({
            embeds: [
              new EmbedBuilder()
                .setDescription("No rating submitted. Thread archived.")
                .setColor(0x95a5a6),
            ],
          });

          try {
            await thread.setLocked(true, "Ticket closed — no rating");
            await thread.members.remove(submitterId, "Ticket closed — access revoked").catch(() => {});
            await thread.setArchived(true, "No rating submitted");
            log("info", `ticket ${ticketId} archived (no rating)`);
          } catch (err: any) {
            log("error", `Failed to archive ticket thread: ${err.message}`);
          }
        }
      });
    }

    return {
      name: "tickets",
      config: currentConfig,
      async onLoad(bot: any) {
        log("info", `Loaded — admin=${currentConfig.adminChannelId} log=${currentConfig.logChannelId || "(not set)"}`);
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

        log("info", `handleCommand: ${sub} by ${interaction.user.id} in ${interaction.channelId}`);

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

          if (!clientRef) clientRef = interaction.client;

          await interaction.deferReply({ ephemeral: true });

          const channel = await interaction.client.channels.fetch(channelId);
          if (!channel || channel.type !== ChannelType.GuildText) {
            await interaction.editReply({ content: "❌ Admin channel not found or is not a text channel." });
            return;
          }

          ticketCounter++;
          saveTicketCounter(ticketCounter);
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

          log("info", `ticket ${ticketId} created in thread ${thread.id}`);
          await interaction.editReply({
            content: `✅ Ticket created!\n\n**${ticketId}**: ${subject}\n<#${thread.id}>`,
          });
        } else if (sub === "close") {
          const thread = interaction.channel;
          if (!thread?.isThread()) {
            await interaction.reply({ content: "❌ This command can only be used inside a ticket thread.", ephemeral: true });
            return;
          }

          if (!clientRef) clientRef = interaction.client;

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
          log("info", `close: ticket=${ticketName} opener=${opener?.id || "none"} ownerId=${thread.ownerId} submitter=${submitterId}`);
          if (submitterId) {
            await sendRatingPrompt(thread, submitterId, interaction.user.id);
          } else {
            log("warn", `close: no submitter identified for ${ticketName}`);
            try {
              await thread.setLocked(true, "Closed — could not identify submitter");
              await thread.setArchived(true, "Closed — could not identify submitter");
              await sendLogSummary(ticketName, thread, thread.ownerId || "unknown", interaction.user.id, 0, "No response");
            } catch (err: any) {
              log("error", `Failed to archive thread: ${err.message}`);
            }
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
