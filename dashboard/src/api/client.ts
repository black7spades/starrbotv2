const API_BASE = import.meta.env.VITE_API_URL || "";

export interface FeedProviderField {
  key: string;
  label: string;
  placeholder: string;
  hint?: string;
  required?: boolean;
}

export interface FeedProvider {
  id: string;
  label: string;
  description: string;
  icon: string;
  feedSource: string;
  fields: FeedProviderField[];
}

class ApiClient {
  private base: string;

  constructor(base: string = "") {
    this.base = base;
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.base}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      credentials: "include",
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(error.message || `HTTP ${res.status}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json();
  }

  get<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: "GET" });
  }

  post<T>(endpoint: string, body: any) {
    return this.request<T>(endpoint, { method: "POST", body: JSON.stringify(body) });
  }

  patch<T>(endpoint: string, body: any) {
    return this.request<T>(endpoint, { method: "PATCH", body: JSON.stringify(body) });
  }

  delete<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: "DELETE" });
  }

  // Auth
  login(username: string, password: string) {
    return this.post<{ user: { id: string; username: string; role: string } }>("/api/auth/login", { username, password });
  }

  logout() {
    return this.post("/api/auth/logout", {});
  }

  getMe() {
    return this.get<
      { user: { id: string; username: string; role: string; avatarUrl?: string | null } } | { user: null }
    >("/api/auth/me");
  }

  updateProfile(data: { username?: string; avatarUrl?: string | null }) {
    return this.patch<{
      user: { id: string; username: string; role: string; avatarUrl?: string | null };
    }>("/api/auth/me", data);
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.post<{ ok: boolean; reauth?: boolean }>("/api/auth/me/password", {
      currentPassword,
      newPassword,
    });
  }

  refresh() {
    return this.post("/api/auth/refresh", {});
  }

  // Bots
  getBots() {
    return this.get<{ bots: any[] }>("/api/bots");
  }

  getBot(id: string) {
    return this.get<any>(`/api/bots/${id}`);
  }

  getChannels(botId: string, guildId: string) {
    return this.get<{ id: string; name: string; type: number }[]>(`/api/bots/${botId}/guilds/${guildId}/channels`);
  }

  createBot(data: any) {
    return this.post<{ id: string; name: string }>("/api/bots", data);
  }

  updateBot(id: string, data: any) {
    return this.patch(`/api/bots/${id}`, data);
  }

  deleteBot(id: string) {
    return this.delete(`/api/bots/${id}`);
  }

  startBot(id: string) {
    return this.post(`/api/bots/${id}/start`, {});
  }

  stopBot(id: string) {
    return this.post(`/api/bots/${id}/stop`, {});
  }

  restartBot(id: string) {
    return this.post(`/api/bots/${id}/restart`, {});
  }

  // Functions
  getFunctions() {
    return this.get<any[]>("/api/functions");
  }

  getFunctionManifest(name: string) {
    return this.get<any>(`/api/functions/${name}`);
  }

  getBotFunction(botId: string, functionName: string) {
    return this.get<any>(`/api/bots/${botId}/functions/${functionName}`);
  }

  updateFunctionConfig(botId: string, functionName: string, data: any) {
    return this.patch(`/api/bots/${botId}/functions/${functionName}`, data);
  }

  /** Source types the Updates function can follow. */
  getUpdateProviders() {
    return this.get<{ providers: FeedProvider[] }>("/api/functions/updates/providers");
  }

  /** Previews a feed, from either a ready URL or a provider + its field values. */
  testFeed(body: { url?: string; providerId?: string; input?: Record<string, string> }) {
    return this.post<{
      ok: boolean;
      url?: string;
      error?: string;
      itemCount?: number;
      items?: { title: string; link: string }[];
    }>("/api/functions/test-feed", body);
  }

  // Users (admin)
  getUsers() {
    return this.get<any[]>("/api/users");
  }

  createUser(data: any) {
    return this.post("/api/users", data);
  }

  updateUser(id: string, data: any) {
    return this.patch(`/api/users/${id}`, data);
  }

  deleteUser(id: string) {
    return this.delete(`/api/users/${id}`);
  }

  // Settings
  getSettings() {
    return this.get<any>("/api/settings");
  }

  updateSettings(data: any) {
    return this.patch("/api/settings", data);
  }

  // Discord OAuth
  discordAuthUrl() {
    return `${this.base}/api/auth/discord`;
  }

  getDiscordStatus() {
    return this.get<{ configured: boolean }>("/api/auth/discord/status");
  }

  // Templates
  getTemplates() {
    return this.get<{ templates: any[] }>("/api/bots/templates");
  }

  createTemplate(data: { name: string; description?: string; botId: string }) {
    return this.post<any>("/api/bots/templates", data);
  }

  createBotFromTemplate(templateId: string, data: { name: string; token: string; clientId: string; guildId?: string }) {
    return this.post<{ id: string }>(`/api/bots/from-template/${templateId}`, data);
  }

  deleteTemplate(id: string) {
    return this.delete(`/api/bots/templates/${id}`);
  }

  // Version
  getVersion() {
    return this.get<{ version: string; buildTime: string; nodeEnv: string }>("/api/version");
  }
}

export const api = new ApiClient(API_BASE);