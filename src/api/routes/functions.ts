import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { configStore } from "config/index";
import { getAllManifests, getManifest } from "functions/registry/index";
import { providerCatalogue, buildFeedUrl } from "functions/updates/providers";
import { fetchFeed } from "functions/updates/feed";
import { runDiagnostics, runSelfTest } from "functions/twitch/selftest";
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

  /**
   * Twitch integration health. Read-only and side-effect free, so it is safe to
   * poll from the dashboard while someone is filling the form in.
   */
  fastify.get<{ Querystring: { channel?: string } }>(
    "/twitch/diagnostics",
    { preHandler: requireAdmin },
    async (request) => {
      return runDiagnostics(request.query.channel);
    }
  );

  /**
   * Sends a signed synthetic go-live through the real public callback. Admin
   * only and a POST, because it puts a message in a Discord channel.
   */
  fastify.post<{ Body: { channel?: string } }>(
    "/twitch/self-test",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const channel = (request.body?.channel ?? "").trim();
      if (!channel) {
        return reply
          .code(400)
          .send({ error: "Bad Request", message: "A Twitch channel name is required" });
      }
      return runSelfTest({ broadcasterLogin: channel });
    }
  );

  // Source types the Updates function can follow, for the Playground's picker.
  fastify.get("/updates/providers", { preHandler: optionalAuth }, async () => {
    return { providers: providerCatalogue() };
  });

  // Admin-only: this endpoint makes a server-side request to a caller-supplied
  // URL, so it can be used to reach hosts only the server can see.
  fastify.post<{ Body: { url?: string; providerId?: string; input?: Record<string, string> } }>(
    "/test-feed",
    { preHandler: requireAdmin },
    async (request, reply) => {
      // Accept either a ready-made feed URL or a provider + its field values,
      // so the Playground can preview a source before it is saved.
      let target = (request.body.url ?? "").trim();
      if (!target && request.body.providerId) {
        const built = buildFeedUrl(request.body.providerId, request.body.input ?? {});
        if (!built.ok) return reply.code(400).send({ error: "Bad Request", message: built.error });
        target = built.url!;
      }
      if (!target) {
        return reply.code(400).send({ error: "Bad Request", message: "A feed URL or provider is required" });
      }

      let parsed: URL;
      try {
        parsed = new URL(target);
      } catch {
        return reply.code(400).send({ error: "Bad Request", message: "Invalid feed URL" });
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return reply
          .code(400)
          .send({ error: "Bad Request", message: "Only http and https URLs are supported" });
      }

      try {
        const items = await fetchFeed(target);
        if (items.length === 0) {
          // Deliberately does not echo the response body — doing so would turn
          // this diagnostic endpoint into a way to read arbitrary URLs.
          return { ok: false, error: "That URL did not return any feed items", url: target };
        }
        return {
          ok: true,
          url: target,
          itemCount: items.length,
          items: items.slice(0, 3).map((i) => ({ title: i.title, link: i.link })),
        };
      } catch (err: any) {
        return { ok: false, error: err.message || "Fetch failed", url: target };
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

      if (request.body.config && typeof request.body.config !== "object") {
        return reply.code(400).send({ error: "Bad Request", message: "Config must be an object" });
      }

      const updated = configStore.upsertBotFunction(botId, name, request.body);

      const runtime = botManager.getBot(botId);
      if (runtime && runtime.status === "running") {
        await runtime.reloadFunction(name);
      }

      // `updated` already carries functionName (same value) — see bots.ts.
      return updated;
    }
  );
};