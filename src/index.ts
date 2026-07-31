import { configStore } from "config/index";
import { startServer } from "api/server";
import { botManager } from "discord/manager";
import { functionRegistry, registerFunction } from "functions/registry/index";
import { updatesManifest } from "functions/updates/index";
import { ticketsManifest } from "functions/tickets/index";
import { twitchManifest } from "functions/twitch/index";
import { welcomeManifest } from "functions/welcome/index";
import { subsManifest } from "functions/subs/index";
import { logger } from "utils/logger";
import { systemLog } from "utils/systemLog";
import { startMaintenance, stopMaintenance } from "utils/storage";

// Auto-start enabled bots on startup
async function startEnabledBots(): Promise<void> {
  const bots = configStore.getBots();
  for (const bot of bots) {
    if (bot.enabled) {
      try {
        await botManager.startBot(bot);
        logger.info({ botId: bot.id, botName: bot.name }, "Auto-started bot");
      } catch (err: any) {
        logger.error({ err, botId: bot.id }, "Failed to auto-start bot");
      }
    }
  }
}

async function main(): Promise<void> {
  logger.info("Starting StarrBot v2...");

  // Initialize function registry (loads built-in functions)
  registerFunction(updatesManifest);
  registerFunction(ticketsManifest);
  registerFunction(twitchManifest);
  registerFunction(welcomeManifest);
  registerFunction(subsManifest);
  logger.info("Function registry loaded", { functions: functionRegistry.getAllManifests().map(f => f.name) });

  // Start API server
  await startServer();

  // Auto-start enabled bots
  await startEnabledBots();

  // Keep disk use bounded without anyone having to ask.
  startMaintenance();

  logger.info("StarrBot v2 started successfully");
}

main().catch((err) => {
  logger.fatal({ err }, "Failed to start StarrBot v2");
  process.exit(1);
});

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down...`);
  for (const bot of botManager.getAllBots()) {
    await bot.stop();
  }
  stopMaintenance();
  configStore.close();
  // The system log only writes every 30 seconds, so without this every restart
  // threw away up to half a minute of history — including whatever was logged
  // on the way down, which is exactly the part worth keeping.
  systemLog.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
