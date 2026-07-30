import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { verifyRequest, parseEvent, SeenMessages, isValidSecret } from "functions/twitch/eventsub";
import { twitchEvents } from "functions/twitch/events";
import { systemLog } from "utils/systemLog";

/**
 * Twitch EventSub callback.
 *
 * SECURITY: this route is deliberately outside the authenticated route group.
 * Twitch cannot present a session, so the HMAC signature is the only thing
 * authenticating a caller — which is why the raw body is preserved byte for
 * byte (re-serialising parsed JSON changes whitespace and breaks the digest)
 * and why an unverified request is dropped before any parsing happens.
 */

const seen = new SeenMessages(1000);

function log(level: "info" | "warn" | "error", msg: string) {
  systemLog.add(level, msg, "twitch");
}

export const twitchRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Keep the exact bytes Twitch sent so the signature can be recomputed.
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body: string, done) => {
      done(null, { raw: body });
    }
  );

  fastify.post("/eventsub", async (request, reply) => {
    const secret = process.env.TWITCH_EVENTSUB_SECRET ?? "";
    if (!isValidSecret(secret)) {
      log("error", "TWITCH_EVENTSUB_SECRET is unset or invalid; rejecting EventSub callback");
      return reply.code(503).send({ error: "Twitch integration is not configured" });
    }

    const rawBody = (request.body as { raw?: string })?.raw ?? "";
    const verdict = verifyRequest({ headers: request.headers as any, rawBody, secret });

    if (!verdict.ok) {
      // Log the reason for operators, but tell the caller nothing.
      log("warn", `rejected EventSub callback: ${verdict.reason}`);
      return reply.code(403).send();
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return reply.code(400).send();
    }

    // Twitch retries on any non-2xx, so the same message can legitimately
    // arrive more than once. Acknowledge repeats without acting on them.
    if (!seen.add(verdict.messageId)) {
      return reply.code(204).send();
    }

    if (verdict.messageType === "webhook_callback_verification") {
      const challenge = String(body?.challenge ?? "");
      log("info", `EventSub callback verified for ${body?.subscription?.type ?? "unknown type"}`);
      // Must be the bare challenge as text/plain — not JSON-wrapped.
      return reply.code(200).type("text/plain").send(challenge);
    }

    if (verdict.messageType === "revocation") {
      log(
        "warn",
        `Twitch revoked subscription ${body?.subscription?.type}: ${body?.subscription?.status}`
      );
      return reply.code(204).send();
    }

    const parsed = parseEvent(body);
    if (!parsed.broadcasterUserId || !parsed.subscriptionType) {
      return reply.code(204).send();
    }

    twitchEvents.publish({
      subscriptionType: parsed.subscriptionType,
      broadcasterUserId: parsed.broadcasterUserId,
      event: parsed.event,
    });

    // Acknowledge promptly; posting to Discord happens off this request.
    return reply.code(204).send();
  });
};
