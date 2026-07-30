import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { CreateUserSchema, UpdateUserSchema } from "config/schema";
import { createUser, updateUser, deleteUser, getUserById, getAllUsers } from "auth/index";
import { requireAdmin } from "auth/middleware";

export const userRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook("onRequest", requireAdmin);

  fastify.get("/", async () => {
    return getAllUsers();
  });

  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const user = getUserById(request.params.id);
    if (!user) {
      return reply.code(404).send({ error: "Not Found", message: "User not found" });
    }
    return user;
  });

  fastify.post<{ Body: z.infer<typeof CreateUserSchema> }>(
    "/",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            username: { type: "string", minLength: 3, maxLength: 32 },
            password: { type: "string", minLength: 8, maxLength: 128 },
            role: { type: "string", enum: ["admin", "viewer"] },
          },
          required: ["username", "password"],
        },
      },
    },
    async (request, reply) => {
      try {
        const user = await createUser(request.body);
        return reply.code(201).send(user);
      } catch (err: any) {
        if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
          return reply.code(409).send({ error: "Conflict", message: "Username already exists" });
        }
        throw err;
      }
    }
  );

  fastify.patch<{ Params: { id: string }; Body: z.infer<typeof UpdateUserSchema> }>(
    "/:id",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            username: { type: "string", minLength: 3, maxLength: 32 },
            password: { type: "string", minLength: 8, maxLength: 128 },
            role: { type: "string", enum: ["admin", "viewer"] },
},
        },
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
    async (request, reply) => {
      const user = await updateUser(request.params.id, request.body);
      if (!user) {
        return reply.code(404).send({ error: "Not Found", message: "User not found" });
      }
      return user;
    }
  );

  fastify.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    if (request.user?.sub === request.params.id) {
      return reply.code(400).send({ error: "Bad Request", message: "Cannot delete yourself" });
    }

    const deleted = deleteUser(request.params.id);
    if (!deleted) {
      return reply.code(404).send({ error: "Not Found", message: "User not found" });
    }
    return { ok: true };
  });
};
