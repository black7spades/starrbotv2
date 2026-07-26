import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import {
  User,
  CreateUserInput,
  UpdateUserInput,
  Bot,
  CreateBotInput,
  UpdateBotInput,
  BotFunction,
  UpdateFunctionConfigInput,
  GlobalSettings,
  RefreshToken,
  BotSummary,
  TicketLog,
} from "./schema";

const DATA_DIR = join(__dirname, "../../data");

const USERS_FILE = join(DATA_DIR, "users.json");
const BOTS_FILE = join(DATA_DIR, "bots.json");
const BOT_FUNCTIONS_FILE = join(DATA_DIR, "bot-functions.json");
const SETTINGS_FILE = join(DATA_DIR, "settings.json");
const REFRESH_TOKENS_FILE = join(DATA_DIR, "refresh-tokens.json");
const POSTED_URLS_FILE = join(DATA_DIR, "posted-urls.json");
const TICKETS_LOG_FILE = join(DATA_DIR, "tickets-log.json");

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJson<T>(file: string, defaultValue: T): T {
  ensureDataDir();
  if (!existsSync(file)) return defaultValue;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return defaultValue;
  }
}

function writeJson<T>(file: string, data: T): void {
  ensureDataDir();
  writeFileSync(file, JSON.stringify(data, null, 2));
}

