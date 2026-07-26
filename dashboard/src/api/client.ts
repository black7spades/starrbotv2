const API_BASE = import.meta.env.VITE_API_URL || "";

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
    return this.get<{ user: { id: string; username: string; role: string } } | { user: null }>("/api/auth/me");
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

  // Version
  getVersion() {
    return this.get<{ version: string; buildTime: string; nodeEnv: string }>("/api/version");
  }
}

export const api = new ApiClient(API_BASE);