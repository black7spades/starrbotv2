import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export default function Functions() {
  const navigate = useNavigate();
  const { data: botsData } = useQuery({
    queryKey: ["bots"],
    queryFn: () => api.getBots(),
    refetchInterval: 10000,
  });
  const bots = botsData?.bots || [];

  const { data: manifests, isLoading } = useQuery({
    queryKey: ["functions"],
    queryFn: () => api.getFunctions(),
  });

  const [selectedBotId, setSelectedBotId] = useState<string>(
    bots.length === 1 ? bots[0].id : ""
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Functions</h1>
        {bots.length > 1 && (
          <select
            value={selectedBotId}
            onChange={(e) => setSelectedBotId(e.target.value)}
            className="w-64 px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent"
          >
            <option value="">Select a bot...</option>
            {bots.map((bot: any) => (
              <option key={bot.id} value={bot.id}>{bot.name}</option>
            ))}
          </select>
        )}
      </div>

      {bots.length === 0 && (
        <div className="p-4 bg-discord-card rounded-xl border border-discord-border text-discord-muted">
          No bots yet. <Link to="/bots/create" className="text-discord-accent hover:underline">Create one</Link> first.
        </div>
      )}

      {isLoading && <div className="text-center py-12 text-discord-muted">Loading functions...</div>}

      {manifests && manifests.length === 0 && (
        <div className="text-center py-16 text-discord-muted">
          <p className="text-xl mb-2">No functions installed</p>
          <p className="text-sm">No function packages found on this server.</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {manifests?.map((m: any) => (
          <button
            key={m.name}
            onClick={() => {
              if (!selectedBotId && bots.length > 1) return;
              const botId = selectedBotId || bots[0]?.id;
              if (botId) navigate(`/bots/${botId}/functions/${m.name}`);
            }}
            className={`p-4 bg-discord-card rounded-xl border border-discord-border text-left transition-colors ${
              selectedBotId || bots.length === 1
                ? "hover:border-discord-accent/50 cursor-pointer"
                : "opacity-50 cursor-not-allowed"
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="text-3xl shrink-0">{m.icon || "🔧"}</span>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold">{m.label}</h3>
                <p className="text-sm text-discord-muted line-clamp-2">{m.description}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-discord-muted">
                  <span>v{m.version}</span>
                </div>
              </div>
            </div>
            {(!selectedBotId && bots.length > 1) && (
              <p className="mt-3 text-xs text-discord-muted text-center">Select a bot above first</p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}