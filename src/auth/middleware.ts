import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyAccessToken, extractTokenFromHeader, extractTokenFromCookie } from "./jwt";
import type { JWTPayload } from "config/schema";

declare module "fastify" {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  let token = extractTokenFromHeader(request.headers.authorization);
  if (!token) {
    token = extractTokenFromCookie(request.cookies as Record<string, string>, "access_token");
  }

  if (!token) {
    return reply.code(401).send({ error: "Unauthorized", message: "No token provided" });
  }

  const payload = verifyAccessToken(token);
  if (!payload) {
    return reply.code(401).send({ error: "Unauthorized", message: "Invalid or expired token" });
  }

  request.user = payload;
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await authMiddleware(request, reply);
  if (reply.sent) return;

  if (request.user?.role !== "admin") {
    return reply.code(403).send({ error: "Forbidden", message: "Admin role required" });
  }
}

export async function optionalAuth(request: FastifyRequest): Promise<void> {
  let token = extractTokenFromHeader(request.headers.authorization);
  if (!token) {
    token = extractTokenFromCookie(request.cookies as Record<string, string>, "access_token");
  }

  if (token) {
    const payload = verifyAccessToken(token);
    if (payload) request.user = payload;
  }
}
