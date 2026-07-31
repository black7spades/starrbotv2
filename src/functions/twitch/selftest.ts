import { randomUUID } from "crypto";
import { systemLog } from "utils/systemLog";
import { TwitchApi, SUBSCRIPTION_TYPES } from "./api";
import { HEADER, TEST_STATUS, hmacMessage, signPayload, isValidSecret } from "./eventsub";
import { callbackUrl } from "./index";

/**
 * Built-in diagnostics for the Twitch integration.
 *
 * The point is that the app verifies itself. Previously this required
 * installing the Twitch CLI, reading a generated secret out of the container,
 * and pasting it into a shell — which is the application asking the operator to
 * do the application's job.
 *
 * The synthetic event is deliberately delivered over HTTP to the real public
 * callback URL rather than short-circuited into the handler. Short-circuiting
 * would pass while Twitch still could not reach you, which is the single most
 * common failure. Going over the wire exercises DNS, TLS, any reverse proxy,
 * the route, signature verification, dispatch, and the Discord post.
 */

function log(level: "info" | "warn" | "error", msg: string) {
  systemLog.add(level, msg, "twitch");
}

export type CheckStatus = "pass" | "fail" | "warn" | "skip";

export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** What to do about it, when there is something to do. */
  fix?: string;
}

export interface DiagnosticsResult {
  ok: boolean;
  checks: Check[];
  callbackUrl: string;
}

function check(
  id: string,
  label: string,
  status: CheckStatus,
  detail: string,
  fix?: string
): Check {
  return { id, label, status, detail, fix };
}

/**
 * Reports whether the integration is configured and healthy, without sending
 * anything to Discord. Safe to run at any time.
 */
export async function runDiagnostics(broadcasterLogin?: string): Promise<DiagnosticsResult> {
  const checks: Check[] = [];
  const callback = callbackUrl();

  // --- Twitch application credentials ---
  const api = TwitchApi.fromEnv();
  if (!api) {
    checks.push(
      check(
        "credentials",
        "Twitch application",
        "fail",
        "TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET are not set",
        "Create an app at dev.twitch.tv/console/apps and put the id and secret in your .env"
      )
    );
  } else {
    checks.push(check("credentials", "Twitch application", "pass", "Client id and secret are set"));
  }

  // --- Signing secret ---
  const secret = process.env.TWITCH_EVENTSUB_SECRET ?? "";
  if (!secret) {
    checks.push(
      check(
        "secret",
        "Signing secret",
        "fail",
        "TWITCH_EVENTSUB_SECRET is not set",
        "In Docker this is generated and stored automatically; check the container started cleanly"
      )
    );
  } else if (!isValidSecret(secret)) {
    checks.push(
      check(
        "secret",
        "Signing secret",
        "fail",
        "Set, but outside Twitch's 10-100 ASCII character requirement",
        "Replace it with 10-100 plain ASCII characters"
      )
    );
  } else {
    checks.push(check("secret", "Signing secret", "pass", "Set and valid"));
  }

  // --- Callback URL ---
  if (!callback || callback === "/api/twitch/eventsub") {
    checks.push(
      check(
        "callback",
        "Callback URL",
        "fail",
        "BASE_URL is not set, so there is no address to give Twitch",
        "Set BASE_URL to your public https address"
      )
    );
  } else if (!callback.startsWith("https://")) {
    checks.push(
      check(
        "callback",
        "Callback URL",
        "fail",
        `${callback} is not https — Twitch refuses plain HTTP callbacks`,
        "Terminate TLS in front of the app and set BASE_URL to the https address"
      )
    );
  } else {
    checks.push(check("callback", "Callback URL", "pass", callback));
  }

  // --- Channel resolution ---
  let broadcasterId: string | null = null;
  if (api && broadcasterLogin) {
    try {
      const user = await api.getUserByLogin(broadcasterLogin);
      if (user) {
        broadcasterId = user.id;
        checks.push(
          check("channel", "Twitch channel", "pass", `${user.displayName} (id ${user.id})`)
        );
      } else {
        checks.push(
          check(
            "channel",
            "Twitch channel",
            "fail",
            `No Twitch channel named "${broadcasterLogin}"`,
            "Use the name exactly as it appears in the channel URL"
          )
        );
      }
    } catch (err: any) {
      checks.push(check("channel", "Twitch channel", "fail", err.message));
    }
  } else {
    checks.push(
      check("channel", "Twitch channel", "skip", broadcasterLogin ? "Not checked" : "No channel configured yet")
    );
  }

  // --- Subscription health, straight from Twitch ---
  // This is the authoritative answer to "can Twitch reach us": a subscription
  // only becomes `enabled` after Twitch successfully completes the verification
  // handshake against the callback.
  if (api && broadcasterId) {
    try {
      const subs = (await api.listSubscriptions()).filter(
        (s) => s.condition?.broadcaster_user_id === broadcasterId
      );
      const wanted = Object.values(SUBSCRIPTION_TYPES).map((s) => s.type);

      for (const type of wanted) {
        const match = subs.find((s) => s.type === type && s.transport?.callback === callback);
        if (!match) {
          checks.push(
            check(
              `sub:${type}`,
              type,
              "fail",
              "No subscription for this callback",
              "Save the function again to re-subscribe"
            )
          );
        } else if (match.status === "enabled") {
          checks.push(check(`sub:${type}`, type, "pass", "enabled"));
        } else if (match.status === "webhook_callback_verification_pending") {
          checks.push(
            check(
              `sub:${type}`,
              type,
              "warn",
              "Twitch has not verified the callback yet",
              "Usually means your BASE_URL is not reachable from the internet"
            )
          );
        } else {
          checks.push(
            check(
              `sub:${type}`,
              type,
              "fail",
              match.status,
              "Twitch stopped delivering. Fix reachability, then save the function again"
            )
          );
        }
      }
    } catch (err: any) {
      checks.push(check("subscriptions", "Subscriptions", "fail", err.message));
    }
  } else {
    checks.push(check("subscriptions", "Subscriptions", "skip", "Needs credentials and a channel"));
  }

  return {
    ok: checks.every((c) => c.status === "pass" || c.status === "skip"),
    checks,
    callbackUrl: callback,
  };
}

