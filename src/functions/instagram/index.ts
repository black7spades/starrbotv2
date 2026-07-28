import type { FunctionManifest, FunctionInstance } from "../registry/types";
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { configStore } from "config/index";
import { systemLog } from "utils/systemLog";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { InstagramAPI, type IgMedia } from "./api";

function log(level: "info" | "warn" | "error", msg: string) {
  systemLog.add(level, msg, "instagram");
}

const SEEN_FILE = join(process.cwd(), "data", "instagram-seen.json");

function loadSeen(): Record<string, string[]> {
  try {
    if (existsSync(SEEN_FILE)) return JSON.parse(readFileSync(SEEN_FILE, "utf-8"));
  } catch { /* ignore */ }
  return {};
}

function saveSeen(seen: Record<string, string[]>): void {
  try {
    writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
  } catch (e) {
    log("error", `Failed to save seen file: ${e}`);
  }
}

interface MonitoredAccount {
  username: string;
  channelId: string;
  label?: string;
  enabled: boolean;
}

function buildEmbed(media: IgMedia, username: string): EmbedBuilder {
  const caption = media.caption?.slice(0, 2000) || "";
  const url = `https://www.instagram.com/p/${media.shortcode}/`;

  const embed = new EmbedBuilder()
    .setAuthor({ name: `@${username}`, url: `https://www.instagram.com/${username}/` })
    .setURL(url)
    .setTimestamp(new Date(media.taken_at * 1000))
    .setColor(0xE1306C); // Instagram gradient

  if (media.is_video) {
    embed.setTitle("📹 New video post");
    embed.setDescription(caption || "No caption");
    // Can't embed video directly in Discord embeds, link to post
    if (media.video_url) embed.setImage(media.display_url);
  } else if (media.carousel_media && media.carousel_media.length > 0) {
    embed.setTitle(`🖼️ New carousel (${media.carousel_media.length} items)`);
    embed.setDescription(caption || "No caption");
    embed.setImage(media.display_url);
  } else {
    embed.setTitle("🖼️ New post");
    embed.setDescription(caption || "No caption");
    embed.setImage(media.display_url);
  }

  const footerParts: string[] = [];
  if (media.like_count !== undefined) footerParts.push(`❤️ ${media.like_count.toLocaleString()}`);
  if (media.comment_count !== undefined) footerParts.push(`💬 ${media.comment_count.toLocaleString()}`);
  if (footerParts.length) embed.setFooter({ text: footerParts.join(" · ") });

  return embed;
}

const instagramManifest: FunctionManifest = {
  name: "instagram",
  label: "Instagram",
  description: "Monitor Instagram accounts and post new content to Discord",
  icon: "📸",
  version: "1.0.0",
  configSchema: {
    type: "object",
    properties: {
      cookie: {
        type: "string",
        description: "Instagram session cookie string (copy full cookie header from browser)",
      },
      checkInterval: {
        type: "number",
        default: 10,
        minimum: 5,
        maximum: 1440,
        description: "Check interval in minutes",
      },
      accounts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            username: { type: "string" },
            channelId: { type: "string" },
            label: { type: "string" },
            enabled: { type: "boolean", default: true },
          },
          required: ["username", "channelId"],
        },
      },
    },
    required: ["cookie"],
  },
  defaultConfig: {
    cookie: "",
    checkInterval: 10,
    accounts: [] as MonitoredAccount[],
  },
  commands: [
    new SlashCommandBuilder()
      .setName("ig")
      .setDescription("Instagram commands")
      .addSubcommand(sub =>
        sub
          .setName("recent")
          .setDescription("Show recent posts from a monitored account")
          .addStringOption(opt => opt.setName("account").setDescription("Instagram username").setRequired(true))
          .addIntegerOption(opt => opt.setName("count").setDescription("Number of posts (1-5)").setMinValue(1).setMaxValue(5))
      )
      .addSubcommand(sub =>
        sub.setName("list").setDescription("List monitored Instagram accounts")
      )
      .toJSON() as any,
  ],
  createInstance,
};

