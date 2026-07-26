import { Client, GatewayIntentBits, Events, REST, Routes } from "discord.js";
import { EventEmitter } from "events";
import { configStore } from "config/index";
import { functionRegistry } from "functions/registry/index";
import { logger } from "utils/logger";
import type { Bot } from "config/schema";
import type { FunctionInstance } from "./types";

export interface BotStats {
  postsSent: number;
  errors: number;
  lastCheck: number | null;
  ticketsCreated: number;
  uptime: number | null;
  functions: string[];
}

export interface LogEntry {
  message: string;
  timestamp: number;
  level: "info" | "warn" | "error";
}

export interface ManagedBot extends EventEmitter {
  config: Bot;
  client: Client;
  status: "stopped" | "starting" | "running" | "error";
  error: string | null;
  functions: Map<string, FunctionInstance>;
  startTime: number | null;
  stats: BotStats;
  logs: LogEntry[];
  start(): Promise<void>;
  stop(): Promise<void>;
  reloadFunction(name: string): Promise<void>;
  getStats(): BotStats;
  getLogs(): LogEntry[];
  get guildCount(): number;
  get guilds(): { id: string; name: string; memberCount: number; icon: string | null }[];
  addLog(message: string, level: LogEntry["level"]): void;
}

const MAX_LOGS = 100;

function createBotInstance(botConfig: Bot): ManagedBot {
  const emitter = new EventEmitter();
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  const functions = new Map<string, FunctionInstance>();
  const logs: LogEntry[] = [];
  let status: ManagedBot["status"] = "stopped";
  let error: string | null = null;
  let startTime: number | null = null;

  const stats: BotStats = {
    postsSent: 0,
    errors: 0,
    lastCheck: null,
    ticketsCreated: 0,
    uptime: null,
    functions: [],
  };

  function addLog(message: string, level: LogEntry["level"] = "info"): void {
    const entry: LogEntry = { message, timestamp: Date.now(), level };
    logs.push(entry);
    if (logs.length > MAX_LOGS) logs.shift();
    emitter.emit("log", entry);
  }

  function setStatus(newStatus: ManagedBot["status"], newError: string | null = null): void {
    status = newStatus;
    error = newError;
    emitter.emit("statusChange", { status, error });
  }

  async function registerCommands(): Promise<void> {
    const rest = new REST({ version: "10" }).setToken(botConfig.token);
    const commands: any[] = [];

    for (const [, instance] of functions) {
      if (instance.manifest?.commands) {
        commands.push(...instance.manifest.commands);
      }
    }

    if (commands.length > 0) {
      try {
        await rest.put(Routes.applicationCommands(botConfig.clientId), { body: commands });
        addLog(`Registered ${commands.length} slash commands`);
      } catch (err: any) {
        addLog(`Failed to register commands: ${err.message}`, "error");
      }
    }
  }

  function setupEventHandlers(): void {
    client.once(Events.ClientReady, async (c) => {
      addLog(`Logged in as ${c.user.tag}`);
      setStatus("running");
      startTime = Date.now();
      stats.uptime = Date.now();
      await registerCommands();
      emitter.emit("ready");
    });

    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const commandName = interaction.commandName;
      for (const [name, instance] of functions) {
        if (instance.manifest?.commands?.some((cmd: any) => cmd.name === commandName)) {
          try {
            if (instance.handleCommand) {
              await instance.handleCommand(interaction, emitter as ManagedBot, { bot: emitter, client, config: botConfig });
            }
          } catch (err: any) {
            addLog(`Command error (${commandName}): ${err.message}`, "error");
            stats.errors++;
            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply({ content: "Error executing command", ephemeral: true }).catch(() => {});
            }
          }
          return;
        }
      }
    });

    client.on(Events.MessageCreate, async (message) => {
      if (message.author.bot || !message.guild) return;
      for (const [, instance] of functions) {
        if (instance.onMessage) {
          try {
            await instance.onMessage(message, emitter as ManagedBot, { bot: emitter, client, config: botConfig });
          } catch (err: any) {
            addLog(`Message handler error: ${err.message}`, "error");
          }
        }
      }
    });

    client.on(Events.Error, (err) => {
      addLog(`Client error: ${err.message}`, "error");
      stats.errors++;
    });

    client.on(Events.Warn, (warn) => {
      addLog(`Discord warning: ${warn}`, "warn");
    });
  }

  const result = {
    config: botConfig,
    client,
    get status() { return status; },
    get error() { return error; },
    functions,
    get startTime() { return startTime; },
    stats,
    logs,

    async start() {
      if (status !== "stopped") return;
      setStatus("starting");
      addLog("Starting bot...");

      const botFunctions = configStore.getBotFunctions(botConfig.id);
      for (const bf of botFunctions) {
        if (bf.enabled) {
          const manifest = functionRegistry.getManifest(bf.functionName);
          if (manifest) {
            try {
              const instance = await manifest.createInstance(bf.config);
              instance.manifest = manifest;
              functions.set(bf.functionName, instance);
              await instance.onLoad?.(emitter as ManagedBot, bf.config);
              addLog(`Loaded function: ${bf.functionName}`);
            } catch (err: any) {
              addLog(`Failed to load function ${bf.functionName}: ${err.message}`, "error");
            }
          }
        }
      }

      stats.functions = Array.from(functions.keys());
      setupEventHandlers();

      try {
        await client.login(botConfig.token);
      } catch (err: any) {
        setStatus("error", err.message);
        addLog(`Login failed: ${err.message}`, "error");
        throw err;
      }
    },

    async stop() {
      if (status === "stopped") return;
      addLog("Stopping bot...");

      for (const [name, instance] of functions) {
        try {
          await instance.onUnload?.();
        } catch (err: any) {
          addLog(`Error stopping function ${name}: ${err.message}`, "error");
        }
      }
      functions.clear();

      client.destroy();
      setStatus("stopped");
      startTime = null;
      stats.uptime = null;
    },

    async reloadFunction(name: string) {
      const bf = configStore.getBotFunction(botConfig.id, name);
      if (!bf) return;

      const oldInstance = functions.get(name);
      if (oldInstance) {
        try {
          await oldInstance.onUnload?.();
        } catch (err: any) {
          addLog(`Error stopping function ${name}: ${err.message}`, "error");
        }
        functions.delete(name);
      }

      if (bf.enabled) {
        const manifest = functionRegistry.getManifest(name);
        if (manifest) {
          try {
            const instance = await manifest.createInstance(bf.config);
            instance.manifest = manifest;
            functions.set(name, instance);
            await instance.onLoad?.(emitter as ManagedBot, bf.config);
            addLog(`Reloaded function: ${name}`);
          } catch (err: any) {
            addLog(`Failed to reload function ${name}: ${err.message}`, "error");
          }
        }
      }

      stats.functions = Array.from(functions.keys());
    },

    getStats() {
      return {
        ...stats,
        uptime: startTime ? Date.now() - startTime : null,
      };
    },

    getLogs() {
      return [...logs];
    },

    get guildCount() {
      return client.guilds.cache.size;
    },

    get guilds() {
      return Array.from(client.guilds.cache.values()).map((g) => ({
        id: g.id,
        name: g.name,
        memberCount: g.memberCount,
        icon: g.iconURL(),
      }));
    },

    addLog,
  } as ManagedBot;

  Object.setPrototypeOf(result, Object.getPrototypeOf(emitter));
  return result;
}

