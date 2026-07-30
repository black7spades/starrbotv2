import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { configStore } from "config/index";
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

  fastify.get("/health/ready", async (_, reply) => {
    // Readiness = the JSON store is usable. This previously also reported a
    // `redis` field sourced from a function that unconditionally returned true,
    // so the endpoint claimed Redis was healthy whether or not it was; nothing
    // in the app uses Redis at all.
    const storeOk = configStore.isReady();
    if (!storeOk) {
      return reply.code(503).send({ status: "degraded", store: false });
    }
    return { status: "ready", store: true };
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
