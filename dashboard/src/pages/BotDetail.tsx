import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { BotTabs } from "../components/BotTabs";
import { useBotStore } from "../store/botStore";
import { useAuthStore } from "../store/authStore";

export default function BotDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { selectBot } = useBotStore();
  const [actionError, setActionError] = useState<string | null>(null);
  const activeTab = location.pathname.endsWith("/functions") ? "functions" : "overview";

  const { data: bot, isLoading, error } = useQuery({
    queryKey: ["bot", id],
    queryFn: () => api.getBot(id!),
    enabled: !!id,
    refetchInterval: (query: any) => {
      const status = query.state.data?.status;
      if (status === "starting") return 2000;
      return 15000;
    },
  });

  useEffect(() => {
    if (bot) selectBot(bot);
  }, [bot, selectBot]);

  useEffect(() => {
    if (actionError) {
      const t = setTimeout(() => setActionError(null), 5000);
      return () => clearTimeout(t);
    }
  }, [actionError]);

  const startMutation = useMutation({
    mutationFn: () => api.startBot(id!),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["bot", id] });
      queryClient.invalidateQueries({ queryKey: ["bots"] });
    },
    onError: (err: any) => setActionError(err.message || "Failed to start bot"),
  });

  const stopMutation = useMutation({
    mutationFn: () => api.stopBot(id!),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["bot", id] });
      queryClient.invalidateQueries({ queryKey: ["bots"] });
    },
    onError: (err: any) => setActionError(err.message || "Failed to stop bot"),
  });

  const restartMutation = useMutation({
    mutationFn: () => api.restartBot(id!),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["bot", id] });
      queryClient.invalidateQueries({ queryKey: ["bots"] });
    },
    onError: (err: any) => setActionError(err.message || "Failed to restart bot"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteBot(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bots"] });
      navigate("/");
    },
    onError: (err: any) => setActionError(err.message || "Failed to delete bot"),
  });

  if (isLoading) return <div className="flex items-center justify-center h-64">Loading...</div>;
  if (error) return <div className="text-center py-12">Failed to load bot</div>;
  if (!bot) return null;

  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-6">
      {actionError && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-300">×</button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          {bot.avatarUrl ? (
            <img src={bot.avatarUrl} alt={bot.name} className="w-16 h-16 rounded-xl" />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-discord-accent/20 flex items-center justify-center text-2xl">
              🤖
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold">{bot.name}</h1>
            <p className="text-discord-muted text-sm">{bot.id}</p>
          </div>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                bot.status === "running"
                  ? "bg-discord-green/20 text-discord-green"
                  : bot.status === "error"
                  ? "bg-discord-red/20 text-discord-red"
                  : bot.status === "starting"
                  ? "bg-yellow-400/20 text-yellow-400"
                  : "bg-discord-muted/20 text-discord-muted"
              }`}
            >
              {(bot.status || "stopped").charAt(0).toUpperCase() + (bot.status || "stopped").slice(1)}
            </span>

            {bot.status === "running" && (
              <>
                <button
                  onClick={() => stopMutation.mutate()}
                  disabled={stopMutation.isPending}
                  className="btn-secondary text-sm"
                >
                  {stopMutation.isPending ? "Stopping..." : "Stop"}
                </button>
                <button
                  onClick={() => restartMutation.mutate()}
                  disabled={restartMutation.isPending}
                  className="btn-secondary text-sm"
                >
                  {restartMutation.isPending ? "Restarting..." : "Restart"}
                </button>
              </>
            )}

            {bot.status !== "running" && bot.status !== "starting" && (
              <button
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending}
                className="btn-primary text-sm"
              >
                {startMutation.isPending ? "Starting..." : bot.status === "error" ? "Restart" : "Start"}
              </button>
            )}

            <button
              onClick={() => navigate(`/bots/${id}/edit`)}
              className="btn-secondary text-sm"
            >
              Edit
            </button>

            <button
              onClick={() => {
                if (confirm(`Delete "${bot.name}"? This cannot be undone.`)) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
              className="btn-danger text-sm"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <BotTabs
        activeTab={activeTab}
        bot={bot}
      />
    </div>
  );
}
