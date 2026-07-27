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
  const [discordConfigured, setDiscordConfigured] = useState(false);

  const { register, handleSubmit, formState: { errors }, watch } = useForm({
    defaultValues: { username: "", password: "", confirmPassword: "" },
  });

  useEffect(() => {
    api.request<{ needsSetup: boolean }>("/api/auth/setup/status").then(r => setNeedsSetup(r.needsSetup)).catch(() => setNeedsSetup(true));
    api.getVersion().then(v => setVersion(v.version)).catch(() => {});
    // Check if Discord OAuth is configured by trying to load the URL
    setDiscordConfigured(!!api.discordAuthUrl());
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

  const handleDiscordLogin = () => {
    window.location.href = api.discordAuthUrl();
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

          {/* Discord Login Button */}
          {discordConfigured && !needsSetup && (
            <>
              <button
                onClick={handleDiscordLogin}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-lg bg-[#5865F2] text-white font-medium hover:bg-[#4752C4] transition-colors mb-4"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561 19.9312 19.9312 0 005.9932 3.0397.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057 13.1073 13.1073 0 01-1.872-.8923.0766.0766 0 01-.0074-.127 10.2292 10.2292 0 00.3723-.2917.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3733.2926a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286 19.8975 19.8975 0 006.0022-3.0397.0771.0771 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
                </svg>
                Login with Discord
              </button>
              <div className="relative mb-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-discord-border"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-discord-card text-discord-muted">or sign in with username</span>
                </div>
              </div>
            </>
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
