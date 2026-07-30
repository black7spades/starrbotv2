import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import Icon, { type IconName } from "../components/Icon";
import SourceBuilder from "../components/SourceBuilder";

/**
 * One page to configure a function and put it on bots.
 *
 * The old flow made you walk Dashboard -> a bot -> Functions -> a function ->
 * config, and repeat the whole path for every other bot. Here the three things
 * you are actually deciding — which function, how it is configured, which bots
 * run it — are on screen together, and saving applies the config to every
 * selected bot in one action.
 */

const FUNCTION_ICON: Record<string, IconName> = {
  updates: "rss",
  tickets: "ticket",
  instagram: "camera",
  twitch: "twitch",
};

interface Manifest {
  name: string;
  label: string;
  description: string;
  version: string;
  configSchema?: { properties?: Record<string, any>; required?: string[] };
  defaultConfig?: Record<string, unknown>;
}

export default function Playground() {
  const queryClient = useQueryClient();
  const [selectedFn, setSelectedFn] = useState<string | null>(null);
  const [config, setConfig] = useState<Record<string, any>>({});
  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { data: manifests = [] } = useQuery<Manifest[]>({
    queryKey: ["functions"],
    queryFn: () => api.getFunctions(),
  });

  const { data: botsData } = useQuery({
    queryKey: ["bots"],
    queryFn: () => api.getBots(),
    refetchInterval: 10000,
  });
  const bots = botsData?.bots ?? [];

  const manifest = useMemo(
    () => manifests.find((m) => m.name === selectedFn) ?? null,
    [manifests, selectedFn]
  );

  // Pick the first function once the list loads, so the page is never empty.
  useEffect(() => {
    if (!selectedFn && manifests.length) setSelectedFn(manifests[0].name);
  }, [manifests, selectedFn]);

  // Seed the editor from the manifest defaults when the function changes.
  useEffect(() => {
    if (!manifest) return;
    setConfig({ ...(manifest.defaultConfig ?? {}) });
    setResult(null);
  }, [manifest?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const fields = Object.entries(manifest?.configSchema?.properties ?? {});
  const required = manifest?.configSchema?.required ?? [];

  const missing = required.filter((key) => {
    const v = config[key];
    return v === undefined || v === null || v === "";
  });
  const canSave = Boolean(manifest) && targets.size > 0 && missing.length === 0;

  const toggleTarget = (id: string) =>
    setTargets((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const loadFromBot = async (botId: string) => {
    if (!manifest) return;
    try {
      const bot = await api.getBot(botId);
      const existing = bot.functions?.find((f: any) => f.functionName === manifest.name);
      if (existing?.config) {
        setConfig({ ...(manifest.defaultConfig ?? {}), ...existing.config });
        setResult({ ok: true, message: `Loaded ${manifest.label} config from ${bot.name}` });
      } else {
        setResult({ ok: false, message: `${bot.name} has no ${manifest.label} config yet` });
      }
    } catch (e: any) {
      setResult({ ok: false, message: e.message || "Could not load that config" });
    }
  };

  const save = async (enabled: boolean) => {
    if (!manifest) return;
    setSaving(true);
    setResult(null);
    const ids = [...targets];
    const failures: string[] = [];

    for (const botId of ids) {
      try {
        await api.updateFunctionConfig(botId, manifest.name, { config, enabled });
      } catch (e: any) {
        failures.push(`${botId}: ${e.message}`);
      }
    }

    setSaving(false);
    queryClient.invalidateQueries({ queryKey: ["bots"] });

    if (failures.length === 0) {
      setResult({
        ok: true,
        message: `${manifest.label} ${enabled ? "enabled" : "saved"} on ${ids.length} bot${ids.length === 1 ? "" : "s"}`,
      });
    } else {
      setResult({ ok: false, message: `Failed on ${failures.length} of ${ids.length}: ${failures[0]}` });
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold display text-ink">Playground</h1>
        <p className="text-sm mt-1 text-ink-muted">
          Build a function's configuration and apply it to any number of bots at once.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[260px_1fr_280px]">
        {/* 1 — pick a function */}
        <section className="glass-panel h-fit">
          <h2 className="label">1 — Function</h2>
          <div className="space-y-1.5">
            {manifests.map((m) => {
              const active = m.name === selectedFn;
              return (
                <button
                  key={m.name}
                  onClick={() => setSelectedFn(m.name)}
                  className="w-full text-left px-3 py-2.5 flex items-start gap-2.5 glass-hover"
                  style={{
                    borderRadius: "var(--radius-sm)",
                    background: active ? "var(--accent)" : "transparent",
                    color: active ? "var(--accent-contrast)" : "var(--text)",
                  }}
                >
                  <Icon name={FUNCTION_ICON[m.name] ?? "playground"} size={17} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{m.label}</span>
                    <span
                      className="block text-[11px] leading-snug"
                      style={{ color: active ? "var(--accent-contrast)" : "var(--text-faint)" }}
                    >
                      {m.description}
                    </span>
                  </span>
                </button>
              );
            })}
            {manifests.length === 0 && (
              <p className="text-xs text-ink-faint">No functions registered.</p>
            )}
          </div>
        </section>

        {/* 2 — configure it */}
        <section className="glass-panel">
          <div className="flex items-center justify-between mb-3">
            <h2 className="label !mb-0">2 — Configure</h2>
            {manifest && (
              <span className="chip display">
                {manifest.name} v{manifest.version}
              </span>
            )}
          </div>

          {!manifest && <p className="text-sm text-ink-muted">Pick a function to begin.</p>}

          {manifest && (
            <div className="space-y-4">
              {fields.length === 0 && (
                <p className="text-sm text-ink-muted">This function has no settings.</p>
              )}
              {fields.map(([key, schema]) => (
                <Field
                  key={key}
                  name={key}
                  schema={schema}
                  required={required.includes(key)}
                  value={config[key]}
                  onChange={(v) => setConfig((c) => ({ ...c, [key]: v }))}
                />
              ))}
            </div>
          )}
        </section>

        {/* 3 — choose bots */}
        <section className="glass-panel h-fit space-y-3">
          <h2 className="label !mb-0">3 — Apply to bots</h2>

          <div className="space-y-1">
            {bots.length === 0 && <p className="text-xs text-ink-faint">No bots yet.</p>}
            {bots.map((bot: any) => {
              const checked = targets.has(bot.id);
              const has = bot.allFunctions?.includes(manifest?.name);
              return (
                <label
                  key={bot.id}
                  className="flex items-center gap-2.5 px-2.5 py-2 cursor-pointer glass-hover"
                  style={{ borderRadius: "var(--radius-sm)" }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleTarget(bot.id)}
                    className="accent-current"
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate text-ink">{bot.name}</span>
                    {has && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          loadFromBot(bot.id);
                        }}
                        className="text-[11px] underline text-ink-faint hover:text-accent"
                      >
                        load its config
                      </button>
                    )}
                  </span>
                  {bot.activeFunctions?.includes(manifest?.name) && (
                    <Icon name="check" size={14} style={{ color: "var(--status-running)" }} />
                  )}
                </label>
              );
            })}
          </div>

          {bots.length > 0 && (
            <button
              className="btn-ghost w-full text-xs"
              onClick={() =>
                setTargets((prev) =>
                  prev.size === bots.length ? new Set() : new Set(bots.map((b: any) => b.id))
                )
              }
            >
              {targets.size === bots.length ? "Clear all" : "Select all"}
            </button>
          )}

          {missing.length > 0 && targets.size > 0 && (
            <p className="text-[11px]" style={{ color: "var(--status-starting)" }}>
              Required: {missing.join(", ")}
            </p>
          )}

          <div className="space-y-2 pt-1">
            <button className="btn-primary w-full" disabled={!canSave || saving} onClick={() => save(true)}>
              {saving && <Icon name="spinner" size={14} />}
              Save &amp; enable
            </button>
            <button className="btn-secondary w-full" disabled={!canSave || saving} onClick={() => save(false)}>
              Save without enabling
            </button>
          </div>

          {result && (
            <p
              className="text-xs px-2.5 py-2 flex items-start gap-1.5"
              style={{
                borderRadius: "var(--radius-sm)",
                background: "var(--surface)",
                color: result.ok ? "var(--status-running)" : "var(--status-error)",
              }}
              role="status"
            >
              <Icon name={result.ok ? "check" : "alert"} size={14} />
              {result.message}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

/** Renders one config field from its JSON-schema fragment. */
function Field({
  name,
  schema,
  required,
  value,
  onChange,
}: {
  name: string;
  schema: any;
  required: boolean;
  value: any;
  onChange: (v: any) => void;
}) {
  const label = schema.title ?? name.replace(/([A-Z])/g, " $1").replace(/^./, (c: string) => c.toUpperCase());

  // The Updates `sources` array gets a purpose-built editor rather than raw JSON.
  if (schema.type === "array" && name === "sources") {
    return <SourceBuilder value={Array.isArray(value) ? value : []} onChange={onChange} />;
  }

  if (schema.type === "boolean") {
    return (
      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          style={{ accentColor: "var(--accent)" }}
        />
        <span className="text-sm text-ink">{label}</span>
      </label>
    );
  }

  if (schema.type === "number" || schema.type === "integer") {
    return (
      <div>
        <label className="label" htmlFor={`f-${name}`}>
          {label} {required && <span style={{ color: "var(--status-error)" }}>*</span>}
        </label>
        <input
          id={`f-${name}`}
          type="number"
          className="field"
          value={value ?? ""}
          min={schema.minimum}
          max={schema.maximum}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
        {schema.description && <p className="text-[11px] mt-1 text-ink-faint">{schema.description}</p>}
      </div>
    );
  }

  if (schema.type === "array") {
    return (
      <div>
        <label className="label">{label}</label>
        <p className="text-[11px] text-ink-faint">
          Configured from this function's own screen.
        </p>
      </div>
    );
  }

  const isSecret = /cookie|token|secret|password/i.test(name);
  return (
    <div>
      <label className="label" htmlFor={`f-${name}`}>
        {label} {required && <span style={{ color: "var(--status-error)" }}>*</span>}
      </label>
      <input
        id={`f-${name}`}
        type={isSecret ? "password" : "text"}
        className="field"
        value={value ?? ""}
        placeholder={schema.default ? String(schema.default) : undefined}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={isSecret ? "off" : undefined}
      />
      {schema.description && <p className="text-[11px] mt-1 text-ink-faint">{schema.description}</p>}
    </div>
  );
}
