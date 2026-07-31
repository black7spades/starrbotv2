import Fastify, { FastifyInstance, FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import fastifyStatic from "@fastify/static";
import path from "path";
import { authRoutes } from "./routes/auth";
import { discordRoutes } from "./routes/discord";
import { userRoutes } from "./routes/users";
import { botRoutes } from "./routes/bots";
import { functionRoutes } from "./routes/functions";
import { eventRoutes } from "./routes/events";
import { settingsRoutes } from "./routes/settings";
import { healthRoutes } from "./routes/health";
import { twitchRoutes } from "./routes/twitch";
import { authMiddleware, optionalAuth } from "auth/middleware";
import { logger } from "utils/logger";

const PORT = parseInt(process.env.PORT || "2013");
const HOST = process.env.HOST || "0.0.0.0";

declare module "fastify" {
  interface FastifyRequest {
    startTime?: number;
  }
}

export async function createServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: false,
    trustProxy: true,
  });

  await server.register(cors, {
    origin: true,
    credentials: true,
  });

  await server.register(cookie, {
    hook: "onRequest",
  });

  await server.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "1 minute",
  });

  await server.register(swagger, {
    openapi: {
      info: {
        title: "StarrBot v2 API",
        description: "Multi-bot Discord fleet management API",
        version: "2.0.0",
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
          cookieAuth: { type: "apiKey", in: "cookie", name: "access_token" },
        },
      },
      security: [{ bearerAuth: [], cookieAuth: [] }],
    },
  });

  await server.register(swaggerUI, {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "list", deepLinking: true },
  });

  await server.register(healthRoutes);

  // Twitch EventSub callback. Registered outside the authenticated groups on
  // purpose: Twitch cannot present a session, so the route authenticates each
  // request by HMAC signature instead. It gets its own encapsulated scope so
  // its raw-body parser does not affect any other route.
  await server.register(twitchRoutes, { prefix: "/api/twitch" });

  const publicDir = path.join(__dirname, "..", "..", "public");
  await server.register(fastifyStatic, {
    root: publicDir,
    prefix: "/",
    wildcard: false,
  });

  server.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/") || request.url.startsWith("/docs")) {
      return reply.code(404).send({ error: "Not Found", message: `Route ${request.method} ${request.url} not found` });
    }
    return reply.sendFile("index.html");
  });

  server.addHook("onRequest", async (request: FastifyRequest) => {
    request.startTime = Date.now();
  });

  server.addHook("onResponse", async (request: FastifyRequest, reply) => {
    const duration = Date.now() - (request.startTime || Date.now());
    if (reply.statusCode >= 400 || duration > 2000) {
      logger.warn(
        { method: request.method, url: request.url, status: reply.statusCode, duration },
        "HTTP request"
      );
    }
  });

  await server.register(async (fastify) => {
    fastify.addHook("onRequest", optionalAuth);
    await fastify.register(authRoutes, { prefix: "/api/auth" });
    await fastify.register(discordRoutes, { prefix: "/api/auth" });
  });

  await server.register(async (fastify) => {
    // Every route in this group requires a valid session. Individual routes
    // additionally use `requireAdmin` for writes. Using `optionalAuth` here
    // left all GET routes readable by anonymous callers — including
    // /api/bots/:id, which returns per-function config (session cookies,
    // tokens and similar secrets) in plaintext.
    fastify.addHook("onRequest", authMiddleware);

    await fastify.register(userRoutes, { prefix: "/api/users" });
    await fastify.register(botRoutes, { prefix: "/api/bots" });
    await fastify.register(functionRoutes, { prefix: "/api/functions" });
    await fastify.register(eventRoutes, { prefix: "/api/events" });
    await fastify.register(settingsRoutes, { prefix: "/api/settings" });
  });

  server.setErrorHandler((error, request, reply) => {
    logger.error({ err: error, url: request.url }, "Request error");

    if (error.validation) {
      return reply.code(400).send({
        error: "Bad Request",
        message: "Validation failed",
        details: error.validation,
      });
    }

    if (error.statusCode === 401) {
      return reply.code(401).send({ error: "Unauthorized", message: error.message });
    }

    if (error.statusCode === 403) {
      return reply.code(403).send({ error: "Forbidden", message: error.message });
    }

    return reply.code(500).send({ error: "Internal Server Error", message: "An unexpected error occurred" });
  });

  return server;
}

export async function startServer(): Promise<void> {
  const server = await createServer();

  try {
    await server.listen({ port: PORT, host: HOST });
    logger.info(`Server listening on http://${HOST}:${PORT}`);
    logger.info(`API docs available at http://${HOST}:${PORT}/docs`);
  } catch (err) {
    logger.error(err, "Failed to start server");
    process.exit(1);
  }
}

// NOTE: SIGTERM/SIGINT are handled in src/index.ts, which stops each bot and
// closes the config store before exiting. Handlers used to be registered here
// too, and because this module is imported first they ran first and called
// process.exit(0) immediately — pre-empting that graceful shutdown.