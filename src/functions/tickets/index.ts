import type { FunctionManifest, FunctionInstance } from "../registry/types";
import {
  SlashCommandBuilder,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
  AttachmentBuilder,
} from "discord.js";
import type { Guild } from "discord.js";
import { collectMessages, renderTranscript, saveTranscript } from "./transcript";
import { configStore } from "config/store";
import { systemLog } from "utils/systemLog";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// Same override as the config store — see src/config/store.ts.
const DATA_DIR = process.env.STARRBOT_DATA_DIR || join(__dirname, "../../../data");
const COUNTER_FILE = join(DATA_DIR, "ticket-counter.json");
const OPENERS_FILE = join(DATA_DIR, "ticket-openers.json");

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

function loadOpeners(): Record<string, string> {
  try {
    if (existsSync(OPENERS_FILE)) {
      return JSON.parse(readFileSync(OPENERS_FILE, "utf8"));
    }
  } catch {}
  return {};
}

function saveOpeners(openers: Record<string, string>): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(OPENERS_FILE, JSON.stringify(openers));
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
      .addSubcommand((sub) =>
        sub
          .setName("purge")
          .setDescription("Delete closed tickets (admin only)")
          .addIntegerOption((opt) =>
            opt.setName("days").setDescription("Only purge tickets closed within the last N days (omit for all)").setMinValue(1)
          )
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .toJSON() as any,
  ],
  async createInstance(config: Record<string, unknown>): Promise<FunctionInstance> {
    const currentConfig = { ...config };
    let ticketsCreated = 0;
    let clientRef: any = null;

    interface CloseOutcome {
      ticketId: string;
      thread: any;
      submitterId: string;
      closedBy: string;
      rating: number;
      ratingLabel: string;
      /** Path of the saved transcript, relative to the data dir. */
      transcriptPath?: string;
      messageCount?: number;
      /** Rendered transcript, attached to the summary when present. */
      transcriptBody?: string;
    }

    async function sendLogSummary(outcome: CloseOutcome) {
      const { ticketId, thread, submitterId, closedBy, rating, ratingLabel } = outcome;
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
            { name: "Opened by", value: submitterId ? `<@${submitterId}>` : "unknown", inline: true },
            { name: "Closed by", value: `<@${closedBy}>`, inline: true },
            ratingField,
          )
          .setColor(rating >= 4 ? 0x57f287 : rating >= 3 ? 0xfee75c : rating > 0 ? 0xed4245 : 0x95a5a6)
          .setTimestamp();

        if (outcome.transcriptPath) {
          summaryEmbed.addFields({
            name: "Transcript",
            value: `\`${outcome.transcriptPath}\`${
              outcome.messageCount !== undefined ? ` (${outcome.messageCount} messages)` : ""
            }`,
          });
        } else {
          summaryEmbed.addFields({ name: "Transcript", value: "⚠️ capture failed — see logs" });
        }

        // Attach the transcript so the conversation survives deleting the thread.
        const files = outcome.transcriptBody
          ? [
              new AttachmentBuilder(Buffer.from(outcome.transcriptBody, "utf8"), {
                name: `${ticketId.replace(/[^a-zA-Z0-9._-]+/g, "-") || "ticket"}.md`,
              }),
            ]
          : [];

        await logChannel.send({ embeds: [summaryEmbed], files });
        log("info", `sendLogSummary: posted to ${logChannelId}`);
      } catch (err: any) {
        log("error", `sendLogSummary failed: ${err.message}`);
      }
    }

    function ticketIdFor(thread: any): string {
      const match = String(thread?.name ?? "").match(/^(TICKET-\d+)/);
      return match ? match[1] : String(thread?.name ?? "unknown");
    }

    /**
     * Records a closed ticket: captures the conversation, writes the log entry,
     * and posts the summary. Transcript capture is best-effort — a failure here
     * must never stop a ticket from being closed.
     */
    async function finalizeTicket(
      thread: any,
      submitterId: string,
      closerId: string,
      rating: number,
      ratingLabel: string,
    ) {
      const ticketId = ticketIdFor(thread);
      const closedAt = Date.now();

      let transcriptPath: string | undefined;
      let transcriptBody: string | undefined;
      let messageCount: number | undefined;

      try {
        const messages = await collectMessages(thread);
        transcriptBody = renderTranscript(
          {
            ticketId,
            threadName: String(thread?.name ?? ""),
            threadId: String(thread?.id ?? ""),
            submitterId,
            closedBy: closerId,
            rating,
            ratingLabel,
            closedAt,
          },
          messages,
        );
        transcriptPath = saveTranscript(ticketId, String(thread?.id ?? ""), transcriptBody);
        messageCount = messages.length;
        log("info", `transcript saved for ${ticketId}: ${transcriptPath} (${messages.length} messages)`);
      } catch (err: any) {
        log("error", `transcript capture failed for ${ticketId}: ${err.message}`);
      }

      configStore.logTicket({
        ticketId,
        threadName: String(thread?.name ?? ""),
        threadId: String(thread?.id ?? ""),
        submitterId,
        closedBy: closerId,
        rating,
        transcript: transcriptPath,
        messageCount,
      });

      await sendLogSummary({
        ticketId,
        thread,
        submitterId,
        closedBy: closerId,
        rating,
        ratingLabel,
        transcriptPath,
        messageCount,
        transcriptBody,
      });
    }

    async function sendRatingPrompt(thread: any, submitterId: string, closerId: string) {
      log("info", `sendRatingPrompt: thread=${thread.id} submitter=${submitterId} closer=${closerId}`);

      const select = new StringSelectMenuBuilder()
        .setCustomId("ticket_rating")
        .setPlaceholder("Rate your experience")
        .addOptions(
          { label: "1 — Unsatisfied", value: "1" },
          { label: "2 — Not happy", value: "2" },
          { label: "3 — Okay", value: "3" },
          { label: "4 — Satisfied", value: "4" },
          { label: "5 — Overjoyed", value: "5" },
        );

      const row = new ActionRowBuilder().addComponents(select);

      const ratingEmbed = new EmbedBuilder()
        .setTitle("Rate Your Experience")
        .setDescription("How satisfied were you with the support you received?\n\nSelect a rating below. This thread will archive after you rate.")
        .setColor(0xfee75c);

      const ratingMsg = await thread.send({
        content: `<@${submitterId}>`,
        embeds: [ratingEmbed],
        components: [row],
      });
      log("info", `sendRatingPrompt: dropdown sent id=${ratingMsg.id}`);

      const collector = ratingMsg.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: (i: any) => i.user.id === submitterId,
        max: 1,
        time: 86400000,
      });

      collector.on("collect", async (interaction: any) => {
        const rating = parseInt(interaction.values[0], 10);
        const ratingLabels = ["", "Unsatisfied", "Not happy", "Okay", "Satisfied", "Overjoyed"];
        log("info", `collector.collect: rating=${rating} user=${interaction.user.id}`);

        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(`Thank you! Rating: **${rating}/5** — ${ratingLabels[rating]}`)
              .setColor(0x57f287),
          ],
        });

        // Capture the conversation before the thread is locked/archived, so the
        // record survives the thread being purged later.
        const ticketId = ticketIdFor(thread);
        await finalizeTicket(thread, submitterId, closerId, rating, ratingLabels[rating]);

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
          const ticketId = ticketIdFor(thread);
          await finalizeTicket(thread, submitterId, closerId, 0, "No response");

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
      async onLoad(_bot: any) {
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
          const openers = loadOpeners();
          openers[thread.id] = interaction.user.id;
          saveOpeners(openers);
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

          const openers = loadOpeners();
          const submitterId = openers[thread.id];
          delete openers[thread.id];
          saveOpeners(openers);

          if (!submitterId) {
            log("warn", `close: no persisted opener for ${ticketName}, cannot send rating`);
            // No opener means no rating prompt, but the ticket must still be
            // recorded — otherwise this thread has no transcript and no log
            // entry, and purging it would erase the ticket entirely.
            await finalizeTicket(thread, "", interaction.user.id, 0, "No response");
            try {
              await thread.setLocked(true, "Closed — could not identify opener");
              await thread.setArchived(true, "Closed — could not identify opener");
            } catch (err: any) {
              log("error", `Failed to archive thread: ${err.message}`);
            }
            return;
          }
          log("info", `close: ticket=${ticketName} submitter=${submitterId}`);
          await sendRatingPrompt(thread, submitterId, interaction.user.id);
        } else if (sub === "purge") {
          const hasRole = interaction.member?.roles?.cache?.has(adminRoleId);
          if (!hasRole) {
            await interaction.reply({ content: "❌ Only admins can purge tickets.", ephemeral: true });
            return;
          }

          const days = interaction.options.getInteger("days");
          const cutoff = days ? Date.now() - days * 86400000 : 0;

          await interaction.deferReply({ ephemeral: true });

          const logs = configStore.getTicketLogs(10000);
          const closed = days
            ? logs.filter((t) => t.closedAt >= cutoff)
            : logs;

          if (!closed.length) {
            await interaction.editReply({ content: days ? `No tickets closed in the last ${days} day(s).` : "No closed tickets found." });
            return;
          }

          let deleted = 0;
          let failed = 0;
          let notFound = 0;
          // Thread ids to drop from the ticket log: everything we either deleted
          // or confirmed is already gone. Failures stay so they can be retried.
          const settled: string[] = [];

          const guild: Guild | undefined =
            interaction.guild ?? interaction.client.guilds.cache.get(interaction.guildId);
          if (!guild) {
            await interaction.editReply({ content: "❌ Could not resolve guild." });
            return;
          }

          for (const ticket of closed) {
            try {
              // NOTE: must be guild.channels, not guild.threads — Guild has no
              // `threads` manager (only text/forum channels do), so the previous
              // guild.threads.fetch() threw TypeError on every iteration and
              // purge never deleted anything.
              const thread = await guild.channels.fetch(ticket.threadId);

              if (!thread) {
                notFound++;
                settled.push(ticket.threadId);
                continue;
              }

              // Guard against a stale/incorrect id pointing at a real channel:
              // only ever delete threads here.
              if (!thread.isThread?.()) {
                log("warn", `purge: ${ticket.ticketId} (${ticket.threadId}) is not a thread — skipping`);
                failed++;
                continue;
              }

              // Archived threads can be deleted directly; unarchiving first is
              // best-effort only and must not abort the delete.
              if (thread.archived) {
                await thread.setArchived(false, "Purge — unarchiving to delete").catch(() => {});
              }

              await thread.delete(`Purged by ${interaction.user.tag}`);
              deleted++;
              settled.push(ticket.threadId);
            } catch (err: any) {
              // 10003 = Unknown Channel: the thread is already gone, which is a
              // success for our purposes rather than a failure.
              if (err?.code === 10003) {
                notFound++;
                settled.push(ticket.threadId);
                continue;
              }
              log("warn", `purge: failed to delete ${ticket.ticketId} (${ticket.threadId}): ${err.message}`);
              failed++;
            }
          }

          const pruned = configStore.deleteTicketLogs(settled);

          const parts = [`🗑️ Purge complete:`];
          if (deleted) parts.push(`**${deleted}** deleted`);
          if (notFound) parts.push(`**${notFound}** already gone`);
          if (failed) parts.push(`**${failed}** failed`);
          if (!deleted && !notFound && !failed) parts.push("nothing to do");
          parts.push(days ? `(closed within last ${days} day(s))` : "(all closed tickets)");

          await interaction.editReply({ content: parts.join(" — ") });
          log(
            "info",
            `purge: deleted=${deleted} notFound=${notFound} failed=${failed} logPruned=${pruned} days=${days ?? "all"}`
          );
        }
      },
      getStats() {
        return { ticketsCreated };
      },
    };
  },
};

export { ticketsManifest };
