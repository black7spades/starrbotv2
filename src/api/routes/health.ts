import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { configStore } from "config/index";
import { botManager } from "discord/manager";
import { execSync } from "child_process";
import { register } from "utils/metrics";

const gitHash = process.env.GIT_HASH || (() => {
  try {
    return execSync("git rev-parse --short HEAD", { timeout: 3000 }).toString().trim();
  } catch { return "unknown"; }
})();

const buildTime = new Date().toISOString();

export const healthRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get("/health/live", async () => ({ status: "ok" }));

  fastify.get("/health/ready", async () => {
    const dbOk = !!configStore;
    const redisOk = botManager.checkRedisConnection();
    if (!dbOk || !redisOk) {
      return { status: "degraded", db: dbOk, redis: redisOk };
    }
    return { status: "ready", db: dbOk, redis: redisOk };
  });

  fastify.get("/api/version", async () => ({
    version: gitHash,
    buildTime,
    nodeEnv: process.env.NODE_ENV || "development",
  }));

  fastify.get("/metrics", async (_, reply) => {
    const metrics = await register.metrics();
    reply.header("Content-Type", register.contentType);
    return metrics;
  });
};
