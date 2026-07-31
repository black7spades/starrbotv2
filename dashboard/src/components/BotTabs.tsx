import { useEffect, useState, useRef } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../api/client";
import Icon, { type IconName } from "./Icon";

interface BotTabsProps {
  activeTab: string;
  bot: any;
}

const tabs: { id: string; label: string; icon: IconName }[] = [
  { id: "overview", label: "Overview", icon: "dashboard" },
  { id: "functions", label: "Functions", icon: "playground" },
  { id: "logs", label: "Logs", icon: "logs" },
];

export function BotTabs({ activeTab, bot }: BotTabsProps) {
  return (
    <div>
      <div className="flex border-b border-discord-border mb-6">
        {tabs.map((tab) => (
          <NavLink
            key={tab.id}
            to={`/bots/${bot.id}/${tab.id === "overview" ? "" : tab.id}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-discord-accent text-discord-accent"
                : "border-transparent text-discord-muted hover:text-discord-text"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Icon name={tab.icon} size={15} />
              {tab.label}
            </span>
          </NavLink>
        ))}
      </div>

      {activeTab === "overview" && <OverviewTab bot={bot} />}
      {activeTab === "functions" && <FunctionsTab bot={bot} />}
      {activeTab === "logs" && <LogsTab bot={bot} />}
    </div>
  );
}

function OverviewTab({ bot }: { bot: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Status" value={bot.status || "stopped"} icon="🟢" />
        <StatCard label="Servers" value={bot.guildCount || 0} icon="🏰" />
        <StatCard label="Functions" value={bot.functions?.length || 0} icon="🔧" />
        <StatCard label="Uptime" value={bot.runtime?.uptime ? formatUptime(bot.runtime.uptime) : "N/A"} icon="⏱️" />
      </div>

      {bot.guilds && bot.guilds.length > 0 && (
        <div className="p-4 bg-discord-card rounded-xl border border-discord-border">
          <h3 className="font-semibold mb-3">Discord Servers ({bot.guilds.length})</h3>
          <div className="space-y-2">
            {bot.guilds.map((guild: any) => (
              <div key={guild.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-discord-input">
                {guild.icon ? (
                  <img src={guild.icon} alt="" className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-discord-accent/20 flex items-center justify-center text-sm">
                    {guild.name?.charAt(0) ?? "?"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{guild.name}</p>
                  <p className="text-xs text-discord-muted">{guild.memberCount?.toLocaleString()} members</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Read-only view of what this bot is running.
 *
 * Editing deliberately does not happen here. Functions are configured in one
 * place — the Playground — because two editors for the same config drift apart
 * and it stops being obvious which one is authoritative. Each card links into
 * the Playground with this function and this bot already selected.
 */
function FunctionsTab({ bot }: { bot: any }) {
  const [manifests, setManifests] = useState<any[]>([]);

  useEffect(() => {
    api.get<any[]>("/api/functions").then(setManifests).catch(() => {});
  }, []);

  const botFnMap = new Map<string, any>((bot.functions || []).map((f: any) => [f.functionName, f]));

  if (manifests.length === 0) {
    return (
      <div className="text-center py-12 text-ink-muted">
        <p className="text-lg mb-1">No functions available</p>
        <p className="text-sm">No function packages are installed on this server.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-ink-muted">
          What <span className="text-ink font-medium">{bot.name}</span> is running. Configure in the
          Playground.
        </p>
        <NavLink to={`/playground?bot=${encodeURIComponent(bot.id)}`} className="btn-secondary text-xs">
          Open Playground
        </NavLink>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {manifests.map((m: any) => {
          const existing = botFnMap.get(m.name);
          const enabled = existing?.enabled ?? false;
          const state = !existing ? "off" : enabled ? "on" : "paused";
          const colour =
            state === "on"
              ? "var(--status-running)"
              : state === "paused"
                ? "var(--status-starting)"
                : "var(--status-stopped)";

          return (
            <NavLink
              key={m.name}
              to={`/playground?function=${encodeURIComponent(m.name)}&bot=${encodeURIComponent(bot.id)}`}
              className="glass glass-hover p-4 block"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold truncate text-ink">{m.label}</h3>
                  <p className="text-sm mt-0.5 text-ink-muted line-clamp-2">{m.description}</p>
                  {m.commands?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {m.commands.map((cmd: any) => (
                        <span key={cmd.name} className="chip display !text-[10px]">
                          /{cmd.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="chip shrink-0" style={{ color: colour }}>
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: colour }}
                    aria-hidden="true"
                  />
                  {state === "on" ? "Enabled" : state === "paused" ? "Configured" : "Not set up"}
                </span>
              </div>
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: any; icon: string }) {
  return (
    <div className="p-4 bg-discord-card rounded-xl border border-discord-border">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-discord-muted text-sm">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <span className="text-3xl">{icon}</span>
      </div>
    </div>
  );
}

function formatUptime(ms: number): string {
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const LOG_LEVEL_COLORS: Record<string, string> = {
  debug: "text-gray-400",
  info: "text-green-400",
  warn: "text-yellow-400",
  error: "text-red-400",
  fatal: "text-red-500 font-bold",
};

function LogsTab({ bot }: { bot: any }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [level, setLevel] = useState<string>("");
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const botSource = `bot:${bot.id}`;

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("source", botSource);
    if (level) params.set("level", level);
    params.set("limit", "200");

    fetch(`/api/events/logs?${params}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: any[]) => { setLogs(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [bot.id, level]);

  useEffect(() => {
    if (!live) return;
    const es = new EventSource("/api/events/logs/stream", { withCredentials: true });
    es.onmessage = (e) => {
      const entry = JSON.parse(e.data);
      if (entry.source === botSource || entry.source?.startsWith(`${botSource}:`)) {
        setLogs((prev) => {
          const next = [...prev, entry];
          return next.length > 500 ? next.slice(-500) : next;
        });
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [live, bot.id]);

  useEffect(() => {
    if (live) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, live]);

  return (
    <div className="space-y-3">
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
        </select>
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
        <span className="text-xs text-discord-muted ml-auto">{logs.length} entries</span>
      </div>

      {loading ? (
        <div className="text-center py-8 text-discord-muted text-sm">Loading logs...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-discord-muted text-sm">No logs for this bot yet.</div>
      ) : (
        <div className="bg-discord-input rounded-xl overflow-hidden font-mono text-sm">
          <div className="h-80 overflow-y-auto p-3 space-y-0.5">
            {logs.map((log: any) => (
              <div key={log.id} className="flex gap-2 text-xs leading-relaxed hover:bg-discord-card/50 px-1 rounded">
                <span className="shrink-0 text-discord-muted w-20">{new Date(log.timestamp).toLocaleTimeString()}</span>
                <span className={`shrink-0 w-12 text-right uppercase ${LOG_LEVEL_COLORS[log.level] || "text-discord-muted"}`}>
                  {log.level}
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
