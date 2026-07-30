# Setting up the tickets forum

Tickets are forum posts. Each ticket is a post in a Discord forum channel,
tagged `Open` when created and `Resolved` when closed, so closed tickets drop
out of the default view without anything being deleted.

This replaces the previous behaviour of creating threads inside a text channel.
`/ticket create` now requires a forum channel and will refuse a text channel
with a message saying so.

## 1. Create the forum channel

In Discord: **Server Settings → Channels → Create Channel → Forum**.

Name it whatever you like (`support`, `tickets`, …). Members need to be able to
*see* it, but they do not need permission to post — `/ticket create` posts on
their behalf.

## 2. Create the tags

Open the forum channel's settings and add two tags under **Tags**:

| Tag | Used for |
|---|---|
| `Open` | Applied automatically when a ticket is created |
| `Resolved` | Applied automatically when a ticket is closed |

The names are matched case-insensitively, and you can rename them in the
function config (`openTagName` / `resolvedTagName`) if you prefer different
wording. You can add other tags — `Billing`, `Bug`, whatever — and apply them by
hand; closing a ticket preserves them and only swaps `Open` for `Resolved`.

If a tag is missing, tickets still work: creation posts untagged and closing
leaves tags alone, with a warning in the system log under the `tickets` source.

**Do not tick "Moderated"** on these two tags unless the bot has Manage Threads
in the channel — moderated tags can only be applied by moderators.

## 3. Point the function at it

In the dashboard, open the bot → **Functions** → **Tickets**, and set:

| Field | Value |
|---|---|
| `adminChannelId` | The forum channel's id |
| `adminRoleId` | The role allowed to close and purge tickets; also pinged on each new ticket |
| `logChannelId` | Optional text channel for close summaries and transcript attachments |
| `openTagName` | Defaults to `Open` |
| `resolvedTagName` | Defaults to `Resolved` |

To copy a channel id, enable **Settings → Advanced → Developer Mode** in
Discord, then right-click the channel → **Copy Channel ID**.

## 4. Give the bot permissions

In the forum channel, the bot needs:

- **View Channel**
- **Create Posts** — to open tickets
- **Send Messages in Posts** — for the admin-role ping and the rating prompt
- **Manage Threads** — to lock, archive, apply tags, and delete on purge
- **Read Message History** — required for transcripts; without it capture fails

Also enable **Message Content Intent** for the application in the
[Developer Portal](https://discord.com/developers/applications) under **Bot →
Privileged Gateway Intents**. Without it the transcript is still written, but
every message body comes back empty — you get a file of headers and
`_(no content)_` rather than an obvious error.

## 5. Check it works

1. Run `/ticket create` — a new post should appear in the forum, tagged `Open`,
   with the ticket embed as its first message.
2. Run `/ticket close` inside that post. The submitter gets a rating prompt.
3. After they rate (or 24h passes), the post should be tagged `Resolved`,
   locked and archived, and — if `logChannelId` is set — a summary should appear
   there with a `.md` transcript attached.

Open the transcript and confirm the message bodies are real text. If they're
empty, revisit Message Content Intent in step 4.

## Status lives on the tag

The ticket embed shows who opened the ticket but deliberately does not carry a
`Status` field. The forum tag is the single source of truth — a status baked
into the starter message would still read `Open` after the ticket was resolved.

## Do you still need purge?

Mostly no, which was the point. Closed tickets are tagged `Resolved`, locked and
archived, so they're filtered out of the forum's default view while staying
searchable. `/ticket purge` still works if you want the posts gone, and since
transcripts are captured at close, deleting a post no longer destroys the
conversation — see [ticket-transcripts.md](./ticket-transcripts.md).

Note that `/ticket purge days:N` deletes tickets closed **within** the last N
days, not those older than N days. It's a "clean up what I just made" tool, not
a retention policy.
