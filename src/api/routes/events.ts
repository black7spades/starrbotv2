import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { configStore } from "config/index";
import { botManager } from "discord/manager";
import { logger } from "utils/logger";
import { optionalAuth } from "auth/middleware";

export const eventRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get("/stream", { preHandler: optionalAuth }, async (request, reply) => {
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.flushHeaders();

    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    send("bots", botManager.getAllBotSummaries());

    const handlers = {
      botStatus: (data: { id: string; status: string; error: string | null }) => send("bot:status", data),
      botLog: (data: { botId: string; message: string; timestamp: number; level: string }) => send("bot:log", data),
      botStats: (data: { id: string; stats: any }) => send("bot:stats", data),
    };

    botManager.on("bot:status", handlers.botStatus);
    botManager.on("bot:log", handlers.botLog);
    botManager.on("bot:stats", handlers.botStats);

    request.raw.on("close", () => {
      botManager.off("bot:status", handlers.botStatus);
      botManager.off("bot:log", handlers.botLog);
      botManager.off("bot:stats", handlers.botStats);
    });

    const interval = setInterval(() => {
      send("heartbeat", { timestamp: Date.now() });
    }, 30000);

    request.raw.on("close", () => clearInterval(interval));
  });

  fastify.get<{ Params: { id: string } }>(
    "/bots/:id/logs",
    { preHandler: optionalAuth },
    async (request, reply) => {
      const runtime = botManager.getBot(request.params.id);
      if (!runtime) {
        return reply.code(404).send({ error: "Not Found", message: "Bot not found" });
      }

      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.flushHeaders();

      const logs = runtime.getLogs();
      for (const log of logs.slice(-100)) {
        reply.raw.write(`data: ${JSON.stringify(log)}\n\n`);
      }

      const handler = (data: { botId: string; message: string; timestamp: number; level: string }) => {
        if (data.botId === request.params.id) {
          reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
        }
      };

      botManager.on("bot:log", handler);

      request.raw.on("close", () => {
        botManager.off("bot:log", handler);
      });
    }
  );
};
