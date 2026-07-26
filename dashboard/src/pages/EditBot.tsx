import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export default function EditBot() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: bot, isLoading } = useQuery({
    queryKey: ["bot", id],
    queryFn: () => api.getBot(id!),
    enabled: !!id,
  });

  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (bot) {
      setName(bot.name || "");
      setClientId(bot.clientId || "");
    }
  }, [bot]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data: any = {};
      if (name !== bot.name) data.name = name;
      if (token) data.token = token;
      if (clientId !== bot.clientId) data.clientId = clientId;
      await api.updateBot(id!, data);
      queryClient.invalidateQueries({ queryKey: ["bot", id] });
      navigate(`/bots/${id}`);
    } catch (err: any) {
      setError(err.message || "Failed to update bot");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-64">Loading...</div>;
  if (!bot) return <div className="text-center py-12">Bot not found</div>;

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Edit Bot</h1>
        <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="text-sm text-discord-accent">
          Discord Developer Portal ↗
        </a>
      </div>

      <form onSubmit={onSubmit} className="p-6 bg-discord-card rounded-xl border border-discord-border space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-discord-red/10 border border-discord-red/20 text-discord-red text-sm">{error}</div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} required className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Token</label>
          <input value={token} onChange={e => setToken(e.target.value)} type="password" placeholder="Leave blank to keep current" className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Client ID</label>
          <input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="Leave blank to keep current" className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent" />
        </div>

        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={submitting} className="btn-primary">{submitting ? "Saving..." : "Save Changes"}</button>
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  );
}
