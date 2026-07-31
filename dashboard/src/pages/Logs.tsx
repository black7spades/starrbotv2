import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";

interface LogEntry {
  id: number;
  timestamp: number;
  level: "debug" | "info" | "warn" | "error" | "fatal";
  message: string;
  source: string;
  context?: Record<string, unknown>;
}

interface StorageEntry {
  name: string;
  bytes: number;
  items: number | null;
  oldest: number | null;
  description: string;
}

interface StorageReport {
  dataDir: string;
  totalBytes: number;
  entries: StorageEntry[];
  strayTempFiles: number;
  log: {
    entries: number;
    bytes: number;
    oldest: number | null;
    newest: number | null;
    fileBytes: number;
    dropped: { age: number; count: number; bytes: number };
    limits: {
      maxEntries: number;
      maxBytes: number;
      maxAgeMs: number;
      maxMessageLength: number;
      maxContextBytes: number;
    };
  };
}

const LEVEL_COLORS: Record<string, string> = {
  debug: "text-discord-muted",
  info: "text-discord-green",
  warn: "text-yellow-400",
  error: "text-discord-red",
  fatal: "text-discord-red font-bold",
};

const SOURCE_COLORS: Record<string, string> = {
  system: "text-blue-400",
  api: "text-purple-400",
};

