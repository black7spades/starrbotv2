import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGuildStore } from "../store/guildStore";
import { useAuthStore } from "../store/authStore";

export default function DiscordCallback() {
  const navigate = useNavigate();
  const setDiscordData = useGuildStore((s) => s.setDiscordData);
  const initAuth = useAuthStore((s) => s.initAuth);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const data = params.get("data");
    if (!data) {
      setError("No data received from Discord");
      return;
    }

    try {
      const parsed = JSON.parse(atob(data.replace(/-/g, "+").replace(/_/g, "/")));
      setDiscordData(
        { id: parsed.discordId, username: parsed.discordUsername, avatar: parsed.discordAvatar },
        parsed.guilds
      );
      // Refresh auth state since the backend just issued JWT cookies
      initAuth().then(() => navigate("/", { replace: true }));
    } catch {
      setError("Failed to parse Discord data");
    }
  }, [navigate, setDiscordData, initAuth]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-discord-bg text-discord-text">
        <div className="text-center space-y-4">
          <p className="text-discord-red text-lg">{error}</p>
          <button onClick={() => navigate("/")} className="btn-primary px-4 py-2 rounded-lg">
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-discord-bg text-discord-text">
      <p className="text-discord-muted">Connecting to Discord...</p>
    </div>
  );
}
