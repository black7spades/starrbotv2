import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  LoginSchema,
  CreateUserSchema,
  UpdateProfileSchema,
  ChangePasswordSchema,
} from "config/schema";
import {
  authenticateUser,
  createSession,
  refreshSession,
  revokeSession,
  createUser,
  changeOwnPassword,
  updateUser,
} from "auth/index";
import { configStore } from "config/index";

const loginBodySchema = LoginSchema;
const refreshBodySchema = z.object({
  refreshToken: z.string().optional(),
});
const setupBodySchema = CreateUserSchema;

/** Max size of an uploaded avatar once base64-encoded (~256 KB of image). */
const MAX_AVATAR_BYTES = 350_000;

/**
 * Avatars are stored inline, so the value has to be constrained: only images,
 * only data: or https:, and small enough that users.json stays a sane size.
 * Returns an error message, or null when acceptable.
 */
function validateAvatar(value: string): string | null {
  if (value.startsWith("data:")) {
    if (!/^data:image\/(png|jpeg|webp|gif);base64,/.test(value)) {
      return "Avatar must be a PNG, JPEG, WebP or GIF image";
    }
    if (value.length > MAX_AVATAR_BYTES) return "Avatar image is too large (max ~256 KB)";
    return null;
  }
  if (value.startsWith("https://")) return null;
  return "Avatar must be an uploaded image or an https URL";
}

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
      config: {
        // Tighter than the global 100/min: this is the password-guessing
        // surface, and the global limit allows ~144k attempts per day per IP.
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
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

    return {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        avatarUrl: user.avatarUrl ?? null,
      },
    };
  });

  // Update your own profile. Deliberately narrower than the admin user route:
  // role is not accepted here, so this can never be used to self-escalate.
  fastify.patch<{ Body: { username?: string; avatarUrl?: string | null } }>(
    "/me",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            username: { type: "string", minLength: 3, maxLength: 32 },
            avatarUrl: { type: ["string", "null"] },
          },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) return reply.code(401).send({ error: "Unauthorized" });

      const parsed = UpdateProfileSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Invalid profile",
          details: parsed.error.flatten(),
        });
      }

      const { username, avatarUrl } = parsed.data;

      if (avatarUrl) {
        const problem = validateAvatar(avatarUrl);
        if (problem) return reply.code(400).send({ error: "Bad Request", message: problem });
      }

      if (username && username !== request.user.username) {
        const taken = configStore.getUserByUsername(username);
        if (taken && taken.id !== request.user.sub) {
          return reply.code(409).send({ error: "Conflict", message: "Username already taken" });
        }
      }

      const updated = await updateUser(request.user.sub, { username, avatarUrl });
      if (!updated) return reply.code(404).send({ error: "Not Found", message: "User not found" });

      return {
        user: {
          id: updated.id,
          username: updated.username,
          role: updated.role,
          avatarUrl: updated.avatarUrl ?? null,
        },
      };
    }
  );

  fastify.post<{ Body: { currentPassword: string; newPassword: string } }>(
    "/me/password",
    {
      config: {
        // Same reasoning as login: this endpoint verifies a password, so it is
        // a guessing surface.
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
      schema: {
        body: {
          type: "object",
          properties: {
            currentPassword: { type: "string", minLength: 1 },
            newPassword: { type: "string", minLength: 8, maxLength: 128 },
          },
          required: ["currentPassword", "newPassword"],
        },
      },
    },
    async (request, reply) => {
      if (!request.user) return reply.code(401).send({ error: "Unauthorized" });

      const parsed = ChangePasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Bad Request", message: "Password must be at least 8 characters" });
      }

      const ok = await changeOwnPassword(
        request.user.sub,
        parsed.data.currentPassword,
        parsed.data.newPassword
      );
      if (!ok) {
        return reply
          .code(400)
          .send({ error: "Bad Request", message: "Current password is incorrect" });
      }

      // changeOwnPassword revokes every refresh token, so clear this session's
      // cookies too and make the client sign in again.
      reply.clearCookie("access_token", { path: "/" });
      reply.clearCookie("refresh_token", { path: "/" });

      return { ok: true, reauth: true };
    }
  );
};
