import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { configStore } from "config/index";
import { getAllManifests, getManifest, createInstance } from "functions/registry/index";
import { requireAdmin, optionalAuth } from "auth/middleware";
import { botManager } from "discord/manager";

const updateFunctionBodySchema = z.object({
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

export const functionRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get("/", { preHandler: optionalAuth }, async () => {
    return getAllManifests();
  });

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