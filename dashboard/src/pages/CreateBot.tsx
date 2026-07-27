import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

export default function CreateBot() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);

  useEffect(() => {
    api.getTemplates().then(r => setTemplates(r.templates || [])).catch(() => {});
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (selectedTemplate) {
        const bot = await api.createBotFromTemplate(selectedTemplate.id, { name, token, clientId });
        navigate(`/bots/${bot.id}`);
      } else {
        const bot = await api.createBot({ name, token, clientId });
        navigate(`/bots/${bot.id}`);
      }
    } catch (err: any) {
      setError(err.message || "Failed to create bot");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Create Bot</h1>
        <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="text-sm text-discord-accent">
          Discord Developer Portal ↗
        </a>
      </div>

      {/* Template Picker */}
      {templates.length > 0 && !selectedTemplate && (
        <div className="mb-6 p-4 bg-discord-card rounded-xl border border-discord-border">
          <h2 className="text-sm font-semibold mb-3">Create from Template</h2>
          <div className="grid gap-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTemplate(t)}
                className="text-left p-3 rounded-lg bg-discord-input border border-discord-border hover:border-discord-accent/50 transition-colors"
              >
                <p className="font-medium text-sm">{t.name}</p>
                {t.description && <p className="text-xs text-discord-muted mt-0.5">{t.description}</p>}
                <p className="text-xs text-discord-muted mt-1">{t.functionConfigs?.length || 0} function(s) configured</p>
              </button>
            ))}
          </div>
          <div className="mt-3 text-center">
            <span className="text-xs text-discord-muted">or </span>
            <button onClick={() => setSelectedTemplate(null)} className="text-xs text-discord-accent">create from scratch</button>
          </div>
        </div>
      )}

      {selectedTemplate && (
        <div className="mb-4 p-3 bg-discord-accent/10 border border-discord-accent/20 rounded-lg flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-discord-accent">Template: {selectedTemplate.name}</p>
            <p className="text-xs text-discord-muted">{selectedTemplate.functionConfigs?.length || 0} function(s) will be pre-configured</p>
          </div>
          <button onClick={() => setSelectedTemplate(null)} className="text-xs text-discord-muted hover:text-discord-text">✕ Clear</button>
        </div>
      )}

      {!selectedTemplate && (
        <div className="mb-6 p-4 bg-discord-card rounded-xl border border-discord-border">
          <h2 className="text-sm font-semibold mb-2">How to create a Discord bot</h2>
          <ol className="text-sm text-discord-muted space-y-1 list-decimal list-inside">
            <li>Visit <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="text-discord-accent">Discord Developer Portal</a> and create a new application</li>
            <li>Go to the <strong>Bot</strong> tab and create a bot user</li>
            <li>Copy the <strong>Token</strong> and <strong>Client ID</strong> below</li>
            <li>Enable <strong>Message Content Intent</strong> under the Bot tab</li>
          </ol>
        </div>
      )}

      <form onSubmit={onSubmit} className="p-6 bg-discord-card rounded-xl border border-discord-border space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-discord-red/10 border border-discord-red/20 text-discord-red text-sm">{error}</div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} required className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent" />
          <p className="text-xs text-discord-muted mt-1">A friendly name to identify this bot in the dashboard</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Token</label>
          <input value={token} onChange={e => setToken(e.target.value)} required type="password" placeholder="e.g. MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.GxYz1Q.abc123..." className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent" />
          <p className="text-xs text-discord-muted mt-1">Found in the Discord Developer Portal under your app's <strong>Bot</strong> tab → <strong>Token</strong></p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Client ID</label>
          <input value={clientId} onChange={e => setClientId(e.target.value)} required placeholder="e.g. 123456789012345678" className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent" />
          <p className="text-xs text-discord-muted mt-1">Found in the Discord Developer Portal under <strong>OAuth2</strong> → <strong>Client ID</strong></p>
        </div>

        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? "Creating..." : selectedTemplate ? "Create from Template" : "Create Bot"}
          </button>
          <button type="button" onClick={() => navigate("/")} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  );
}
