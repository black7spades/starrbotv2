import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

export default function CreateBot() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const bot = await api.createBot({ name, token, clientId });
      navigate(`/bots/${bot.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to create bot");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Create Bot</h1>
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
          <input value={token} onChange={e => setToken(e.target.value)} required type="password" className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Client ID</label>
          <input value={clientId} onChange={e => setClientId(e.target.value)} required className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent" />
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={submitting} className="btn-primary">Create Bot</button>
          <button type="button" onClick={() => navigate("/")} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  );
}
