import { Outlet, NavLink } from "react-router-dom";
import { useUIStore } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";

export default function Layout() {
  const { theme, sidebarOpen, toggleSidebar, toggleTheme } = useUIStore();
  const { user, logout } = useAuthStore();

  const navItems = [
    { path: "/", label: "Dashboard", icon: "📊" },
    { path: "/settings", label: "Settings", icon: "⚙️" },
  ];

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // logout failed silently, store already cleared
    }
  };

  return (
    <div className={`min-h-screen flex ${theme === "dark" ? "dark" : ""}`}>
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-discord-card border-r border-discord-border transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b border-discord-border">
            <h1 className="text-xl font-bold text-discord-accent flex items-center gap-2">
              <span>🤖</span> StarrBot
            </h1>
            <p className="text-xs text-discord-muted mt-1">Fleet Management</p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
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

          {/* User */}
          <div className="p-4 border-t border-discord-border">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-8 h-8 rounded-full bg-discord-accent flex items-center justify-center text-white text-sm font-medium">
                {user?.username?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.username}</p>
                <p className="text-xs text-discord-muted capitalize">{user?.role}</p>
              </div>
              <button
                onClick={handleLogout}
                className="text-discord-muted hover:text-discord-red text-sm p-1"
                title="Logout"
              >
                🚪
              </button>
            </div>
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
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-discord-bg/80 backdrop-blur-sm border-b border-discord-border">
          <div className="flex items-center justify-between h-16 px-4 lg:px-6">
            <button
              onClick={toggleSidebar}
              className="lg:hidden p-2 rounded-lg hover:bg-discord-input text-discord-text"
            >
              ☰
            </button>

            <div className="flex-1 lg:flex-none" />

            <div className="flex items-center gap-4">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg hover:bg-discord-input text-discord-muted hover:text-discord-text"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? "☀️" : "🌙"}
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