/**
 * Retention rules for the in-memory system log.
 *
 * Pure functions, so the "what gets dropped and why" decisions are testable
 * without a filesystem or a timer.
 *
 * Three caps are enforced at once, and whichever binds first wins:
 *
 *   entries  — a hard count, cheap to reason about
 *   bytes    — because a count cap alone is not a size cap. One entry carrying
 *              a large context object can be megabytes, so 5000 entries had no
 *              meaningful upper bound on disk or memory.
 *   age      — so a quiet instance does not keep months-old noise forever
 *
 * Oversized individual entries are truncated rather than rejected: losing the
 * fact that something was logged is worse than losing the tail of its context.
 */

export interface RetainableEntry {
  id: number;
  timestamp: number;
  level: string;
  message: string;
  source: string;
  context?: Record<string, unknown>;
}

export interface RetentionLimits {
  maxEntries: number;
  maxBytes: number;
  maxAgeMs: number;
  /** Longest a single message may be before it is cut. */
  maxMessageLength: number;
  /** Longest a serialised context may be before it is dropped. */
  maxContextBytes: number;
}

export const DEFAULT_LIMITS: RetentionLimits = {
  maxEntries: 5000,
  maxBytes: 4 * 1024 * 1024, // 4 MB of log body
  maxAgeMs: 14 * 24 * 60 * 60 * 1000, // 14 days
  maxMessageLength: 2000,
  maxContextBytes: 4096,
};

/** Approximate serialised size of an entry, used for the byte cap. */
export function entrySize(entry: RetainableEntry): number {
  let size = 64; // id, timestamp, level, source and JSON overhead
  size += entry.message.length;
  size += entry.source.length;
  if (entry.context) {
    try {
      size += JSON.stringify(entry.context).length;
    } catch {
      size += 128;
    }
  }
  return size;
}

/**
 * Trims one entry down to the per-entry limits.
 *
 * A context that cannot be serialised at all (circular, a BigInt) is replaced
 * with a note rather than thrown away silently or allowed to crash the logger.
 */
export function clampEntry(entry: RetainableEntry, limits: RetentionLimits): RetainableEntry {
  let message = entry.message;
  if (message.length > limits.maxMessageLength) {
    message = `${message.slice(0, limits.maxMessageLength)}… [truncated ${message.length - limits.maxMessageLength} chars]`;
  }

  let context = entry.context;
  if (context) {
    let serialised: string | null = null;
    try {
      serialised = JSON.stringify(context);
    } catch {
      context = { _note: "context could not be serialised" };
      serialised = null;
    }
    if (serialised !== null && serialised.length > limits.maxContextBytes) {
      context = {
        _note: `context omitted (${serialised.length} bytes exceeds the ${limits.maxContextBytes} byte limit)`,
      };
    }
  }

  return { ...entry, message, context };
}

export interface PruneResult {
  kept: RetainableEntry[];
  droppedByAge: number;
  droppedByCount: number;
  droppedByBytes: number;
  bytes: number;
}

/**
 * Applies every cap, oldest-first.
 *
 * Age is applied before the size caps so that expiring old entries can free
 * room rather than being masked by a count trim.
 */
export function prune(
  entries: readonly RetainableEntry[],
  limits: RetentionLimits,
  now: number = Date.now()
): PruneResult {
  const cutoff = now - limits.maxAgeMs;

  let working = entries.filter((e) => e.timestamp >= cutoff);
  const droppedByAge = entries.length - working.length;

  let droppedByCount = 0;
  if (working.length > limits.maxEntries) {
    droppedByCount = working.length - limits.maxEntries;
    working = working.slice(-limits.maxEntries);
  }

  // Walk backwards from newest, keeping entries until the byte budget runs out,
  // so what survives is always the most recent history.
  let bytes = 0;
  let cutIndex = 0;
  for (let i = working.length - 1; i >= 0; i--) {
    const size = entrySize(working[i]);
    if (bytes + size > limits.maxBytes) {
      cutIndex = i + 1;
      break;
    }
    bytes += size;
  }

  const droppedByBytes = cutIndex;
  const kept = cutIndex > 0 ? working.slice(cutIndex) : working;

  return { kept, droppedByAge, droppedByCount, droppedByBytes, bytes };
}
