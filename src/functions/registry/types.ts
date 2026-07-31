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
  onMessage?(message: any, bot: any, context: any): Promise<void>;
  /** A member joined the guild. Requires the privileged GuildMembers intent. */
  onMemberJoin?(member: any, bot: any, context: any): Promise<void>;
  /** A member's roles or profile changed. Requires the GuildMembers intent. */
  onMemberUpdate?(before: any, after: any, bot: any, context: any): Promise<void>;
  getStats(): Record<string, unknown>;
  handleCommand?(interaction: any, bot: any, context: any): Promise<void>;
}
