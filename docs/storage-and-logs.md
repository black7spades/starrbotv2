# Storage and logs

Everything the app keeps lives under one directory — `data/` by default, or
whatever `STARRBOT_DATA_DIR` points at. This page covers what grows, what stops
it growing, and how to look without shelling into the container.

## Seeing what is on disk

**System Logs → Storage.** The button shows the current total; opening it breaks
that down by store, with a usage bar for the system log against its limits. The
figures refresh every 30 seconds while the panel is open.

Two buttons sit alongside it, both admin-only:

- **Sweep now** — applies every retention rule immediately instead of waiting
  for the next scheduled run, and clears any leftover temp files.
- **Clear log** — empties the system log. Transcripts and configuration are not
  touched.

The same data is available at `GET /api/events/logs/storage`.

## What grows, and what bounds it

| Store | Bound |
| --- | --- |
| System log (`system-logs.json`) | Count, size and age caps, applied continuously |
| Ticket transcripts (`transcripts/*.md`) | **Unbounded by default** — see below |
| Ticket index (`tickets-log.json`) | Most recent 5,000 closed tickets |
| Posted updates (`posted-urls.json`) | Most recent 1,000 URLs per bot |
| Refresh tokens | Expired tokens are swept out |
| Configuration | Does not grow on its own |
| Container stdout | Docker `json-file` driver, 3 × 10 MB |

That last row matters more than it looks. Docker's default logging driver has
**no size limit at all**, so container stdout grows until the disk is full,
regardless of anything the app does. `docker/docker-compose.yml` caps it.

## System log limits

Three caps are enforced at once, and whichever binds first wins:

| Cap | Default | Override |
| --- | --- | --- |
| Entries | 5,000 | `LOG_MAX_ENTRIES` |
| Size | 4 MB | `LOG_MAX_BYTES` |
| Age | 14 days | `LOG_MAX_AGE_DAYS` |

A count cap on its own is not a size cap: one entry carrying a large context
object can be megabytes, so 5,000 entries had no meaningful upper bound until
the byte cap existed. Individual entries are also clamped — messages over 2,000
characters are truncated, and a context over 4 KB is replaced with a note saying
how big it was. Losing the tail of a context is better than losing the fact that
something was logged at all.

Age is applied before the size caps, so expiring old entries can free room
rather than being masked by a count trim.

Retention runs every 30 seconds, but only writes when something actually
changed, so an idle instance is not rewriting the file forever. Writes go to a
temp file and are then renamed, which is atomic — a crash mid-write can no
longer leave corrupt JSON that gets discarded on the next start, taking the
whole history with it.

## Transcript retention

Transcripts are the only record of what was said in a ticket, so nothing deletes
them by default. Set `TRANSCRIPT_MAX_AGE_DAYS` to opt in:

```yaml
environment:
  - TRANSCRIPT_MAX_AGE_DAYS=180
```

Zero, unset or a negative value keeps them forever. The scheduled sweep applies
this every six hours; **Sweep now** in the dashboard does not delete transcripts
unless a period is passed explicitly, so an accidental click cannot destroy
records.

## Stray temp files

The atomic writers create `<file>.<pid>.tmp` and rename it into place. A `.tmp`
file that outlives its process means a crash mid-write. They are dead weight and
the sweep removes them — but the storage panel reports the count first, because
a number that keeps climbing means something is crashing repeatedly.

## Scheduled maintenance

The sweep runs once at startup — a crash may have left temp files behind — and
every six hours after that. It logs only when it actually reclaimed something,
so a healthy instance stays quiet.