class BotManagerClass extends EventEmitter {
  private bots = new Map<string, ManagedBot>();

  getBot(id: string): ManagedBot | undefined {
    return this.bots.get(id);
  }

  getAllBots(): ManagedBot[] {
    return Array.from(this.bots.values());
  }

  getAllBotSummaries() {
    const bots = configStore.getBotSummaries();
    return bots.map((bot) => {
      const runtime = this.bots.get(bot.id);
      return {
        ...bot,
        status: runtime?.status || "stopped",
        error: runtime?.error || null,
        guildCount: runtime?.guildCount || 0,
      };
    });
  }

  async startBot(config: Bot): Promise<ManagedBot> {
    if (this.bots.has(config.id)) {
      throw new Error("Bot already running");
    }

    const bot = createBotInstance(config);
    this.bots.set(config.id, bot);

    bot.on("statusChange", ({ status, error }) => {
      this.emit("bot:status", { id: config.id, status, error });
    });

    bot.on("log", (log: LogEntry) => {
      this.emit("bot:log", { botId: config.id, ...log });
    });

    try {
      await bot.start();
    } catch (err) {
      this.bots.delete(config.id);
      throw err;
    }

    return bot;
  }

  async stopBot(id: string): Promise<void> {
    const bot = this.bots.get(id);
    if (!bot) return;

    await bot.stop();
    this.bots.delete(id);
  }

  async restartBot(config: Bot): Promise<void> {
    await this.stopBot(config.id);
    await this.startBot(config);
  }

  checkRedisConnection(): boolean {
    return true;
  }
}

export const botManager = new BotManagerClass();
