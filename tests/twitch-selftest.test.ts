import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";

import { createServer } from "api/server";
import { parseEvent, signPayload, hmacMessage, HEADER, TEST_STATUS } from "functions/twitch/eventsub";
import { twitchEvents, type TwitchNotification } from "functions/twitch/events";

/**
 * The self-test marker decides whether an announcement is labelled a test and
 * whether it pings the notification role. Getting it wrong in either direction
 * is bad: a real go-live labelled "test" is ignored, and a test that pings the
 * role trains people to distrust the alerts.
 */

const SECRET = "self-test-secret-value";
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

describe("test marker", () => {
  it("flags a payload carrying the self-test status", () => {
    const parsed = parseEvent({
      subscription: { type: "stream.online", status: TEST_STATUS },
      event: { broadcaster_user_id: "1", broadcaster_user_login: "someone" },
    });
    expect(parsed.isTest).toBe(true);
  });

  it("does NOT flag a real Twitch notification", () => {
    for (const status of ["enabled", "webhook_callback_verification_pending", "authorization_revoked"]) {
      const parsed = parseEvent({
        subscription: { type: "stream.online", status },
        event: { broadcaster_user_id: "1", broadcaster_user_login: "someone" },
      });
      expect(parsed.isTest, status).toBe(false);
    }
  });

  it("does not flag a payload with no status at all", () => {
    const parsed = parseEvent({
      subscription: { type: "stream.online" },
      event: { broadcaster_user_id: "1", broadcaster_user_login: "someone" },
    });
    expect(parsed.isTest).toBe(false);
  });

  it("uses a marker Twitch would never send", () => {
    // Twitch statuses are lowercase words joined by underscores and documented;
    // a vendor-prefixed value cannot collide with one.
    expect(TEST_STATUS).toContain("starrbot");
  });
});

describe("test events travel the real verification path", () => {
  function post(body: string, signWith = SECRET) {
    const id = `st-${Math.random()}`;
    const ts = new Date().toISOString();
    return server.inject({
      method: "POST",
      url: "/api/twitch/eventsub",
      headers: {
        "content-type": "application/json",
        [HEADER.id]: id,
        [HEADER.timestamp]: ts,
        [HEADER.signature]: signPayload(signWith, hmacMessage(id, ts, body)),
        [HEADER.type]: "notification",
      },
      payload: body,
    });
  }

  const testBody = JSON.stringify({
    subscription: { type: "stream.online", status: TEST_STATUS },
    event: { broadcaster_user_id: "555", broadcaster_user_login: "teststreamer" },
  });

  it("delivers a signed test event and marks it", async () => {
    const received: TwitchNotification[] = [];
    const off = twitchEvents.onBroadcaster("555", (n) => received.push(n));
    try {
      const res = await post(testBody);
      expect(res.statusCode).toBe(204);
      expect(received).toHaveLength(1);
      expect(received[0].isTest).toBe(true);
    } finally {
      off();
    }
  });

  it("rejects an unsigned test event — the marker grants no bypass", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/twitch/eventsub",
      headers: { "content-type": "application/json" },
      payload: testBody,
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects a test event signed with the wrong secret", async () => {
    const res = await post(testBody, "a-different-secret-entirely");
    expect(res.statusCode).toBe(403);
  });
});

describe("diagnostics endpoint", () => {
  it("requires authentication", async () => {
    const res = await server.inject({ method: "GET", url: "/api/functions/twitch/diagnostics" });
    expect(res.statusCode).toBe(401);
  });

  it("self-test requires authentication", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/functions/twitch/self-test",
      payload: { channel: "someone" },
    });
    expect(res.statusCode).toBe(401);
  });
});
