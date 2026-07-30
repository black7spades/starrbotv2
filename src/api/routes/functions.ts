import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { configStore } from "config/index";
import { getAllManifests, getManifest } from "functions/registry/index";
import { requireAdmin, optionalAuth } from "auth/middleware";
import { botManager } from "discord/manager";

const updateFunctionBodySchema = z.object({
  config: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

export const functionRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get("/", { preHandler: optionalAuth }, async () => {
    return getAllManifests();
  });

  // Admin-only: this endpoint makes a server-side request to a caller-supplied
  // URL, so it can be used to reach hosts only the server can see.
  fastify.post<{ Body: { rsshubUrl: string; feedPath: string } }>(
    "/test-feed",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { rsshubUrl, feedPath } = request.body;
      if (!feedPath) {
        return reply.code(400).send({ error: "Bad Request", message: "feedPath is required" });
      }

      // If feedPath is a full URL (e.g. YouTube native RSS), use it directly
      const url = feedPath.startsWith("http")
        ? feedPath
        : `${(rsshubUrl || "").replace(/\/+$/, "")}/${feedPath.replace(/^\/+/, "")}`;

      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return reply.code(400).send({ error: "Bad Request", message: "Invalid feed URL" });
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return reply.code(400).send({ error: "Bad Request", message: "Only http and https URLs are supported" });
      }

      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) {
          return { ok: false, error: `HTTP ${res.status}`, url };
        }
        const text = await res.text();

        const items: { title: string; link: string }[] = [];
        const itemMatches = text.matchAll(/<item>([\s\S]*?)<\/item>/gi);
        for (const match of itemMatches) {
          const block = match[1];
          const title = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i)?.[1]
            || block.match(/<title>([\s\S]*?)<\/title>/i)?.[1]
            || "Untitled";
          const link = block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "";
          if (items.length < 3) items.push({ title: title.trim(), link: link.trim() });
        }

        if (items.length === 0) {
          // Deliberately does not echo the response body — doing so would turn
          // this diagnostic endpoint into a way to read arbitrary URLs.
          return { ok: false, error: "Feed returned 0 items (may need Instagram cookie or invalid URL)", url };
        }

        return { ok: true, itemCount: items.length, items, url };
      } catch (err: any) {
        return { ok: false, error: err.message || "Fetch failed", url };
      }
    }
  );

  fastify.get<{ Params: { name: string } }>(
    "/:name",
    { preHandler: optionalAuth },
    async (request, reply) => {
      const manifest = getManifest(request.params.name);
      if (!manifest) {
        return reply.code(404).send({ error: "Not Found", message: "Function not found" });
      }
      return manifest;
    }
  );

  fastify.patch<{ Params: { botId: string; name: string }; Body: z.infer<typeof updateFunctionBodySchema> }>(
    "/:botId/:name",
    {
      preHandler: requireAdmin,
      schema: {
        body: {
          type: "object",
          properties: {
            config: { type: "object" },
            enabled: { type: "boolean" },
          },
        },
        params: {
          type: "object",
          properties: {
            botId: { type: "string" },
            name: { type: "string" },
          },
          required: ["botId", "name"],
        },
      },
    },
    async (request, reply) => {
      const { botId, name } = request.params;
      const bot = configStore.getBot(botId);
      if (!bot) {
        return reply.code(404).send({ error: "Not Found", message: "Bot not found" });
      }

      const manifest = getManifest(name);
      if (!manifest) {
        return reply.code(404).send({ error: "Not Found", message: "Function not found" });
      }

      if (request.body.config) {
        const result = manifest.configSchema.safeParse(request.body.config);
        if (!result.success) {
          return reply.code(400).send({ error: "Bad Request", message: "Invalid config", details: result.error.flatten() });
        }
      }

      const updated = configStore.upsertBotFunction(botId, name, request.body);

      const runtime = botManager.getBot(botId);
      if (runtime && runtime.status === "running") {
        await runtime.reloadFunction(name);
      }

      return { functionName: name, ...updated };
    }
  );
};