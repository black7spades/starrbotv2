import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { configStore } from "config/index";
import { execSync } from "child_process";
import { register } from "utils/metrics";

/**
 * Build identity.
 *
 * The dashboard used to show the raw GIT_HASH, which CI sets to the full
 * 40-character SHA — long enough to overrun the sidebar. Report the package
 * version as the headline instead, with the commit abbreviated to 7 characters
 * and accompanied by links so it stays clickable rather than just decorative.
 */
const REPO_URL = "https://github.com/black7spades/starrbotv2";

const packageVersion: string = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return String(require("../../../package.json").version ?? "0.0.0");
  } catch {
    return "0.0.0";
  }
})();

const fullCommit = (() => {
  if (process.env.GIT_HASH && process.env.GIT_HASH !== "unknown") return process.env.GIT_HASH;
  try {
    return execSync("git rev-parse HEAD", { timeout: 3000 }).toString().trim();
  } catch {
    return "";
  }
})();

/** Abbreviated the way git and GitHub abbreviate. */
const shortCommit = fullCommit ? fullCommit.slice(0, 7) : "";

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
    version: packageVersion,
    commit: shortCommit,
    commitUrl: fullCommit ? `${REPO_URL}/commit/${fullCommit}` : null,
    repoUrl: REPO_URL,
    changelogUrl: `${REPO_URL}/blob/main/CHANGELOG.md`,
    releasesUrl: `${REPO_URL}/releases`,
    buildTime,
    nodeEnv: process.env.NODE_ENV || "development",
  }));

  fastify.get("/metrics", async (_, reply) => {
    const metrics = await register.metrics();
    reply.header("Content-Type", register.contentType);
    return metrics;
  });
};
