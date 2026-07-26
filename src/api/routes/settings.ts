import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { configStore } from "config/index";
import { requireAdmin } from "auth/middleware";

export const settingsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get("/", async () => {
    return configStore.getSettings();
  });

  fastify.patch<{ Body: { theme?: "light" | "dark" } }>("/", { preHandler: requireAdmin }, async (request, reply) => {
    const { theme } = request.body;
    if (theme && !["light", "dark"].includes(theme)) {
      return reply.code(400).send({ error: "Bad Request", message: "Invalid theme" });
    }
    return configStore.updateSettings({ theme });
  });
};
