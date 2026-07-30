import type { FunctionManifest, FunctionInstance } from "../registry/types";
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { configStore } from "config/index";
import { systemLog } from "utils/systemLog";
import { fetchFeed as fetchAndParse, type FeedItem } from "./feed";
import { buildFeedUrl } from "./providers";

interface RssSource {
  /** Direct feed URL. Always present — it is what actually gets fetched. */
  url: string;
  label: string;
  enabled: boolean;
  /**
   * Which provider produced `url`, plus the values it was built from. Optional
   * so sources added as a plain feed URL still work, and so the URL can be
   * rebuilt if a provider changes how it constructs feeds.
   */
  providerId?: string;
  providerInput?: Record<string, string>;
}

function log(level: "info" | "warn" | "error", msg: string) {
  systemLog.add(level, msg, "updates");
}

const updatesManifest: FunctionManifest = {
  name: "updates",
  label: "Updates",
  description: "Follow native RSS and Atom feeds and post new items to Discord",
  icon: "📡",
  version: "2.0.0",
  configSchema: {
    type: "object",
    properties: {
      checkInterval: { type: "number", default: 15, minimum: 1, maximum: 1440, description: "Check interval in minutes" },
      guildId: { type: "string", description: "Discord server to post in" },
      channelId: { type: "string", description: "Discord channel to post updates" },
        sources: {
        type: "array",
        items: {
          type: "object",
          properties: {
            url: { type: "string" },
            label: { type: "string" },
            enabled: { type: "boolean", default: true },
          },
          required: ["url"],
        },
      },
    },
    required: ["channelId"],
  },
  defaultConfig: {
    checkInterval: 15,
    guildId: "",
    channelId: "",
    sources: [] as RssSource[],
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
      .addSubcommand((sub) =>
        sub
          .setName("testpost")
          .setDescription("Post the latest item from a source to test the connection")
      )
      .addSubcommand((sub) => sub.setName("list").setDescription("List configured RSS sources"))
      .toJSON() as any,
  ],
  async createInstance(config: Record<string, unknown>): Promise<FunctionInstance> {
    const currentConfig = { ...config };
    const botId = config.botId as string;
    let checkInterval: ReturnType<typeof setInterval> | null = null;
    let sourcesChecked = 0;
    let clientRef: any = null;

    function getSources(): RssSource[] {
      return (currentConfig.sources as RssSource[]) || [];
    }

    function persistSources(sources: RssSource[]): void {
      currentConfig.sources = sources;
      if (botId) {
        configStore.upsertBotFunction(botId, "updates", {
          config: { ...currentConfig },
        });
      }
    }

    async function fetchFeed(url: string): Promise<FeedItem[]> {
      // The URL is already a real feed published by the origin service — there
      // is no proxy to prefix. Parsing handles both RSS and Atom.
      try {
        return await fetchAndParse(url);
      } catch (err: any) {
        log("warn", `feed fetch failed for ${url}: ${err.message}`);
        return [];
      }
    }

    async function checkFeeds(interaction?: any): Promise<void> {
      const sources = getSources();
      if (!sources.length) {
        if (interaction) await interaction.editReply({ content: "No RSS sources configured. Use `/updates add` to add one." });
        return;
      }

      const channelId = currentConfig.channelId as string;
      if (!channelId) {
        if (interaction) await interaction.editReply({ content: "No channel configured. Please set a channel in the function settings." });
        return;
      }

      const client = interaction?.client || clientRef;
      if (!client) {
        log("error", "checkFeeds: no client available to fetch channel");
        if (interaction) await interaction.editReply({ content: "❌ Bot client not available." });
        return;
      }

      if (interaction) {
        await interaction.editReply({ content: `🔄 Checking ${sources.length} feed(s)...` });
      }

      let newItems = 0;

      for (const source of sources) {
        if (source.enabled === false) continue;
        const items = await fetchFeed(source.url);
        for (const item of items) {
          if (configStore.hasPostedUrl(botId, item.link)) continue;

          try {
            const channel = await client.channels.fetch(channelId);
            if (!channel || !("send" in channel)) continue;

            const embed = new EmbedBuilder()
              .setTitle(item.title)
              .setURL(item.link)
              .setDescription(item.description || "")
              .setColor(0x57f287)
              .setFooter({ text: source.label })
              .setTimestamp();

            await channel.send({ embeds: [embed] });
            configStore.addPostedUrl(botId, item.link);
            newItems++;
          } catch {
            // skip failed sends
          }
        }
        sourcesChecked++;
      }

      log("info", `checkFeeds: ${newItems} new items across ${sources.length} feeds`);
      if (interaction) {
        await interaction.editReply({
          content: newItems > 0
            ? `✅ Found ${newItems} new update(s) across ${sources.length} feed(s).`
            : `✅ Checked ${sources.length} feed(s). No new updates.`,
        });
      }
    }

    return {
      name: "updates",
      config: currentConfig,
      async onLoad(_bot: any) {
        log("info", `Loaded — channel=${currentConfig.channelId} interval=${currentConfig.checkInterval}m`);
        const interval = (currentConfig.checkInterval as number) || 15;
        checkInterval = setInterval(() => checkFeeds(), interval * 60 * 1000);
      },
      async onUnload() {
        if (checkInterval) {
          clearInterval(checkInterval);
          checkInterval = null;
        }
      },
      async onConfigChange(newConfig: Record<string, unknown>) {
        Object.assign(currentConfig, newConfig);
        if (checkInterval) {
          clearInterval(checkInterval);
          const interval = (currentConfig.checkInterval as number) || 15;
          checkInterval = setInterval(() => checkFeeds(), interval * 60 * 1000);
        }
      },
      async handleCommand(interaction: any) {
        if (interaction.commandName !== "updates") return;
        if (!clientRef) clientRef = interaction.client;
        const sub = interaction.options.getSubcommand();

        if (sub === "check") {
          await interaction.deferReply({ ephemeral: true });
          await checkFeeds(interaction);
        } else if (sub === "add") {
          const raw = interaction.options.getString("url", true);

          // Adding from Discord goes through the same validation the dashboard
          // uses, so a bad scheme cannot be stored from either entry point.
          const built = buildFeedUrl("rss", { url: raw });
          if (!built.ok) {
            await interaction.reply({ content: `❌ ${built.error}`, ephemeral: true });
            return;
          }
          const url = built.url!;

          const label = interaction.options.getString("label") || url;
          const sources = getSources();
          if (sources.some((s) => s.url === url)) {
            await interaction.reply({ content: `⚠️ Source already exists: ${url}`, ephemeral: true });
            return;
          }
          sources.push({ url, label, enabled: true, providerId: "rss", providerInput: { url } });
          persistSources(sources);
          await interaction.reply({ content: `✅ Added source: ${label} (${url})`, ephemeral: true });
        } else if (sub === "remove") {
          const url = interaction.options.getString("url", true);
          const sources = getSources().filter((s) => s.url !== url);
          if (sources.length === getSources().length) {
            await interaction.reply({ content: `⚠️ Source not found: ${url}`, ephemeral: true });
            return;
          }
          persistSources(sources);
          await interaction.reply({ content: `✅ Removed source: ${url}`, ephemeral: true });
        } else if (sub === "list") {
          const sources = getSources();
          if (!sources.length) {
            await interaction.reply({ content: "No sources configured.", ephemeral: true });
            return;
          }
          const list = sources.map((s, i) => `${i + 1}. **${s.label}** — ${s.url}`).join("\n");
          await interaction.reply({ content: `📋 **Sources:**\n${list}`, ephemeral: true });
        } else if (sub === "testpost") {
          const sources = getSources().filter((s) => s.enabled !== false);
          if (!sources.length) {
            await interaction.reply({ content: "No enabled sources configured.", ephemeral: true });
            return;
          }
          const channelId = currentConfig.channelId as string;
          if (!channelId) {
            await interaction.reply({ content: "❌ No channel configured.", ephemeral: true });
            return;
          }

          const { StringSelectMenuBuilder, ActionRowBuilder } = await import("discord.js");
          const select = new StringSelectMenuBuilder()
            .setCustomId("updates-testpost-source")
            .setPlaceholder("Pick a source")
            .addOptions(sources.map((s) => ({ label: s.label, value: s.url, description: s.url })));
          const row = new ActionRowBuilder().addComponents(select);
          const reply = await interaction.reply({ components: [row], ephemeral: true });

          let source: RssSource;
          try {
            const selected = await reply.awaitMessageComponent({ time: 30_000 });
            source = sources.find((s) => s.url === selected.values[0])!;
            await selected.deferUpdate();
            await interaction.editReply({ content: `🔄 Fetching latest from **${source.label}**...`, components: [] });
          } catch {
            await interaction.editReply({ content: "⏱️ Timed out.", components: [] });
            return;
          }

          const items = await fetchFeed(source.url);
          if (!items.length) {
            await interaction.editReply({ content: `❌ No items from **${source.label}** — check the feed URL.` });
            return;
          }

          const item = items[0];
          try {
            const channel = await (clientRef || interaction.client).channels.fetch(channelId);
            if (!channel || !("send" in channel)) {
              await interaction.editReply({ content: "❌ Channel not found." });
              return;
            }
            const embed = new EmbedBuilder()
              .setTitle(item.title)
              .setURL(item.link)
              .setDescription(item.description || "")
              .setColor(0x57f287)
              .setFooter({ text: source.label })
              .setTimestamp();
            await channel.send({ embeds: [embed] });
            await interaction.editReply({ content: `✅ Posted **${item.title}**` });
          } catch (e: any) {
            await interaction.editReply({ content: `❌ Failed to send: ${e.message}` });
          }
        }
      },
      getStats() {
        return { sources: getSources().length, sourcesChecked };
      },
    };
  },
};

export { updatesManifest };
