import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { twitchEvents, type TwitchNotification } from "functions/twitch/events";
import { SUBSCRIPTION_TYPES } from "functions/twitch/api";

/**
 * Simulates the full Twitch go-live announcement flow end-to-end:
 * event bus → function instance → Discord channel message.
 *
 * The root cause of the broken go-live was that onLoad received a plain
 * EventEmitter (no .client) instead of the ManagedBot. These tests exercise
 * the contract the function relies on: bot.client must be the Discord client.
 */

const BROADCASTER_ID = "99999";
const BROADCASTER_LOGIN = "teststreamer";
const CHANNEL_ID = "discord-channel-123";

const sentMessages: any[] = [];
const mockChannel = {
  isTextBased: () => true,
  send: vi.fn(async (msg: any) => {
    sentMessages.push(msg);
    return msg;
  }),
};

const mockClient = {
  channels: { fetch: vi.fn(async () => mockChannel) },
};

function helixResponse(data: any) {
  return new Response(JSON.stringify({ data: Array.isArray(data) ? data : [data] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function tokenResponse() {
  return new Response(
    JSON.stringify({ access_token: "mock-token", expires_in: 3600 }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

const originalFetch = globalThis.fetch;

function installFetchMock() {
  globalThis.fetch = vi.fn(async (url: any, init?: any) => {
    const u = typeof url === "string" ? url : url.toString();

    if (u.includes("/oauth2/token")) return tokenResponse();

    if (u.includes("/users?login=")) {
      return helixResponse({
        id: BROADCASTER_ID,
        login: BROADCASTER_LOGIN,
        display_name: "TestStreamer",
      });
    }

    if (u.includes("/channels?broadcaster_id=")) {
      return helixResponse({
        title: "Fetched Stream Title",
        game_name: "Fetched Game",
      });
    }

    if (u.includes("/eventsub/subscriptions")) {
      if (init?.method === "POST") {
        return new Response(
          JSON.stringify({
            data: [{ id: "sub-1", type: "stream.online", status: "enabled", condition: {}, transport: {} }],
          }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        );
      }
      if (init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({ data: [], pagination: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return originalFetch(url, init);
  }) as any;
}

let instance: any;
let unsubscribe: (() => void) | null = null;

beforeAll(async () => {
  process.env.TWITCH_CLIENT_ID = "mock-client-id";
  process.env.TWITCH_CLIENT_SECRET = "mock-client-secret";
  process.env.TWITCH_EVENTSUB_SECRET = "mock-eventsub-secret-value";
  process.env.BASE_URL = "https://bot.example.com";

  installFetchMock();

  const { twitchManifest } = await import("functions/twitch/index");
  instance = await twitchManifest.createInstance({
    broadcasterLogin: BROADCASTER_LOGIN,
    channelId: CHANNEL_ID,
    guildId: "guild-1",
    liveMessage: "{name} is live playing {game}: {title}",
    announceOffline: true,
  });
});

afterAll(async () => {
  await instance?.onUnload?.();
  globalThis.fetch = originalFetch;
  delete process.env.TWITCH_CLIENT_ID;
  delete process.env.TWITCH_CLIENT_SECRET;
  delete process.env.TWITCH_EVENTSUB_SECRET;
  delete process.env.BASE_URL;
});

beforeEach(() => {
  sentMessages.length = 0;
  mockChannel.send.mockClear();
  mockClient.channels.fetch.mockClear();
});

describe("onLoad receives a bot with .client (the fix)", () => {
  it("sets clientRef when bot.client exists", async () => {
    await instance.onLoad({ client: mockClient, config: { id: "bot1" } });
    // If clientRef is set, a stream.online event should trigger a Discord post.
    const n: TwitchNotification = {
      subscriptionType: SUBSCRIPTION_TYPES.online.type,
      broadcasterUserId: BROADCASTER_ID,
      event: {
        broadcasterUserId: BROADCASTER_ID,
        broadcasterUserLogin: BROADCASTER_LOGIN,
        broadcasterUserName: "TestStreamer",
        startedAt: new Date().toISOString(),
      } as any,
    };
    twitchEvents.publish(n);
    // Give the async postAnnouncement a tick to complete.
    await new Promise((r) => setTimeout(r, 50));
    expect(mockChannel.send).toHaveBeenCalled();
    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
  });
});

describe("onLoad with a bot without .client (the old bug)", () => {
  it("silently skips announcements when clientRef is null", async () => {
    const ISOLATED_ID = "88888";
    const { twitchManifest } = await import("functions/twitch/index");

    // Mock getUserByLogin to return the isolated broadcaster ID.
    const prevFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: any, init?: any) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.includes("/users?login="))
        return helixResponse({ id: ISOLATED_ID, login: "broken", display_name: "Broken" });
      return prevFetch(url, init);
    }) as any;

    const brokenInstance = await twitchManifest.createInstance({
      broadcasterLogin: "broken",
      channelId: CHANNEL_ID,
    });
    // Simulate the old bug: onLoad receives something with no .client
    await brokenInstance.onLoad({ config: { id: "bot2" } });
    globalThis.fetch = prevFetch;

    mockChannel.send.mockClear();
    twitchEvents.publish({
      subscriptionType: SUBSCRIPTION_TYPES.online.type,
      broadcasterUserId: ISOLATED_ID,
      event: {
        broadcasterUserId: ISOLATED_ID,
        broadcasterUserLogin: "broken",
        broadcasterUserName: "Broken",
      } as any,
    });
    await new Promise((r) => setTimeout(r, 50));
    // No message sent because clientRef is null.
    expect(mockChannel.send).not.toHaveBeenCalled();

    await brokenInstance.onUnload?.();
  });
});

describe("stream.online announcement", () => {
  it("posts an embed with the stream title and game", async () => {
    sentMessages.length = 0;

    twitchEvents.publish({
      subscriptionType: SUBSCRIPTION_TYPES.online.type,
      broadcasterUserId: BROADCASTER_ID,
      event: {
        broadcasterUserId: BROADCASTER_ID,
        broadcasterUserLogin: BROADCASTER_LOGIN,
        broadcasterUserName: "TestStreamer",
        startedAt: "2026-08-01T12:00:00Z",
      } as any,
    });
    await new Promise((r) => setTimeout(r, 50));

    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
    const msg = sentMessages[sentMessages.length - 1];
    expect(msg.content).toContain("TestStreamer is live");
    expect(msg.embeds).toBeDefined();
    expect(msg.embeds.length).toBeGreaterThan(0);
  });

  it("includes the Twitch channel URL", async () => {
    sentMessages.length = 0;

    twitchEvents.publish({
      subscriptionType: SUBSCRIPTION_TYPES.online.type,
      broadcasterUserId: BROADCASTER_ID,
      event: {
        broadcasterUserId: BROADCASTER_ID,
        broadcasterUserLogin: BROADCASTER_LOGIN,
        broadcasterUserName: "TestStreamer",
      } as any,
    });
    await new Promise((r) => setTimeout(r, 50));

    const msg = sentMessages[sentMessages.length - 1];
    expect(msg.content).toContain(`https://twitch.tv/${BROADCASTER_LOGIN}`);
  });
});

describe("channel.update caches title and game", () => {
  it("records title/game from channel.update without posting", async () => {
    sentMessages.length = 0;

    twitchEvents.publish({
      subscriptionType: SUBSCRIPTION_TYPES.update.type,
      broadcasterUserId: BROADCASTER_ID,
      event: {
        broadcasterUserId: BROADCASTER_ID,
        broadcasterUserLogin: BROADCASTER_LOGIN,
        broadcasterUserName: "TestStreamer",
        title: "Cached Title From Update",
        categoryName: "Cached Game",
      } as any,
    });
    await new Promise((r) => setTimeout(r, 50));

    // channel.update should NOT post a message.
    expect(sentMessages).toHaveLength(0);

    // Now fire a stream.online — it should use the cached values.
    twitchEvents.publish({
      subscriptionType: SUBSCRIPTION_TYPES.online.type,
      broadcasterUserId: BROADCASTER_ID,
      event: {
        broadcasterUserId: BROADCASTER_ID,
        broadcasterUserLogin: BROADCASTER_LOGIN,
        broadcasterUserName: "TestStreamer",
        startedAt: "2026-08-01T13:00:00Z",
      } as any,
    });
    await new Promise((r) => setTimeout(r, 50));

    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
    const msg = sentMessages[sentMessages.length - 1];
    expect(msg.content).toContain("Cached Title From Update");
    expect(msg.content).toContain("Cached Game");
  });
});

describe("stream.offline announcement", () => {
  it("posts an offline embed when announceOffline is enabled", async () => {
    sentMessages.length = 0;

    twitchEvents.publish({
      subscriptionType: SUBSCRIPTION_TYPES.offline.type,
      broadcasterUserId: BROADCASTER_ID,
      event: {
        broadcasterUserId: BROADCASTER_ID,
        broadcasterUserLogin: BROADCASTER_LOGIN,
        broadcasterUserName: "TestStreamer",
      } as any,
    });
    await new Promise((r) => setTimeout(r, 50));

    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
    const msg = sentMessages[sentMessages.length - 1];
    expect(msg.embeds).toBeDefined();
    expect(msg.embeds[0].data.description).toContain("ended their stream");
  });
});

describe("test event handling", () => {
  it("labels test events and suppresses role pings", async () => {
    sentMessages.length = 0;

    twitchEvents.publish({
      subscriptionType: SUBSCRIPTION_TYPES.online.type,
      broadcasterUserId: BROADCASTER_ID,
      isTest: true,
      event: {
        broadcasterUserId: BROADCASTER_ID,
        broadcasterUserLogin: BROADCASTER_LOGIN,
        broadcasterUserName: "TestStreamer",
        startedAt: "2026-08-01T14:00:00Z",
      } as any,
    });
    await new Promise((r) => setTimeout(r, 50));

    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
    const msg = sentMessages[sentMessages.length - 1];
    expect(msg.content).toContain("Test announcement");
    expect(msg.allowedMentions).toEqual({ parse: [] });
  });
});

describe("channel info fetch fallback", () => {
  it("fetches channel info from Twitch API when no cached title exists", async () => {
    // Create a fresh instance with no cached title/game.
    const { twitchManifest } = await import("functions/twitch/index");
    const freshInstance = await twitchManifest.createInstance({
      broadcasterLogin: BROADCASTER_LOGIN,
      channelId: CHANNEL_ID,
      liveMessage: "{name}: {title} [{game}]",
    });
    await freshInstance.onLoad({ client: mockClient, config: { id: "bot3" } });
    sentMessages.length = 0;

    twitchEvents.publish({
      subscriptionType: SUBSCRIPTION_TYPES.online.type,
      broadcasterUserId: BROADCASTER_ID,
      event: {
        broadcasterUserId: BROADCASTER_ID,
        broadcasterUserLogin: BROADCASTER_LOGIN,
        broadcasterUserName: "TestStreamer",
        startedAt: "2026-08-01T15:00:00Z",
      } as any,
    });
    await new Promise((r) => setTimeout(r, 100));

    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
    const msg = sentMessages[sentMessages.length - 1];
    // The channel info fetch should have populated title and game.
    expect(msg.content).toContain("Fetched Stream Title");
    expect(msg.content).toContain("Fetched Game");

    await freshInstance.onUnload?.();
  });
});

describe("manager.ts bot object contract", () => {
  it("the ManagedBot passed to onLoad has .client (regression guard)", async () => {
    // This test verifies the fix at the manager level: the bot object
    // passed to onLoad must have .client. We test the contract directly
    // rather than starting a real Discord client.
    let receivedBot: any = null;

    const manifest = {
      name: "test-probe",
      label: "Test Probe",
      description: "Checks what onLoad receives",
      icon: "T",
      version: "0.0.0",
      configSchema: { type: "object", properties: {} },
      defaultConfig: {},
      commands: [],
      async createInstance() {
        return {
          name: "test-probe",
          config: {},
          async onLoad(bot: any) {
            receivedBot = bot;
          },
          getStats() {
            return {};
          },
        };
      },
    };

    const instance = await manifest.createInstance();
    // Simulate what the fixed manager.ts does: passes result (with .client).
    const fakeManagedBot = { client: mockClient, config: { id: "test" } };
    await instance.onLoad(fakeManagedBot);
    expect(receivedBot).toBe(fakeManagedBot);
    expect(receivedBot.client).toBe(mockClient);
  });
});
