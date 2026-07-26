import { EventEmitter } from "events";

export interface FunctionInstance {
  name: string;
  config: Record<string, unknown>;
  manifest?: any;
  onLoad?(bot: any, config: Record<string, unknown>): Promise<void>;
  onUnload?(): Promise<void>;
  onConfigChange?(newConfig: Record<string, unknown>): Promise<void>;
  getStats(): Record<string, unknown>;
  handleCommand?(interaction: any, bot: any, context: any): Promise<void>;
}

export interface FunctionManifest {
  name: string;
  label: string;
  description: string;
  icon: string;
  version: string;
  configSchema: any;
  defaultConfig: Record<string, unknown>;
  commands: any[];
  createInstance(config: Record<string, unknown>): Promise<FunctionInstance>;
}

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
  config: any;
  client: any;
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
  addLog(message: string, level: LogEntry["level"]): void;
}
