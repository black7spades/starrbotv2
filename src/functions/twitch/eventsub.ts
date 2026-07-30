import { createHmac, timingSafeEqual } from "crypto";

/**
 * Twitch EventSub webhook protocol: signature verification and message parsing.
 *
 * This is the security boundary for the whole Twitch integration. The callback
 * URL has to be publicly reachable — Twitch cannot authenticate to us — so the
 * HMAC signature is the *only* thing separating a real Twitch event from
 * anyone on the internet POSTing a fake "stream is live" to your Discord.
 *
 * Deliberately free of Fastify and network code so every rule here is directly
 * testable.
 */

export const HEADER = {
  id: "twitch-eventsub-message-id",
  timestamp: "twitch-eventsub-message-timestamp",
  signature: "twitch-eventsub-message-signature",
  type: "twitch-eventsub-message-type",
  subscriptionType: "twitch-eventsub-subscription-type",
} as const;

export type MessageType = "webhook_callback_verification" | "notification" | "revocation";

/** Twitch rejects secrets outside this range, so we validate before subscribing. */
export const SECRET_MIN = 10;
export const SECRET_MAX = 100;

/** Messages older than this are refused, per Twitch's replay guidance. */
export const MAX_AGE_MS = 10 * 60 * 1000;

export interface VerifyInput {
  headers: Record<string, string | string[] | undefined>;
  /** The exact bytes Twitch sent. Re-serialising parsed JSON will not match. */
  rawBody: string;
  secret: string;
  now?: number;
}

export type VerifyResult =
  | { ok: true; messageId: string; messageType: MessageType }
  | { ok: false; reason: string };

function header(headers: VerifyInput["headers"], name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export function isValidSecret(secret: string): boolean {
  if (secret.length < SECRET_MIN || secret.length > SECRET_MAX) return false;
  // Twitch requires ASCII.
  return /^[\x20-\x7e]+$/.test(secret);
}

/**
 * The signed payload is the message id, the timestamp, and the raw body
 * concatenated with no separator — in that order.
 */
export function hmacMessage(messageId: string, timestamp: string, rawBody: string): string {
  return `${messageId}${timestamp}${rawBody}`;
}

export function signPayload(secret: string, message: string): string {
  return `sha256=${createHmac("sha256", secret).update(message).digest("hex")}`;
}

/** Constant-time compare that tolerates length mismatches without throwing. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Verifies an inbound EventSub request.
 *
 * Every failure returns a reason rather than throwing, so the caller can log
 * why a request was rejected while still answering with a bare 403.
 */
export function verifyRequest(input: VerifyInput): VerifyResult {
  const { headers, rawBody, secret } = input;
  const now = input.now ?? Date.now();

  if (!isValidSecret(secret)) {
    return { ok: false, reason: "server secret is missing or invalid" };
  }

  const messageId = header(headers, HEADER.id);
  const timestamp = header(headers, HEADER.timestamp);
  const signature = header(headers, HEADER.signature);
  const messageType = header(headers, HEADER.type);

  if (!messageId || !timestamp || !signature || !messageType) {
    return { ok: false, reason: "missing EventSub headers" };
  }

  const sentAt = Date.parse(timestamp);
  if (Number.isNaN(sentAt)) return { ok: false, reason: "unparseable timestamp" };

  // Reject both stale messages and ones from the future — a clock-skewed or
  // forged timestamp should not extend the replay window.
  const age = now - sentAt;
  if (age > MAX_AGE_MS) return { ok: false, reason: "message too old" };
  if (age < -MAX_AGE_MS) return { ok: false, reason: "message timestamp is in the future" };

  const expected = signPayload(secret, hmacMessage(messageId, timestamp, rawBody));
  if (!safeEqual(expected, signature)) {
    return { ok: false, reason: "signature mismatch" };
  }

  if (
    messageType !== "webhook_callback_verification" &&
    messageType !== "notification" &&
    messageType !== "revocation"
  ) {
    return { ok: false, reason: `unknown message type: ${messageType}` };
  }

  return { ok: true, messageId, messageType };
}

/**
 * Remembers recently seen message ids so a redelivery is not posted twice.
 *
 * Twitch retries on any non-2xx and can legitimately send the same message
 * more than once, so at-least-once delivery has to be made idempotent here.
 */
export class SeenMessages {
  private readonly ids = new Set<string>();
  private readonly order: string[] = [];

  constructor(private readonly limit = 1000) {}

  /** Returns true the first time an id is seen, false for a repeat. */
  add(id: string): boolean {
    if (this.ids.has(id)) return false;
    this.ids.add(id);
    this.order.push(id);
    if (this.order.length > this.limit) {
      const evicted = this.order.shift();
      if (evicted) this.ids.delete(evicted);
    }
    return true;
  }

  get size(): number {
    return this.ids.size;
  }
}

export interface StreamOnlineEvent {
  broadcasterUserId: string;
  broadcasterUserLogin: string;
  broadcasterUserName: string;
  startedAt?: string;
  type?: string;
}

export interface ChannelUpdateEvent {
  broadcasterUserId: string;
  broadcasterUserLogin: string;
  broadcasterUserName: string;
  title?: string;
  categoryName?: string;
}

/** Normalises Twitch's snake_case event payload into our camelCase shape. */
export function parseEvent(body: any): {
  subscriptionType?: string;
  broadcasterUserId?: string;
  event: StreamOnlineEvent & ChannelUpdateEvent;
} {
  const e = body?.event ?? {};
  return {
    subscriptionType: body?.subscription?.type,
    broadcasterUserId: e.broadcaster_user_id,
    event: {
      broadcasterUserId: e.broadcaster_user_id,
      broadcasterUserLogin: e.broadcaster_user_login,
      broadcasterUserName: e.broadcaster_user_name ?? e.broadcaster_user_login,
      startedAt: e.started_at,
      type: e.type,
      title: e.title,
      categoryName: e.category_name,
    },
  };
}
