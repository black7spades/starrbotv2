import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/authStore";
import { useUIStore } from "./store/uiStore";
import Login from "./pages/Login";
import DiscordCallback from "./pages/DiscordCallback";
import Dashboard from "./pages/Dashboard";
import BotDetail from "./pages/BotDetail";
import CreateBot from "./pages/CreateBot";
import EditBot from "./pages/EditBot";
import Settings from "./pages/Settings";
import Playground from "./pages/Playground";
import Logs from "./pages/Logs";
import Layout from "./components/Layout";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();
  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function App() {
  const { initAuth } = useAuthStore();
  const { initTheme } = useUIStore();

  useEffect(() => {
    initAuth();
    initTheme();
  }, [initAuth, initTheme]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/discord-callback" element={<DiscordCallback />} />
        <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/bots/create" element={<CreateBot />} />
          <Route path="/bots/:id/edit" element={<EditBot />} />
          <Route path="/playground" element={<Playground />} />
          {/* Old entry point; the Playground replaces it. */}
          <Route path="/functions" element={<Navigate to="/playground" replace />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/bots/:id/functions" element={<BotDetail />} />
          <Route path="/bots/:id/logs" element={<BotDetail />} />
          {/* Functions are edited in one place only — the Playground. */}
          <Route path="/bots/:botId/functions/:name" element={<Navigate to="/playground" replace />} />
          <Route path="/bots/:id" element={<BotDetail />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;