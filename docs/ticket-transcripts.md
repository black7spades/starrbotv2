# Ticket transcripts

> Tickets live in a forum channel — see
> [tickets-forum-setup.md](./tickets-forum-setup.md) for how to set that up.

Every ticket closed through `/ticket close` is now saved as a Markdown
transcript before the thread is locked and archived. The point is that deleting
a thread later — by hand or via `/ticket purge` — no longer destroys the support
history.

## What gets written

`data/transcripts/<TICKET-ID>-<threadId>.md`, containing:

- a header with the ticket id, thread name and id, opener, closer, rating and
  close time
- every message in the thread, oldest first, with author, timestamp and content
- attachment filenames and their CDN URLs
- embed titles and descriptions

Message bodies are quoted (`> `) so that content a user pasted — `###`, `---`,
and so on — cannot reshape the document.

The thread id is part of the filename because the ticket id falls back to the
raw thread name when a thread isn't named `TICKET-<n>`, and those can repeat.

## Where it shows up

- **On disk**, under the data directory — independent of Discord, so it survives
  the log channel being cleared or the message being deleted.
- **In the log channel** (if `logChannelId` is configured), attached to the
  existing summary embed, which also gains a `Transcript` field naming the file
  and message count.
- **In the ticket log** (`data/tickets-log.json`), as `transcript` (path,
  relative to the data directory) and `messageCount`.

Entries closed before this existed simply have no `transcript` field, and
`/ticket purge` continues to work on them.

## Failure behaviour

Transcript capture is best-effort and never blocks a close. If fetching the
thread's messages fails — most likely missing permissions — the ticket is still
logged and archived, the `transcript` field is omitted, and the summary embed
says `⚠️ capture failed — see logs`. The reason is written to the system log
under the `tickets` source.

Tickets closed without a resolvable opener used to be archived with no log entry
at all. They are now recorded too, with an empty `submitterId` (the summary
renders `unknown`), so they still get a transcript.

## Limits

- At most 1000 messages per thread (`MAX_TRANSCRIPT_MESSAGES` in
  `src/functions/tickets/transcript.ts`), fetched 100 at a time.
- Attachments are recorded by name and URL, not downloaded. Discord CDN links
  can expire, so if you need durable copies of user-supplied images, fetch them
  separately.

## Configuration

The data directory can be redirected with `STARRBOT_DATA_DIR`; transcripts
follow it. The test suite uses this to write into a temp directory.
