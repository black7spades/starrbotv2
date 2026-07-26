import { Client, GatewayIntentBits, Events, REST, Routes, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import { EventEmitter } from "events";
import { configStore } from "config/index";
import { functionRegistry } from "functions/registry/index";
import { systemLog } from "utils/systemLog";
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

export interface ManagedBot extends EventEmitter {
  config: Bot;
  client: Client;
  status: "stopped" | "starting" | "running" | "error";
  error: string | null;
  functions: Map<string, FunctionInstance>;
  startTime: number | null;
  stats: BotStats;
  start(): Promise<void>;
  stop(): Promise<void>;
  reloadFunction(name: string): Promise<void>;
  getStats(): BotStats;
  get guildCount(): number;
  get guilds(): { id: string; name: string; memberCount: number; icon: string | null }[];
}

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

  const botSource = `bot:${botConfig.id}`;

  function log(level: "info" | "warn" | "error", message: string, context?: Record<string, unknown>) {
    systemLog.add(level, message, botSource, { botName: botConfig.name, ...context });
    emitter.emit("log", { message, timestamp: Date.now(), level });
  }

  function setStatus(newStatus: ManagedBot["status"], newError: string | null = null): void {
    status = newStatus;
    error = newError;
    emitter.emit("statusChange", { status, error });
  }

  async function registerCommands(): Promise<void> {
    const rest = new REST({ version: "10" }).setToken(botConfig.token);
    const commands: any[] = [
      {
        name: "help",
        description: "List all available slash commands",
      } as any,
    ];

    const seen = new Set<string>();
    seen.add("help");

    for (const [, instance] of functions) {
      if (instance.manifest?.commands) {
        for (const cmd of instance.manifest.commands) {
          if (!seen.has(cmd.name)) {
            seen.add(cmd.name);
            commands.push(cmd);
          }
        }
      }
    }

    if (commands.length === 0) return;

    const guildId = process.env.GUILD_ID || client.guilds.cache.first()?.id;

    try {
      if (guildId) {
        await rest.put(Routes.applicationGuildCommands(botConfig.clientId, guildId), { body: commands });
        log("info", `Registered ${commands.length} slash commands (guild ${guildId})`);
        try {
          const globalCmds = await rest.get(Routes.applicationCommands(botConfig.clientId)) as any[];
          if (globalCmds && globalCmds.length > 0) {
            await rest.put(Routes.applicationCommands(botConfig.clientId), { body: [] });
            log("info", `Cleared ${globalCmds.length} stale global commands`);
          }
        } catch {}
      } else {
        await rest.put(Routes.applicationCommands(botConfig.clientId), { body: commands });
        log("info", `Registered ${commands.length} slash commands (global — may take up to 1 hour to propagate)`);
      }
    } catch (err: any) {
      log("error", `Failed to register commands: ${err.message}`);
    }
  }

  function setupEventHandlers(): void {
    client.once(Events.ClientReady, async (c) => {
      log("info", `Logged in as ${c.user.tag}`);
      setStatus("running");
      startTime = Date.now();
      stats.uptime = Date.now();
      await registerCommands();
      emitter.emit("ready");
    });

    client.on(Events.InteractionCreate, async (interaction) => {
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "help") {
          const activeFunctions = Array.from(functions.entries()).filter(
            ([, inst]) => inst.manifest?.commands?.length > 0,
          );

          if (activeFunctions.length === 0) {
            await interaction.reply({
              content: "No commands enabled. Enable functions in the dashboard first.",
              ephemeral: true,
            });
            return;
          }

          const buildAllEmbed = () => {
            const embed = new EmbedBuilder()
              .setTitle("Available Commands")
              .setDescription("Select a function from the dropdown to filter commands.")
              .setColor(0x5865f2)
              .setTimestamp();

            for (const [name, instance] of activeFunctions) {
              const cmds = instance.manifest!.commands!;
              const cmdList = cmds.map((c: any) => `\`/${c.name}\` — ${c.description || "No description"}`).join("\n");
              embed.addFields({
                name: `${instance.manifest?.icon || "🔧"} ${instance.manifest?.label || name}`,
                value: cmdList,
              });
            }
            return embed;
          };

          const buildFunctionEmbed = (fnName: string) => {
            const instance = functions.get(fnName);
            if (!instance) return buildAllEmbed();
            const cmds = instance.manifest?.commands || [];
            const embed = new EmbedBuilder()
              .setTitle(`${instance.manifest?.icon || "🔧"} ${instance.manifest?.label || fnName}`)
              .setColor(0x5865f2)
              .setTimestamp();

            if (cmds.length > 0) {
              embed.setDescription(
                cmds.map((c: any) => `\`/${c.name}\` — ${c.description || "No description"}`).join("\n"),
              );
            } else {
              embed.setDescription("No commands in this function.");
            }
            return embed;
          };

          const selectMenu = new StringSelectMenuBuilder()
            .setCustomId("help:function-select")
            .setPlaceholder("Filter by function...")
            .addOptions(
              activeFunctions.map(([name, instance]) => ({
                label: instance.manifest?.label || name,
                value: name,
                emoji: instance.manifest?.icon || "🔧",
              })),
            );

          const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

          const reply = await interaction.reply({
            embeds: [buildAllEmbed()],
            components: [row],
            ephemeral: true,
          });

          const collector = reply.createMessageComponentCollector({
            filter: (i: any) => i.user.id === interaction.user.id,
            time: 300000,
          });

          collector.on("collect", async (i: any) => {
            if (!i.isStringSelectMenu()) return;
            const selected = i.values[0];
            if (selected === "all") {
              await i.update({ embeds: [buildAllEmbed()] });
            } else {
              await i.update({ embeds: [buildFunctionEmbed(selected)] });
            }
          });

          return;
        }

        const commandName = interaction.commandName;
        for (const [name, instance] of functions) {
          if (instance.manifest?.commands?.some((cmd: any) => cmd.name === commandName)) {
            try {
              if (instance.handleCommand) {
                await instance.handleCommand(interaction, emitter as ManagedBot, { bot: emitter, client, config: botConfig });
              }
            } catch (err: any) {
              log("error", `Command error (${commandName}): ${err.message}`);
              stats.errors++;
              if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: "Error executing command", ephemeral: true }).catch(() => {});
              }
            }
            return;
          }
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
            log("error", `Message handler error: ${err.message}`);
          }
        }
      }
    });

    client.on(Events.Error, (err) => {
      log("error", `Client error: ${err.message}`);
      stats.errors++;
    });

    client.on(Events.Warn, (warn) => {
      log("warn", `Discord warning: ${warn}`);
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

    async start() {
      if (status !== "stopped") return;
      setStatus("starting");
      log("info", "Starting bot...");

      const botFunctions = configStore.getBotFunctions(botConfig.id);
      for (const bf of botFunctions) {
        if (bf.enabled) {
          const manifest = functionRegistry.getManifest(bf.functionName);
          if (manifest) {
            try {
              const instance = await manifest.createInstance({ ...bf.config, botId: bf.botId });
              instance.manifest = manifest;
              functions.set(bf.functionName, instance);
              await instance.onLoad?.(emitter as ManagedBot, bf.config);
              log("info", `Loaded function: ${bf.functionName}`);
            } catch (err: any) {
              log("error", `Failed to load function ${bf.functionName}: ${err.message}`);
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
        log("error", `Login failed: ${err.message}`);
        throw err;
      }
    },

    async stop() {
      if (status === "stopped") return;
      log("info", "Stopping bot...");

      for (const [name, instance] of functions) {
        try {
          await instance.onUnload?.();
        } catch (err: any) {
          log("error", `Error stopping function ${name}: ${err.message}`);
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
          log("error", `Error stopping function ${name}: ${err.message}`);
        }
        functions.delete(name);
      }

      if (bf.enabled) {
        const manifest = functionRegistry.getManifest(name);
        if (manifest) {
          try {
            const instance = await manifest.createInstance({ ...bf.config, botId: bf.botId });
            instance.manifest = manifest;
            functions.set(name, instance);
            await instance.onLoad?.(emitter as ManagedBot, bf.config);
            log("info", `Reloaded function: ${name}`);
          } catch (err: any) {
            log("error", `Failed to reload function ${name}: ${err.message}`);
          }
        }
      }

      stats.functions = Array.from(functions.keys());
      await registerCommands();
    },

    getStats() {
      return {
        ...stats,
        uptime: startTime ? Date.now() - startTime : null,
      };
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
