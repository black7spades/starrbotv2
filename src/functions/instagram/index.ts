import type { FunctionManifest, FunctionInstance } from "../registry/types";
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { systemLog } from "utils/systemLog";
import { InstagramAPI, type IgMedia } from "./api";

function log(level: "info" | "warn" | "error", msg: string) {
  systemLog.add(level, msg, "instagram");
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
    .setColor(0xE1306C);

  if (media.is_video) {
    embed.setTitle("📹 New video post");
    embed.setDescription(caption || "No caption");
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
  description: "Fetch and post Instagram content to Discord",
  icon: "📸",
  version: "1.0.0",
  configSchema: {
    type: "object",
    properties: {
      cookie: {
        type: "string",
        description: "Instagram session cookie string (copy full cookie header from browser)",
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
    accounts: [] as MonitoredAccount[],
  },
  commands: [
    new SlashCommandBuilder()
      .setName("ig")
      .setDescription("Instagram commands")
      .addSubcommand(sub =>
        sub
          .setName("recent")
          .setDescription("Show recent posts from an account")
          .addStringOption(opt => opt.setName("account").setDescription("Instagram username").setRequired(true))
          .addIntegerOption(opt => opt.setName("count").setDescription("Number of posts (1-5)").setMinValue(1).setMaxValue(5))
      )
      .addSubcommand(sub =>
        sub
          .setName("post")
          .setDescription("Post latest from a monitored account to this channel")
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
  let igClient: InstagramAPI | null = null;

  if (cookie) {
    igClient = new InstagramAPI(cookie);
  }

  return {
    name: "instagram",
    config,
    manifest: instagramManifest,

    async onLoad() {
      if (!igClient) {
        log("warn", "Instagram loaded without cookie — configure in settings");
        return;
      }
      log("info", `Instagram ready — ${accounts.length} account(s) configured`);
    },

    async onUnload() {
      igClient = null;
    },

    async onConfigChange(newConfig: Record<string, unknown>) {
      const newCookie = (newConfig.cookie as string) || "";
      igClient = newCookie ? new InstagramAPI(newCookie) : null;
    },

    async handleCommand(interaction: any, bot: any) {
      const sub = interaction.options.getSubcommand();

      if (sub === "recent" || sub === "post") {
        if (!igClient) {
          await interaction.reply({ content: "❌ Instagram cookie not configured", ephemeral: true });
          return;
        }
        const username = interaction.options.getString("account", true);
        const count = interaction.options.getInteger("count") || 3;
        await interaction.deferReply({ ephemeral: sub === "post" ? false : true });
        try {
          const result = await igClient.getUserPosts(username);
          if (result.posts.length === 0) {
            await interaction.editReply(`No public posts from @${username}`);
            return;
          }
          const embeds = result.posts.slice(0, count).reverse().map(p => buildEmbed(p, username));

          if (sub === "post") {
            // Post to the channel (public)
            await interaction.editReply({ content: `📸 Latest from **@${username}**:` });
            await interaction.channel.send({ embeds });
          } else {
            // Ephemeral reply
            await interaction.editReply({ embeds });
          }
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
        hasCookie: !!cookie,
      };
    },
  };
}

export { instagramManifest };