function generateId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export class ConfigStore {
  private static instance: ConfigStore | null = null;

  private constructor() {}

  static getInstance(): ConfigStore {
    if (!ConfigStore.instance) {
      ConfigStore.instance = new ConfigStore();
    }
    return ConfigStore.instance;
  }

  // Users
  getUsers(): Omit<User, "passwordHash">[] {
    const users = readJson<User[]>(USERS_FILE, []);
    return users.map(({ passwordHash, ...u }) => u);
  }

  hasAdminUser(): boolean {
    const users = readJson<User[]>(USERS_FILE, []);
    return users.some((u) => u.role === "admin");
  }

  getUserByUsername(username: string): User | null {
    const users = readJson<User[]>(USERS_FILE, []);
    return users.find((u) => u.username === username) || null;
  }

  getUserById(id: string): Omit<User, "passwordHash"> | null {
    const users = readJson<User[]>(USERS_FILE, []);
    const user = users.find((u) => u.id === id);
    if (!user) return null;
    const { passwordHash, ...rest } = user;
    return rest;
  }

  createUser(input: CreateUserInput): Omit<User, "passwordHash"> {
    const users = readJson<User[]>(USERS_FILE, []);
    const id = generateId(input.username);
    const now = Date.now();
    const user: User = { id, username: input.username, passwordHash: input.password, role: input.role, createdAt: now };
    users.push(user);
    writeJson(USERS_FILE, users);
    const { passwordHash, ...rest } = user;
    return rest;
  }

  updateUser(id: string, updates: UpdateUserInput): Omit<User, "passwordHash"> | null {
    const users = readJson<User[]>(USERS_FILE, []);
    const idx = users.findIndex((u) => u.id === id);
    if (idx === -1) return null;

    if (updates.username) users[idx].username = updates.username;
    if (updates.password) users[idx].passwordHash = updates.password; // Already hashed
    if (updates.role) users[idx].role = updates.role;

    writeJson(USERS_FILE, users);
    const { passwordHash, ...rest } = users[idx];
    return rest;
  }

  deleteUser(id: string): boolean {
    const users = readJson<User[]>(USERS_FILE, []);
    const filtered = users.filter((u) => u.id !== id);
    if (filtered.length === users.length) return false;
    writeJson(USERS_FILE, filtered);
    return true;
  }

  // Bots
  getBots(): Bot[] {
    return readJson<Bot[]>(BOTS_FILE, []);
  }

  getBot(id: string): Bot | null {
    const bots = this.getBots();
    return bots.find((b) => b.id === id) || null;
  }

  createBot(input: CreateBotInput): Bot {
    const bots = this.getBots();
    const id = generateId(input.name);
    const now = Date.now();
    const bot: Bot = { id, ...input, enabled: true, createdAt: now };
    bots.push(bot);
    writeJson(BOTS_FILE, bots);
    return bot;
  }

  updateBot(id: string, updates: UpdateBotInput): Bot | null {
    const bots = this.getBots();
    const idx = bots.findIndex((b) => b.id === id);
    if (idx === -1) return null;

    if (updates.name !== undefined) bots[idx].name = updates.name;
    if (updates.token !== undefined) bots[idx].token = updates.token;
    if (updates.clientId !== undefined) bots[idx].clientId = updates.clientId;
    if (updates.avatarUrl !== undefined) bots[idx].avatarUrl = updates.avatarUrl;
    if (updates.enabled !== undefined) bots[idx].enabled = updates.enabled;

    writeJson(BOTS_FILE, bots);
    return bots[idx];
  }

  deleteBot(id: string): boolean {
    const bots = this.getBots();
    const filtered = bots.filter((b) => b.id !== id);
    if (filtered.length === bots.length) return false;
    writeJson(BOTS_FILE, filtered);
    // Also delete function configs
    this.deleteBotFunctions(id);
    return true;
  }

  // Bot Functions
  getBotFunctions(botId: string): BotFunction[] {
    const all = readJson<Record<string, BotFunction[]>>(BOT_FUNCTIONS_FILE, {});
    return all[botId] || [];
  }

  getBotFunction(botId: string, functionName: string): BotFunction | null {
    const funcs = this.getBotFunctions(botId);
    return funcs.find((f) => f.functionName === functionName) || null;
  }

  upsertBotFunction(botId: string, functionName: string, input: UpdateFunctionConfigInput): BotFunction {
    const all = readJson<Record<string, BotFunction[]>>(BOT_FUNCTIONS_FILE, {});
    if (!all[botId]) all[botId] = [];

    const idx = all[botId].findIndex((f) => f.functionName === functionName);
    const config = input.config ?? (idx >= 0 ? all[botId][idx].config : {});
    const enabled = input.enabled ?? (idx >= 0 ? all[botId][idx].enabled : false);

    if (idx >= 0) {
      all[botId][idx] = { ...all[botId][idx], config, enabled };
    } else {
      all[botId].push({ botId, functionName, config, enabled });
    }

    writeJson(BOT_FUNCTIONS_FILE, all);
    return { botId, functionName, config, enabled };
  }

  deleteBotFunctions(botId: string): void {
    const all = readJson<Record<string, BotFunction[]>>(BOT_FUNCTIONS_FILE, {});
    delete all[botId];
    writeJson(BOT_FUNCTIONS_FILE, all);
  }

  // Settings
  getSettings(): GlobalSettings {
    const settings = readJson<Record<string, any>>(SETTINGS_FILE, {});
    return {
      commandPrefix: settings.commandPrefix ?? "!",
      theme: settings.theme ?? "dark",
    };
  }

  updateSettings(updates: Partial<GlobalSettings>): GlobalSettings {
    const current = this.getSettings();
    const merged = { ...current, ...updates };
    writeJson(SETTINGS_FILE, merged);
    return merged;
  }

  // Refresh Tokens
  storeRefreshToken(tokenHash: string, userId: string, expiresAt: number): void {
    const tokens = readJson<RefreshToken[]>(REFRESH_TOKENS_FILE, []);
    tokens.push({ tokenHash, userId, expiresAt, createdAt: Date.now() });
    writeJson(REFRESH_TOKENS_FILE, tokens);
  }

  getRefreshToken(tokenHash: string): RefreshToken | null {
    const tokens = readJson<RefreshToken[]>(REFRESH_TOKENS_FILE, []);
    return tokens.find((t) => t.tokenHash === tokenHash && t.expiresAt > Date.now()) || null;
  }

  revokeRefreshToken(tokenHash: string): boolean {
    const tokens = readJson<RefreshToken[]>(REFRESH_TOKENS_FILE, []);
    const filtered = tokens.filter((t) => t.tokenHash !== tokenHash);
    if (filtered.length === tokens.length) return false;
    writeJson(REFRESH_TOKENS_FILE, filtered);
    return true;
  }

  revokeAllUserRefreshTokens(userId: string): void {
    const tokens = readJson<RefreshToken[]>(REFRESH_TOKENS_FILE, []);
    const filtered = tokens.filter((t) => t.userId !== userId);
    writeJson(REFRESH_TOKENS_FILE, filtered);
  }

  // Posted URLs (dedup)
  addPostedUrl(botId: string, url: string): void {
    const all = readJson<Record<string, string[]>>(POSTED_URLS_FILE, {});
    if (!all[botId]) all[botId] = [];
    const hash = this.hashUrl(url);
    if (!all[botId].includes(hash)) {
      all[botId].push(hash);
      // Keep only last 1000
      if (all[botId].length > 1000) all[botId] = all[botId].slice(-1000);
      writeJson(POSTED_URLS_FILE, all);
    }
  }

  hasPostedUrl(botId: string, url: string): boolean {
    const all = readJson<Record<string, string[]>>(POSTED_URLS_FILE, {});
    const hash = this.hashUrl(url);
    return all[botId]?.includes(hash) ?? false;
  }

  private hashUrl(url: string): string {
    return createHash("sha256").update(url).digest("hex").slice(0, 32);
  }

  prunePostedUrls(botId: string, maxAge: number = 30 * 24 * 60 * 60 * 1000): number {
    // Simple pruning - in JSON we just truncate to 1000 entries
    const all = readJson<Record<string, string[]>>(POSTED_URLS_FILE, {});
    if (all[botId] && all[botId].length > 1000) {
      all[botId] = all[botId].slice(-1000);
      writeJson(POSTED_URLS_FILE, all);
      return all[botId].length;
    }
    return 0;
  }

  // Ticket logs
  logTicket(entry: Omit<TicketLog, "closedAt">): TicketLog {
    const tickets = readJson<TicketLog[]>(TICKETS_LOG_FILE, []);
    const record: TicketLog = { ...entry, closedAt: Date.now() };
    tickets.push(record);
    writeJson(TICKETS_LOG_FILE, tickets);
    return record;
  }

  getTicketLogs(limit: number = 100): TicketLog[] {
    const tickets = readJson<TicketLog[]>(TICKETS_LOG_FILE, []);
    return tickets.slice(-limit);
  }

  getBotSummaries(): BotSummary[] {
    const bots = this.getBots();
    return bots.map((bot) => {
      const functions = this.getBotFunctions(bot.id);
      return {
        id: bot.id,
        name: bot.name,
        avatarUrl: bot.avatarUrl,
        enabled: bot.enabled,
        status: "stopped",
        error: null,
        guildCount: 0,
        activeFunctions: functions.filter((f) => f.enabled).map((f) => f.functionName),
        allFunctions: functions.map((f) => f.functionName),
      };
    });
  }

  close(): void {
    // No-op for JSON store
  }
}

export const configStore = ConfigStore.getInstance();
