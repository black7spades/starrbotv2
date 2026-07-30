import { systemLog } from "utils/systemLog";

/**
 * Twitch Helix client: app access token, user lookup, and EventSub
 * subscription management.
 *
 * Webhook EventSub subscriptions must be created with an *app* access token
 * (client credentials) — Twitch rejects a user token for webhook transports.
 * The token is cached until shortly before it expires and refreshed on demand.
 */

const ID_BASE = "https://id.twitch.tv";
const HELIX_BASE = "https://api.twitch.tv/helix";

function log(level: "info" | "warn" | "error", msg: string) {
  systemLog.add(level, msg, "twitch");
}

export interface TwitchCredentials {
  clientId: string;
  clientSecret: string;
}

export interface TwitchUser {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl?: string;
}

export interface EventSubSubscription {
  id: string;
  type: string;
  status: string;
  condition: Record<string, string>;
  transport: { method: string; callback?: string };
}

/** Subscription types the Twitch function uses. */
export const SUBSCRIPTION_TYPES = {
  online: { type: "stream.online", version: "1" },
  offline: { type: "stream.offline", version: "1" },
  update: { type: "channel.update", version: "2" },
} as const;

export class TwitchApi {
  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private readonly creds: TwitchCredentials) {}

  static fromEnv(): TwitchApi | null {
    const clientId = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    return new TwitchApi({ clientId, clientSecret });
  }

  /** Client-credentials token, cached with a 60s safety margin. */
  private async appToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;

    const params = new URLSearchParams({
      client_id: this.creds.clientId,
      client_secret: this.creds.clientSecret,
      grant_type: "client_credentials",
    });

    const res = await fetch(`${ID_BASE}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error(`Twitch token request failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = body.access_token;
    this.tokenExpiresAt = Date.now() + Math.max(0, (body.expires_in - 60) * 1000);
    return this.token;
  }

  private async helix(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.appToken();
    return fetch(`${HELIX_BASE}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        "Client-Id": this.creds.clientId,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
  }

  /** Resolves a channel name to the numeric id EventSub conditions need. */
  async getUserByLogin(login: string): Promise<TwitchUser | null> {
    const res = await this.helix(`/users?login=${encodeURIComponent(login.toLowerCase())}`);
    if (!res.ok) throw new Error(`Twitch user lookup failed: HTTP ${res.status}`);
    const body = (await res.json()) as { data: any[] };
    const user = body.data?.[0];
    if (!user) return null;
    return {
      id: user.id,
      login: user.login,
      displayName: user.display_name ?? user.login,
      profileImageUrl: user.profile_image_url,
    };
  }

  async listSubscriptions(): Promise<EventSubSubscription[]> {
    const out: EventSubSubscription[] = [];
    let cursor: string | undefined;

    do {
      const query = cursor ? `?after=${encodeURIComponent(cursor)}` : "";
      const res = await this.helix(`/eventsub/subscriptions${query}`);
      if (!res.ok) throw new Error(`Listing EventSub subscriptions failed: HTTP ${res.status}`);
      const body = (await res.json()) as { data: any[]; pagination?: { cursor?: string } };
      for (const s of body.data ?? []) {
        out.push({
          id: s.id,
          type: s.type,
          status: s.status,
          condition: s.condition,
          transport: s.transport,
        });
      }
      cursor = body.pagination?.cursor;
    } while (cursor);

    return out;
  }

  async createSubscription(opts: {
    type: string;
    version: string;
    broadcasterUserId: string;
    callback: string;
    secret: string;
  }): Promise<EventSubSubscription> {
    const res = await this.helix("/eventsub/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        type: opts.type,
        version: opts.version,
        condition: { broadcaster_user_id: opts.broadcasterUserId },
        transport: { method: "webhook", callback: opts.callback, secret: opts.secret },
      }),
    });

    if (res.status === 409) {
      throw new Error("A matching EventSub subscription already exists");
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Creating ${opts.type} subscription failed: HTTP ${res.status} ${detail.slice(0, 200)}`);
    }

    const body = (await res.json()) as { data: any[] };
    const created = body.data[0];
    return {
      id: created.id,
      type: created.type,
      status: created.status,
      condition: created.condition,
      transport: created.transport,
    };
  }

  async deleteSubscription(id: string): Promise<void> {
    const res = await this.helix(`/eventsub/subscriptions?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    // 404 means it is already gone, which is the state we wanted.
    if (!res.ok && res.status !== 404) {
      throw new Error(`Deleting subscription ${id} failed: HTTP ${res.status}`);
    }
  }

  /**
   * Makes the live subscription set match what we want for a broadcaster.
   *
   * Twitch keeps subscriptions per application, not per process, so a restart
   * or a redeploy must not pile up duplicates. Anything already present and
   * healthy for this callback is left alone; anything failed or pointing at a
   * stale callback is removed and recreated.
   */
  async ensureSubscriptions(opts: {
    broadcasterUserId: string;
    callback: string;
    secret: string;
    types?: { type: string; version: string }[];
  }): Promise<{ created: string[]; kept: string[]; removed: string[] }> {
    const wanted = opts.types ?? Object.values(SUBSCRIPTION_TYPES);
    const existing = await this.listSubscriptions();

    const created: string[] = [];
    const kept: string[] = [];
    const removed: string[] = [];

    for (const want of wanted) {
      const matches = existing.filter(
        (s) =>
          s.type === want.type && s.condition?.broadcaster_user_id === opts.broadcasterUserId
      );

      const healthy = matches.find(
        (s) => s.transport?.callback === opts.callback && s.status === "enabled"
      );

      // Drop anything for this type that we are not keeping: wrong callback,
      // revoked, or failed verification.
      for (const stale of matches) {
        if (healthy && stale.id === healthy.id) continue;
        try {
          await this.deleteSubscription(stale.id);
          removed.push(`${stale.type}:${stale.id}`);
        } catch (err: any) {
          log("warn", `could not delete stale subscription ${stale.id}: ${err.message}`);
        }
      }

      if (healthy) {
        kept.push(want.type);
        continue;
      }

      try {
        const sub = await this.createSubscription({
          type: want.type,
          version: want.version,
          broadcasterUserId: opts.broadcasterUserId,
          callback: opts.callback,
          secret: opts.secret,
        });
        created.push(`${sub.type}:${sub.status}`);
      } catch (err: any) {
        log("error", `could not create ${want.type} subscription: ${err.message}`);
      }
    }

    return { created, kept, removed };
  }
}
