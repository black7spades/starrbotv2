import { z } from "zod";

export const UserRole = z.enum(["admin", "viewer"]);
export type UserRole = z.infer<typeof UserRole>;

export const UserSchema = z.object({
  id: z.string(),
  username: z.string().min(1),
  passwordHash: z.string(),
  discordId: z.string().optional(),
  role: UserRole,
  createdAt: z.number().int().positive(),
});
export type User = z.infer<typeof UserSchema>;

export const CreateUserSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(128),
  discordId: z.string().optional(),
  role: UserRole.default("viewer"),
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  password: z.string().min(8).max(128).optional(),
  role: UserRole.optional(),
});
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

export const BotSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(64),
  token: z.string().min(1),
  clientId: z.string().min(1),
  guildId: z.string().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  enabled: z.boolean().default(true),
  createdAt: z.number().int().positive(),
});
export type Bot = z.infer<typeof BotSchema>;

export const CreateBotSchema = z.object({
  name: z.string().min(1).max(64),
  token: z.string().min(1),
  clientId: z.string().min(1),
  guildId: z.string().optional(),
  avatarUrl: z.string().url().nullable().optional(),
});
export type CreateBotInput = z.infer<typeof CreateBotSchema>;

export const UpdateBotSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  token: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
  guildId: z.string().nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  enabled: z.boolean().optional(),
});
export type UpdateBotInput = z.infer<typeof UpdateBotSchema>;

export const FunctionConfigSchema = z.record(z.unknown());
export type FunctionConfig = z.infer<typeof FunctionConfigSchema>;

export const BotFunctionSchema = z.object({
  botId: z.string(),
  functionName: z.string(),
  config: FunctionConfigSchema,
  enabled: z.boolean().default(false),
});
export type BotFunction = z.infer<typeof BotFunctionSchema>;

export const UpdateFunctionConfigSchema = z.object({
  config: FunctionConfigSchema.optional(),
  enabled: z.boolean().optional(),
});
export type UpdateFunctionConfigInput = z.infer<typeof UpdateFunctionConfigSchema>;

export const GlobalSettingsSchema = z.object({
  commandPrefix: z.string().default("!"),
  theme: z.enum(["light", "dark"]).default("dark"),
});
export type GlobalSettings = z.infer<typeof GlobalSettingsSchema>;

export const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const JWTPayloadSchema = z.object({
  sub: z.string(),
  username: z.string(),
  role: UserRole,
  iat: z.number().int().optional(),
  exp: z.number().int().optional(),
});
export type JWTPayload = z.infer<typeof JWTPayloadSchema>;

export const RefreshTokenSchema = z.object({
  tokenHash: z.string(),
  userId: z.string(),
  expiresAt: z.number().int().positive(),
  createdAt: z.number().int().positive(),
});
export type RefreshToken = z.infer<typeof RefreshTokenSchema>;

export const PostedUrlSchema = z.object({
  botId: z.string(),
  urlHash: z.string(),
  url: z.string().url(),
  postedAt: z.number().int().positive(),
});
export type PostedUrl = z.infer<typeof PostedUrlSchema>;

export const BotStatusSchema = z.enum(["stopped", "starting", "running", "error"]);
export type BotStatus = z.infer<typeof BotStatusSchema>;

export const BotSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  avatarUrl: z.string().url().nullable().optional(),
  enabled: z.boolean(),
  status: BotStatusSchema,
  error: z.string().nullable().optional(),
  guildCount: z.number().int().nonnegative(),
  activeFunctions: z.array(z.string()),
  allFunctions: z.array(z.string()),
});
export type BotSummary = z.infer<typeof BotSummarySchema>;

export const FunctionManifestSchema = z.object({
  name: z.string(),
  label: z.string(),
  description: z.string(),
  icon: z.string(),
  version: z.string(),
  configSchema: z.any(),
  defaultConfig: z.record(z.unknown()),
  commands: z.array(z.any()),
});
export type FunctionManifest = z.infer<typeof FunctionManifestSchema>;

export const BotStatsSchema = z.object({
  postsSent: z.number().int().nonnegative().default(0),
  errors: z.number().int().nonnegative().default(0),
  lastCheck: z.number().int().nullable().optional(),
  ticketsCreated: z.number().int().nonnegative().default(0),
  uptime: z.number().int().nullable().optional(),
  functions: z.array(z.string()),
});
export type BotStats = z.infer<typeof BotStatsSchema>;

export const LogEntrySchema = z.object({
  message: z.string(),
  timestamp: z.number().int().positive(),
  level: z.enum(["info", "warn", "error"]).default("info"),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

export const TemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(64),
  description: z.string().max(256).optional(),
  functionConfigs: z.array(z.object({
    functionName: z.string(),
    config: z.record(z.unknown()),
    enabled: z.boolean(),
  })),
  createdAt: z.number().int().positive(),
});
export type BotTemplate = z.infer<typeof TemplateSchema>;

export const TicketLogSchema = z.object({
  ticketId: z.string(),
  threadName: z.string(),
  threadId: z.string(),
  submitterId: z.string(),
  closedBy: z.string(),
  rating: z.number().int().min(0).max(5),
  closedAt: z.number().int().positive(),
});
export type TicketLog = z.infer<typeof TicketLogSchema>;