async function createInstance(config: Record<string, unknown>): Promise<FunctionInstance> {
  const cookie = (config.cookie as string) || "";
  const accounts = (config.accounts as MonitoredAccount[]) || [];
  const checkInterval = (config.checkInterval as number) || 10;
  let clientRef: any = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let igClient: InstagramAPI | null = null;

  if (cookie) {
    igClient = new InstagramAPI(cookie);
  }

  const seen = loadSeen();

  async function checkAllAccounts() {
    if (!igClient || !clientRef) return;
    for (const account of accounts) {
      if (!account.enabled) continue;
      try {
        const result = await igClient.getUserPosts(account.username);
        const shortcodes = result.posts.map(p => p.shortcode);
        const accountSeen = seen[account.username] || [];
        const newPosts = result.posts.filter(p => !accountSeen.includes(p.shortcode));

        if (newPosts.length > 0) {
          log("info", `Found ${newPosts.length} new post(s) from @${account.username}`);
          const channel = await clientRef.channels.fetch(account.channelId).catch(() => null);
          if (!channel?.isTextBased()) {
            log("warn", `Channel ${account.channelId} not found for @${account.username}`);
            continue;
          }
          // Post newest first
          for (const post of newPosts.slice(0, 3).reverse()) {
            const embed = buildEmbed(post, account.username);
            await channel.send({ embeds: [embed] }).catch((e: any) => {
              log("error", `Failed to send post from @${account.username}: ${e.message}`);
            });
          }
        }

        // Update seen (keep last 50 per account)
        seen[account.username] = [...shortcodes, ...accountSeen].slice(0, 50);
      } catch (e: any) {
        if (e.message?.includes("429")) {
          log("warn", `Instagram rate limited for @${account.username}, will retry next cycle`);
        } else {
          log("error", `Failed to check @${account.username}: ${e.message}`);
        }
      }
    }
    saveSeen(seen);
  }

  return {
    name: "instagram",
    config,
    manifest: instagramManifest,

    async onLoad(bot: any) {
      clientRef = bot;
      if (!igClient) {
        log("warn", "Instagram function loaded without cookie — configure cookie in settings");
        return;
      }
      if (!accounts.length) {
        log("warn", "Instagram function loaded with no accounts — add accounts to start monitoring");
        return;
      }
      log("info", `Instagram monitoring ${accounts.length} account(s) every ${checkInterval}m`);
      // Run once after 10s, then on interval
      setTimeout(checkAllAccounts, 10_000);
      timer = setInterval(checkAllAccounts, checkInterval * 60_000);
    },

    async onUnload() {
      if (timer) clearInterval(timer);
      clientRef = null;
      igClient = null;
      log("info", "Instagram monitoring stopped");
    },

    async onConfigChange(newConfig: Record<string, unknown>) {
      const newCookie = (newConfig.cookie as string) || "";
      const newAccounts = (newConfig.accounts as MonitoredAccount[]) || [];
      const newInterval = (newConfig.checkInterval as number) || 10;

      // Rebuild IG client if cookie changed
      if (newCookie !== cookie) {
        igClient = newCookie ? new InstagramAPI(newCookie) : null;
      }

      if (timer) clearInterval(timer);
      timer = null;
      if (igClient && clientRef && newAccounts.length) {
        log("info", `Instagram config updated — ${newAccounts.length} account(s), ${newInterval}m interval`);
        timer = setInterval(checkAllAccounts, newInterval * 60_000);
      }
    },

    async handleCommand(interaction: any, bot: any) {
      clientRef = bot;
      const sub = interaction.options.getSubcommand();

      if (sub === "recent") {
        if (!igClient) {
          await interaction.reply({ content: "❌ Instagram cookie not configured", ephemeral: true });
          return;
        }
        const username = interaction.options.getString("account", true);
        const count = interaction.options.getInteger("count") || 3;
        await interaction.deferReply({ ephemeral: true });
        try {
          const result = await igClient.getUserPosts(username);
          if (result.posts.length === 0) {
            await interaction.editReply(`No public posts from @${username}`);
            return;
          }
          const embeds = result.posts.slice(0, count).reverse().map(p => buildEmbed(p, username));
          await interaction.editReply({ embeds });
        } catch (e: any) {
          await interaction.editReply(`❌ Failed: ${e.message}`);
        }
      } else if (sub === "list") {
        if (!accounts.length) {
          await interaction.reply({ content: "No accounts configured", ephemeral: true });
          return;
        }
        const list = accounts.map(a => {
          const status = a.enabled ? "✅" : "⏸️";
          return `${status} **@${a.username}** → <#${a.channelId}>${a.label ? ` (${a.label})` : ""}`;
        });
        await interaction.reply({ content: list.join("\n"), ephemeral: true });
      }
    },

    getStats() {
      return {
        accounts: accounts.length,
        enabled: accounts.filter(a => a.enabled).length,
        checkInterval,
        hasCookie: !!cookie,
      };
    },
  };
}

export { instagramManifest };
