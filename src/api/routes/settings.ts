import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { configStore } from "config/index";
import { setting } from "config/index";
import { requireAdmin } from "auth/middleware";

const SECRET_FIELDS = new Set([
  "discordClientSecret",
  "twitchClientSecret",
  "twitchEventsubSecret",
]);

function mask(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return "••••" + value.slice(-4);
}

function effectiveSettings() {
  const stored = configStore.getSettings();
  const keys = [
    "baseUrl",
    "discordClientId",
    "discordClientSecret",
    "twitchClientId",
    "twitchClientSecret",
    "twitchEventsubSecret",
  ] as const;

  const result: Record<string, any> = {
    commandPrefix: stored.commandPrefix,
    theme: stored.theme,
  };

  for (const key of keys) {
    const value = setting(key);
    result[key] = SECRET_FIELDS.has(key) ? mask(value) : value;
    result[`${key}Set`] = !!value;
  }
  return result;
}

export const settingsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get("/", async () => {
    return effectiveSettings();
  });

  fastify.patch<{
    Body: {
      theme?: "light" | "dark";
      baseUrl?: string;
      discordClientId?: string;
      discordClientSecret?: string;
      twitchClientId?: string;
      twitchClientSecret?: string;
      twitchEventsubSecret?: string;
    };
  }>("/", { preHandler: requireAdmin }, async (request, reply) => {
    const { body } = request;
    if (body.theme && !["light", "dark"].includes(body.theme)) {
      return reply.code(400).send({ error: "Bad Request", message: "Invalid theme" });
    }

    const updates: Record<string, any> = {};
    if (body.theme !== undefined) updates.theme = body.theme;
    if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl.replace(/\/+$/, "");
    if (body.discordClientId !== undefined) updates.discordClientId = body.discordClientId;
    if (body.twitchClientId !== undefined) updates.twitchClientId = body.twitchClientId;

    for (const key of ["discordClientSecret", "twitchClientSecret", "twitchEventsubSecret"] as const) {
      if (body[key] !== undefined && !body[key]!.startsWith("••••")) {
        updates[key] = body[key];
      }
    }

    configStore.updateSettings(updates);
    return effectiveSettings();
  });
};
