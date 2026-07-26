import type { FunctionManifest, FunctionInstance } from "../registry/types";
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

interface SocialPost {
  message: string;
  platforms: string[];
  timestamp: number;
  userId: string;
  results: Record<string, { ok: boolean; error?: string }>;
}

const postsHistory: SocialPost[] = [];

async function postToTwitter(bearerToken: string, message: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: message }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.title || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

async function postToBluesky(identifier: string, password: string, message: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const sessionRes = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
      signal: AbortSignal.timeout(15000),
    });
    if (!sessionRes.ok) return { ok: false, error: `Auth failed: HTTP ${sessionRes.status}` };
    const { accessJwt } = await sessionRes.json() as any;

    const postRes = await fetch("https://bsky.social/xrpc/com.atproto.repo.createRecord", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessJwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repo: identifier,
        collection: "app.bsky.feed.post",
        record: { $type: "app.bsky.feed.post", text: message, createdAt: new Date().toISOString() },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!postRes.ok) return { ok: false, error: `Post failed: HTTP ${postRes.status}` };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

async function postToMastodon(instanceUrl: string, accessToken: string, message: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${instanceUrl}/api/v1/statuses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: message }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

const socialsManifest: FunctionManifest = {
  name: "socials",
  label: "Socials Updater",
  description: "Post updates to social media platforms from Discord",
  icon: "📱",
  version: "1.0.0",
  configSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "Discord channel to post updates to" },
      platforms: {
        type: "array",
        items: { type: "string" },
        description: "Platforms to post to (twitter, bluesky, mastodon)",
      },
      twitterBearerToken: { type: "string", description: "Twitter/X Bearer Token" },
      blueskyIdentifier: { type: "string", description: "Bluesky handle (e.g. user.bsky.social)" },
      blueskyPassword: { type: "string", description: "Bluesky app password" },
      mastodonInstanceUrl: { type: "string", description: "Mastodon instance URL (e.g. https://mastodon.social)" },
      mastodonAccessToken: { type: "string", description: "Mastodon access token" },
      postFormat: { type: "string", default: "{message}", description: "Post format template" },
      autoPost: { type: "boolean", default: false, description: "Auto-post when a message is sent in the channel" },
    },
    required: ["channelId"],
  },
  defaultConfig: {
    channelId: "",
    platforms: [],
    twitterBearerToken: "",
    blueskyIdentifier: "",
    blueskyPassword: "",
    mastodonInstanceUrl: "",
    mastodonAccessToken: "",
    postFormat: "{message}",
    autoPost: false,
  },
  commands: [
    new SlashCommandBuilder()
      .setName("socials")
      .setDescription("Post a message to configured social media platforms")
      .addStringOption((opt) =>
        opt.setName("message").setDescription("Message to post").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("platforms").setDescription("Comma-separated platforms (twitter,bluesky,mastodon)").setRequired(false)
      )
      .toJSON() as any,
  ],
  async createInstance(config: Record<string, unknown>): Promise<FunctionInstance> {
    const currentConfig = { ...config };
    let postsSent = 0;

    async function postToPlatforms(message: string, platforms: string[], userId: string): Promise<Record<string, { ok: boolean; error?: string }>> {
      const results: Record<string, { ok: boolean; error?: string }> = {};

      for (const platform of platforms) {
        switch (platform) {
          case "twitter":
            if (currentConfig.twitterBearerToken) {
              results.twitter = await postToTwitter(currentConfig.twitterBearerToken as string, message);
            } else {
              results.twitter = { ok: false, error: "No token configured" };
            }
            break;
          case "bluesky":
            if (currentConfig.blueskyIdentifier && currentConfig.blueskyPassword) {
              results.bluesky = await postToBluesky(
                currentConfig.blueskyIdentifier as string,
                currentConfig.blueskyPassword as string,
                message,
              );
            } else {
              results.bluesky = { ok: false, error: "No credentials configured" };
            }
            break;
          case "mastodon":
            if (currentConfig.mastodonInstanceUrl && currentConfig.mastodonAccessToken) {
              results.mastodon = await postToMastodon(
                currentConfig.mastodonInstanceUrl as string,
                currentConfig.mastodonAccessToken as string,
                message,
              );
            } else {
              results.mastodon = { ok: false, error: "No credentials configured" };
            }
            break;
          default:
            results[platform] = { ok: false, error: "Unknown platform" };
        }
      }

      return results;
    }

    return {
      name: "socials",
      config: currentConfig,
      async onLoad(bot: any) {
        console.log("[socials] Loaded, monitoring channel:", currentConfig.channelId);
      },
      async onUnload() {},
      async onConfigChange(newConfig: Record<string, unknown>) {
        Object.assign(currentConfig, newConfig);
      },
      async onMessage(message: any, bot: any, context: any) {
        const cfg = currentConfig;
        if (!cfg.autoPost || message.channelId !== cfg.channelId) return;
        if (message.author?.bot) return;
        if (!message.content) return;

        const platforms = (cfg.platforms as string[]) || [];
        if (!platforms.length) return;

        const results = await postToPlatforms(message.content, platforms, message.author.id);
        postsHistory.push({ message: message.content, platforms, timestamp: Date.now(), userId: message.author.id, results });
        postsSent++;
      },
      async handleCommand(interaction: any) {
        if (interaction.commandName !== "socials") return;
        const message = interaction.options.getString("message", true);
        const platformsOpt = interaction.options.getString("platforms");
        const cfg = currentConfig;
        const platforms = platformsOpt
          ? platformsOpt.split(",").map((p: string) => p.trim().toLowerCase())
          : ((cfg.platforms as string[]) || []);

        if (!platforms.length) {
          await interaction.reply({ content: "No platforms configured. Use the dashboard to configure platforms first.", ephemeral: true });
          return;
        }

        await interaction.deferReply({ ephemeral: true });

        const results = await postToPlatforms(message, platforms, interaction.user.id);
        postsHistory.push({ message, platforms, timestamp: Date.now(), userId: interaction.user.id, results });
        postsSent++;

        const resultList = Object.entries(results)
          .map(([name, r]) => r.ok ? `✅ ${name}` : `❌ ${name}: ${r.error}`)
          .join("\n");

        await interaction.editReply({ content: `📱 **Post results:**\n${resultList}\n\n> ${message.slice(0, 200)}` });
      },
      getStats() {
        return { postsSent, platforms: ((currentConfig.platforms as string[]) || []).length };
      },
    };
  },
};

export { socialsManifest };
