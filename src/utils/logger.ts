import pino from "pino";
import { systemLog } from "./systemLog";

const isDev = process.env.NODE_ENV !== "production";

// Simple writable stream that tees pino output into systemLog
const teeStream = new (require("stream").PassThrough)({
  write(chunk: Buffer, _encoding: BufferEncoding, cb: () => void) {
    try {
      const parsed = JSON.parse(chunk.toString());
      const level = typeof parsed.level === "number"
        ? parsed.level <= 15 ? "fatal" : parsed.level <= 25 ? "error" : parsed.level <= 35 ? "warn" : parsed.level <= 45 ? "info" : "debug"
        : "info";
      const msg = parsed.msg || "";
      const { msg: _, level: __, time: ___, service: ____, ...rest } = parsed;
      systemLog.add(level as any, msg, "system", Object.keys(rest).length > 0 ? rest : undefined);
    } catch {}
    cb();
  },
});

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
    base: { service: "starrbot" },
  },
  isDev
    ? pino.transport({
        targets: [
          {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss Z",
              ignore: "pid,hostname",
            },
            level: "debug",
          },
          { target: "pino/file", options: { destination: 1 }, level: "debug" },
        ],
      })
    : teeStream,
);

// In non-dev mode, pipe teeStream into systemLog. In dev, also tee.
if (isDev) {
  teeStream.on("data", () => {});
}

export const createChildLogger = (bindings: Record<string, unknown>) => logger.child(bindings);
