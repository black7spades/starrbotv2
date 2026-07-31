import { describe, it, expect } from "vitest";
import {
  verifyRequest,
  signPayload,
  hmacMessage,
  isValidSecret,
  parseEvent,
  SeenMessages,
  HEADER,
  MAX_AGE_MS,
} from "functions/twitch/eventsub";

const SECRET = "a-sufficiently-long-secret";
const NOW = Date.parse("2026-07-30T12:00:00.000Z");

function signedRequest(over: {
  body?: string;
  secret?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  signature?: string;
} = {}) {
  const body = over.body ?? JSON.stringify({ subscription: { type: "stream.online" } });
  const id = over.id ?? "msg-1";
  const timestamp = over.timestamp ?? new Date(NOW).toISOString();
  const type = over.type ?? "notification";
  const signature = over.signature ?? signPayload(over.secret ?? SECRET, hmacMessage(id, timestamp, body));

  return {
    headers: {
      [HEADER.id]: id,
      [HEADER.timestamp]: timestamp,
      [HEADER.signature]: signature,
      [HEADER.type]: type,
    },
    rawBody: body,
    secret: SECRET,
    now: NOW,
  };
}

describe("isValidSecret", () => {
  it("accepts a normal secret", () => {
    expect(isValidSecret(SECRET)).toBe(true);
  });

  it("rejects secrets outside Twitch's 10-100 character range", () => {
    expect(isValidSecret("short")).toBe(false);
    expect(isValidSecret("x".repeat(101))).toBe(false);
    expect(isValidSecret("x".repeat(100))).toBe(true);
    expect(isValidSecret("x".repeat(10))).toBe(true);
  });

  it("rejects non-ASCII secrets, which Twitch will not accept", () => {
    expect(isValidSecret("sécret-with-accents")).toBe(false);
    expect(isValidSecret("secret-with-emoji-🎮")).toBe(false);
  });

  it("rejects an empty secret", () => {
    expect(isValidSecret("")).toBe(false);
  });
});

