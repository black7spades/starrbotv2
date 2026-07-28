import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "../api/client";
import { Slider } from "../components/ui/Slider";
import SocialSetupWizard from "../components/SocialSetupWizard";
import { useGuildStore } from "../store/guildStore";

const FunctionConfigSchema = z.object({
  config: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

type FunctionConfigForm = z.infer<typeof FunctionConfigSchema>;

export default function FunctionConfig() {
  const { botId, name } = useParams<{ botId: string; name: string }>();
  const navigate = useNavigate();

  const [manifest, setManifest] = useState<any>(null);
  const [currentConfig, setCurrentConfig] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FunctionConfigForm>({
    resolver: zodResolver(FunctionConfigSchema),
    defaultValues: { enabled: false },
  });

  useEffect(() => {
    if (botId && name) {
      loadFunction();
    }
  }, [botId, name]);

  const loadFunction = async () => {
    try {
      setLoading(true);
      const manifestData = await api.getFunctionManifest(name!);
      setManifest(manifestData);
      const defaults = manifestData.defaultConfig || {};

      try {
        const configData = await api.getBotFunction(botId!, name!);
        setCurrentConfig(configData.config || {});
        setValue("enabled", configData.enabled ?? false);
        setIsConfigured(true);
        if (configData.config) {
          Object.entries(configData.config).forEach(([key, value]) => {
            setValue(`config.${key}`, value as any);
          });
        }
      } catch {
        setCurrentConfig(defaults);
        if (defaults) {
          Object.entries(defaults).forEach(([key, value]) => {
            setValue(`config.${key}`, value as any);
          });
        }
      }
    } catch (err) {
      console.error("Failed to load function:", err);
      setManifest(null);
    } finally {
      setLoading(false);
    }
  };

  const doSave = async (data: FunctionConfigForm, close: boolean) => {
    if (!botId || !name) return;
    setSaving(true);
    try {
      await api.updateFunctionConfig(botId, name, data);
      setIsConfigured(true);
      if (close) {
        navigate(-1);
      } else {
        setSaveMsg("Saved!");
        setTimeout(() => setSaveMsg(null), 2000);
      }
    } catch (err: any) {
      alert(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>;
  if (!manifest) return <div className="text-center py-12">Function not found</div>;

  const configFields = manifest.configSchema?.properties || {};
  const requiredFields = manifest.configSchema?.required || [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-discord-input">
            ←
          </button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <span className="text-3xl">{manifest.icon}</span>
              {manifest.label}
            </h1>
            <p className="text-discord-muted">{manifest.description}</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit((data) => doSave(data, false))} className="space-y-6">
        {Object.keys(configFields).length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Configuration</h2>
            {Object.entries(configFields).map(([key, field]: [string, any]) => {
              if (key === "guildId") return null; // rendered as part of ChannelField
              if (key === "channelId") {
                return (
                  <ChannelField
                    key={key}
                    botId={botId!}
                    guildValue={watch("config.guildId") as string || ""}
                    channelValue={watch("config.channelId") as string || ""}
                    onGuildChange={(val) => { setValue("config.guildId", val); setValue("config.channelId", ""); }}
                    onChannelChange={(val) => setValue("config.channelId", val)}
                  />
                );
              }
              if (field.type === "array") {
                if (name === "instagram" && key === "accounts") {
                  return (
                    <InstagramAccountsField
                      key={key}
                      botId={botId!}
                      guildId={watch("config.guildId") as string || ""}
                      value={watch(`config.${key}`) as any[]}
                      onChange={(val) => setValue(`config.${key}`, val)}
                    />
                  );
                }
                return (
                  <SourcesField
                    key={key}
                    name={key}
                    field={field}
                    value={watch(`config.${key}`) as any[]}
                    onChange={(val) => setValue(`config.${key}`, val)}
                    functionName={name || ""}
                    rsshubUrl={watch("config.rsshubUrl") as string || currentConfig.rsshubUrl || "http://rsshub:1200"}
                    onWizardAdd={(source) => {
                      const current = (watch(`config.${key}`) as any[]) || [];
                      setValue(`config.${key}`, [...current, source]);
                    }}
                    wizardOpen={wizardOpen}
                    setWizardOpen={setWizardOpen}
                  />
                );
              }
              return (
                <ConfigField
                  key={key}
                  name={key}
                  field={field}
                  required={requiredFields.includes(key)}
                  value={currentConfig[key]}
                  register={register}
                  watch={watch}
                  setValue={setValue}
                  errors={errors}
                  disabled={false}
                />
              );
            })}
          </div>
        )}

        {Object.keys(configFields).length === 0 && (
          <div className="p-4 bg-discord-card rounded-xl border border-discord-border text-discord-muted text-center">
            This function has no configuration options.
          </div>
        )}

        <div className={`p-4 bg-discord-card rounded-xl border border-discord-border ${!isConfigured ? "opacity-50" : ""}`}>
          <label className={`flex items-center justify-between ${isConfigured ? "cursor-pointer" : "cursor-not-allowed"}`}>
            <div>
              <h3 className="font-semibold">Enable {manifest.label}</h3>
              <p className="text-sm text-discord-muted">
                {isConfigured
                  ? "Toggle this function on/off for this bot"
                  : "Save configuration first to enable this function"}
              </p>
            </div>
            <Slider
              checked={watch("enabled") ?? false}
              onChange={(val) => setValue("enabled", val)}
              disabled={!isConfigured}
            />
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-discord-border">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn-secondary"
          >
            Cancel
          </button>
          {saveMsg && (
            <span className="self-center text-sm text-discord-green">{saveMsg}</span>
          )}
          <button type="submit" disabled={saving} className="btn-secondary">
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSubmit((data) => doSave(data, true))}
            className="btn-primary"
          >
            {saving ? "Saving..." : "Save & Close"}
          </button>
        </div>
      </form>
    </div>
  );
}

function SourcesField({
  name,
  field,
  value,
  onChange,
  functionName,
  rsshubUrl,
  onWizardAdd,
  wizardOpen,
  setWizardOpen,
}: {
  name: string;
  field: any;
  value: any[];
  onChange: (val: any[]) => void;
  functionName: string;
  rsshubUrl: string;
  onWizardAdd: (source: { url: string; label: string; enabled: boolean }) => void;
  wizardOpen: boolean;
  setWizardOpen: (v: boolean) => void;
}) {
  const sources: any[] = Array.isArray(value) ? value : [];
  const itemFields = field.items?.properties || {};
  const [bulkText, setBulkText] = useState("");

  const addSource = (url?: string, label?: string) => {
    const newItem: any = {};
    Object.entries(itemFields).forEach(([key, def]: [string, any]) => {
      if (key === "url") newItem[key] = url ?? "";
      else if (key === "label") newItem[key] = label ?? (url ? deriveLabel(url) : "");
      else if (key === "enabled") newItem[key] = true;
      else newItem[key] = def.default ?? "";
    });
    onChange([...sources, newItem]);
  };

  const removeSource = (index: number) => {
    onChange(sources.filter((_, i) => i !== index));
  };

  const updateSource = (index: number, key: string, val: any) => {
    const updated = sources.map((s, i) => (i === index ? { ...s, [key]: val } : s));
    onChange(updated);
  };

  const addBulk = () => {
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const newSources = lines.map((url) => {
      const item: any = {};
      Object.entries(itemFields).forEach(([key, def]: [string, any]) => {
        if (key === "url") item[key] = url;
        else if (key === "label") item[key] = deriveLabel(url);
        else if (key === "enabled") item[key] = true;
        else item[key] = def.default ?? "";
      });
      return item;
    });
    onChange([...sources, ...newSources]);
    setBulkText("");
  };

  return (
    <div className="p-4 bg-discord-card rounded-xl border border-discord-border space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium">{field.title || name}</h4>
          {field.description && <p className="text-sm text-discord-muted">{field.description}</p>}
        </div>
        <div className="flex gap-2">
          {functionName === "updates" && (
            <button type="button" onClick={() => setWizardOpen(true)} className="btn-primary text-sm">
              + Add Social
            </button>
          )}
          <button type="button" onClick={() => addSource()} className="btn-secondary text-sm">
            + Add URL
          </button>
        </div>
      </div>

      {functionName === "updates" && sources.length === 0 && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: "📸", label: "Instagram", path: "instagram/2/user/" },
            { icon: "▶️", label: "YouTube", path: "youtube/channel/" },
            { icon: "🤖", label: "Reddit", path: "reddit/hot/" },
            { icon: "🐙", label: "GitHub", path: "github/repos/" },
          ].map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setWizardOpen(true)}
              className="flex flex-col items-center gap-1 p-3 rounded-xl bg-discord-input border border-discord-border hover:border-discord-accent/50 transition-colors"
            >
              <span className="text-xl">{p.icon}</span>
              <span className="text-xs text-discord-muted">{p.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <textarea
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          placeholder={"Bulk paste — one URL per line:\nhttps://rsshub.servalan.one/twitch/user/mkitty\nhttps://rsshub.servalan.one/twitter/user/Mazland"}
          rows={3}
          className="flex-1 px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text text-sm font-mono focus:ring-2 focus:ring-discord-accent focus:border-transparent resize-none"
        />
        <button
          type="button"
          onClick={addBulk}
          disabled={!bulkText.trim()}
          className="btn-primary text-sm self-end"
        >
          Add All
        </button>
      </div>

      {sources.length === 0 && (
        <p className="text-sm text-discord-muted text-center py-4">
          No sources configured. Add one above or paste multiple URLs.
        </p>
      )}

      <div className="space-y-3">
        {sources.map((source, index) => (
          <div
            key={index}
            className="flex items-center gap-3 p-3 bg-discord-input rounded-lg border border-discord-border"
          >
            <div className="flex-1 grid gap-2 sm:grid-cols-2">
              {itemFields.url && (
                <input
                  type="text"
                  value={source.url || ""}
                  onChange={(e) => updateSource(index, "url", e.target.value)}
                  placeholder="Feed URL"
                  className="w-full px-3 py-2 bg-discord-card border border-discord-border rounded-lg text-discord-text text-sm focus:ring-2 focus:ring-discord-accent focus:border-transparent"
                />
              )}
              {itemFields.label && (
                <input
                  type="text"
                  value={source.label || ""}
                  onChange={(e) => updateSource(index, "label", e.target.value)}
                  placeholder="Label"
                  className="w-full px-3 py-2 bg-discord-card border border-discord-border rounded-lg text-discord-text text-sm focus:ring-2 focus:ring-discord-accent focus:border-transparent"
                />
              )}
            </div>
            {itemFields.enabled && (
              <Slider
                checked={source.enabled !== false}
                onChange={(val) => updateSource(index, "enabled", val)}
              />
            )}
            <button
              type="button"
              onClick={() => removeSource(index)}
              className="shrink-0 p-1.5 text-discord-red hover:bg-discord-red/10 rounded-lg transition-colors"
              title="Remove"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {wizardOpen && functionName === "updates" && (
        <SocialSetupWizard
          rsshubUrl={rsshubUrl}
          onAdd={onWizardAdd}
          onClose={() => setWizardOpen(false)}
        />
      )}
    </div>
  );
}

function deriveLabel(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/^\//, "").replace(/\/$/, "");
    const parts = path.split("/").filter(Boolean);
    if (parts.length >= 2) return `${parts[0]} / ${parts[parts.length - 1]}`;
    if (parts.length === 1) return parts[0];
    return url;
  } catch {
    return url;
  }
}

function ConfigField({
  name,
  field,
  required,
  value,
  register,
  watch,
  setValue,
  errors,
  disabled,
}: {
  name: string;
  field: any;
  required: boolean;
  value: any;
  register: any;
  watch: any;
  setValue: any;
  errors: any;
  disabled: boolean;
}) {
  const fieldName = `config.${name}`;
  const error = errors.config?.[name];

  if (field.type === "boolean") {
    return (
      <div className="p-4 bg-discord-card rounded-xl border border-discord-border">
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <h4 className="font-medium flex items-center gap-2">
              {field.title || name}
              {required && <span className="text-discord-red text-sm">*</span>}
            </h4>
            {field.description && <p className="text-sm text-discord-muted">{field.description}</p>}
          </div>
          <Slider
            checked={watch(fieldName) ?? field.default ?? false}
            onChange={(val) => setValue(fieldName, val)}
            disabled={disabled}
          />
        </label>
      </div>
    );
  }

  if (field.type === "string" && field.enum) {
    return (
      <div className="p-4 bg-discord-card rounded-xl border border-discord-border">
        <label className="block">
          <h4 className="font-medium flex items-center gap-2 mb-2">
            {field.title || name}
            {required && <span className="text-discord-red text-sm">*</span>}
          </h4>
          {field.description && <p className="text-sm text-discord-muted mb-2">{field.description}</p>}
          <select
            {...register(fieldName)}
            disabled={disabled}
            className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent focus:border-transparent disabled:opacity-50"
          >
            {field.enum.map((opt: string) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {error && <p className="text-discord-red text-sm mt-1">{error.message}</p>}
        </label>
      </div>
    );
  }

  if (field.type === "number" || field.type === "integer") {
    return (
      <div className="p-4 bg-discord-card rounded-xl border border-discord-border">
        <label className="block">
          <h4 className="font-medium flex items-center gap-2 mb-2">
            {field.title || name}
            {required && <span className="text-discord-red text-sm">*</span>}
          </h4>
          {field.description && <p className="text-sm text-discord-muted mb-2">{field.description}</p>}
          <input
            type="number"
            {...register(fieldName, { valueAsNumber: true })}
            disabled={disabled}
            min={field.minimum}
            max={field.maximum}
            step={field.type === "integer" ? 1 : "any"}
            className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent focus:border-transparent disabled:opacity-50"
            defaultValue={value}
          />
          {error && <p className="text-discord-red text-sm mt-1">{error.message}</p>}
        </label>
      </div>
    );
  }

  return (
    <div className="p-4 bg-discord-card rounded-xl border border-discord-border">
      <label className="block">
        <h4 className="font-medium flex items-center gap-2 mb-2">
          {field.title || name}
          {required && <span className="text-discord-red text-sm">*</span>}
        </h4>
        {field.description && <p className="text-sm text-discord-muted mb-2">{field.description}</p>}
        <input
          type="text"
          {...register(fieldName)}
          disabled={disabled}
          placeholder={field.default ? String(field.default) : ""}
          className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text focus:ring-2 focus:ring-discord-accent focus:border-transparent disabled:opacity-50"
          defaultValue={value}
        />
        {error && <p className="text-discord-red text-sm mt-1">{error.message}</p>}
      </label>
    </div>
  );
}

function InstagramAccountsField({
  botId,
  guildId,
  value,
  onChange,
}: {
  botId: string;
  guildId: string;
  value: any[];
  onChange: (val: any[]) => void;
}) {
  const accounts: any[] = Array.isArray(value) ? value : [];
  const [newUsername, setNewUsername] = useState("");
  const [newChannelId, setNewChannelId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);

  useEffect(() => {
    if (!guildId) { setChannels([]); return; }
    setLoadingChannels(true);
    api.getChannels(botId, guildId)
      .then(setChannels)
      .catch(() => setChannels([]))
      .finally(() => setLoadingChannels(false));
  }, [guildId, botId]);

  const addAccount = () => {
    if (!newUsername.trim() || !newChannelId.trim()) return;
    onChange([...accounts, { username: newUsername.trim(), channelId: newChannelId.trim(), label: newLabel.trim(), enabled: true }]);
    setNewUsername("");
    setNewChannelId("");
    setNewLabel("");
  };

  const removeAccount = (i: number) => {
    onChange(accounts.filter((_, idx) => idx !== i));
  };

  const toggleAccount = (i: number) => {
    onChange(accounts.map((a, idx) => (idx === i ? { ...a, enabled: !a.enabled } : a)));
  };

  return (
    <div className="p-4 bg-discord-card rounded-xl border border-discord-border space-y-4">
      <div>
        <h4 className="font-medium flex items-center gap-2">📸 Monitored Accounts</h4>
        <p className="text-sm text-discord-muted">Instagram accounts to monitor and post new content to Discord</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <input
          type="text"
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          placeholder="Instagram username"
          className="px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text text-sm focus:ring-2 focus:ring-discord-accent focus:border-transparent"
        />
        <select
          value={newChannelId}
          onChange={(e) => setNewChannelId(e.target.value)}
          disabled={!guildId || loadingChannels}
          className="px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text text-sm focus:ring-2 focus:ring-discord-accent focus:border-transparent disabled:opacity-50"
        >
          <option value="">{!guildId ? "Pick server first" : loadingChannels ? "Loading..." : "Select channel"}</option>
          {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
        </select>
        <div className="flex gap-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Label (optional)"
            className="flex-1 px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text text-sm focus:ring-2 focus:ring-discord-accent focus:border-transparent"
          />
          <button type="button" onClick={addAccount} disabled={!newUsername.trim() || !newChannelId.trim()} className="btn-primary text-sm">
            Add
          </button>
        </div>
      </div>

      {accounts.length === 0 && (
        <p className="text-sm text-discord-muted text-center py-3">No accounts configured. Add one above.</p>
      )}

      <div className="space-y-2">
        {accounts.map((account, i) => {
          const ch = channels.find(c => c.id === account.channelId);
          return (
            <div key={i} className="flex items-center gap-3 p-3 bg-discord-input rounded-lg border border-discord-border">
              <button type="button" onClick={() => toggleAccount(i)} className={`text-lg ${account.enabled ? "" : "opacity-30"}`}>
                {account.enabled ? "✅" : "⏸️"}
              </button>
              <div className="flex-1 min-w-0">
                <span className="font-medium text-discord-text">@{account.username}</span>
                <span className="text-discord-muted mx-2">→</span>
                <span className="text-sm text-discord-muted">#{ch ? ch.name : account.channelId}</span>
                {account.label && <span className="text-xs text-discord-muted ml-2">({account.label})</span>}
              </div>
              <button type="button" onClick={() => removeAccount(i)} className="text-discord-red hover:text-red-400 text-sm">
                Remove
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChannelField({
  botId,
  guildValue,
  channelValue,
  onGuildChange,
  onChannelChange,
}: {
  botId: string;
  guildValue: string;
  channelValue: string;
  onGuildChange: (val: string) => void;
  onChannelChange: (val: string) => void;
}) {
  const { guilds } = useGuildStore();
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);

  useEffect(() => {
    if (!guildValue) { setChannels([]); return; }
    setLoadingChannels(true);
    api.getChannels(botId, guildValue)
      .then(setChannels)
      .catch(() => setChannels([]))
      .finally(() => setLoadingChannels(false));
  }, [guildValue, botId]);

  return (
    <div className="p-4 bg-discord-card rounded-xl border border-discord-border">
      <h4 className="font-medium mb-2">Post to channel</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-sm text-discord-muted mb-1 block">Server</label>
          <select
            value={guildValue}
            onChange={(e) => onGuildChange(e.target.value)}
            className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text text-sm focus:ring-2 focus:ring-discord-accent focus:border-transparent"
          >
            <option value="">Select server...</option>
            {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          {guilds.length === 0 && <p className="text-xs text-discord-muted mt-1">No servers found — re-login with Discord</p>}
        </div>
        <div>
          <label className="text-sm text-discord-muted mb-1 block">Channel</label>
          <select
            value={channelValue}
            onChange={(e) => onChannelChange(e.target.value)}
            disabled={!guildValue || loadingChannels}
            className="w-full px-3 py-2 bg-discord-input border border-discord-border rounded-lg text-discord-text text-sm focus:ring-2 focus:ring-discord-accent focus:border-transparent disabled:opacity-50"
          >
            <option value="">{loadingChannels ? "Loading..." : "Select channel..."}</option>
            {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
