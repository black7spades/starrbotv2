export * from "./schema";
export { ConfigStore, configStore } from "./store";

import { configStore } from "./store";

const ENV_MAP: Record<string, string> = {
  baseUrl: "BASE_URL",
  discordClientId: "DISCORD_CLIENT_ID",
  discordClientSecret: "DISCORD_CLIENT_SECRET",
  twitchClientId: "TWITCH_CLIENT_ID",
  twitchClientSecret: "TWITCH_CLIENT_SECRET",
  twitchEventsubSecret: "TWITCH_EVENTSUB_SECRET",
};

/**
 * Reads an integration setting from settings.json, falling back to the
 * matching environment variable. Dashboard-configured values take priority
 * so operators can move off docker-compose env vars at their own pace.
 */
export function setting(key: keyof typeof ENV_MAP): string {
  const stored = (configStore.getSettings() as any)[key];
  if (stored) return stored;
  return process.env[ENV_MAP[key]] || "";
}
