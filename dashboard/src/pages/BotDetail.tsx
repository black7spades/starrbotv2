import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { BotTabs } from "../components/BotTabs";
import { useBotStore } from "../store/botStore";
import { useAuthStore } from "../store/authStore";

interface BotDetailData {
  id: string;
  name: string;
  avatarUrl?: string;
  enabled: boolean;
  token: string;
  clientId: string;
  status: string;
  error?: string | null;
  guildCount: number;
  functions: Array<{
    functionName: string;
    config: Record<string, unknown>;
    enabled: boolean;
  }>;
}

export default function BotDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { selectBot } = useBotStore();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: bot, isLoading, error } = useQuery({
    queryKey: ["bot", id],
    queryFn: () => api.getBot(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (bot) selectBot(bot);
  }, [bot, selectBot]);

  const startMutation = useMutation({
    mutationFn: () => api.startBot(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bot", id] }),
  });

  const stopMutation = useMutation({
    mutationFn: () => api.stopBot(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bot", id] }),
  });

  const restartMutation = useMutation({
    mutationFn: () => api.restartBot(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bot", id] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteBot(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bots"] });
      navigate("/");
    },
  });

  if (isLoading) return <div className="flex items-center justify-center h-64">Loading...</div>;
  if (error) return <div className="text-center py-12">Failed to load bot</div>;
  if (!bot) return null;

  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-6">
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
              {bot.status.charAt(0).toUpperCase() + bot.status.slice(1)}
            </span>

            {bot.status === "running" && (
              <>
                <button
                  onClick={() => stopMutation.mutate()}
                  disabled={stopMutation.isPending}
                  className="btn-secondary text-sm"
                >
                  Stop
                </button>
                <button
                  onClick={() => restartMutation.mutate()}
                  disabled={restartMutation.isPending}
                  className="btn-secondary text-sm"
                >
                  Restart
                </button>
              </>
            )}

            {bot.status !== "running" && bot.status !== "starting" && (
              <button
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending}
                className="btn-primary text-sm"
              >
                {bot.status === "error" ? "Restart" : "Start"}
              </button>
            )}

            <button
              onClick={() => {
                if (confirm(`Delete "${bot.name}"? This cannot be undone.`)) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
              className="btn-danger text-sm"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <BotTabs
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        bot={bot}
        isAdmin={isAdmin}
      />
    </div>
  );
}