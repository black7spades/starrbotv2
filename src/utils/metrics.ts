import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from "prom-client";

export const register = new Registry();

collectDefaultMetrics({ register, prefix: "starrbot_" });

export const httpRequestsTotal = new Counter({
  name: "starrbot_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: "starrbot_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const botStatus = new Gauge({
  name: "starrbot_bot_status",
  help: "Bot status (0=stopped, 1=starting, 2=running, 3=error)",
  labelNames: ["bot_id", "bot_name"],
  registers: [register],
});

export const botGuildCount = new Gauge({
  name: "starrbot_bot_guild_count",
  help: "Number of guilds the bot is in",
  labelNames: ["bot_id"],
  registers: [register],
});

export const feedsCheckedTotal = new Counter({
  name: "starrbot_feeds_checked_total",
  help: "Total number of feed checks",
  labelNames: ["bot_id", "result"],
  registers: [register],
});

export const postsSentTotal = new Counter({
  name: "starrbot_posts_sent_total",
  help: "Total posts sent to Discord",
  labelNames: ["bot_id", "platform"],
  registers: [register],
});

export const feedErrorsTotal = new Counter({
  name: "starrbot_feed_errors_total",
  help: "Total feed check errors",
  labelNames: ["bot_id", "feed_url"],
  registers: [register],
});

export const ticketsCreatedTotal = new Counter({
  name: "starrbot_tickets_created_total",
  help: "Total tickets created",
  labelNames: ["bot_id"],
  registers: [register],
});

export const queueJobsActive = new Gauge({
  name: "starrbot_queue_jobs_active",
  help: "Active queue jobs",
  labelNames: ["bot_id", "queue_name"],
  registers: [register],
});

export const queueJobsCompleted = new Counter({
  name: "starrbot_queue_jobs_completed_total",
  help: "Completed queue jobs",
  labelNames: ["bot_id", "queue_name", "status"],
  registers: [register],
});

export function recordBotStatus(botId: string, botName: string, status: "stopped" | "starting" | "running" | "error"): void {
  const statusMap = { stopped: 0, starting: 1, running: 2, error: 3 };
  botStatus.set({ bot_id: botId, bot_name: botName }, statusMap[status]);
}

export function recordBotGuildCount(botId: string, count: number): void {
  botGuildCount.set({ bot_id: botId }, count);
}
