import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { api } from "../api/client";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [error, setError] = useState("");
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [version, setVersion] = useState("");

  const { register, handleSubmit, formState: { errors }, watch } = useForm({
    defaultValues: { username: "", password: "", confirmPassword: "" },
  });

  useEffect(() => {
    api.request<{ needsSetup: boolean }>("/api/auth/setup/status").then(r => setNeedsSetup(r.needsSetup)).catch(() => setNeedsSetup(true));
    api.getVersion().then(v => setVersion(v.version)).catch(() => {});
  }, []);

  const onSubmit = async (data: { username: string; password: string; confirmPassword?: string }) => {
    setError("");
    setSubmitting(true);
    try {
      if (needsSetup) {
        await api.request("/api/auth/setup", { method: "POST", body: JSON.stringify({ username: data.username, password: data.password }) });
      }
      await login(data.username, data.password);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  const passwordField = (
    <div>
      <label htmlFor="password" className="block text-sm font-medium mb-1">Password</label>
      <div className="relative">
        <input
          {...register("password", { required: "Password is required", minLength: { value: 8, message: "Min 8 characters" } })}
          id="password"
          type={showPassword ? "text" : "password"}
          autoComplete={needsSetup ? "new-password" : "current-password"}
          className="w-full px-4 py-3 pr-12 rounded-lg bg-discord-input border border-discord-border text-discord-text placeholder-discord-muted focus:outline-none focus:ring-2 focus:ring-discord-accent focus:border-transparent"
          disabled={submitting}
        />
        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-discord-muted hover:text-discord-text text-sm">
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>
      {errors.password && <p className="mt-1 text-sm text-discord-red">{errors.password.message}</p>}
    </div>
  );

  if (needsSetup === null) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-discord-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-discord-card rounded-2xl p-8 border border-discord-border">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-discord-accent flex items-center justify-center text-2xl">
              🤖
            </div>
            <h1 className="text-2xl font-bold">StarrBot</h1>
            <p className="text-discord-muted mt-1">{needsSetup ? "Create Admin Account" : "Fleet Management Dashboard"}</p>
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
                {...register("username", { required: "Username is required", minLength: { value: 3, message: "Min 3 characters" } })}
                id="username"
                type="text"
                autoComplete="username"
                className="w-full px-4 py-3 rounded-lg bg-discord-input border border-discord-border text-discord-text placeholder-discord-muted focus:outline-none focus:ring-2 focus:ring-discord-accent focus:border-transparent"
                disabled={submitting}
              />
              {errors.username && <p className="mt-1 text-sm text-discord-red">{errors.username.message}</p>}
            </div>

            {passwordField}

            {needsSetup && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium mb-1">Confirm Password</label>
                <input
                  {...register("confirmPassword", {
                    required: "Confirm your password",
                    validate: (val: string) => {
                      const pw = watch("password");
                      return val === pw || "Passwords do not match";
                    },
                  })}
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  className="w-full px-4 py-3 rounded-lg bg-discord-input border border-discord-border text-discord-text placeholder-discord-muted focus:outline-none focus:ring-2 focus:ring-discord-accent focus:border-transparent"
                  disabled={submitting}
                />
                {errors.confirmPassword && <p className="mt-1 text-sm text-discord-red">{errors.confirmPassword.message}</p>}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 px-4 rounded-lg bg-discord-accent text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? "Please wait..." : needsSetup ? "Create Admin & Sign In" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center mt-4 text-xs text-discord-muted/50 font-mono">
          {version ? `v${version}` : ""}
        </p>
      </div>
    </div>
  );
}