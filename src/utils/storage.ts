/**
 * What the app is keeping on disk, and the sweep that keeps it bounded.
 *
 * Every growing thing lives under the data directory, so a single walk gives an
 * honest total. Before this existed the only way to find out why a volume was
 * filling up was to shell into the container, which meant nobody ever did.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from "fs";
import { join } from "path";
import { systemLog, type LogStats } from "./systemLog";
import { pruneTranscripts, transcriptUsage } from "functions/tickets/transcript";

const DATA_DIR = process.env.STARRBOT_DATA_DIR || join(__dirname, "../../data");

export interface StorageEntry {
  name: string;
  bytes: number;
  /** Number of records or files, where that means something. */
  items: number | null;
  /** Timestamp of the oldest thing held, if known. */
  oldest: number | null;
  description: string;
}

export interface StorageReport {
  dataDir: string;
  totalBytes: number;
  entries: StorageEntry[];
  log: LogStats;
  /** Stale temp files left by an interrupted atomic write. */
  strayTempFiles: number;
}

function fileBytes(path: string): number {
  try {
    return existsSync(path) ? statSync(path).size : 0;
  } catch {
    return 0;
  }
}

function jsonCount(path: string): number | null {
  try {
    if (!existsSync(path)) return 0;
    // Counting via the file avoids importing the store and its side effects.
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed && typeof parsed === "object") return Object.keys(parsed).length;
    return null;
  } catch {
    return null;
  }
}

/**
 * Temp files are named `<file>.<pid>.tmp` by the atomic writers. One that
 * outlives its process means a crash mid-write; it is dead weight and safe to
 * remove, but worth reporting because a growing count means repeated crashes.
 */
function listStrayTempFiles(): string[] {
  try {
    return readdirSync(DATA_DIR)
      .filter((n) => n.endsWith(".tmp"))
      .map((n) => join(DATA_DIR, n));
  } catch {
    return [];
  }
}

export function storageReport(): StorageReport {
  if (!existsSync(DATA_DIR)) {
    try {
      mkdirSync(DATA_DIR, { recursive: true });
    } catch {
      // A read-only data dir is the operator's problem, not a crash.
    }
  }

  const logStats = systemLog.stats();
  const transcripts = transcriptUsage();

  const entries: StorageEntry[] = [
    {
      name: "System log",
      bytes: logStats.fileBytes,
      items: logStats.entries,
      oldest: logStats.oldest,
      description: "Application log shown on this page. Capped by count, size and age.",
    },
    {
      name: "Ticket transcripts",
      bytes: transcripts.bytes,
      items: transcripts.files,
      oldest: transcripts.oldest,
      description: "The durable record of every closed ticket. Kept forever unless you set a retention period.",
    },
    {
      name: "Ticket index",
      bytes: fileBytes(join(DATA_DIR, "tickets-log.json")),
      items: jsonCount(join(DATA_DIR, "tickets-log.json")),
      oldest: null,
      description: "One row per closed ticket, capped at the most recent 5,000.",
    },
    {
      name: "Posted updates",
      bytes: fileBytes(join(DATA_DIR, "posted-urls.json")),
      items: jsonCount(join(DATA_DIR, "posted-urls.json")),
      oldest: null,
      description: "Seen feed URLs, so the same item is never posted twice. Capped per bot.",
    },
    {
      name: "Refresh tokens",
      bytes: fileBytes(join(DATA_DIR, "refresh-tokens.json")),
      items: jsonCount(join(DATA_DIR, "refresh-tokens.json")),
      oldest: null,
      description: "Active dashboard sessions. Expired tokens are swept out.",
    },
    {
      name: "Configuration",
      bytes:
        fileBytes(join(DATA_DIR, "bots.json")) +
        fileBytes(join(DATA_DIR, "bot-functions.json")) +
        fileBytes(join(DATA_DIR, "users.json")) +
        fileBytes(join(DATA_DIR, "settings.json")) +
        fileBytes(join(DATA_DIR, "templates.json")),
      items: null,
      oldest: null,
      description: "Bots, functions, users and settings. Does not grow on its own.",
    },
  ];

  const strays = listStrayTempFiles();

  return {
    dataDir: DATA_DIR,
    totalBytes:
      entries.reduce((sum, e) => sum + e.bytes, 0) +
      strays.reduce((sum, p) => sum + fileBytes(p), 0),
    entries,
    log: logStats,
    strayTempFiles: strays.length,
  };
}

export interface SweepResult {
  logEntriesDropped: number;
  transcriptsDeleted: number;
  tempFilesRemoved: number;
  freedBytes: number;
}

/**
 * Applies every retention rule now, rather than waiting for the timer.
 *
 * `transcriptMaxAgeDays` is opt-in: zero (the default) keeps transcripts
 * forever, because they are the only record of what was said in a ticket.
 */
export function sweep(transcriptMaxAgeDays: number = 0): SweepResult {
  const before = storageReport();

  const logBefore = before.log.entries;
  systemLog.maintain();
  const logAfter = systemLog.stats().entries;

  const transcriptsDeleted = pruneTranscripts(transcriptMaxAgeDays);

  let tempFilesRemoved = 0;
  for (const path of listStrayTempFiles()) {
    try {
      unlinkSync(path);
      tempFilesRemoved++;
    } catch {
      // A temp file another process is still writing will fail here; fine.
    }
  }

  const after = storageReport();

  return {
    logEntriesDropped: Math.max(0, logBefore - logAfter),
    transcriptsDeleted,
    tempFilesRemoved,
    freedBytes: Math.max(0, before.totalBytes - after.totalBytes),
  };
}

/** How often the background sweep runs. */
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

let sweepTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Runs the sweep on a schedule so disk use stays bounded without anyone
 * pressing a button. The system log caps itself continuously; this is what
 * clears stray temp files and applies an optional transcript retention period.
 *
 * `TRANSCRIPT_MAX_AGE_DAYS` is unset by default, which keeps transcripts
 * forever — deleting a ticket's only record should never be a default.
 */
export function startMaintenance(): void {
  if (sweepTimer) return;

  const days = Number(process.env.TRANSCRIPT_MAX_AGE_DAYS || 0);
  const run = () => {
    const result = sweep(Number.isFinite(days) && days > 0 ? days : 0);
    if (result.freedBytes > 0 || result.tempFilesRemoved > 0 || result.transcriptsDeleted > 0) {
      systemLog.add("info", "Scheduled storage sweep", "system", { ...result });
    }
  };

  // Once at startup, because a crash may have left temp files behind.
  run();
  sweepTimer = setInterval(run, SWEEP_INTERVAL_MS);
  sweepTimer.unref?.();
}

export function stopMaintenance(): void {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
}
