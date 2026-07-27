import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useUIStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";
import { api } from "../api/client";

export default function Layout() {
  const { theme, sidebarOpen, toggleSidebar, toggleTheme } = useUIStore();
  const { user, logout } = useAuthStore();
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
    } catch {
      // logout failed silently
    }
  };

  const navItems = [
    { path: "/", label: "Dashboard", icon: "📊" },
    { path: "/functions", label: "Functions", icon: "⚡" },
    { path: "/logs", label: "Logs", icon: "📝" },
  ];

  const statusColor = (status: string) => {
    switch (status) {
      case "running": return "bg-green-500";
      case "error": return "bg-red-500";
      case "starting": return "bg-yellow-500";
      default: return "bg-gray-500";
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-discord-card border-r border-discord-border flex flex-col transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        {/* Logo */}
        <div className="p-4 border-b border-discord-border shrink-0">
          <h1 className="text-xl font-bold text-discord-accent flex items-center gap-2">
            <span>🤖</span> StarrBot
          </h1>
          <p className="text-xs text-discord-muted mt-1">Fleet Management</p>
        </div>

        {/* Nav links */}
        <nav className="p-2 space-y-0.5 shrink-0">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-discord-accent text-white"
                    : "text-discord-muted hover:text-discord-text hover:bg-discord-input"
                }`
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bots list */}
        <div className="flex-1 min-h-0 flex flex-col border-t border-discord-border">
          <div className="px-3 py-2 flex items-center justify-between shrink-0">
            <span className="text-xs font-semibold text-discord-muted uppercase tracking-wider">Bots</span>
            <NavLink to="/bots/create" className="text-discord-muted hover:text-discord-accent text-lg leading-none" title="Add bot">+</NavLink>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
            {bots.length === 0 && (
              <p className="text-xs text-discord-muted px-2 py-1">No bots yet</p>
            )}
            {bots.map((bot: any) => (
              <button
                key={bot.id}
                onClick={() => { navigate(`/bots/${bot.id}`); if (sidebarOpen) toggleSidebar(); }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm text-left hover:bg-discord-input transition-colors group"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${statusColor(bot.status || "stopped")}`} />
                <span className="truncate text-discord-text group-hover:text-discord-accent">{bot.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Bottom: settings + theme + version */}
        <div className="border-t border-discord-border shrink-0">
          <nav className="p-2 space-y-0.5">
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-discord-accent text-white"
                    : "text-discord-muted hover:text-discord-text hover:bg-discord-input"
                }`
              }
            >
              <span>⚙️</span>
              <span>Settings</span>
            </NavLink>
            <button
              onClick={toggleTheme}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-discord-muted hover:text-discord-text hover:bg-discord-input transition-colors w-full"
            >
              <span>{theme === "dark" ? "☀️" : theme === "light" ? "🖥️" : "🌙"}</span>
              <span className="capitalize">{theme} mode</span>
            </button>
          </nav>
          <div className="px-4 pb-2 pt-1 border-t border-discord-border">
            <p className="text-[10px] text-discord-muted/50 font-mono">
              {version?.version ? `v${version.version}` : "loading..."}
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => toggleSidebar()}
        />
      )}

      {/* Main content */}
      <div className={`flex-1 lg:ml-64 transition-all duration-300 ${sidebarOpen ? "lg:ml-64" : ""}`}>
        {/* Header */}
        <header className="sticky top-0 z-20 bg-discord-bg/80 backdrop-blur-sm border-b border-discord-border">
          <div className="flex items-center justify-between h-14 px-4 lg:px-6">
            <button
              onClick={toggleSidebar}
              className="lg:hidden p-2 rounded-lg hover:bg-discord-input text-discord-text"
            >
              ☰
            </button>

            <div className="flex-1" />

            {/* User profile */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-discord-accent flex items-center justify-center text-white text-xs font-medium">
                  {user?.username?.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-discord-text hidden sm:block">{user?.username}</span>
              </div>
              <button
                onClick={handleLogout}
                className="text-discord-muted hover:text-discord-red text-sm p-1.5 rounded hover:bg-discord-input"
                title="Logout"
              >
                🚪
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}