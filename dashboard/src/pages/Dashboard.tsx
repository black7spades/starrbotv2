import { useQuery } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useUIStore } from "../store/uiStore";
import { BotTabs } from "../components/BotTabs";

function DashboardContent() {
  const { data: botsData } = useQuery({
    queryKey: ["bots"],
    queryFn: () => api.getBots(),
    refetchInterval: 10000,
  });

  const bots = botsData?.bots || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-discord-muted">Manage your Discord bot fleet</p>
        </div>
        <Link to="/bots/create" className="btn-primary">
          + Create Bot
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Bots" value={bots.length} icon="🤖" />
        <StatCard label="Running" value={bots.filter(b => b.status === "running").length} icon="🟢" />
        <StatCard label="Stopped" value={bots.filter(b => b.status === "stopped").length} icon="🔴" />
        <StatCard label="Errors" value={bots.filter(b => b.status === "error").length} icon="⚠️" />
      </div>

      {/* Bot Grid */}
      {bots.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🤖</div>
          <h2 className="text-xl font-semibold mb-2">No bots yet</h2>
          <p className="text-discord-muted mb-6">Create your first bot to get started</p>
          <Link to="/bots/create" className="btn-primary inline-block">
            Create Bot
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {bots.map((bot) => (
            <BotCard key={bot.id} bot={bot} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="p-4 bg-discord-card rounded-xl border border-discord-border">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-discord-muted text-sm">{label}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
        </div>
        <span className="text-4xl">{icon}</span>
      </div>
    </div>
  );
}

function BotCard({ bot }: { bot: any }) {
  const statusColors = {
    running: "bg-discord-green/20 text-discord-green",
    stopped: "bg-discord-muted/20 text-discord-muted",
    error: "bg-discord-red/20 text-discord-red",
    starting: "bg-yellow-400/20 text-yellow-400",
  };

  return (
    <Link to={`/bots/${bot.id}`} className="block p-4 bg-discord-card rounded-xl border border-discord-border hover:border-discord-accent/50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {bot.avatarUrl ? (
            <img src={bot.avatarUrl} alt={bot.name} className="w-12 h-12 rounded-lg" />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-discord-accent/20 flex items-center justify-center text-xl">
              🤖
            </div>
          )}
          <div>
            <h3 className="font-semibold">{bot.name}</h3>
            <p className="text-sm text-discord-muted">{bot.id}</p>
          </div>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[bot.status as keyof typeof statusColors] || statusColors.stopped}`}>
          {bot.status}
        </span>
      </div>

      <div className="mt-3 pt-3 border-t border-discord-border flex items-center justify-between text-sm text-discord-muted">
        <span>{bot.activeFunctions?.length || 0} functions</span>
        <span>{bot.guildCount || 0} guilds</span>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const { user } = useAuthStore();
  const { sidebarOpen, toggleSidebar } = useUIStore();

  if (!user) return null;

  return (
    <div className="min-h-screen flex">
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-discord-card border-r border-discord-border transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="p-4 border-b border-discord-border">
          <h1 className="font-bold text-lg">StarrBot</h1>
        </div>
        <nav className="p-4 space-y-2">
          <NavLink
            to="/"
            className={({ isActive }) => `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? "bg-discord-accent/20 text-discord-accent" : "text-discord-muted hover:text-discord-text hover:bg-discord-input"}`}
          >
            📊 Dashboard
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? "bg-discord-accent/20 text-discord-accent" : "text-discord-muted hover:text-discord-text hover:bg-discord-input"}`}
          >
            ⚙️ Settings
          </NavLink>
        </nav>
      </aside>

      <div className={`flex-1 transition-margin ${sidebarOpen ? "ml-64" : "ml-0"}`}>
        <header className="sticky top-0 z-30 bg-discord-bg/80 backdrop-blur-sm border-b border-discord-border">
          <div className="flex items-center justify-between h-16 px-4 lg:px-6">
            <button onClick={toggleSidebar} className="lg:hidden p-2 rounded-lg hover:bg-discord-input">
              ☰
            </button>
            <div className="flex-1 lg:flex-none" />
            <div className="flex items-center gap-4">
              <span className="text-sm text-discord-muted hidden sm:block">
                {user.username} ({user.role})
              </span>
              <button
                onClick={() => useAuthStore.getState().logout()}
                className="p-2 rounded-lg hover:bg-discord-input transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <main className="p-4 lg:p-6">
          <DashboardContent />
        </main>
      </div>
    </div>
  );
}