describe("verifyRequest — accepting genuine messages", () => {
  it("accepts a correctly signed notification", () => {
    const res = verifyRequest(signedRequest());
    expect(res).toEqual({ ok: true, messageId: "msg-1", messageType: "notification" });
  });

  it("accepts a verification challenge", () => {
    const res = verifyRequest(signedRequest({ type: "webhook_callback_verification" }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.messageType).toBe("webhook_callback_verification");
  });

  it("accepts a revocation", () => {
    const res = verifyRequest(signedRequest({ type: "revocation" }));
    expect(res.ok).toBe(true);
  });

  it("signs over id + timestamp + raw body concatenated in that order", () => {
    // Pin the construction: a different order would still be a valid HMAC but
    // would never match what Twitch sends.
    expect(hmacMessage("abc", "123", "{}")).toBe("abc123{}");
  });
});

describe("verifyRequest — rejecting forgeries", () => {
  it("rejects a wrong signature", () => {
    const res = verifyRequest(signedRequest({ signature: "sha256=deadbeef" }));
    expect(res).toEqual({ ok: false, reason: "signature mismatch" });
  });

  it("rejects a signature made with a different secret", () => {
    const res = verifyRequest(signedRequest({ secret: "an-attackers-own-secret" }));
    expect(res.ok).toBe(false);
  });

  it("rejects a tampered body even when the signature is otherwise well-formed", () => {
    const req = signedRequest();
    req.rawBody = JSON.stringify({ subscription: { type: "stream.online" }, evil: true });
    expect(verifyRequest(req).ok).toBe(false);
  });

  it("rejects a swapped message id", () => {
    const req = signedRequest();
    req.headers[HEADER.id] = "different-id";
    expect(verifyRequest(req).ok).toBe(false);
  });

  it("rejects when any required header is missing", () => {
    for (const missing of [HEADER.id, HEADER.timestamp, HEADER.signature, HEADER.type]) {
      const req = signedRequest();
      delete (req.headers as any)[missing];
      const res = verifyRequest(req);
      expect(res.ok, `missing ${missing}`).toBe(false);
      if (!res.ok) expect(res.reason).toBe("missing EventSub headers");
    }
  });

  it("rejects an unknown message type", () => {
    const res = verifyRequest(signedRequest({ type: "something_else" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("unknown message type");
  });

  it("refuses to verify anything when the server secret is invalid", () => {
    const req = signedRequest();
    req.secret = "tooshort";
    const res = verifyRequest(req);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("secret");
  });
});

describe("verifyRequest — replay protection", () => {
  it("rejects a message older than the 10 minute window", () => {
    const old = new Date(NOW - MAX_AGE_MS - 1000).toISOString();
    const res = verifyRequest(signedRequest({ timestamp: old }));
    expect(res).toEqual({ ok: false, reason: "message too old" });
  });

  it("accepts a message just inside the window", () => {
    const recent = new Date(NOW - MAX_AGE_MS + 5000).toISOString();
    expect(verifyRequest(signedRequest({ timestamp: recent })).ok).toBe(true);
  });

  it("rejects a timestamp far in the future", () => {
    const future = new Date(NOW + MAX_AGE_MS + 1000).toISOString();
    const res = verifyRequest(signedRequest({ timestamp: future }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("future");
  });

  it("rejects an unparseable timestamp", () => {
    const res = verifyRequest(signedRequest({ timestamp: "not a date" }));
    expect(res).toEqual({ ok: false, reason: "unparseable timestamp" });
  });
});

describe("SeenMessages", () => {
  it("reports the first sighting and suppresses repeats", () => {
    const seen = new SeenMessages(10);
    expect(seen.add("a")).toBe(true);
    expect(seen.add("a")).toBe(false);
    expect(seen.add("b")).toBe(true);
  });

  it("evicts oldest entries beyond the limit", () => {
    const seen = new SeenMessages(3);
    seen.add("1");
    seen.add("2");
    seen.add("3");
    seen.add("4"); // evicts "1"
    expect(seen.size).toBe(3);
    // "1" has been forgotten, so it reads as new again.
    expect(seen.add("1")).toBe(true);
    // "4" is still remembered.
    expect(seen.add("4")).toBe(false);
  });
});

describe("parseEvent", () => {
  it("normalises a stream.online payload", () => {
    const parsed = parseEvent({
      subscription: { type: "stream.online" },
      event: {
        broadcaster_user_id: "12345",
        broadcaster_user_login: "somestreamer",
        broadcaster_user_name: "SomeStreamer",
        started_at: "2026-07-30T11:59:00Z",
        type: "live",
      },
    });
    expect(parsed.subscriptionType).toBe("stream.online");
    expect(parsed.broadcasterUserId).toBe("12345");
    expect(parsed.event.broadcasterUserName).toBe("SomeStreamer");
    expect(parsed.event.startedAt).toBe("2026-07-30T11:59:00Z");
  });

  it("normalises a channel.update payload", () => {
    const parsed = parseEvent({
      subscription: { type: "channel.update" },
      event: {
        broadcaster_user_id: "12345",
        broadcaster_user_login: "somestreamer",
        title: "Speedrunning something",
        category_name: "Celeste",
      },
    });
    expect(parsed.event.title).toBe("Speedrunning something");
    expect(parsed.event.categoryName).toBe("Celeste");
  });

  it("falls back to the login when there is no display name", () => {
    const parsed = parseEvent({
      subscription: { type: "stream.online" },
      event: { broadcaster_user_id: "1", broadcaster_user_login: "lowercase" },
    });
    expect(parsed.event.broadcasterUserName).toBe("lowercase");
  });

  it("does not throw on an empty or malformed body", () => {
    expect(() => parseEvent({})).not.toThrow();
    expect(() => parseEvent(null)).not.toThrow();
    expect(parseEvent({}).broadcasterUserId).toBeUndefined();
  });
});

describe("fingerprintSecret", () => {
  it("is stable for the same secret and differs for another", async () => {
    const { fingerprintSecret } = await import("functions/twitch/api");
    expect(fingerprintSecret("secret-one")).toBe(fingerprintSecret("secret-one"));
    expect(fingerprintSecret("secret-one")).not.toBe(fingerprintSecret("secret-two"));
  });

  it("does not leak the secret", async () => {
    const { fingerprintSecret } = await import("functions/twitch/api");
    const secret = "a-very-recognisable-secret";
    expect(fingerprintSecret(secret)).not.toContain(secret);
    expect(fingerprintSecret(secret)).toMatch(/^[0-9a-f]{16}$/);
  });
});
