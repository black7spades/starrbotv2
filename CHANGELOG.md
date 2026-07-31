# Changelog

The version shown in the dashboard sidebar links here. It is the `version` from
`package.json`, alongside the abbreviated commit the running image was built
from.

## 2.2.0

### Added

- **Storage manager.** System Logs has a Storage panel showing what the app is
  holding on disk, broken down by store, with a usage bar for the system log
  against its limits. Admins get **Sweep now** (apply every retention rule
  immediately) and **Clear log**. See `docs/storage-and-logs.md`.
- **Scheduled maintenance** — a sweep at startup and every six hours after,
  clearing stray temp files and applying retention. It logs only when it
  actually reclaimed something.
- `GET /api/events/logs/storage`, `POST /api/events/logs/sweep` and
  `DELETE /api/events/logs`.
- Optional transcript retention via `TRANSCRIPT_MAX_AGE_DAYS`. Unset by default:
  a transcript is the only record of a ticket, so nothing deletes one unless
  asked by name.

### Fixed

- **The system log could grow without a real bound.** It was capped by entry
  count only, and a count cap is not a size cap — a single entry carrying a
  large context object can be megabytes. It now enforces size (4 MB) and age
  (14 days) alongside the count, all three overridable with `LOG_MAX_BYTES`,
  `LOG_MAX_AGE_DAYS` and `LOG_MAX_ENTRIES`. Over-long messages are truncated and
  oversized contexts replaced with a note, so one bad log line cannot blow the
  budget.
- **Container stdout had no size limit at all.** Docker's default `json-file`
  driver grows until the disk is full regardless of what the app does.
  `docker-compose.yml` now caps it at 3 × 10 MB.
- **The log file was written non-atomically**, so a crash mid-write left corrupt
  JSON — which the loader then discarded along with the entire history. It now
  writes to a temp file and renames.
- **The whole log file was rewritten every 30 seconds** whether or not anything
  had changed, so an idle instance wrote to disk forever for no reason.
- **Up to 30 seconds of logs were lost on every restart**, including anything
  logged on the way down. Shutdown now flushes.
- `tickets-log.json` grew forever; it is capped at the most recent 5,000 closed
  tickets. The transcript on disk remains the durable record either way.

## 2.1.0

### Added

- **Subscriber sync** (`subs` v1.0.0) — mirrors Twitch subscribers onto a role
  you name and control. Reacts live to role changes and reconciles everything on
  a schedule, so nothing is missed while the bot is offline. `/subs status` and
  `/subs sync`.
- **Welcome** (`welcome` v1.0.0) — greets new members with a random phrase from
  an editable pool, never repeating the same line twice in a row. The pool is
  editable from the Playground or from Discord with `/welcome add|edit|remove|
  list|preview`. Supports `{user}`, `{username}`, `{server}` and
  `{memberCount}`.
- **Twitch self-test and diagnostics** — the app checks its own integration and
  can send a signed test go-live through the real callback. No CLI needed.
- Function contract gains `onMemberJoin` and `onMemberUpdate` hooks.

### Changed

- Bots now request the **privileged `GuildMembers` intent**, which the two new
  functions require. It must also be enabled for the application in the Discord
  Developer Portal, or the gateway refuses the connection outright.

## 2.0.1

### Added

- **Violet Whispers** theme — purple over a deep blue base, joining Baby Pink,
  Midnight Blue and Emerald Tears. Each has a light and a dark variant.
- The sidebar version is now a real semantic version plus a 7-character commit,
  both linking out to the changelog and the exact commit on GitHub.

### Changed

- **Functions are configured in one place: the Playground.** A bot's Functions
  tab is now a read-only view of what that bot is running, with each card
  linking into the Playground with the function and bot preselected. The old
  per-bot function editor has been removed — two editors for the same config
  drift apart and it stops being obvious which is authoritative.
- Profile menu is near-opaque with a heavier blur and a dimming scrim behind
  it. It was translucent enough that page content competed with the menu.

### Removed

- **Instagram function.** It depended on scraping endpoints that break
  regularly and a session cookie that expires without warning. Twitch, YouTube,
  Bluesky, Mastodon, Reddit and GitHub all publish supported feeds or events;
  Instagram does not, and pretending otherwise produced a function that did not
  reliably work. Existing Instagram config is ignored rather than migrated.

## 2.0.0

### Added

- **Twitch go-live announcements** over EventSub webhooks, announcing within a
  second or two of a stream starting. Signature-verified, replay-protected and
  idempotent against Twitch's retries. See `docs/twitch-setup.md`.
- **Playground** — configure a function and apply it to any number of bots from
  one screen.
- **C64 glassmorphic theme system** built on the Commodore 64 VIC-II palette.
- **Ticket transcripts** captured at close, so deleting a thread no longer
  destroys the conversation. See `docs/ticket-transcripts.md`.
- **Tickets as forum posts**, tagged `Open` and `Resolved`. See
  `docs/tickets-forum-setup.md`.
- Profile settings: avatar, username and password change.
- A test suite, from zero to ~200 tests, and typecheck/lint/test in CI.

### Fixed

- **Unauthenticated read access to the whole API.** Every `GET` was readable
  without a session, including per-function config, which leaked stored
  credentials in plaintext.
- **Unauthenticated SSRF** in the feed-test endpoint, which fetched arbitrary
  URLs and reflected the response.
- **`/ticket purge` never deleted anything** — it called a manager that does not
  exist on `Guild`, so every attempt threw and was counted as a failure.
- **Generated secrets were regenerated on every restart**, which logged users
  out and silently broke Twitch EventSub delivery. They now persist.
- Graceful shutdown never ran; config writes were not atomic; bot ids could
  collide.

### Removed

- **RSSHub.** Updates now uses feeds the origin services publish themselves.

### Security

- A live Instagram session cookie and a plaintext admin password were committed
  to this repository's history. Both were removed from the working tree and
  must be treated as compromised.
