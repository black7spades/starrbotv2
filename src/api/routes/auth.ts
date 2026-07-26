import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { LoginSchema, CreateUserSchema } from "config/schema";
import { authenticateUser, createSession, refreshSession, revokeSession, createUser } from "auth/index";
import { hashToken } from "auth/argon2";
import { configStore } from "config/index";

const loginBodySchema = LoginSchema;
const refreshBodySchema = z.object({
  refreshToken: z.string().optional(),
});
const setupBodySchema = CreateUserSchema;

export const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Check if setup is needed (no admin user exists)
  fastify.get("/setup/status", async () => {
    const needsSetup = !configStore.hasAdminUser();
    return { needsSetup };
  });

  // Initial admin setup (only works if no admin exists)
  fastify.post<{ Body: z.infer<typeof setupBodySchema> }>(
    "/setup",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            username: { type: "string", minLength: 3, maxLength: 32 },
            password: { type: "string", minLength: 8, maxLength: 128 },
            role: { type: "string", enum: ["admin", "viewer"], default: "admin" },
          },
          required: ["username", "password"],
        },
      },
    },
    async (request, reply) => {
      // Only allow setup if no admin exists
      if (configStore.hasAdminUser()) {
        return reply.code(403).send({ error: "Forbidden", message: "Admin user already exists" });
      }

      const { username, password, role } = request.body;
      const user = await createUser({ username, password, role: role || "admin" });

      // Create session for the new admin
      const { accessToken, refreshToken } = createSession(user);

      const accessMaxAge = 24 * 60 * 60; // 24 hours
      reply.setCookie("access_token", accessToken, {
        httpOnly: true,
        secure: request.protocol === "https",
        sameSite: "lax",
        maxAge: accessMaxAge,
        path: "/",
      });

      reply.setCookie("refresh_token", refreshToken, {
        httpOnly: true,
        secure: request.protocol === "https",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      });

      return { user: { id: user.id, username: user.username, role: user.role } };
    }
  );

  fastify.post<{ Body: z.infer<typeof loginBodySchema> }>(
    "/login",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            username: { type: "string" },
            password: { type: "string" },
          },
          required: ["username", "password"],
        },
      },
    },
    async (request, reply) => {
      const { username, password } = request.body;
      const user = await authenticateUser(username, password);

      if (!user) {
        return reply.code(401).send({ error: "Unauthorized", message: "Invalid credentials" });
      }

      const { accessToken, refreshToken } = createSession(user);
      const accessMaxAge = 24 * 60 * 60;

      reply.setCookie("access_token", accessToken, {
        httpOnly: true,
        secure: request.protocol === "https",
        sameSite: "lax",
        maxAge: accessMaxAge,
        path: "/",
      });

      reply.setCookie("refresh_token", refreshToken, {
        httpOnly: true,
        secure: request.protocol === "https",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      });

      return { user: { id: user.id, username: user.username, role: user.role } };
    }
  );

  fastify.post<{ Body: z.infer<typeof refreshBodySchema> }>(
    "/refresh",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            refreshToken: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const refreshToken = request.body.refreshToken || request.cookies?.refresh_token;

      if (!refreshToken) {
        return reply.code(401).send({ error: "Unauthorized", message: "No refresh token provided" });
      }

      const tokens = refreshSession(refreshToken);
      if (!tokens) {
        return reply.code(401).send({ error: "Unauthorized", message: "Invalid or expired refresh token" });
      }

      const accessMaxAge = 24 * 60 * 60;
      reply.setCookie("access_token", tokens.accessToken, {
        httpOnly: true,
        secure: request.protocol === "https",
        sameSite: "lax",
        maxAge: accessMaxAge,
        path: "/",
      });

      reply.setCookie("refresh_token", tokens.refreshToken, {
        httpOnly: true,
        secure: request.protocol === "https",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      });

      return { ok: true };
    }
  );

  fastify.post("/logout", async (request, reply) => {
    const refreshToken = request.cookies?.refresh_token;
    if (refreshToken) {
      revokeSession(refreshToken);
    }

    reply.clearCookie("access_token", { path: "/" });
    reply.clearCookie("refresh_token", { path: "/" });

    return { ok: true };
  });

  fastify.get("/me", async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const user = configStore.getUserById(request.user.sub);
    if (!user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    return { user: { id: user.id, username: user.username, role: user.role } };
  });
};
