import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { CreateBotSchema, UpdateBotSchema, CreateBotInput, UpdateBotInput } from "config/schema";
import { configStore } from "config/index";
import { requireAdmin, optionalAuth } from "auth/middleware";
import { botManager } from "discord/manager";
import { validateBotToken } from "discord/validation";

export const botRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get("/", { preHandler: optionalAuth }, async () => {
    const bots = configStore.getBotSummaries();
    const summaries = botManager.getAllBotSummaries();
    const statusMap: Record<string, { status: string; error: string | null; guildCount: number }> = {};
    for (const s of summaries) {
      statusMap[s.id] = { status: s.status, error: s.error, guildCount: s.guildCount };
    }
    const enriched = bots.map((b) => ({
      ...b,
      ...(statusMap[b.id] || { status: "stopped", error: null, guildCount: 0 }),
    }));
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

      return {
        ...bot,
        status: managed?.status || "stopped",
        error: managed?.error || null,
        guildCount: managed?.guildCount || 0,
        runtime: managed
          ? {
              uptime: managed.stats?.uptime || null,
              lastCheck: managed.stats?.lastCheck || null,
              postsSent: managed.stats?.postsSent || 0,
              errors: managed.stats?.errors || 0,
              functions: managed.stats?.functions || [],
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
            avatarUrl: { type: "string", format: "uri", nullable: true },
          },
          required: ["name", "token", "clientId"],
        },
      },
    },
    async (request, reply) => {
      try {
        const bot = configStore.createBot(request.body);
        return reply.code(201).send(bot);
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
            avatarUrl: { type: "string", format: "uri", nullable: true },
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
      return reply.send(updated);
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const deleted = configStore.deleteBot(request.params.id);
      if (!deleted) {
        return reply.code(404).send({ error: "Not Found", message: "Bot not found" });
      }
      return reply.code(204).send();
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

      try {
        await botManager.startBot(bot);
        return { ok: true };
      } catch (error: any) {
        return reply.code(500).send({ error: "Internal Server Error", message: error.message });
      }
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

      botManager.stopBot(bot.id);
      return { ok: true };
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

      try {
        await botManager.restartBot(bot);
        return { ok: true };
      } catch (error: any) {
        return reply.code(500).send({ error: "Internal Server Error", message: error.message });
      }
    }
  );
};