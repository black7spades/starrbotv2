# Subscriber sync and Welcome

Two member-facing functions. Both need the **privileged `GuildMembers` intent**
— see the prerequisite below before configuring either.

## Prerequisite: enable the Server Members intent

Both functions react to members joining or having their roles changed, which
Discord gates behind a privileged intent.

1. Go to <https://discord.com/developers/applications> and open your bot's
   application.
2. **Bot → Privileged Gateway Intents → Server Members Intent** → on.
3. Restart the bot.

Without it the gateway **refuses the connection outright**, so the bot will not
come online at all — it is not a silent degradation. If a bot stops connecting
after this update, this is why.

---

# Subscriber sync

Gives Twitch subscribers a Discord role that you name.

## How it decides who is subscribed

It does not ask Twitch. It mirrors **Discord's own managed Twitch Subscriber
role**, and that is deliberate.

Matching a Discord member to a Twitch subscriber needs a link between the two
accounts. Discord has that link — users connect their Twitch account — but a bot
**cannot read another member's connections**; that needs an OAuth grant from
each individual user. A bot-built sync would therefore require every subscriber
to manually link through a separate OAuth flow, and anyone who did not would
silently miss out.

Discord's built-in integration already does this properly, from data we cannot
see. So it provides the truth, and this function mirrors it onto a role you own.

## 1. Turn on Discord's Twitch integration

This is what actually produces the subscriber data. You need a Twitch
**Affiliate or Partner** account.

1. **Server Settings → Integrations → Twitch**.
2. Connect the Twitch account and enable subscriber sync.

Discord then maintains managed roles named `Twitch Subscriber`, and
`Twitch Subscriber: Tier 1/2/3`. Those are the source.

## 2. Configure the function

**Playground → Subscriber sync**:

| Field | Meaning |
|---|---|
| `subsRoleName` | The role subscribers get. **Created automatically** if it does not exist |
| `sourceRoleId` | Leave blank to auto-detect Discord's managed role |
| `tier` | Mirror only one tier, e.g. `Tier 2`. Blank mirrors all tiers |
| `removeWhenUnsubscribed` | Take the role back when someone lapses (default on) |
| `syncIntervalMinutes` | Full reconcile interval, default 30 |
| `guildId` | Which server, if the bot is in more than one |

The bot's own role must sit **above** the role it manages in the role list, or
Discord refuses the change.

## How it stays in sync

- **Live** — reacts the moment Discord grants or revokes the managed role.
- **Scheduled** — a full reconcile every `syncIntervalMinutes`, and once at
  startup, so anything that happened while the bot was down is picked up.

Discord's own sync runs every 5–10 minutes, so a new subscriber typically has
the role within a few minutes.

## Commands

- `/subs status` — which roles are mirrored, how many hold the role, counts, and
  the last error.
- `/subs sync` — reconcile now.

## If `/subs status` says the source role was not found

Discord's Twitch integration is not set up, or has not created its roles yet.
Everything else is configured correctly; the function has nothing to mirror.

---

# Welcome

Greets new members with a random phrase from a pool you control.

## Configure

**Playground → Welcome**:

| Field | Meaning |
|---|---|
| `channelId` | Where the greeting is posted |
| `phrases` | The pool. Add, edit and delete entries inline |
| `useEmbed` | Post as an embed with the member's avatar instead of plain text |
| `guildId` | Which server, if the bot is in more than one |

## Placeholders

| Placeholder | Becomes |
|---|---|
| `{user}` | A mention, e.g. `@jamie` |
| `{username}` | The name without a mention |
| `{server}` | The server name |
| `{memberCount}` | Ordinal position, e.g. `42nd` |

An unrecognised placeholder is left visible rather than blanked, so a typo shows
up instead of leaving a gap.

## Behaviour

- A phrase is chosen at random, and **never the same one twice in a row** when
  the pool has more than one entry — back-to-back repeats are the quickest way a
  random pool stops feeling random.
- Bots joining are ignored.
- An empty pool posts nothing and logs a warning rather than greeting with a
  blank message.

## Commands

`/welcome list`, `/welcome add`, `/welcome edit`, `/welcome remove`, and
`/welcome preview` — which renders a greeting for you privately, without posting
and without pinging anyone.

Edits from Discord are written back to the function's config, so the dashboard
and the slash commands operate on the same pool.

---

## Logging

Both functions write to the system log (**Logs** in the dashboard) under the
sources `subs` and `welcome`: every role granted or removed with the member id,
every greeting sent, every reconcile with its counts, config changes, and every
failure with its reason.
