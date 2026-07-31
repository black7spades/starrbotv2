import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { botManager } from "discord/manager";
import { systemLog, LogEntry } from "utils/systemLog";
import { storageReport, sweep } from "utils/storage";
import { optionalAuth, requireAdmin } from "auth/middleware";

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
    };

    botManager.on("bot:status", handlers.botStatus);

    request.raw.on("close", () => {
      botManager.off("bot:status", handlers.botStatus);
    });

    const interval = setInterval(() => {
      send("heartbeat", { timestamp: Date.now() });
    }, 30000);

    request.raw.on("close", () => clearInterval(interval));
  });

  fastify.get("/logs", { preHandler: optionalAuth }, async (request) => {
    const query = request.query as any;
    return systemLog.getAll({
      limit: Math.min(parseInt(query.limit) || 500, 2000),
      level: query.level || undefined,
      source: query.source || undefined,
      since: query.since ? parseInt(query.since) : undefined,
    });
  });

  /**
   * What the app is holding on disk, and under what limits. Surfaced in the
   * dashboard so nobody has to shell into the container to find out why a
   * volume is filling up.
   */
  fastify.get("/logs/storage", async () => storageReport());

  /**
   * Runs every retention rule immediately instead of waiting for the timer.
   *
   * `transcriptDays` is opt-in and defaults to keeping transcripts forever —
   * they are the only record of what was said in a ticket, so nothing deletes
   * them unless an operator asks for it by name.
   */
  fastify.post("/logs/sweep", { preHandler: requireAdmin }, async (request) => {
    const body = (request.body || {}) as { transcriptDays?: number };
    const days = Number(body.transcriptDays);
    const result = sweep(Number.isFinite(days) && days > 0 ? days : 0);
    systemLog.add("info", "Storage sweep run from the dashboard", "api", {
      ...result,
      user: request.user?.username,
    });
    return { ...result, storage: storageReport() };
  });

  /** Clears the system log. Transcripts and configuration are untouched. */
  fastify.delete("/logs", { preHandler: requireAdmin }, async (request) => {
    const before = systemLog.stats().entries;
    systemLog.clear();
    systemLog.add("info", `System log cleared (${before} entries)`, "api", {
      user: request.user?.username,
    });
    return { cleared: before, storage: storageReport() };
  });

  fastify.get("/logs/stream", { preHandler: optionalAuth }, async (request, reply) => {
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.flushHeaders();

    const send = (entry: LogEntry) => {
      reply.raw.write(`data: ${JSON.stringify(entry)}\n\n`);
    };

    // Send recent history
    const recent = systemLog.getRecent(100);
    for (const entry of recent) {
      send(entry);
    }

    // Listen for new logs
    const handler = (entry: LogEntry) => send(entry);
    systemLog.on("log", handler);

    request.raw.on("close", () => {
      systemLog.off("log", handler);
    });
  });
};
