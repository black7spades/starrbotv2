import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";

import { createServer } from "api/server";
import { configStore } from "config/index";
import { createUser } from "auth/index";
import { generateAccessToken } from "auth/jwt";
import { registerFunction } from "functions/registry/index";
import { instagramManifest } from "functions/instagram/index";

/**
 * Regression tests for the API auth model.
 *
 * The protected route group used `optionalAuth` as its onRequest hook.
 * optionalAuth populates request.user when a token is present but never
 * rejects, so every GET in the group was readable anonymously — including
 * GET /api/bots/:id, which returns each function's stored config and therefore
 * leaked saved Instagram session cookies in plaintext.
 */

let server: FastifyInstance;
let adminToken: string;
let viewerToken: string;

const SECRET_COOKIE = "sessionid=SUPER_SECRET_SESSION_VALUE";

beforeAll(async () => {
  // getBotFunctions() filters out configs whose function isn't registered, so
  // register the manifest as src/index.ts does at boot.
  registerFunction(instagramManifest);

  // Seed a bot whose function config holds a secret, mirroring a real install.
  configStore.createBot({
    name: "Test Bot",
    token: "discord-bot-token-that-must-not-leak",
    clientId: "1234567890",
  });
  configStore.upsertBotFunction("test-bot", "instagram", {
    config: { cookie: SECRET_COOKIE },
    enabled: true,
  });

  const admin = await createUser({ username: "admin-user", password: "password123", role: "admin" });
  const viewer = await createUser({ username: "viewer-user", password: "password123", role: "viewer" });
  adminToken = generateAccessToken({ sub: admin.id, username: admin.username, role: admin.role });
  viewerToken = generateAccessToken({ sub: viewer.id, username: viewer.username, role: viewer.role });

  server = await createServer();
  await server.ready();
});

afterAll(async () => {
  await server?.close();
});

const PROTECTED_READS = [
  "/api/bots",
  "/api/bots/test-bot",
  "/api/users",
  "/api/functions",
  "/api/settings",
  "/api/events/logs",
];

describe("protected routes reject anonymous callers", () => {
  it.each(PROTECTED_READS)("GET %s -> 401 without a token", async (url) => {
    const res = await server.inject({ method: "GET", url });
    expect(res.statusCode).toBe(401);
  });

  it("does not leak a stored function secret to an anonymous caller", async () => {
    const res = await server.inject({ method: "GET", url: "/api/bots/test-bot" });
    expect(res.statusCode).toBe(401);
    expect(res.body).not.toContain("SUPER_SECRET_SESSION_VALUE");
  });

  it("rejects a malformed or forged token", async () => {
    for (const auth of ["Bearer nonsense", "Bearer ", "Basic abc", "nonsense"]) {
      const res = await server.inject({
        method: "GET",
        url: "/api/bots",
        headers: { authorization: auth },
      });
      expect(res.statusCode).toBe(401);
    }
  });
});

describe("public routes stay reachable", () => {
  it.each(["/health/live", "/health/ready", "/api/auth/setup/status"])(
    "GET %s -> 200 without a token",
    async (url) => {
      const res = await server.inject({ method: "GET", url });
      expect(res.statusCode).toBe(200);
    }
  );

  it("login is reachable anonymously and rejects bad credentials with 401", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin-user", password: "wrong-password" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("authenticated reads still work", () => {
  it.each(PROTECTED_READS)("GET %s -> 200 for an admin", async (url) => {
    const res = await server.inject({
      method: "GET",
      url,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns the function config to an authorised admin", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/bots/test-bot",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("SUPER_SECRET_SESSION_VALUE");
  });

  it("never returns the raw Discord bot token", async () => {
    for (const url of ["/api/bots", "/api/bots/test-bot"]) {
      const res = await server.inject({
        method: "GET",
        url,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.body).not.toContain("discord-bot-token-that-must-not-leak");
    }
  });

  it("accepts the token via cookie as well as bearer header", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/bots",
      cookies: { access_token: adminToken },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("admin-only routes reject a viewer", () => {
  it("a viewer cannot list users", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/users",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("a viewer cannot create a bot", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/bots",
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { name: "Nope", token: "x".repeat(60), clientId: "1234567890" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("a viewer cannot reach the outbound-fetch diagnostic", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/functions/test-feed",
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { feedPath: "http://127.0.0.1/" },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("test-feed is not an open fetch proxy", () => {
  it("requires authentication", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/functions/test-feed",
      payload: { feedPath: "http://127.0.0.1/" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects non-http(s) schemes for an admin", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/functions/test-feed",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { feedPath: "file:///etc/passwd" },
    });
    expect(res.statusCode).toBe(400);
  });
});
