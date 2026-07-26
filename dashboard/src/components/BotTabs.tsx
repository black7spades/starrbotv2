import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { api } from "../api/client";

interface BotTabsProps {
  activeTab: string;
  bot: any;
}

const tabs = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "functions", label: "Functions", icon: "🔧" },
  { id: "logs", label: "Logs", icon: "📝" },
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
              <span>{tab.icon}</span>
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
                    {guild.name.charAt(0)}
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

function FunctionsTab({ bot }: { bot: any }) {
  const navigate = useNavigate();
  const [manifests, setManifests] = useState<any[]>([]);

  useEffect(() => {
    api.get<any[]>("/api/functions").then(setManifests).catch(() => {});
  }, []);

  const botFnMap = new Map<string, any>((bot.functions || []).map((f: any) => [f.functionName, f]));

  if (manifests.length === 0 && (!bot.functions || bot.functions.length === 0)) {
    return (
      <div className="text-center py-12 text-discord-muted">
        <p className="text-xl mb-2">🔧 No functions available</p>
        <p className="text-sm">No function packages are installed on this server.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {manifests.map((m: any) => {
          const existing = botFnMap.get(m.name);
          const enabled = existing?.enabled ?? false;
          return (
            <button
              key={m.name}
              onClick={() => navigate(`/bots/${bot.id}/functions/${m.name}`)}
              className="text-left p-4 bg-discord-card rounded-xl border border-discord-border hover:border-discord-accent/50 transition-colors"
            >
                <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl shrink-0">{m.icon || "🔧"}</span>
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{m.label}</h3>
                    <p className="text-sm text-discord-muted line-clamp-2">{m.description}</p>
                    {m.commands && m.commands.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {m.commands.map((cmd: any) => (
                          <span key={cmd.name} className="px-1.5 py-0.5 bg-discord-accent/10 text-discord-accent rounded text-xs font-mono">
                            /{cmd.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {existing ? (
                  <span className={`shrink-0 px-2 py-1 rounded text-xs font-medium ${
                    enabled ? "bg-discord-green/20 text-discord-green" : "bg-discord-muted/20 text-discord-muted"
                  }`}>
                    {enabled ? "Enabled" : "Disabled"}
                  </span>
                ) : (
                  <span className="shrink-0 px-2 py-1 rounded text-xs font-medium bg-discord-accent/20 text-discord-accent">
                    Add
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LogsTab({ bot }: { bot: any }) {
  const logs: any[] = bot.logs || [];

  if (logs.length === 0) {
    return (
      <div className="h-96 bg-discord-input rounded-xl overflow-hidden flex items-center justify-center text-discord-muted">
        <div className="text-center">
          <p className="text-lg mb-1">No logs yet</p>
          <p className="text-sm">Logs will appear here when the bot is running.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-discord-input rounded-xl overflow-hidden font-mono text-sm">
      <div className="p-3 border-b border-discord-border flex items-center justify-between">
        <span className="text-discord-muted text-xs">Last {logs.length} entries</span>
      </div>
      <div className="h-96 overflow-y-auto p-3 space-y-1">
        {logs.slice().reverse().map((log: any, i: number) => (
          <div key={i} className={`flex gap-2 text-xs leading-relaxed ${
            log.level === "error" ? "text-red-400" :
            log.level === "warn" ? "text-yellow-400" :
            "text-discord-muted"
          }`}>
            <span className="shrink-0 text-discord-muted">{new Date(log.timestamp).toLocaleTimeString()}</span>
            <span className={`shrink-0 w-12 text-right ${
              log.level === "error" ? "text-red-400" :
              log.level === "warn" ? "text-yellow-400" :
              "text-green-400"
            }`}>{log.level}</span>
            <span className="break-all">{log.message}</span>
          </div>
        ))}
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