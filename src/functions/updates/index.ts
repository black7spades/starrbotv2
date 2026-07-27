import type { FunctionManifest, FunctionInstance } from "../registry/types";
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { configStore } from "config/index";
import { systemLog } from "utils/systemLog";

interface RssSource {
  url: string;
  label: string;
}

function log(level: "info" | "warn" | "error", msg: string) {
  systemLog.add(level, msg, "updates");
}

const updatesManifest: FunctionManifest = {
  name: "updates",
  label: "Updates",
  description: "Monitor RSS feeds and post updates to Discord",
  icon: "📡",
  version: "2.0.0",
  configSchema: {
    type: "object",
    properties: {
      rsshubUrl: { type: "string", default: "http://rsshub:1200", description: "RSSHub base URL" },
      checkInterval: { type: "number", default: 15, minimum: 1, maximum: 1440, description: "Check interval in minutes" },
      channelId: { type: "string", description: "Discord channel ID to post updates" },
      sources: {
        type: "array",
        items: {
          type: "object",
          properties: {
            url: { type: "string" },
            label: { type: "string" },
          },
          required: ["url"],
        },
      },
    },
    required: ["channelId"],
  },
  defaultConfig: {
    rsshubUrl: "http://rsshub:1200",
    checkInterval: 15,
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

    async function fetchFeed(url: string): Promise<{ title: string; link: string; description?: string }[]> {
      const rsshubBase = (currentConfig.rsshubUrl as string) || "http://rsshub:1200";
      const feedUrl = `${rsshubBase}/${url.replace(/^https?:\/\//, "")}`;

      try {
        const res = await fetch(feedUrl, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) return [];
        const text = await res.text();

        const items: { title: string; link: string; description?: string }[] = [];
        const itemMatches = text.matchAll(/<item>([\s\S]*?)<\/item>/gi);
        for (const match of itemMatches) {
          const block = match[1];
          const title = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i)?.[1]
            || block.match(/<title>([\s\S]*?)<\/title>/i)?.[1]
            || "Untitled";
          const link = block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "";
          const description = block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i)?.[1]
            || block.match(/<description>([\s\S]*?)<\/description>/i)?.[1]
            || "";
          if (link) items.push({ title: title.trim(), link: link.trim(), description: description.trim().slice(0, 500) });
        }
        return items;
      } catch {
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
      async onLoad(bot: any) {
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
          const url = interaction.options.getString("url", true);
          const label = interaction.options.getString("label") || url;
          const sources = getSources();
          if (sources.some((s) => s.url === url)) {
            await interaction.reply({ content: `⚠️ Source already exists: ${url}`, ephemeral: true });
            return;
          }
          sources.push({ url, label });
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
        }
      },
      getStats() {
        return { sources: getSources().length, sourcesChecked };
      },
    };
  },
};

export { updatesManifest };