function sourceColor(source: string): string {
  if (source.startsWith("bot:")) return "text-cyan-400";
  if (source.startsWith("function:")) return "text-orange-400";
  return SOURCE_COLORS[source] || "text-discord-muted";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAge(timestamp: number | null): string {
  if (!timestamp) return "—";
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (days >= 1) return `${days}d old`;
  const hours = Math.floor((Date.now() - timestamp) / 3_600_000);
  if (hours >= 1) return `${hours}h old`;
  return "just now";
}

/**
 * Storage panel.
 *
 * The system log is the only thing here with a hard ceiling, so it gets a real
 * usage bar against its limits. Everything else is reported as a size so a
 * volume filling up is visible from the dashboard rather than only from a shell
 * inside the container.
 */
function StoragePanel({
  report,
  onChanged,
}: {
  report: StorageReport;
  onChanged: (next: StorageReport) => void;
}) {
  const [busy, setBusy] = useState<"sweep" | "clear" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const { log } = report;
  // Whichever cap is closest to binding is the one worth showing.
  const byCount = log.limits.maxEntries > 0 ? log.entries / log.limits.maxEntries : 0;
  const byBytes = log.limits.maxBytes > 0 ? log.bytes / log.limits.maxBytes : 0;
  const usage = Math.min(1, Math.max(byCount, byBytes));
  const binding = byBytes > byCount ? "size" : "entries";

  const sweep = async () => {
    setBusy("sweep");
    setNote(null);
    try {
      const res = await fetch("/api/events/logs/sweep", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      onChanged(data.storage);
      setNote(
        data.freedBytes > 0 || data.logEntriesDropped > 0 || data.tempFilesRemoved > 0
          ? `Freed ${formatBytes(data.freedBytes)} — ${data.logEntriesDropped} log entries, ${data.tempFilesRemoved} temp files.`
          : "Nothing to reclaim. Everything is already inside its limits."
      );
    } catch {
      setNote("Sweep failed. Admin access is required.");
    } finally {
      setBusy(null);
    }
  };

  const clear = async () => {
    if (!confirm("Clear the system log? Transcripts and configuration are not affected.")) return;
    setBusy("clear");
    setNote(null);
    try {
      const res = await fetch("/api/events/logs", { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      onChanged(data.storage);
      setNote(`Cleared ${data.cleared} entries.`);
    } catch {
      setNote("Clear failed. Admin access is required.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="glass-panel space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-discord-muted">
          <Icon name="database" size={16} />
          Storage — {formatBytes(report.totalBytes)}
        </h2>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={sweep} disabled={busy !== null}>
            <Icon name={busy === "sweep" ? "spinner" : "broom"} size={15} />
            Sweep now
          </button>
          <button className="btn-danger" onClick={clear} disabled={busy !== null}>
            <Icon name={busy === "clear" ? "spinner" : "trash"} size={15} />
            Clear log
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-discord-muted">
          <span>
            System log — {log.entries.toLocaleString()} of{" "}
            {log.limits.maxEntries.toLocaleString()} entries,{" "}
            {formatBytes(log.bytes)} of {formatBytes(log.limits.maxBytes)}
          </span>
          <span>
            {Math.round(usage * 100)}% of the {binding} limit
          </span>
        </div>
        <div
          className="h-2 rounded-full overflow-hidden"
          style={{ background: "var(--surface-strong)" }}
          role="progressbar"
          aria-valuenow={Math.round(usage * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="System log usage"
        >
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${Math.max(1, usage * 100)}%`,
              background: usage > 0.9 ? "var(--status-error)" : "var(--accent)",
            }}
          />
        </div>
        <p className="text-xs text-discord-muted">
          Entries older than {Math.round(log.limits.maxAgeMs / 86_400_000)} days are dropped
          automatically. Since this process started, retention has discarded{" "}
          {(log.dropped.age + log.dropped.count + log.dropped.bytes).toLocaleString()} entries
          {log.dropped.age > 0 ? ` (${log.dropped.age.toLocaleString()} on age)` : ""}.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {report.entries.map((entry) => (
          <div
            key={entry.name}
            className="rounded-glass-sm px-3 py-2 border"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            title={entry.description}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm">{entry.name}</span>
              <span className="text-sm font-mono">{formatBytes(entry.bytes)}</span>
            </div>
            <div className="text-xs text-discord-muted">
              {entry.items !== null ? `${entry.items.toLocaleString()} items` : "fixed size"}
              {entry.oldest ? ` · oldest ${formatAge(entry.oldest)}` : ""}
            </div>
          </div>
        ))}
      </div>

      {report.strayTempFiles > 0 && (
        <p className="text-xs text-yellow-400 flex items-center gap-1.5">
          <Icon name="alert" size={14} />
          {report.strayTempFiles} leftover temp file(s) from an interrupted write. Sweep removes
          them.
        </p>
      )}

      {note && <p className="text-xs text-discord-muted">{note}</p>}
    </section>
  );
}

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [level, setLevel] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [storage, setStorage] = useState<StorageReport | null>(null);
  const [showStorage, setShowStorage] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadStorage = useCallback(() => {
    fetch("/api/events/logs/storage", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: StorageReport | null) => data && setStorage(data))
      .catch(() => undefined);
  }, []);

  // Load initial logs
  useEffect(() => {
    const params = new URLSearchParams();
    if (level) params.set("level", level);
    if (source) params.set("source", source);
    params.set("limit", "500");

    fetch(`/api/events/logs?${params}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: LogEntry[]) => {
        setLogs(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [level, source]);

  useEffect(() => {
    loadStorage();
  }, [loadStorage]);

  // Refresh the storage figures periodically, but only while the panel is open —
  // there is no reason to poll a panel nobody is looking at.
  useEffect(() => {
    if (!showStorage) return;
    const id = setInterval(loadStorage, 30_000);
    return () => clearInterval(id);
  }, [showStorage, loadStorage]);

  // SSE for live logs
  useEffect(() => {
    if (!live) return;

    const es = new EventSource("/api/events/logs/stream", { withCredentials: true });
    es.onmessage = (e) => {
      const entry = JSON.parse(e.data) as LogEntry;
      setLogs((prev) => {
        const next = [...prev, entry];
        return next.length > 1000 ? next.slice(-1000) : next;
      });
    };
    es.onerror = () => es.close();

    return () => es.close();
  }, [live]);

  // Auto-scroll
  useEffect(() => {
    if (live) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, live]);

  const filtered = logs.filter((l) => {
    if (level && l.level !== level) return false;
    if (source && !l.source.startsWith(source)) return false;
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">System Logs</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowStorage((v) => !v)}
            className="btn-secondary"
            aria-expanded={showStorage}
          >
            <Icon name="database" size={15} />
            {storage ? formatBytes(storage.totalBytes) : "Storage"}
          </button>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="field w-auto"
          >
            <option value="">All levels</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
            <option value="fatal">Fatal</option>
          </select>
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Filter by source..."
            className="field w-40"
          />
          <button
            onClick={() => setLive(!live)}
            className={`px-3 py-1.5 rounded-glass-sm text-sm font-medium border transition-colors ${
              live
                ? "bg-discord-green/20 text-discord-green border-discord-green/30"
                : "bg-discord-muted/20 text-discord-muted border-discord-border"
            }`}
          >
            {live ? "● Live" : "○ Paused"}
          </button>
        </div>
      </div>

      {showStorage && storage && <StoragePanel report={storage} onChanged={setStorage} />}

      {loading ? (
        <div className="text-center py-12 text-discord-muted">Loading logs...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-discord-muted">
          <p className="text-lg mb-1">No logs yet</p>
          <p className="text-sm">Logs appear here when the system is running.</p>
        </div>
      ) : (
        <div className="bg-discord-input rounded-glass overflow-hidden font-mono text-sm">
          <div className="p-3 border-b border-discord-border flex items-center justify-between">
            <span className="text-discord-muted text-xs">{filtered.length} entries</span>
          </div>
          <div
            className={`overflow-y-auto p-3 space-y-0.5 ${
              showStorage ? "h-[calc(100vh-560px)] min-h-[200px]" : "h-[calc(100vh-220px)]"
            }`}
          >
            {filtered.map((log) => (
              <div
                key={log.id}
                className="flex gap-2 text-xs leading-relaxed hover:bg-discord-card/50 px-1 rounded"
              >
                <span className="shrink-0 text-discord-muted w-20">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className={`shrink-0 w-12 text-right uppercase ${
                    LEVEL_COLORS[log.level] || "text-discord-muted"
                  }`}
                >
                  {log.level}
                </span>
                <span className={`shrink-0 w-24 truncate ${sourceColor(log.source)}`}>
                  {log.source}
                </span>
                <span className="break-all text-discord-text">{log.message}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>
      )}
    </div>
  );
}
