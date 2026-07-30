import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";

import { createServer } from "api/server";
import { signPayload, hmacMessage, HEADER } from "functions/twitch/eventsub";
import { twitchEvents, type TwitchNotification } from "functions/twitch/events";

/**
 * Exercises the EventSub callback through the real Fastify stack.
 *
 * The raw-body handling is the part most likely to break silently: Fastify
 * parses JSON by default, and re-serialising it changes the bytes enough to
 * invalidate the HMAC. These tests would catch that.
 */

const SECRET = "test-eventsub-secret-value";
let server: FastifyInstance;

beforeAll(async () => {
  process.env.TWITCH_EVENTSUB_SECRET = SECRET;
  server = await createServer();
  await server.ready();
});

afterAll(async () => {
  await server?.close();
  delete process.env.TWITCH_EVENTSUB_SECRET;
});

function post(body: string, over: { id?: string; timestamp?: string; type?: string; signature?: string } = {}) {
  const id = over.id ?? `msg-${Math.random()}`;
  const timestamp = over.timestamp ?? new Date().toISOString();
  const type = over.type ?? "notification";
  const signature = over.signature ?? signPayload(SECRET, hmacMessage(id, timestamp, body));

  return server.inject({
    method: "POST",
    url: "/api/twitch/eventsub",
    headers: {
      "content-type": "application/json",
      [HEADER.id]: id,
      [HEADER.timestamp]: timestamp,
      [HEADER.signature]: signature,
      [HEADER.type]: type,
    },
    payload: body,
  });
}

const ONLINE_BODY = JSON.stringify({
  subscription: { type: "stream.online", status: "enabled" },
  event: {
    broadcaster_user_id: "999",
    broadcaster_user_login: "somestreamer",
    broadcaster_user_name: "SomeStreamer",
    started_at: "2026-07-30T12:00:00Z",
  },
});

describe("the callback is reachable without a session", () => {
  it("does not 401 — Twitch cannot authenticate", async () => {
    const res = await post(ONLINE_BODY);
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).toBe(204);
  });
});

describe("signature enforcement", () => {
  it("rejects an unsigned request with 403", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/twitch/eventsub",
      headers: { "content-type": "application/json" },
      payload: ONLINE_BODY,
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects a bad signature with 403", async () => {
    const res = await post(ONLINE_BODY, { signature: "sha256=notarealsignature" });
    expect(res.statusCode).toBe(403);
  });

  it("rejects a body altered after signing", async () => {
    const id = "tamper-1";
    const timestamp = new Date().toISOString();
    const signature = signPayload(SECRET, hmacMessage(id, timestamp, ONLINE_BODY));
    const res = await server.inject({
      method: "POST",
      url: "/api/twitch/eventsub",
      headers: {
        "content-type": "application/json",
        [HEADER.id]: id,
        [HEADER.timestamp]: timestamp,
        [HEADER.signature]: signature,
        [HEADER.type]: "notification",
      },
      payload: JSON.stringify({ subscription: { type: "stream.online" }, tampered: true }),
    });
    expect(res.statusCode).toBe(403);
  });

  it("says nothing useful in the rejection body", async () => {
    const res = await post(ONLINE_BODY, { signature: "sha256=nope" });
    expect(res.body).toBe("");
  });
});

describe("callback verification handshake", () => {
  it("echoes the challenge as bare text/plain", async () => {
    const challenge = "challenge-token-abc123";
    const body = JSON.stringify({
      challenge,
      subscription: { type: "stream.online", status: "webhook_callback_verification_pending" },
    });
    const res = await post(body, { type: "webhook_callback_verification" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    // Must be the raw challenge — JSON-wrapping it fails Twitch's check.
    expect(res.body).toBe(challenge);
  });

  it("will not echo a challenge that is not correctly signed", async () => {
    const body = JSON.stringify({ challenge: "attacker-challenge" });
    const res = await post(body, { type: "webhook_callback_verification", signature: "sha256=bad" });
    expect(res.statusCode).toBe(403);
    expect(res.body).not.toContain("attacker-challenge");
  });
});

describe("event dispatch", () => {
  let received: TwitchNotification[] = [];
  let off: (() => void) | null = null;

  beforeEach(() => {
    received = [];
    off?.();
    off = twitchEvents.onBroadcaster("999", (n) => received.push(n));
  });

  afterAll(() => off?.());

  it("publishes a stream.online event to the matching broadcaster", async () => {
    const res = await post(ONLINE_BODY, { id: `online-${Date.now()}` });
    expect(res.statusCode).toBe(204);
    expect(received).toHaveLength(1);
    expect(received[0].subscriptionType).toBe("stream.online");
    expect(received[0].event.broadcasterUserLogin).toBe("somestreamer");
  });

  it("does not deliver events for a different broadcaster", async () => {
    const other = JSON.stringify({
      subscription: { type: "stream.online" },
      event: { broadcaster_user_id: "111", broadcaster_user_login: "someoneelse" },
    });
    await post(other, { id: `other-${Date.now()}` });
    expect(received).toHaveLength(0);
  });

  it("ignores a redelivery of the same message id", async () => {
    const id = `dupe-${Date.now()}`;
    const first = await post(ONLINE_BODY, { id });
    const second = await post(ONLINE_BODY, { id });

    expect(first.statusCode).toBe(204);
    expect(second.statusCode).toBe(204);
    // Twitch retries on non-2xx, so a repeat must not announce twice.
    expect(received).toHaveLength(1);
  });

  it("acknowledges a revocation without dispatching it", async () => {
    const body = JSON.stringify({
      subscription: { type: "stream.online", status: "authorization_revoked" },
    });
    const res = await post(body, { type: "revocation", id: `rev-${Date.now()}` });
    expect(res.statusCode).toBe(204);
    expect(received).toHaveLength(0);
  });
});

describe("raw body preservation", () => {
  it("verifies bodies whose exact bytes would change under re-serialisation", async () => {
    // Odd spacing and key order: a parse/re-stringify round trip would alter
    // these bytes and break the digest.
    const body = '{"subscription" :{"type":"stream.online"},  "event":{"broadcaster_user_id":"999","broadcaster_user_login":"somestreamer"}}';
    const res = await post(body, { id: `raw-${Date.now()}` });
    expect(res.statusCode).toBe(204);
  });

  it("returns 400 for a signed body that is not valid JSON", async () => {
    const res = await post("this is not json", { id: `bad-${Date.now()}` });
    expect(res.statusCode).toBe(400);
  });
});

describe("other routes are unaffected by the raw-body parser", () => {
  it("still parses JSON normally on the auth routes", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "nobody", password: "wrong-password" },
    });
    // 401 (or 429 under the limiter) both prove the body parsed; a 400 would
    // mean the Twitch parser leaked out of its plugin scope.
    expect([401, 429]).toContain(res.statusCode);
  });
});
