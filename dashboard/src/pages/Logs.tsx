import { useEffect, useState, useRef } from "react";

interface LogEntry {
  id: number;
  timestamp: number;
  level: "debug" | "info" | "warn" | "error" | "fatal";
  message: string;
  source: string;
  context?: Record<string, unknown>;
}

const LEVEL_COLORS: Record<string, string> = {
  debug: "text-gray-400",
  info: "text-green-400",
  warn: "text-yellow-400",
  error: "text-red-400",
  fatal: "text-red-500 font-bold",
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

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [level, setLevel] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">System Logs</h1>
        <div className="flex items-center gap-3">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="px-3 py-1.5 bg-discord-input border border-discord-border rounded-lg text-sm text-discord-text"
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
            className="px-3 py-1.5 bg-discord-input border border-discord-border rounded-lg text-sm text-discord-text w-40"
          />
          <button
            onClick={() => setLive(!live)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              live
                ? "bg-discord-green/20 text-discord-green border border-discord-green/30"
                : "bg-discord-muted/20 text-discord-muted border border-discord-border"
            }`}
          >
            {live ? "● Live" : "○ Paused"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-discord-muted">Loading logs...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-discord-muted">
          <p className="text-lg mb-1">No logs yet</p>
          <p className="text-sm">Logs appear here when the system is running.</p>
        </div>
      ) : (
        <div className="bg-discord-input rounded-xl overflow-hidden font-mono text-sm">
          <div className="p-3 border-b border-discord-border flex items-center justify-between">
            <span className="text-discord-muted text-xs">{filtered.length} entries</span>
          </div>
          <div className="h-[calc(100vh-220px)] overflow-y-auto p-3 space-y-0.5">
            {filtered.map((log) => (
              <div key={log.id} className="flex gap-2 text-xs leading-relaxed hover:bg-discord-card/50 px-1 rounded">
                <span className="shrink-0 text-discord-muted w-20">{new Date(log.timestamp).toLocaleTimeString()}</span>
                <span className={`shrink-0 w-12 text-right uppercase ${LEVEL_COLORS[log.level] || "text-discord-muted"}`}>
                  {log.level}
                </span>
                <span className={`shrink-0 w-24 truncate ${sourceColor(log.source)}`}>{log.source}</span>
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
