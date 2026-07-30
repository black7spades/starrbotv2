import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { EventEmitter } from "events";

export interface LogEntry {
  id: number;
  timestamp: number;
  level: "debug" | "info" | "warn" | "error" | "fatal";
  message: string;
  source: string;
  context?: Record<string, unknown>;
}

const MAX_ENTRIES = 5000;
const DATA_DIR = join(__dirname, "../../data");
const LOGS_FILE = join(DATA_DIR, "system-logs.json");

class SystemLog extends EventEmitter {
  private entries: LogEntry[] = [];
  private nextId = 1;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.load();
    this.flushTimer = setInterval(() => this.flush(), 30000);
  }

  private load(): void {
    try {
      if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
      if (existsSync(LOGS_FILE)) {
        const data = JSON.parse(readFileSync(LOGS_FILE, "utf8")) as LogEntry[];
        this.entries = data.slice(-MAX_ENTRIES);
        this.nextId = this.entries.length > 0 ? this.entries[this.entries.length - 1].id + 1 : 1;
      }
    } catch {
      this.entries = [];
    }
  }

  flush(): void {
    try {
      if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(LOGS_FILE, JSON.stringify(this.entries.slice(-MAX_ENTRIES)));
    } catch {
      // don't crash on log flush failure
    }
  }

  add(level: LogEntry["level"], message: string, source: string, context?: Record<string, unknown>): LogEntry {
    const entry: LogEntry = {
      id: this.nextId++,
      timestamp: Date.now(),
      level,
      message,
      source,
      context,
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.shift();
    this.emit("log", entry);
    return entry;
  }

  getAll(opts: { limit?: number; level?: string; source?: string; since?: number } = {}): LogEntry[] {
    let result = this.entries;
    // Bind the narrowed values into locals so the callbacks don't re-widen to
    // `number | undefined` / `string | undefined`.
    const { since, level, source } = opts;
    if (since !== undefined) result = result.filter((e) => e.timestamp >= since);
    if (level) result = result.filter((e) => e.level === level);
    if (source) result = result.filter((e) => e.source.startsWith(source));
    return result.slice(-(opts.limit || 500));
  }

  getRecent(count: number = 100): LogEntry[] {
    return this.entries.slice(-count);
  }

  clear(): void {
    this.entries = [];
    this.flush();
  }

  close(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flush();
  }
}

export const systemLog = new SystemLog();
