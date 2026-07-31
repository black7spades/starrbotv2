# Changelog

The version shown in the dashboard sidebar links here. It is the `version` from
`package.json`, alongside the abbreviated commit the running image was built
from.

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

## Unreleased

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
