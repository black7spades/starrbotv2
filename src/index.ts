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

  logger.info("StarrBot v2 started successfully");
}

main().catch((err) => {
  logger.fatal({ err }, "Failed to start StarrBot v2");
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down...");
  for (const bot of botManager.getAllBots()) {
    await bot.stop();
  }
  configStore.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down...");
  for (const bot of botManager.getAllBots()) {
    await bot.stop();
  }
  configStore.close();
  process.exit(0);
});
