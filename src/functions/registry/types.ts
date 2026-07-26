import type { ApplicationCommandData } from "discord.js";

export interface FunctionManifest {
  name: string;
  label: string;
  description: string;
  icon: string;
  version: string;
  configSchema: any;
  defaultConfig: Record<string, unknown>;
  commands: ApplicationCommandData[];
  createInstance: (config: Record<string, unknown>) => Promise<FunctionInstance>;
}

export interface FunctionInstance {
  name: string;
  config: Record<string, unknown>;
  manifest?: FunctionManifest;
  onLoad?(bot: any, config: Record<string, unknown>): Promise<void>;
  onUnload?(): Promise<void>;
  onConfigChange?(newConfig: Record<string, unknown>): Promise<void>;
  getStats(): Record<string, unknown>;
  handleCommand?(interaction: any, bot: any, context: any): Promise<void>;
}
