import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/authStore";
import { useUIStore } from "./store/uiStore";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import BotDetail from "./pages/BotDetail";
import FunctionConfig from "./pages/FunctionConfig";
import CreateBot from "./pages/CreateBot";
import Settings from "./pages/Settings";
import Functions from "./pages/Functions";
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
        <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/bots/create" element={<CreateBot />} />
          <Route path="/functions" element={<Functions />} />
          <Route path="/bots/:botId/functions/:name" element={<FunctionConfig />} />
          <Route path="/bots/:id" element={<BotDetail />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;