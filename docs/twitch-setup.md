# Twitch go-live announcements

Announces in Discord the moment a Twitch channel goes live, using Twitch
**EventSub webhooks** — Twitch pushes the event to us, so the alert lands within
a second or two of the stream starting. There is no polling and no delay.

## Why webhooks and not polling

Twitch has no RSS feed, and Discord's built-in Twitch integration syncs
subscriber roles but does **not** post go-live alerts. The two real options are
polling the Helix API on a timer (simple, but 1–2 minutes late and burns rate
limit) or EventSub webhooks (real time). For a channel whose viewers are
deciding whether to click through *now*, the delay matters, so this uses
webhooks.

## What you need

- A public **HTTPS** URL for this app. You already have one if Discord OAuth
  login works — it is the same `BASE_URL`. Twitch will not deliver to plain
  HTTP or to a hostname it cannot reach.
- A Twitch application, for the client id and secret.

## 1. Create a Twitch application

1. Go to <https://dev.twitch.tv/console/apps> and click **Register Your
   Application**.
2. Name it anything. For **OAuth Redirect URLs** enter `http://localhost` — it
   is required by the form but never used here, because go-live announcements
   use an app token rather than logging a user in.
3. Category: **Application Integration**.
4. Copy the **Client ID**, then **New Secret** and copy that too.

## 2. Set the environment variables

In your `.env` next to `docker-compose.yml`:

```bash
TWITCH_CLIENT_ID=your-client-id
TWITCH_CLIENT_SECRET=your-client-secret
```

`TWITCH_EVENTSUB_SECRET` signs the callback. The Docker entrypoint generates one
if you do not set it, which is fine — just be aware that it changes on a fresh
volume, and the app recreates its subscriptions when that happens.

Make sure `BASE_URL` is your real public URL, e.g.
`BASE_URL=https://bot.example.com`. Twitch will POST to
`${BASE_URL}/api/twitch/eventsub`.

Restart: `docker compose up -d`.

## 3. Configure the function

In the dashboard, open **Playground**, choose **Twitch**, and set:

| Field | Meaning |
|---|---|
| `broadcasterLogin` | The channel name from its URL — `twitch.tv/**somestreamer**` |
| `channelId` | The Discord channel that gets the announcement |
| `mentionRoleId` | Role to ping, e.g. a "stream notifications" role (optional) |
| `liveMessage` | Message text. `{name}`, `{title}`, `{game}` and `{url}` are substituted |
| `announceOffline` | Also post when the stream ends (off by default) |

Tick the bots that should announce, then **Save & enable**.

On enable, the app resolves the channel to its Twitch user id and makes sure
three subscriptions exist: `stream.online`, `stream.offline` and
`channel.update`. The last one is how the announcement knows the stream title
and category — `stream.online` carries neither.

## 4. Check it worked

Run `/twitch status` in Discord. It reports the watched channel, the resolved
broadcaster id, the callback URL, how many announcements have been sent, and the
last error if there was one.

You can also watch the system log (**Logs** in the dashboard, source `twitch`)
for `EventSub callback verified`, which is Twitch completing the handshake.

To test end to end without going live, use the
[Twitch CLI](https://dev.twitch.tv/docs/cli/):

```bash
twitch event trigger stream.online \
  -F https://your-domain/api/twitch/eventsub \
  -s $TWITCH_EVENTSUB_SECRET
```

## How the callback is secured

`/api/twitch/eventsub` is deliberately **not** behind the dashboard session —
Twitch cannot log in. Instead every request must carry a valid HMAC-SHA256
signature over the message id, timestamp and raw body, keyed with
`TWITCH_EVENTSUB_SECRET`. Anything that fails is dropped with a bare 403.

Also enforced:

- Messages older than 10 minutes, or dated in the future, are refused, so a
  captured request cannot be replayed later.
- Message ids are remembered, so Twitch's at-least-once retries cannot announce
  the same stream twice.
- The comparison is constant-time, so the signature cannot be guessed byte by
  byte from response timing.

If `TWITCH_EVENTSUB_SECRET` is missing or outside Twitch's 10–100 ASCII
character requirement, the endpoint answers 503 rather than accepting unsigned
traffic.

## Troubleshooting

**Nothing happens when the stream starts.** Check `/twitch status` for a last
error. The usual cause is `BASE_URL` not being reachable from the internet —
Twitch has to complete a verification handshake before a subscription becomes
`enabled`, and it silently stays pending if the callback 403s or times out.

**"BASE_URL must be a public https URL".** Twitch refuses plain HTTP callbacks.
Terminate TLS in front of the app and set `BASE_URL` to the https address.

**Subscriptions keep getting revoked.** Twitch revokes a subscription after
repeated delivery failures. Fix reachability, then restart — the app reconciles
its subscriptions on load, deleting stale or failed ones and recreating them.

**Announcements have no title or category.** Those come from `channel.update`,
which only fires when the streamer changes them. A channel that has not changed
its title since the bot started will announce without one until it does.
