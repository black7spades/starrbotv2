import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const statusClass = STATUS_COLORS[bot.status as keyof typeof STATUS_COLORS] || "text-discord-muted";

  const startMutation = useMutation({
    mutationFn: () => api.startBot(bot.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bots"] });
      queryClient.invalidateQueries({ queryKey: ["bot", bot.id] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => api.stopBot(bot.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bots"] });
      queryClient.invalidateQueries({ queryKey: ["bot", bot.id] });
    },
  });

  const restartMutation = useMutation({
    mutationFn: () => api.restartBot(bot.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bots"] });
      queryClient.invalidateQueries({ queryKey: ["bot", bot.id] });
    },
  });

  const isRunning = bot.status === "running";
  const isStarting = bot.status === "starting";

  return (
    <div className="bot-card bg-discord-card rounded-xl border border-discord-border p-5 hover:border-discord-accent/50 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <Link to={`/bots/${bot.id}`} className="flex items-center gap-3 min-w-0">
          {bot.avatarUrl ? (
            <img src={bot.avatarUrl} alt={bot.name} className="w-10 h-10 rounded-lg shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-discord-accent/20 flex items-center justify-center text-xl shrink-0">
              🤖
            </div>
          )}
          <div className="min-w-0">
            <h3 className="font-semibold truncate max-w-[160px]">{bot.name}</h3>
            <p className="text-xs text-discord-muted">{bot.id}</p>
          </div>
        </Link>
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
          <p className="text-xs text-discord-muted uppercase tracking-wide">Servers</p>
          <p className="text-2xl font-bold">{bot.guildCount}</p>
        </div>
        <div className="bg-discord-bg/50 rounded-lg p-3">
          <p className="text-xs text-discord-muted uppercase tracking-wide">Functions</p>
          <p className="text-2xl font-bold">{bot.activeFunctions.length}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
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

      <div className="flex items-center gap-2 border-t border-discord-border pt-3">
        {isRunning ? (
          <>
            <button
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-discord-red/10 text-discord-red hover:bg-discord-red/20 transition-colors disabled:opacity-50"
              title="Stop bot"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
              {stopMutation.isPending ? "..." : "Stop"}
            </button>
            <button
              onClick={() => restartMutation.mutate()}
              disabled={restartMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
              title="Restart bot"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M21 12a9 9 0 1 1-2.2-5.9"/><polyline points="21 3 21 9 15 9"/></svg>
              {restartMutation.isPending ? "..." : "Restart"}
            </button>
          </>
        ) : (
          <button
            onClick={() => startMutation.mutate()}
            disabled={isStarting || startMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-discord-green/10 text-discord-green hover:bg-discord-green/20 transition-colors disabled:opacity-50"
            title="Start bot"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><polygon points="6 3 20 12 6 21 6 3"/></svg>
            {startMutation.isPending ? "..." : isStarting ? "Starting..." : "Start"}
          </button>
        )}
        <button
          onClick={() => navigate(`/bots/${bot.id}/edit`)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-discord-input text-discord-text hover:bg-discord-border transition-colors"
          title="Edit bot"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit
        </button>
      </div>
    </div>
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