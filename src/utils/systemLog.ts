import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, statSync } from "fs";
import { join } from "path";
import { EventEmitter } from "events";
import {
  DEFAULT_LIMITS,
  clampEntry,
  entrySize,
  prune,
  type RetentionLimits,
} from "./logRetention";

export interface LogEntry {
  id: number;
  timestamp: number;
  level: "debug" | "info" | "warn" | "error" | "fatal";
  message: string;
  source: string;
  context?: Record<string, unknown>;
}

// Same override the config store uses, so tests and alternative deployments
// keep every piece of state in one place.
const DATA_DIR = process.env.STARRBOT_DATA_DIR || join(__dirname, "../../data");
const LOGS_FILE = join(DATA_DIR, "system-logs.json");

/** How often retention is applied and the file is written, if anything changed. */
const FLUSH_INTERVAL_MS = 30_000;

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Limits are overridable so an operator can tighten them without a rebuild. */
export function limitsFromEnv(): RetentionLimits {
  return {
    maxEntries: envNumber("LOG_MAX_ENTRIES", DEFAULT_LIMITS.maxEntries),
    maxBytes: envNumber("LOG_MAX_BYTES", DEFAULT_LIMITS.maxBytes),
    maxAgeMs: envNumber("LOG_MAX_AGE_DAYS", DEFAULT_LIMITS.maxAgeMs / 86_400_000) * 86_400_000,
    maxMessageLength: DEFAULT_LIMITS.maxMessageLength,
    maxContextBytes: DEFAULT_LIMITS.maxContextBytes,
  };
}

export interface LogStats {
  entries: number;
  bytes: number;
  oldest: number | null;
  newest: number | null;
  fileBytes: number;
  /** Totals since this process started. */
  dropped: { age: number; count: number; bytes: number };
  limits: RetentionLimits;
}

/**
 * Bounded system log.
 *
 * Previously this kept a count-capped array and rewrote the whole file every 30
 * seconds whether or not anything had changed. A count cap is not a size cap —
 * one entry with a large context could be megabytes — and the unconditional
 * rewrite meant constant disk writes on an idle server. It also wrote
 * non-atomically, so a crash mid-write left corrupt JSON, which `load` then
 * discarded, silently losing the entire history.
 */
class SystemLog extends EventEmitter {
  private entries: LogEntry[] = [];
  private nextId = 1;
  private bytes = 0;
  private dirty = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private limits: RetentionLimits = limitsFromEnv();
  private dropped = { age: 0, count: 0, bytes: 0 };

  constructor() {
    super();
    this.load();
    this.flushTimer = setInterval(() => this.maintain(), FLUSH_INTERVAL_MS);
    // Retention must not hold the process open at shutdown.
    this.flushTimer.unref?.();
  }

  private load(): void {
    try {
      if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
      if (!existsSync(LOGS_FILE)) return;

      const data = JSON.parse(readFileSync(LOGS_FILE, "utf8")) as LogEntry[];
      // Apply retention on load: limits may have been tightened since, and a
      // file written by an older build could be any size.
      const result = prune(Array.isArray(data) ? data : [], this.limits);
      this.entries = result.kept as LogEntry[];
      this.bytes = result.bytes;
      this.nextId =
        this.entries.length > 0 ? this.entries[this.entries.length - 1].id + 1 : 1;
      this.dirty = result.droppedByAge + result.droppedByCount + result.droppedByBytes > 0;
    } catch {
      this.entries = [];
      this.bytes = 0;
    }
  }

  add(
    level: LogEntry["level"],
    message: string,
    source: string,
    context?: Record<string, unknown>
  ): LogEntry {
    const entry = clampEntry(
      {
        id: this.nextId++,
        timestamp: Date.now(),
        level,
        message,
        source,
        context,
      },
      this.limits
    ) as LogEntry;

    this.entries.push(entry);
    this.bytes += entrySize(entry);
    this.dirty = true;

    // Cheap incremental trim on the hot path; the full sweep (age, bytes)
    // happens on the timer so logging never pays for it.
    while (
      this.entries.length > this.limits.maxEntries ||
      this.bytes > this.limits.maxBytes
    ) {
      const evicted = this.entries.shift();
      if (!evicted) break;
      this.bytes -= entrySize(evicted);
      if (this.entries.length >= this.limits.maxEntries) this.dropped.count++;
      else this.dropped.bytes++;
    }

    this.emit("log", entry);
    return entry;
  }

  /** Applies every retention rule, then persists only if something changed. */
  maintain(): void {
    const result = prune(this.entries, this.limits);
    if (result.droppedByAge || result.droppedByCount || result.droppedByBytes) {
      this.entries = result.kept as LogEntry[];
      this.dropped.age += result.droppedByAge;
      this.dropped.count += result.droppedByCount;
      this.dropped.bytes += result.droppedByBytes;
      this.dirty = true;
    }
    this.bytes = result.bytes;
    if (this.dirty) this.flush();
  }

  flush(): void {
    try {
      if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
      // Temp file then rename, so a crash mid-write cannot leave corrupt JSON
      // that load() would discard along with the whole history.
      const tmp = `${LOGS_FILE}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.entries));
      renameSync(tmp, LOGS_FILE);
      this.dirty = false;
    } catch {
      // Never let a logging failure take the process down.
    }
  }

  getAll(
    opts: { limit?: number; level?: string; source?: string; since?: number } = {}
  ): LogEntry[] {
    let result = this.entries;
    const { since, level, source } = opts;
    if (since !== undefined) result = result.filter((e) => e.timestamp >= since);
    if (level) result = result.filter((e) => e.level === level);
    if (source) result = result.filter((e) => e.source.startsWith(source));
    return result.slice(-(opts.limit || 500));
  }

  getRecent(count: number = 100): LogEntry[] {
    return this.entries.slice(-count);
  }

  stats(): LogStats {
    let fileBytes = 0;
    try {
      if (existsSync(LOGS_FILE)) fileBytes = statSync(LOGS_FILE).size;
    } catch {
      // Reporting zero is better than failing the stats call.
    }
    return {
      entries: this.entries.length,
      bytes: this.bytes,
      oldest: this.entries[0]?.timestamp ?? null,
      newest: this.entries[this.entries.length - 1]?.timestamp ?? null,
      fileBytes,
      dropped: { ...this.dropped },
      limits: { ...this.limits },
    };
  }

  clear(): void {
    this.entries = [];
    this.bytes = 0;
    this.dirty = true;
    this.flush();
  }

  close(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
    this.flush();
  }
}

export const systemLog = new SystemLog();
