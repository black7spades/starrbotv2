import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { CreateBotSchema, UpdateBotSchema } from "config/schema";
import { configStore } from "config/index";
import { requireAdmin, optionalAuth } from "auth/middleware";
import { botManager } from "discord/manager";
import { validateBotToken } from "discord/validation";
import { systemLog } from "utils/systemLog";

function maskToken(token: string): string {
  if (!token || token.length < 8) return "••••••••";
  return token.slice(0, 4) + "••••" + token.slice(-4);
}

export const botRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get("/", { preHandler: optionalAuth }, async () => {
    const summaries = botManager.getAllBotSummaries();
    const enriched = summaries.map((s) => {
      const managed = botManager.getBot(s.id);
      const avatar = managed?.client?.user?.displayAvatarURL() || s.avatarUrl || null;
      return {
        ...s,
        token: undefined,
        avatarUrl: avatar,
      };
    });
    return { bots: enriched };
  });

  fastify.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: optionalAuth },
    async (request, reply) => {
      const bot = configStore.getBot(request.params.id);
      if (!bot) {
        return reply.code(404).send({ error: "Not Found", message: "Bot not found" });
      }

      const functions = configStore.getBotFunctions(bot.id);
      const managed = botManager.getBot(bot.id);
      const liveStats = managed?.getStats();
      const avatar = managed?.client?.user?.displayAvatarURL() || bot.avatarUrl || null;

      return {
        id: bot.id,
        name: bot.name,
        clientId: bot.clientId,
        guildId: bot.guildId || null,
        avatarUrl: avatar,
        enabled: bot.enabled,
        createdAt: bot.createdAt,
        status: managed?.status || "stopped",
        error: managed?.error || null,
        guildCount: managed?.guildCount || 0,
        guilds: managed?.guilds || [],
        runtime: liveStats
          ? {
              uptime: liveStats.uptime,
              lastCheck: liveStats.lastCheck,
              postsSent: liveStats.postsSent,
              errors: liveStats.errors,
              functions: liveStats.functions,
            }
          : null,
        functions: functions.map((f) => ({
          functionName: f.functionName,
          config: f.config,
          enabled: f.enabled,
        })),
      };
    }
  );

  fastify.get<{ Params: { id: string; guildId: string } }>(
    "/:id/guilds/:guildId/channels",
    { preHandler: optionalAuth },
    async (request, reply) => {
      const managed = botManager.getBot(request.params.id);
      if (!managed) return reply.code(404).send({ error: "Bot not running" });
      return managed.getChannels(request.params.guildId);
    }
  );

  fastify.post<{ Body: z.infer<typeof CreateBotSchema> }>(
    "/",
    {
      preHandler: requireAdmin,
      schema: {
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, maxLength: 64 },
            token: { type: "string", minLength: 50 },
            clientId: { type: "string", minLength: 10 },
            guildId: { type: "string" },
            avatarUrl: { type: "string", nullable: true },
          },
          required: ["name", "token", "clientId"],
        },
      },
    },
    async (request, reply) => {
      try {
        const valid = await validateBotToken(request.body.token, request.body.clientId);
        if (!valid) {
          return reply.code(400).send({ error: "Bad Request", message: "Invalid bot token or client ID" });
        }
        const bot = configStore.createBot(request.body);
        return reply.code(201).send({ ...bot, token: maskToken(bot.token) });
      } catch (error: any) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
          return reply.code(409).send({ error: "Conflict", message: "Bot with this name already exists" });
        }
        throw error;
      }
    }
  );

  fastify.patch<{ Params: { id: string }; Body: z.infer<typeof UpdateBotSchema> }>(
    "/:id",
    {
      preHandler: requireAdmin,
      schema: {
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, maxLength: 64 },
            token: { type: "string", minLength: 50 },
            clientId: { type: "string", minLength: 10 },
            guildId: { type: "string", nullable: true },
            avatarUrl: { type: "string", nullable: true },
            enabled: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      const bot = configStore.getBot(request.params.id);
      if (!bot) {
        return reply.code(404).send({ error: "Not Found", message: "Bot not found" });
      }

      if (request.body.token || request.body.clientId) {
        const token = request.body.token || bot.token;
        const clientId = request.body.clientId || bot.clientId;
        const valid = await validateBotToken(token, clientId);
        if (!valid) {
          return reply.code(400).send({ error: "Bad Request", message: "Invalid bot token or client ID" });
        }
      }

      const updated = configStore.updateBot(request.params.id, request.body);
      if (!updated) {
        return reply.code(404).send({ error: "Not Found", message: "Bot not found" });

      }

      const managed = botManager.getBot(request.params.id);
      if (managed && managed.status === "running") {
        await botManager.restartBot(updated);
      }

      return { ...updated, token: maskToken(updated.token) };
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const bot = configStore.getBot(request.params.id);
      if (!bot) {
        return reply.code(404).send({ error: "Not Found", message: "Bot not found" });
      }

      try {
        await botManager.stopBot(request.params.id);
      } catch {
        // ignore — bot may not be running
      }

      configStore.deleteBot(request.params.id);
      return reply.code(204).send();
    }
  );

  fastify.get<{ Params: { id: string; functionName: string } }>(
    "/:id/functions/:functionName",
    { preHandler: optionalAuth },
    async (request, reply) => {
      const { id, functionName } = request.params;
      const bot = configStore.getBot(id);
      if (!bot) {
        return reply.code(404).send({ error: "Not Found", message: "Bot not found" });
      }
      const fn = configStore.getBotFunction(id, functionName);
      return fn || { functionName, config: {}, enabled: false };
    }
  );

  fastify.patch<{ Params: { id: string; functionName: string }; Body: { config?: Record<string, unknown>; enabled?: boolean } }>(
    "/:id/functions/:functionName",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id, functionName } = request.params;
      const bot = configStore.getBot(id);
      if (!bot) {
        return reply.code(404).send({ error: "Not Found", message: "Bot not found" });
      }
      const updated = configStore.upsertBotFunction(id, functionName, request.body);
      const runtime = botManager.getBot(id);
      if (runtime && runtime.status === "running") {
        await runtime.reloadFunction(functionName);
      }
      // `updated` already carries functionName (same value), so spreading it
      // last silently overwrote the explicit key — return it directly.
      return updated;
    }
  );

  fastify.post<{ Params: { id: string } }>(
    "/:id/start",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const bot = configStore.getBot(request.params.id);
      if (!bot) {
        return reply.code(404).send({ error: "Not Found", message: "Bot not found" });
      }

      if (botManager.getBot(bot.id)?.status === "running") {
        return reply.code(409).send({ error: "Conflict", message: "Bot already running" });
      }

      botManager.startBot(bot).catch((err) => {
        systemLog.add("error", `Failed to start bot ${bot.name}: ${err.message}`, `bot:${bot.id}`);
      });
      return { ok: true, status: "starting" };
    }
  );

  fastify.post<{ Params: { id: string } }>(
    "/:id/stop",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const bot = configStore.getBot(request.params.id);
      if (!bot) {
        return reply.code(404).send({ error: "Not Found", message: "Bot not found" });
      }

      botManager.stopBot(bot.id).catch((err) => {
        systemLog.add("error", `Failed to stop bot ${bot.name}: ${err.message}`, `bot:${bot.id}`);
      });
      return { ok: true, status: "stopped" };
    }
  );

  fastify.post<{ Params: { id: string } }>(
    "/:id/restart",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const bot = configStore.getBot(request.params.id);
      if (!bot) {
        return reply.code(404).send({ error: "Not Found", message: "Bot not found" });
      }

      botManager.restartBot(bot).catch((err) => {
        systemLog.add("error", `Failed to restart bot ${bot.name}: ${err.message}`, `bot:${bot.id}`);
      });
      return { ok: true, status: "starting" };
    }
  );

  // Templates
  fastify.get("/templates", { preHandler: optionalAuth }, async () => {
    return { templates: configStore.getTemplates() };
  });

  fastify.post<{ Body: { name: string; description?: string; botId: string } }>(
    "/templates",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { name, description, botId } = request.body;
      if (!name) return reply.code(400).send({ error: "Bad Request", message: "Template name required" });

      const functions = configStore.getBotFunctions(botId);
      if (functions.length === 0) {
        return reply.code(400).send({ error: "Bad Request", message: "Bot has no function configs to template" });
      }

      const template = configStore.createTemplate({
        name,
        description,
        functionConfigs: functions.map((f) => ({
          functionName: f.functionName,
          config: f.config,
          enabled: f.enabled,
        })),
      });

      return reply.code(201).send(template);
    }
  );

  fastify.post<{ Params: { templateId: string }; Body: { name: string; token: string; clientId: string; guildId?: string } }>(
    "/from-template/:templateId",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const template = configStore.getTemplate(request.params.templateId);
      if (!template) {
        return reply.code(404).send({ error: "Not Found", message: "Template not found" });
      }

      const { name, token, clientId, guildId } = request.body;
      if (!name || !token || !clientId) {
        return reply.code(400).send({ error: "Bad Request", message: "name, token, and clientId are required" });
      }

      const valid = await validateBotToken(token, clientId);
      if (!valid) {
        return reply.code(400).send({ error: "Bad Request", message: "Invalid bot token or client ID" });
      }

      const bot = configStore.createBot({ name, token, clientId, guildId });

      // Apply template function configs to the new bot
      for (const fc of template.functionConfigs) {
        configStore.upsertBotFunction(bot.id, fc.functionName, {
          config: fc.config,
          enabled: fc.enabled,
        });
      }

      return reply.code(201).send({ ...bot, token: maskToken(bot.token) });
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    "/templates/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const deleted = configStore.deleteTemplate(request.params.id);
      if (!deleted) {
        return reply.code(404).send({ error: "Not Found", message: "Template not found" });
      }
      return reply.code(204).send();
    }
  );
};
