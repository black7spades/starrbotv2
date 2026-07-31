import { mkdirSync, writeFileSync, renameSync, readdirSync, statSync, unlinkSync } from "fs";
import { join } from "path";

// Mirrors the override in src/config/store.ts so tests can redirect writes.
const DATA_DIR = process.env.STARRBOT_DATA_DIR || join(__dirname, "../../../data");

export const TRANSCRIPT_DIR = join(DATA_DIR, "transcripts");

/** How many messages we are willing to pull from one thread. */
export const MAX_TRANSCRIPT_MESSAGES = 1000;

export interface TranscriptMessage {
  id: string;
  createdTimestamp: number;
  authorTag: string;
  authorId: string;
  bot: boolean;
  content: string;
  attachments: { name: string; url: string }[];
  embeds: { title?: string; description?: string }[];
}

export interface TranscriptMeta {
  ticketId: string;
  threadName: string;
  threadId: string;
  submitterId: string;
  closedBy: string;
  rating: number;
  ratingLabel: string;
  closedAt: number;
}

/**
 * Turns a ticket id into something safe to use as a filename. Ticket ids are
 * normally "TICKET-<n>", but the close path falls back to the raw thread name,
 * which can contain path separators and other unsafe characters.
 */
export function transcriptFileName(ticketId: string, threadId: string): string {
  const slug = ticketId
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 64);
  return `${slug || "ticket"}-${threadId}.md`;
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}

/**
 * Renders a Markdown transcript. Kept free of discord.js types so it can be
 * tested directly, and so the caller decides how messages are sourced.
 */
