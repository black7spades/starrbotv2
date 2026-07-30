import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type FeedProvider } from "../api/client";
import Icon, { type IconName } from "./Icon";

/**
 * Builds Updates sources from the provider catalogue.
 *
 * Replaces the RSSHub wizard: rather than asking for a scraper route, it asks
 * for the one identifier each service needs (a channel ID, a handle) and builds
 * the platform's own feed URL server-side, so what gets saved is a feed the
 * origin publishes.
 */

export interface Source {
  url: string;
  label: string;
  enabled: boolean;
  providerId?: string;
  providerInput?: Record<string, string>;
}

const PROVIDER_ICON: Record<string, IconName> = {
  youtube: "play",
  "youtube-playlist": "play",
  bluesky: "rss",
  mastodon: "rss",
  reddit: "rss",
  "github-releases": "link",
  "github-commits": "link",
  rss: "rss",
};

export default function SourceBuilder({
  value,
  onChange,
}: {
  value: Source[];
  onChange: (next: Source[]) => void;
}) {
  const [adding, setAdding] = useState(false);

  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const toggle = (i: number) =>
    onChange(value.map((s, idx) => (idx === i ? { ...s, enabled: !s.enabled } : s)));

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="label !mb-0">Sources</span>
        <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => setAdding((v) => !v)}>
          <Icon name={adding ? "close" : "plus"} size={14} />
          {adding ? "Cancel" : "Add source"}
        </button>
      </div>

      {value.length === 0 && !adding && (
        <p className="text-xs text-ink-faint">Nothing followed yet.</p>
      )}

      <ul className="space-y-1.5">
        {value.map((s, i) => (
          <li
            key={`${s.url}-${i}`}
            className="glass flex items-center gap-2.5 px-2.5 py-2"
            style={{ opacity: s.enabled ? 1 : 0.55 }}
          >
            <Icon name={PROVIDER_ICON[s.providerId ?? "rss"] ?? "rss"} size={16} className="text-ink-muted" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm truncate text-ink">{s.label || s.url}</span>
              <span className="block text-[11px] truncate display text-ink-faint">{s.url}</span>
            </span>
            <button
              className="btn-ghost !px-1.5 !py-1"
              onClick={() => toggle(i)}
              title={s.enabled ? "Pause" : "Resume"}
              aria-label={s.enabled ? "Pause source" : "Resume source"}
            >
              <Icon name={s.enabled ? "stop" : "play"} size={14} />
            </button>
            <button
              className="btn-ghost !px-1.5 !py-1"
              onClick={() => remove(i)}
              title="Remove"
              aria-label="Remove source"
            >
              <Icon name="trash" size={14} />
            </button>
          </li>
        ))}
      </ul>

      {adding && (
        <AddSource
          onCancel={() => setAdding(false)}
          onAdd={(s) => {
            onChange([...value, s]);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function AddSource({
  onAdd,
  onCancel,
}: {
  onAdd: (s: Source) => void;
  onCancel: () => void;
}) {
  const { data } = useQuery({
    queryKey: ["update-providers"],
    queryFn: () => api.getUpdateProviders(),
    staleTime: 5 * 60 * 1000,
  });
  const providers = data?.providers ?? [];

  const [providerId, setProviderId] = useState<string | null>(null);
  const [input, setInput] = useState<Record<string, string>>({});
  const [label, setLabel] = useState("");
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{
    ok: boolean;
    error?: string;
    url?: string;
    itemCount?: number;
    items?: { title: string; link: string }[];
  } | null>(null);

  const provider: FeedProvider | undefined = providers.find((p) => p.id === providerId);
  const ready = provider?.fields.every((f) => !f.required || (input[f.key] ?? "").trim()) ?? false;

  const runTest = async () => {
    if (!provider) return;
    setTesting(true);
    setTest(null);
    try {
      const res = await api.testFeed({ providerId: provider.id, input });
      setTest(res);
      if (res.ok && !label) {
        const first = provider.fields[0];
        setLabel((input[first.key] ?? "").replace(/^@/, "").slice(0, 40));
      }
    } catch (e: any) {
      setTest({ ok: false, error: e.message || "Test failed" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="glass-strong mt-2 p-3 space-y-3">
      {!provider && (
        <div>
          <span className="label">What do you want to follow?</span>
          <div className="grid sm:grid-cols-2 gap-1.5">
            {providers.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setProviderId(p.id);
                  setInput({});
                  setTest(null);
                }}
                className="glass glass-hover px-2.5 py-2 flex items-start gap-2 text-left"
              >
                <Icon name={PROVIDER_ICON[p.id] ?? "rss"} size={16} className="mt-0.5 text-ink-muted" />
                <span>
                  <span className="block text-sm text-ink">{p.label}</span>
                  <span className="block text-[11px] text-ink-faint">{p.description}</span>
                </span>
              </button>
            ))}
          </div>
          <button className="btn-ghost w-full mt-2 text-xs" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}

      {provider && (
        <>
          <div className="flex items-center gap-2">
            <button
              className="btn-ghost !px-1.5 !py-1"
              onClick={() => setProviderId(null)}
              aria-label="Back to source types"
            >
              <Icon name="chevron-right" size={14} className="rotate-180" />
            </button>
            <span className="text-sm font-medium text-ink">{provider.label}</span>
            <span className="chip display ml-auto text-[10px]">{provider.feedSource}</span>
          </div>

          {provider.fields.map((f) => (
            <div key={f.key}>
              <label className="label" htmlFor={`src-${f.key}`}>
                {f.label} {f.required && <span style={{ color: "var(--status-error)" }}>*</span>}
              </label>
              <input
                id={`src-${f.key}`}
                className="field"
                placeholder={f.placeholder}
                value={input[f.key] ?? ""}
                onChange={(e) => {
                  setInput((v) => ({ ...v, [f.key]: e.target.value }));
                  setTest(null);
                }}
              />
              {f.hint && <p className="text-[11px] mt-1 text-ink-faint">{f.hint}</p>}
            </div>
          ))}

          <button className="btn-secondary w-full text-xs" onClick={runTest} disabled={!ready || testing}>
            {testing ? <Icon name="spinner" size={14} /> : <Icon name="search" size={14} />}
            Preview feed
          </button>

          {test && (
            <div
              className="text-xs px-2.5 py-2 space-y-1"
              style={{
                borderRadius: "var(--radius-sm)",
                background: "var(--surface)",
                color: test.ok ? "var(--text)" : "var(--status-error)",
              }}
            >
              {test.ok ? (
                <>
                  <p style={{ color: "var(--status-running)" }}>
                    Found {test.itemCount} item{test.itemCount === 1 ? "" : "s"}
                  </p>
                  <ul className="space-y-0.5 text-ink-muted">
                    {test.items?.map((i) => (
                      <li key={i.link} className="truncate">
                        • {i.title}
                      </li>
                    ))}
                  </ul>
                  <p className="display text-[10px] truncate text-ink-faint">{test.url}</p>
                </>
              ) : (
                <p className="flex items-start gap-1.5">
                  <Icon name="alert" size={13} />
                  {test.error}
                </p>
              )}
            </div>
          )}

          {test?.ok && (
            <>
              <div>
                <label className="label" htmlFor="src-label">
                  Label
                </label>
                <input
                  id="src-label"
                  className="field"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Shown on posts"
                />
              </div>
              <button
                className="btn-primary w-full"
                disabled={!label.trim()}
                onClick={() =>
                  onAdd({
                    url: test.url!,
                    label: label.trim(),
                    enabled: true,
                    providerId: provider.id,
                    providerInput: input,
                  })
                }
              >
                <Icon name="plus" size={14} />
                Add source
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
