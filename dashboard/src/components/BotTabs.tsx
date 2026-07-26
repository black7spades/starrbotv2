import { useState } from "react";
import { NavLink } from "react-router-dom";

interface BotTabsProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  bot: any;
  isAdmin: boolean;
}

const tabs = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "functions", label: "Functions", icon: "🔧" },
  { id: "logs", label: "Logs", icon: "📝" },
];

export function BotTabs({ activeTab, setActiveTab, bot, isAdmin }: BotTabsProps) {
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
      {activeTab === "functions" && <FunctionsTab bot={bot} isAdmin={isAdmin} />}
      {activeTab === "logs" && <LogsTab botId={bot.id} />}
    </div>
  );
}

function OverviewTab({ bot }: { bot: any }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard label="Status" value={bot.status} icon="🟢" />
      <StatCard label="Guilds" value={bot.guildCount} icon="🏰" />
      <StatCard label="Functions" value={bot.functions?.length || 0} icon="🔧" />
      <StatCard label="Uptime" value={bot.runtime?.uptime ? formatUptime(bot.runtime.uptime) : "N/A"} icon="⏱️" />
    </div>
  );
}

function FunctionsTab({ bot, isAdmin }: { bot: any; isAdmin: boolean }) {
  if (!bot.functions || bot.functions.length === 0) {
    return (
      <div className="text-center py-12 text-discord-muted">
        <p className="text-xl mb-2">🔧 No functions configured</p>
        <p>Enable functions from the Settings page</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {bot.functions.map((fn: any) => (
        <FunctionCard key={fn.functionName} fn={fn} isAdmin={isAdmin} />
      ))}
    </div>
  );
}

function FunctionCard({ fn, isAdmin }: { fn: any; isAdmin: boolean }) {
  return (
    <div className="p-4 bg-discord-card rounded-xl border border-discord-border">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{fn.manifest?.icon || "🔧"}</span>
          <div>
            <h3 className="font-semibold">{fn.manifest?.label || fn.functionName}</h3>
            <p className="text-sm text-discord-muted">{fn.manifest?.description}</p>
          </div>
        </div>
        <span
          className={`px-2 py-1 rounded text-xs font-medium ${
            fn.enabled
              ? "bg-discord-green/20 text-discord-green"
              : "bg-discord-muted/20 text-discord-muted"
          }`}
        >
          {fn.enabled ? "Enabled" : "Disabled"}
        </span>
      </div>

      {fn.enabled && (
        <div className="space-y-2 text-sm">
          <p className="text-discord-muted">
            {fn.config ? Object.keys(fn.config).length : 0} settings configured
          </p>
        </div>
      )}
    </div>
  );
}

function LogsTab({ botId }: { botId: string }) {
  return (
    <div className="h-96 bg-discord-input rounded-xl overflow-hidden font-mono text-sm">
      <div className="p-4 text-discord-muted text-center">
        Real-time logs via SSE - connect to /api/bots/{botId}/logs
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
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}