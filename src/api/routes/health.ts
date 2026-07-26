import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { configStore } from "config/index";
import { botManager } from "discord/manager";
import { register } from "utils/metrics";

export const healthRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get("/health/live", async () => ({ status: "ok" }));

  fastify.get("/health/ready", async () => {
    const dbOk = !!configStore;
    const redisOk = await botManager.checkRedisConnection();

    if (!dbOk || !redisOk) {
      return { status: "degraded", db: dbOk, redis: redisOk };
    }
    return { status: "ready", db: dbOk, redis: redisOk };
  });

  fastify.get("/metrics", async (_, reply) => {
    const metrics = await register.metrics();
    reply.header("Content-Type", register.contentType);
    return metrics;
  });
};
