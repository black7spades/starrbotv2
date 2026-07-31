import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type TwitchCheck, type TwitchDiagnostics as Diagnostics } from "../api/client";
import Icon, { type IconName } from "./Icon";

/**
 * Self-check for the Twitch integration, in the app.
 *
 * Setting this up used to mean installing the Twitch CLI, reading a generated
 * secret out of the container and pasting it into a shell. The application has
 * everything it needs to do that itself, so it does.
 */

const STATUS: Record<TwitchCheck["status"], { icon: IconName; colour: string }> = {
  pass: { icon: "check", colour: "var(--status-running)" },
  fail: { icon: "alert", colour: "var(--status-error)" },
  warn: { icon: "alert", colour: "var(--status-starting)" },
  skip: { icon: "chevron-right", colour: "var(--text-faint)" },
};

export default function TwitchDiagnostics({ channel }: { channel: string }) {
  const [testing, setTesting] = useState(false);
  const [delivery, setDelivery] = useState<{ ok: boolean; detail: string } | null>(null);

  const {
    data,
    isFetching,
    refetch,
  } = useQuery<Diagnostics>({
    queryKey: ["twitch-diagnostics", channel],
    queryFn: () => api.twitchDiagnostics(channel || undefined),
    // Health depends on Twitch's view of our callback, which changes slowly.
    staleTime: 15_000,
  });

  const runTest = async () => {
    setTesting(true);
    setDelivery(null);
    try {
      const res = await api.twitchSelfTest(channel);
      setDelivery({ ok: res.delivered, detail: res.deliveryDetail });
      await refetch();
    } catch (e: any) {
      setDelivery({ ok: false, detail: e.message || "The test could not be run" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="glass p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="label !mb-0">Integration check</span>
        <button
          className="btn-ghost !py-1 !px-2 text-xs"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? <Icon name="spinner" size={13} /> : <Icon name="search" size={13} />}
          Recheck
        </button>
      </div>

      {!data && <p className="text-xs text-ink-faint">Checking…</p>}

      {data && (
        <ul className="space-y-1.5">
          {data.checks.map((c) => {
            const s = STATUS[c.status];
            return (
              <li key={c.id} className="flex items-start gap-2 text-xs">
                <Icon name={s.icon} size={13} style={{ color: s.colour }} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="text-ink font-medium">{c.label}</span>
                  <span className="text-ink-muted"> — {c.detail}</span>
                  {c.fix && <span className="block mt-0.5 text-ink-faint">↳ {c.fix}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {data?.callbackUrl && (
        <p className="text-[10px] display truncate text-ink-faint" title={data.callbackUrl}>
          {data.callbackUrl}
        </p>
      )}

      <div className="pt-1 border-t space-y-2" style={{ borderColor: "var(--border)" }}>
        <button
          className="btn-secondary w-full text-xs"
          onClick={runTest}
          disabled={testing || !channel}
        >
          {testing ? <Icon name="spinner" size={13} /> : <Icon name="play" size={13} />}
          Send a test announcement
        </button>
        <p className="text-[11px] text-ink-faint">
          Signs a fake go-live and sends it through the real callback, exactly as Twitch would. It
          posts a clearly-labelled test message and never pings your notification role.
        </p>

        {delivery && (
          <p
            className="text-xs flex items-start gap-1.5 px-2.5 py-2"
            style={{
              borderRadius: "var(--radius-sm)",
              background: "var(--surface)",
              color: delivery.ok ? "var(--status-running)" : "var(--status-error)",
            }}
            role="status"
          >
            <Icon name={delivery.ok ? "check" : "alert"} size={13} className="mt-0.5" />
            {delivery.detail}
          </p>
        )}
      </div>
    </div>
  );
}
