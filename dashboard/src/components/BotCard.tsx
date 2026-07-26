import { Link } from "react-router-dom";

interface BotCardProps {
  bot: {
    id: string;
    name: string;
    avatarUrl?: string;
    enabled: boolean;
    status: string;
    error?: string | null;
    guildCount: number;
    activeFunctions: string[];
  };
}

const STATUS_COLORS = {
  running: "text-discord-green",
  starting: "text-yellow-400",
  stopped: "text-discord-muted",
  error: "text-discord-red",
};

const STATUS_LABELS = {
  running: "Running",
  starting: "Starting",
  stopped: "Stopped",
  error: "Error",
};

const FUNCTION_ICONS: Record<string, string> = {
  updates: "📡",
  tickets: "🎫",
};

export function BotCard({ bot }: BotCardProps) {
  const statusClass = STATUS_COLORS[bot.status as keyof typeof STATUS_COLORS] || "text-discord-muted";

  return (
    <Link to={`/bots/${bot.id}`} className="group">
      <div className="bot-card bg-discord-card rounded-xl border border-discord-border p-5 hover:border-discord-accent/50 transition-colors">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {bot.avatarUrl ? (
              <img src={bot.avatarUrl} alt={bot.name} className="w-10 h-10 rounded-lg" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-discord-accent/20 flex items-center justify-center text-xl">
                🤖
              </div>
            )}
            <div>
              <h3 className="font-semibold truncate max-w-[160px]">{bot.name}</h3>
              <p className="text-xs text-discord-muted">{bot.id}</p>
            </div>
          </div>
          <span className={`status-dot ${statusClass}`}>
            <span className="sr-only">{STATUS_LABELS[bot.status as keyof typeof STATUS_LABELS]}</span>
          </span>
        </div>

        {bot.error && (
          <div className="mb-4 p-3 rounded-lg bg-discord-red/10 border border-discord-red/20 text-discord-red text-sm">
            {bot.error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-discord-bg/50 rounded-lg p-3">
            <p className="text-xs text-discord-muted uppercase tracking-wide">Guilds</p>
            <p className="text-2xl font-bold">{bot.guildCount}</p>
          </div>
          <div className="bg-discord-bg/50 rounded-lg p-3">
            <p className="text-xs text-discord-muted uppercase tracking-wide">Functions</p>
            <p className="text-2xl font-bold">{bot.activeFunctions.length}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {bot.activeFunctions.map((fn) => (
            <span
              key={fn}
              className="px-2 py-1 text-xs rounded-full bg-discord-accent/20 text-discord-accent flex items-center gap-1"
            >
              {FUNCTION_ICONS[fn] || "⚙️"}
              {fn}
            </span>
          ))}
          {bot.activeFunctions.length === 0 && (
            <span className="px-2 py-1 text-xs rounded-full bg-discord-muted/20 text-discord-muted">
              No functions
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// Skeleton for loading state
export function BotCardSkeleton() {
  return (
    <div className="bot-card bg-discord-card rounded-xl border border-discord-border p-5 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-discord-input" />
        <div className="flex-1">
          <div className="h-4 w-32 bg-discord-input rounded mb-2" />
          <div className="h-3 w-24 bg-discord-input rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="h-16 bg-discord-input rounded-lg" />
        <div className="h-16 bg-discord-input rounded-lg" />
      </div>
      <div className="flex gap-2">
        <div className="h-6 w-20 bg-discord-input rounded-full" />
        <div className="h-6 w-20 bg-discord-input rounded-full" />
      </div>
    </div>
  );
}