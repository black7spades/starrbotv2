import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useUIStore } from "../store/uiStore";

export default function Login() {
  const navigate = useNavigate();
  const { login, loading } = useAuthStore();
  const { theme } = useUIStore();
  const [error, setError] = useState("");

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = async (data: { username: string; password: string }) => {
    setError("");
    try {
      await login(data.username, data.password);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Login failed");
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 ${theme === "dark" ? "dark" : ""}`}>
      <div className="w-full max-w-md">
        <div className="bg-discord-card rounded-2xl p-8 border border-discord-border">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-discord-accent flex items-center justify-center text-2xl">
              🤖
            </div>
            <h1 className="text-2xl font-bold">StarrBot</h1>
            <p className="text-discord-muted mt-1">Fleet Management Dashboard</p>
          </div>

          {error && (
            <div className="mb-6 p-3 rounded-lg bg-discord-red/10 border border-discord-red/20 text-discord-red text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium mb-1">Username</label>
              <input
                {...register("username", { required: "Username is required" })}
                id="username"
                type="text"
                autoComplete="username"
                className="w-full px-4 py-3 rounded-lg bg-discord-input border border-discord-border text-discord-text placeholder-discord-muted focus:outline-none focus:ring-2 focus:ring-discord-accent focus:border-transparent"
                disabled={loading}
              />
              {errors.username && (
                <p className="mt-1 text-sm text-discord-red">{errors.username.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1">Password</label>
              <input
                {...register("password", { required: "Password is required" })}
                id="password"
                type="password"
                autoComplete="current-password"
                className="w-full px-4 py-3 rounded-lg bg-discord-input border border-discord-border text-discord-text placeholder-discord-muted focus:outline-none focus:ring-2 focus:ring-discord-accent focus:border-transparent"
                disabled={loading}
              />
              {errors.password && (
                <p className="mt-1 text-sm text-discord-red">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-lg bg-discord-accent text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-discord-muted">
            Default: <code className="bg-discord-input px-1 rounded">admin</code> / <code className="bg-discord-input px-1 rounded">admin123</code>
          </p>
        </div>
      </div>
    </div>
  );
}