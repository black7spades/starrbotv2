import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";

let redisClient: InstanceType<typeof Redis> | null = null;

export function createRedisConnection(): InstanceType<typeof Redis> {
  if (!redisClient) {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      lazyConnect: true,
    });

    redisClient.on("error", (err) => console.error("[Redis] Error:", err.message));
    redisClient.on("connect", () => console.log("[Redis] Connected"));
  }
  return redisClient;
}

export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
