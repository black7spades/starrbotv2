import type { FunctionManifest, FunctionInstance } from "../registry/types";
import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { systemLog } from "utils/systemLog";
import { configStore } from "config/index";
import {
  DEFAULT_PHRASES,
  MAX_PHRASE_LENGTH,
  addPhrase,
  editPhrase,
  ordinal,
  pick,
  removePhrase,
  render,
} from "./pool";

function log(level: "info" | "warn" | "error", msg: string) {
  systemLog.add(level, msg, "welcome");
}

const welcomeManifest: FunctionManifest = {
  name: "welcome",
  label: "Welcome",
  description: "Greet new members with a random phrase from an editable pool",
  icon: "👋",
  version: "1.0.0",
  configSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "Channel to post welcomes in" },
      guildId: { type: "string", description: "Discord server" },
      phrases: {
        type: "array",
        items: { type: "string" },
        description:
          "Pool of greetings, picked at random. Use {user}, {username}, {server} and {memberCount}.",
      },
      useEmbed: {
        type: "boolean",
        default: false,
        description: "Post as an embed rather than plain text",
      },
    },
    required: ["channelId"],
  },
  defaultConfig: {
    channelId: "",
    guildId: "",
    phrases: [...DEFAULT_PHRASES],
    useEmbed: false,
  },
  commands: [
    new SlashCommandBuilder()
      .setName("welcome")
      .setDescription("Manage the welcome phrase pool")
      .addSubcommand((sub) => sub.setName("list").setDescription("Show every phrase in the pool"))
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("Add a phrase to the pool")
          .addStringOption((opt) =>
            opt
              .setName("phrase")
              .setDescription("Use {user}, {username}, {server}, {memberCount}")
              .setRequired(true)
              .setMaxLength(MAX_PHRASE_LENGTH)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("edit")
          .setDescription("Replace a phrase")
          .addIntegerOption((opt) =>
            opt.setName("number").setDescription("Position from /welcome list").setRequired(true).setMinValue(1)
          )
          .addStringOption((opt) =>
            opt.setName("phrase").setDescription("The new text").setRequired(true).setMaxLength(MAX_PHRASE_LENGTH)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("Delete a phrase")
          .addIntegerOption((opt) =>
            opt.setName("number").setDescription("Position from /welcome list").setRequired(true).setMinValue(1)
          )
      )
      .addSubcommand((sub) =>
        sub.setName("preview").setDescription("Show what a welcome would look like, without posting")
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .toJSON() as any,
  ],

  async createInstance(config: Record<string, unknown>): Promise<FunctionInstance> {
    const currentConfig = { ...config };
    let botId: string | null = null;
    let welcomed = 0;
    // Avoids greeting two people in a row with the same line.
    let lastIndex: number | null = null;

    function phrases(): string[] {
      const value = currentConfig.phrases;
      return Array.isArray(value) ? (value as string[]) : [...DEFAULT_PHRASES];
    }

    /** Writes an edited pool back through the store so it survives a restart. */
    function persist(next: string[]): void {
      currentConfig.phrases = next;
      if (!botId) return;
      try {
        configStore.upsertBotFunction(botId, "welcome", { config: { ...currentConfig } });
      } catch (err: any) {
        log("warn", `could not persist phrases: ${err.message}`);
      }
    }

    function buildMessage(member: any): { text: string; index: number } | null {
      const chosen = pick(phrases(), lastIndex);
      if (!chosen) return null;

      const guild = member?.guild;
      const text = render(chosen.phrase, {
        user: `<@${member?.id ?? "0"}>`,
        username: member?.user?.username ?? member?.displayName ?? "someone",
        server: guild?.name ?? "the server",
        memberCount: ordinal(guild?.memberCount ?? 0),
      });
      return { text, index: chosen.index };
    }

    return {
      name: "welcome",
      config: currentConfig,

      async onLoad(bot: any) {
        botId = bot?.config?.id ?? null;
        if (!Array.isArray(currentConfig.phrases) || currentConfig.phrases.length === 0) {
          currentConfig.phrases = [...DEFAULT_PHRASES];
        }
        log("info", `Loaded with ${phrases().length} phrase(s)`);
      },

      async onUnload() {},

      async onConfigChange(newConfig: Record<string, unknown>) {
        Object.assign(currentConfig, newConfig);
      },

      async onMemberJoin(member: any) {
        const channelId = currentConfig.channelId as string;
        if (!channelId) return;

        // Only greet in the configured server, when one is set.
        const guildId = currentConfig.guildId as string;
        if (guildId && member?.guild?.id !== guildId) return;

        // Never greet a bot joining — that is noise, not a new member.
        if (member?.user?.bot) return;

        try {
          const channel = await member.client.channels.fetch(channelId);
          if (!channel?.isTextBased()) {
            log("warn", `configured channel ${channelId} is not text-based`);
            return;
          }

          const built = buildMessage(member);
          if (!built) {
            log("warn", "welcome skipped — the phrase pool is empty");
            return;
          }
          lastIndex = built.index;

          if (currentConfig.useEmbed) {
            await channel.send({
              embeds: [
                new EmbedBuilder()
                  .setDescription(built.text)
                  .setThumbnail(member.user?.displayAvatarURL?.() ?? null)
                  .setColor(0x57f287)
                  .setTimestamp(),
              ],
            });
          } else {
            await channel.send({ content: built.text });
          }

          welcomed++;
          log("info", `welcomed ${member?.user?.tag ?? member?.id}`);
        } catch (err: any) {
          log("error", `failed to welcome a member: ${err.message}`);
        }
      },

      async handleCommand(interaction: any) {
        if (interaction.commandName !== "welcome") return;
        const sub = interaction.options.getSubcommand();
        const current = phrases();

        if (sub === "list") {
          if (current.length === 0) {
            await interaction.reply({ content: "The pool is empty.", ephemeral: true });
            return;
          }
          const lines = current.map((p, i) => `**${i + 1}.** ${p}`);
          await interaction.reply({
            content: `**Welcome phrases (${current.length})**\n${lines.join("\n")}`.slice(0, 1900),
            ephemeral: true,
          });
          return;
        }

        if (sub === "add") {
          const result = addPhrase(current, interaction.options.getString("phrase", true));
          if (result.ok) persist(result.phrases);
          await interaction.reply({
            content: `${result.ok ? "✅" : "❌"} ${result.message}`,
            ephemeral: true,
          });
          return;
        }

        if (sub === "edit") {
          const result = editPhrase(
            current,
            interaction.options.getInteger("number", true),
            interaction.options.getString("phrase", true)
          );
          if (result.ok) persist(result.phrases);
          await interaction.reply({
            content: `${result.ok ? "✅" : "❌"} ${result.message}`,
            ephemeral: true,
          });
          return;
        }

        if (sub === "remove") {
          const result = removePhrase(current, interaction.options.getInteger("number", true));
          if (result.ok) {
            persist(result.phrases);
            // The pool shifted, so the remembered index no longer means anything.
            lastIndex = null;
          }
          await interaction.reply({
            content: `${result.ok ? "✅" : "❌"} ${result.message}`,
            ephemeral: true,
          });
          return;
        }

        if (sub === "preview") {
          const built = buildMessage(interaction.member);
          await interaction.reply({
            content: built
              ? `This is one of ${current.length} possible greetings:\n\n${built.text}`
              : "The pool is empty, so nobody would be greeted.",
            ephemeral: true,
            allowedMentions: { parse: [] },
          });
          return;
        }
      },

      getStats() {
        return { welcomed, phraseCount: phrases().length };
      },
    };
  },
};

export { welcomeManifest };
