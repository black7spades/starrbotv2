import { useState, useEffect } from "react";
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

  const [selectedBotId, setSelectedBotId] = useState<string>("");

  useEffect(() => {
    if (bots.length === 1 && !selectedBotId) {
      setSelectedBotId(bots[0].id);
    }
  }, [bots, selectedBotId]);

  const selectedBot = bots.find((b: any) => b.id === selectedBotId);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Functions</h1>
          <p className="text-sm text-discord-muted mt-1">Available function packages. Deploy to a bot from its Functions tab.</p>
        </div>
        {bots.length > 0 && (
          <select
            value={selectedBotId}
            onChange={(e) => setSelectedBotId(e.target.value)}
            className="w-64 px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent"
          >
            <option value="">Select a bot to deploy to...</option>
            {bots.map((bot: any) => (
              <option key={bot.id} value={bot.id}>{bot.name} ({bot.status || "stopped"})</option>
            ))}
          </select>
        )}
      </div>

      {bots.length === 0 && (
        <div className="p-4 bg-discord-card rounded-xl border border-discord-border text-discord-muted">
          No bots yet. <Link to="/bots/create" className="text-discord-accent hover:underline">Create one</Link> first, then deploy functions to it.
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
          <div
            key={m.name}
            className="p-4 bg-discord-card rounded-xl border border-discord-border"
          >
            <div className="flex items-start gap-3">
              <span className="text-3xl shrink-0">{m.icon || "🔧"}</span>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold">{m.label}</h3>
                <p className="text-sm text-discord-muted line-clamp-2">{m.description}</p>
                {m.commands && m.commands.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.commands.map((cmd: any) => (
                      <span key={cmd.name} className="px-2 py-0.5 bg-discord-accent/10 text-discord-accent rounded text-xs font-mono">
                        /{cmd.name}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2 text-xs text-discord-muted">
                  <span>v{m.version}</span>
                </div>
              </div>
            </div>
            {selectedBotId && (
              <button
                onClick={() => navigate(`/bots/${selectedBotId}/functions/${m.name}`)}
                className="mt-3 w-full px-3 py-1.5 bg-discord-accent/10 hover:bg-discord-accent/20 text-discord-accent rounded-lg text-sm font-medium transition-colors"
              >
                Configure for {selectedBot?.name || "bot"}
              </button>
            )}
            {!selectedBotId && bots.length > 0 && (
              <p className="mt-3 text-xs text-discord-muted text-center">Select a bot above to deploy</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