export interface SelfTestResult extends DiagnosticsResult {
  /** Whether the synthetic event was accepted by our own callback. */
  delivered: boolean;
  deliveryDetail: string;
}

/**
 * Signs a synthetic stream.online event and POSTs it to the public callback,
 * exactly as Twitch would. A successful run puts a clearly-labelled test
 * announcement in the configured Discord channel.
 */
export async function runSelfTest(opts: {
  broadcasterLogin: string;
  broadcasterUserName?: string;
}): Promise<SelfTestResult> {
  const diagnostics = await runDiagnostics(opts.broadcasterLogin);
  const callback = diagnostics.callbackUrl;
  const secret = process.env.TWITCH_EVENTSUB_SECRET ?? "";

  // Only block on what delivery genuinely needs: something to sign with, and an
  // address to send to.
  //
  // Notably this does NOT block on the https check. That requirement exists
  // because *Twitch* refuses plain-HTTP callbacks, not because our own request
  // cannot be made — so a local or staging instance on http can still prove its
  // route, signing, dispatch and Discord post all work. The https failure stays
  // visible in the checks above.
  const secretFailed = diagnostics.checks.some((c) => c.id === "secret" && c.status === "fail");
  const hasAddress = /^https?:\/\//.test(callback);

  if (secretFailed || !hasAddress) {
    const reasons = diagnostics.checks
      .filter((c) => (c.id === "secret" && secretFailed) || (c.id === "callback" && !hasAddress))
      .map((c) => c.detail);
    return {
      ...diagnostics,
      delivered: false,
      deliveryDetail: reasons.join("; ") || "Not enough configuration to send a test",
    };
  }

  const login = opts.broadcasterLogin || "teststreamer";
  const body = JSON.stringify({
    subscription: {
      id: randomUUID(),
      type: SUBSCRIPTION_TYPES.online.type,
      version: SUBSCRIPTION_TYPES.online.version,
      // Marks this as ours so the announcement is labelled a test. Twitch never
      // sends this status.
      status: TEST_STATUS,
      condition: { broadcaster_user_id: "0" },
    },
    event: {
      broadcaster_user_id: "0",
      broadcaster_user_login: login,
      broadcaster_user_name: opts.broadcasterUserName || login,
      started_at: new Date().toISOString(),
      type: "live",
    },
  });

  const messageId = randomUUID();
  const timestamp = new Date().toISOString();
  const signature = signPayload(secret, hmacMessage(messageId, timestamp, body));

  try {
    const res = await fetch(callback, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [HEADER.id]: messageId,
        [HEADER.timestamp]: timestamp,
        [HEADER.signature]: signature,
        [HEADER.type]: "notification",
        [HEADER.subscriptionType]: SUBSCRIPTION_TYPES.online.type,
      },
      body,
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 204 || res.status === 200) {
      log("info", `self-test event accepted by ${callback}`);
      return {
        ...diagnostics,
        delivered: true,
        deliveryDetail:
          "Callback accepted a correctly signed event. A test announcement should now be in your Discord channel.",
      };
    }

    if (res.status === 403) {
      return {
        ...diagnostics,
        delivered: false,
        deliveryDetail:
          "The callback rejected our signature (403). The running app and the URL you configured are signing with different secrets — check BASE_URL points at this instance.",
      };
    }

    return {
      ...diagnostics,
      delivered: false,
      deliveryDetail: `Callback answered HTTP ${res.status}`,
    };
  } catch (err: any) {
    // A network failure here is the most useful result of all: it means Twitch
    // will not be able to reach the callback either.
    return {
      ...diagnostics,
      delivered: false,
      deliveryDetail: `Could not reach ${callback} — ${err.message}. Twitch will not be able to reach it either.`,
    };
  }
}
