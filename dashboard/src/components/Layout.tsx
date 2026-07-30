import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useUIStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { api } from "../api/client";
import Icon, { type IconName } from "./Icon";
import ProfileMenu from "./ProfileMenu";

const NAV: { path: string; label: string; icon: IconName }[] = [
  { path: "/", label: "Dashboard", icon: "dashboard" },
  { path: "/playground", label: "Playground", icon: "playground" },
  { path: "/logs", label: "Logs", icon: "logs" },
];

const STATUS_VAR: Record<string, string> = {
  running: "var(--status-running)",
  error: "var(--status-error)",
  starting: "var(--status-starting)",
  stopped: "var(--status-stopped)",
};

export default function Layout() {
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { logout } = useAuthStore();
  const navigate = useNavigate();

  const { data: botsData } = useQuery({
    queryKey: ["bots"],
    queryFn: () => api.getBots(),
    refetchInterval: 10000,
  });
  const bots = botsData?.bots || [];

  const { data: version } = useQuery({
    queryKey: ["version"],
    queryFn: () => api.getVersion(),
    refetchInterval: 60000,
  });

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate("/login");
    }
  };

  return (
    <div className="min-h-screen flex">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 flex flex-col transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
        style={{
          background: "var(--surface)",
          backdropFilter: "blur(var(--glass-blur-strong)) saturate(160%)",
          WebkitBackdropFilter: "blur(var(--glass-blur-strong)) saturate(160%)",
          borderRight: "1px solid var(--border)",
        }}
      >
        <div className="p-4 shrink-0">
          <h1 className="text-lg font-bold display flex items-center gap-2 text-ink">
            <Icon name="bot" size={20} className="text-accent" />
            StarrBot
          </h1>
          <p className="text-[11px] mt-0.5 text-ink-faint display">FLEET MANAGEMENT</p>
        </div>

        <nav className="px-2 space-y-1 shrink-0">
          {NAV.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              onClick={() => sidebarOpen && window.innerWidth < 1024 && toggleSidebar()}
              className="flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors"
              style={({ isActive }) =>
                isActive
                  ? {
                      borderRadius: "var(--radius-sm)",
                      background: "var(--accent)",
                      color: "var(--accent-contrast)",
                    }
                  : { borderRadius: "var(--radius-sm)", color: "var(--text-muted)" }
              }
            >
              <Icon name={item.icon} size={17} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex-1 min-h-0 flex flex-col mt-4">
          <div className="px-4 py-2 flex items-center justify-between shrink-0">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint display">
              Bots
            </span>
            <NavLink
              to="/bots/create"
              className="text-ink-muted hover:text-accent"
              title="Add bot"
              aria-label="Add bot"
            >
              <Icon name="plus" size={16} />
            </NavLink>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
            {bots.length === 0 && <p className="text-xs px-3 py-1 text-ink-faint">No bots yet</p>}
            {bots.map((bot: any) => (
              <button
                key={bot.id}
                onClick={() => {
                  navigate(`/bots/${bot.id}`);
                  if (sidebarOpen && window.innerWidth < 1024) toggleSidebar();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left glass-hover text-ink"
                style={{ borderRadius: "var(--radius-sm)" }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: STATUS_VAR[bot.status] ?? STATUS_VAR.stopped }}
                  title={bot.status}
                />
                <span className="truncate">{bot.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Logout sits bottom-left, out of the way of everything you click often. */}
        <div className="shrink-0 p-2 border-t" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium glass-hover text-ink-muted"
            style={{ borderRadius: "var(--radius-sm)" }}
          >
            <Icon name="logout" size={17} />
            Log out
          </button>
          <p className="px-3 pt-1.5 text-[10px] display text-ink-faint">
            {version?.version ? `v${version.version}` : "…"}
          </p>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => toggleSidebar()}
          aria-hidden="true"
        />
      )}

      <div className="flex-1 lg:ml-64">
        <header
          className="sticky top-0 z-20"
          style={{
            background: "var(--surface)",
            backdropFilter: "blur(var(--glass-blur)) saturate(140%)",
            WebkitBackdropFilter: "blur(var(--glass-blur)) saturate(140%)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="flex items-center justify-between h-14 px-4 lg:px-6">
            <button
              onClick={toggleSidebar}
              className="lg:hidden btn-ghost !px-2"
              aria-label="Toggle navigation"
            >
              <Icon name="menu" size={20} />
            </button>
            <div className="flex-1" />
            <ProfileMenu />
          </div>
        </header>

        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
