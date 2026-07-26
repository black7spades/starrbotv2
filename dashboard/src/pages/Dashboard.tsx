import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { BotCard, BotCardSkeleton } from "../components/BotCard";

function DashboardContent() {
  const { data: botsData, isLoading } = useQuery({
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
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <BotCardSkeleton key={i} />)}
        </div>
      ) : bots.length === 0 ? (
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

export default function Dashboard() {
  return <DashboardContent />;
}