export function renderTranscript(meta: TranscriptMeta, messages: TranscriptMessage[]): string {
  const lines: string[] = [];

  lines.push(`# ${meta.ticketId}`);
  lines.push("");
  lines.push(`- **Thread:** ${meta.threadName} (\`${meta.threadId}\`)`);
  lines.push(`- **Opened by:** \`${meta.submitterId}\``);
  lines.push(`- **Closed by:** \`${meta.closedBy}\``);
  lines.push(
    `- **Rating:** ${meta.rating > 0 ? `${meta.rating}/5 — ${meta.ratingLabel}` : "No response"}`
  );
  lines.push(`- **Closed at:** ${formatTimestamp(meta.closedAt)}`);
  lines.push(`- **Messages:** ${messages.length}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  if (messages.length === 0) {
    lines.push("_No messages were captured for this ticket._");
    lines.push("");
    return lines.join("\n");
  }

  for (const msg of messages) {
    const who = msg.bot ? `${msg.authorTag} [bot]` : msg.authorTag;
    lines.push(`### ${who} — ${formatTimestamp(msg.createdTimestamp)}`);
    lines.push("");

    if (msg.content.trim()) {
      // Quote the body so message content can never break out of the document
      // structure (a user pasting "### " or "---" would otherwise reshape it).
      for (const line of msg.content.split("\n")) {
        lines.push(`> ${line}`);
      }
      lines.push("");
    }

    for (const embed of msg.embeds) {
      const title = embed.title?.trim();
      const description = embed.description?.trim();
      if (!title && !description) continue;
      lines.push(`> **[embed]**${title ? ` ${title}` : ""}`);
      if (description) {
        for (const line of description.split("\n")) lines.push(`> ${line}`);
      }
      lines.push("");
    }

    for (const att of msg.attachments) {
      // CDN links can expire — the filename is recorded so the attachment is
      // still identifiable after the URL stops resolving.
      lines.push(`> **[attachment]** ${att.name} — ${att.url}`);
      lines.push("");
    }

    if (!msg.content.trim() && msg.embeds.length === 0 && msg.attachments.length === 0) {
      lines.push("> _(no content)_");
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Writes the transcript to disk and returns its path relative to the data
 * directory, which is what gets stored in the ticket log.
 */
export function saveTranscript(ticketId: string, threadId: string, contents: string): string {
  mkdirSync(TRANSCRIPT_DIR, { recursive: true });
  const name = transcriptFileName(ticketId, threadId);
  const target = join(TRANSCRIPT_DIR, name);
  // Same temp-then-rename approach as the config store: never leave a partial
  // transcript behind if the process dies mid-write.
  const tmp = `${target}.${process.pid}.tmp`;
  writeFileSync(tmp, contents, "utf8");
  renameSync(tmp, target);
  return join("transcripts", name);
}

/** Minimal shape we need from a discord.js thread; keeps this module testable. */
interface FetchableThread {
  messages: {
    fetch(options: { limit: number; before?: string }): Promise<
      Map<string, unknown> & { size: number; values(): IterableIterator<unknown>; last(): unknown }
    >;
  };
}

function toTranscriptMessage(raw: any): TranscriptMessage {
  return {
    id: String(raw?.id ?? ""),
    createdTimestamp: Number(raw?.createdTimestamp ?? 0),
    authorTag: String(raw?.author?.tag ?? raw?.author?.username ?? "unknown"),
    authorId: String(raw?.author?.id ?? ""),
    bot: Boolean(raw?.author?.bot),
    content: String(raw?.content ?? ""),
    attachments: [...(raw?.attachments?.values?.() ?? [])].map((a: any) => ({
      name: String(a?.name ?? "file"),
      url: String(a?.url ?? ""),
    })),
    embeds: (raw?.embeds ?? []).map((e: any) => ({
      title: e?.title ?? undefined,
      description: e?.description ?? undefined,
    })),
  };
}

/**
 * Pages backwards through a thread's history and returns messages oldest-first.
 * Discord returns newest-first in batches of at most 100.
 */
export async function collectMessages(
  thread: FetchableThread,
  max: number = MAX_TRANSCRIPT_MESSAGES
): Promise<TranscriptMessage[]> {
  const collected: TranscriptMessage[] = [];
  let before: string | undefined;

  while (collected.length < max) {
    const limit = Math.min(100, max - collected.length);
    const batch = await thread.messages.fetch(before ? { limit, before } : { limit });
    if (!batch || batch.size === 0) break;

    for (const raw of batch.values()) collected.push(toTranscriptMessage(raw));

    const oldest = batch.last() as any;
    if (!oldest?.id) break;
    before = String(oldest.id);

    if (batch.size < limit) break;
  }

  // Batches arrive newest-first; sort ascending for a readable transcript.
  return collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

export interface TranscriptUsage {
  files: number;
  bytes: number;
  oldest: number | null;
}

/** Current size of the transcript directory, for the storage report. */
export function transcriptUsage(): TranscriptUsage {
  try {
    const names = readdirSync(TRANSCRIPT_DIR).filter((n) => n.endsWith(".md"));
    let bytes = 0;
    let oldest: number | null = null;
    for (const name of names) {
      try {
        const s = statSync(join(TRANSCRIPT_DIR, name));
        bytes += s.size;
        if (oldest === null || s.mtimeMs < oldest) oldest = s.mtimeMs;
      } catch {
        // A file removed between listing and stat is not an error.
      }
    }
    return { files: names.length, bytes, oldest };
  } catch {
    return { files: 0, bytes: 0, oldest: null };
  }
}

/**
 * Deletes transcripts older than `maxAgeDays`.
 *
 * Transcripts are the durable record of a ticket, so this is opt-in: it only
 * runs when a retention period is configured. Zero or a negative value keeps
 * everything forever, which is the default.
 */
export function pruneTranscripts(maxAgeDays: number, now: number = Date.now()): number {
  if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) return 0;
  const cutoff = now - maxAgeDays * 86_400_000;
  let removed = 0;
  try {
    for (const name of readdirSync(TRANSCRIPT_DIR)) {
      if (!name.endsWith(".md")) continue;
      const full = join(TRANSCRIPT_DIR, name);
      try {
        if (statSync(full).mtimeMs < cutoff) {
          unlinkSync(full);
          removed++;
        }
      } catch {
        // Skip anything that vanished or cannot be read.
      }
    }
  } catch {
    // No directory yet means nothing to prune.
  }
  return removed;
}
