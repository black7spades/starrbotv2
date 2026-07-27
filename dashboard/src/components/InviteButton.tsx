import { useState, useRef, useEffect } from "react";
import { useGuildStore } from "../store/guildStore";

function buildInviteUrl(clientId: string, guildId?: string) {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("permissions", "8");
  url.searchParams.set("scope", "bot applications.commands");
  if (guildId) url.searchParams.set("guild_id", guildId);
  return url.toString();
}

export default function InviteButton({
  clientId,
  className = "",
}: {
  clientId: string;
  className?: string;
}) {
  const { guilds } = useGuildStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (guilds.length === 0) {
    return (
      <a
        href={buildInviteUrl(clientId)}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        Invite to Server
      </a>
    );
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button onClick={() => setOpen(!open)} className={className}>
        Invite to Server
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-64 bg-discord-card border border-discord-border rounded-lg shadow-lg z-50 py-1">
          <p className="px-3 py-1.5 text-xs text-discord-muted font-semibold uppercase tracking-wider">Select a server</p>
          {guilds.map((g) => (
            <button
              key={g.id}
              onClick={() => {
                window.open(buildInviteUrl(clientId, g.id), "_blank");
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm text-discord-text hover:bg-discord-input transition-colors flex items-center gap-2"
            >
              {g.icon ? (
                <img src={`https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png`} alt="" className="w-5 h-5 rounded-full" />
              ) : (
                <span className="w-5 h-5 rounded-full bg-discord-accent/20 flex items-center justify-center text-xs">
                  {g.name?.charAt(0) ?? "?"}
                </span>
              )}
              <span className="truncate">{g.name}</span>
            </button>
          ))}
          <div className="border-t border-discord-border mt-1 pt-1">
            <button
              onClick={() => {
                window.open(buildInviteUrl(clientId), "_blank");
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm text-discord-muted hover:bg-discord-input transition-colors"
            >
              Choose on Discord...
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
