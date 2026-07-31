import type { FunctionManifest, FunctionInstance } from "../registry/types";
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { systemLog } from "utils/systemLog";
import { TwitchApi, SUBSCRIPTION_TYPES } from "./api";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { twitchEvents, type TwitchNotification } from "./events";

function log(level: "info" | "warn" | "error", msg: string) {
  systemLog.add(level, msg, "twitch");
}

const DATA_DIR = process.env.STARRBOT_DATA_DIR || join(__dirname, "../../../data");
const STATE_FILE = join(DATA_DIR, "twitch-state.json");

/**
 * Records the fingerprint of the secret each broadcaster was subscribed with,
 * so a rotated secret can be detected across a restart.
 */
function readState(): Record<string, string> {
  try {
    if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    // A corrupt state file just means we re-subscribe once.
  }
  return {};
}

function writeState(state: Record<string, string>): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err: any) {
    log("warn", `could not persist Twitch state: ${err.message}`);
  }
}

/** Where Twitch should POST events. Derived from the same BASE_URL Discord OAuth uses. */
export function callbackUrl(): string {
  const base = (process.env.BASE_URL || "").replace(/\/+$/, "");
  return `${base}/api/twitch/eventsub`;
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
}

const twitchManifest: FunctionManifest = {
  name: "twitch",
  label: "Twitch",
  description: "Announce when a Twitch channel goes live, in real time",
  icon: "📺",
  version: "1.0.0",
  configSchema: {
    type: "object",
    properties: {
      broadcasterLogin: {
        type: "string",
        description: "Twitch channel name, as it appears in the channel URL",
      },
      guildId: { type: "string", description: "Discord server to post in" },
      channelId: { type: "string", description: "Discord channel for go-live announcements" },
      mentionRoleId: {
        type: "string",
        description: "Role to ping on go-live (optional)",
      },
      liveMessage: {
        type: "string",
        default: "{name} is live!",
        description: "Message text. {name}, {title}, {game} and {url} are substituted.",
      },
      announceOffline: {
        type: "boolean",
        default: false,
        description: "Also post when the stream ends",
      },
    },
    required: ["broadcasterLogin", "channelId"],
  },
  defaultConfig: {
    broadcasterLogin: "",
    guildId: "",
    channelId: "",
    mentionRoleId: "",
    liveMessage: "{name} is live!",
    announceOffline: false,
  },
  commands: [
    new SlashCommandBuilder()
      .setName("twitch")
      .setDescription("Twitch go-live announcements")
      .addSubcommand((sub) =>
        sub.setName("status").setDescription("Show the watched channel and subscription health")
      )
      .toJSON() as any,
  ],

  async createInstance(config: Record<string, unknown>): Promise<FunctionInstance> {
    const currentConfig = { ...config };
    let clientRef: any = null;
    let unsubscribe: (() => void) | null = null;
    let broadcasterId: string | null = null;
    let lastError: string | null = null;
    let announced = 0;

    // Remembers the most recent title/category so a go-live announcement can
    // include them: stream.online itself carries neither.
    let lastTitle = "";
    let lastGame = "";

    const api = TwitchApi.fromEnv();

    async function postAnnouncement(n: TwitchNotification): Promise<void> {
      const channelId = currentConfig.channelId as string;
      if (!channelId || !clientRef) return;

      try {
        const channel = await clientRef.channels.fetch(channelId);
        if (!channel?.isTextBased()) {
          log("warn", `configured channel ${channelId} is not text-based`);
          return;
        }

        const name = n.event.broadcasterUserName || n.event.broadcasterUserLogin;
        const url = `https://twitch.tv/${n.event.broadcasterUserLogin}`;

        if (n.subscriptionType === SUBSCRIPTION_TYPES.update.type) {
          // Title/category changes are recorded, not announced.
          if (n.event.title) lastTitle = n.event.title;
          if (n.event.categoryName) lastGame = n.event.categoryName;
          return;
        }

        if (n.subscriptionType === SUBSCRIPTION_TYPES.offline.type) {
          if (!currentConfig.announceOffline) return;
          await channel.send({
            embeds: [
              new EmbedBuilder()
                .setAuthor({ name, url })
                .setDescription(`${name} has ended their stream.`)
                .setColor(0x4b367c)
                .setTimestamp(),
            ],
          });
          return;
        }

        // stream.online
        const template = (currentConfig.liveMessage as string) || "{name} is live!";
        const content = renderTemplate(template, {
          name,
          title: lastTitle || "",
          game: lastGame || "",
          url,
        });

        const embed = new EmbedBuilder()
          .setAuthor({ name, url })
          .setTitle(lastTitle || `${name} is live on Twitch`)
          .setURL(url)
          .setColor(0x9146ff)
          .setTimestamp(n.event.startedAt ? new Date(n.event.startedAt) : new Date());

        if (lastGame) embed.addFields({ name: "Playing", value: lastGame, inline: true });

        const mention = currentConfig.mentionRoleId
          ? `<@&${currentConfig.mentionRoleId}> `
          : "";

        await channel.send({ content: `${mention}${content}\n${url}`, embeds: [embed] });
        announced++;
        log("info", `announced go-live for ${n.event.broadcasterUserLogin}`);
      } catch (err: any) {
        lastError = err.message;
        log("error", `failed to post announcement: ${err.message}`);
      }
    }

    /**
     * Resolves the channel and makes sure Twitch is subscribed to it.
     *
     * Failures here are logged rather than thrown: a missing Twitch app or an
     * unreachable callback should leave the rest of the bot running.
     */
    async function connect(): Promise<void> {
      const login = String(currentConfig.broadcasterLogin ?? "").trim();
      if (!login) {
        lastError = "No Twitch channel configured";
        return;
      }
      if (!api) {
        lastError = "TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET are not set";
        log("warn", lastError);
        return;
      }

      const secret = process.env.TWITCH_EVENTSUB_SECRET ?? "";
      const callback = callbackUrl();
      if (!callback.startsWith("https://")) {
        lastError = `BASE_URL must be a public https URL for Twitch to reach ${callback}`;
        log("warn", lastError);
        return;
      }

      try {
        const user = await api.getUserByLogin(login);
        if (!user) {
          lastError = `Twitch channel "${login}" not found`;
          log("warn", lastError);
          return;
        }
        broadcasterId = user.id;

        const state = readState();
        const result = await api.ensureSubscriptions({
          broadcasterUserId: user.id,
          callback,
          secret,
          previousSecretFingerprint: state[user.id] ?? null,
        });
        state[user.id] = result.secretFingerprint;
        writeState(state);

        log(
          "info",
          `subscriptions for ${login}: created=${result.created.length} kept=${result.kept.length} removed=${result.removed.length}`
        );

        unsubscribe?.();
        unsubscribe = twitchEvents.onBroadcaster(user.id, (n) => {
          void postAnnouncement(n);
        });
        lastError = null;
      } catch (err: any) {
        lastError = err.message;
        log("error", `Twitch setup failed for ${login}: ${err.message}`);
      }
    }

    return {
      name: "twitch",
      config: currentConfig,

      async onLoad(bot: any) {
        clientRef = bot?.client ?? null;
        await connect();
      },

      async onUnload() {
        unsubscribe?.();
        unsubscribe = null;
      },

      async onConfigChange(newConfig: Record<string, unknown>) {
        const before = currentConfig.broadcasterLogin;
        Object.assign(currentConfig, newConfig);
        // Only re-subscribe when the watched channel actually changed;
        // everything else is read at post time.
        if (before !== currentConfig.broadcasterLogin) await connect();
      },

      async handleCommand(interaction: any) {
        if (interaction.commandName !== "twitch") return;
        if (interaction.options.getSubcommand() !== "status") return;

        const login = String(currentConfig.broadcasterLogin ?? "") || "(not set)";
        const lines = [
          `**Channel:** ${login}`,
          `**Broadcaster ID:** ${broadcasterId ?? "not resolved"}`,
          `**Callback:** ${callbackUrl() || "(BASE_URL not set)"}`,
          `**Announcements sent:** ${announced}`,
        ];
        if (lastError) lines.push(`**Last error:** ${lastError}`);

        await interaction.reply({ content: lines.join("\n"), ephemeral: true });
      },

      getStats() {
        return { announced, broadcasterId, lastError };
      },
    };
  },
};

export { twitchManifest };
