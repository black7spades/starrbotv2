import type { FunctionManifest, FunctionInstance } from "../registry/types";
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { systemLog } from "utils/systemLog";
import {
  findRoleByName,
  findTwitchSubscriberRole,
  planSync,
  reactToRoleChange,
  type RoleLike,
} from "./sync";

function log(level: "info" | "warn" | "error", msg: string, context?: Record<string, unknown>) {
  systemLog.add(level, msg, "subs", context);
}

const subsManifest: FunctionManifest = {
  name: "subs",
  label: "Subscriber sync",
  description: "Mirror Twitch subscribers onto a role you name and control",
  icon: "🎟️",
  version: "1.0.0",
  configSchema: {
    type: "object",
    properties: {
      guildId: { type: "string", description: "Discord server to sync in" },
      subsRoleName: {
        type: "string",
        default: "Subscriber",
        description:
          "Name of the role subscribers receive. Created automatically if it does not exist.",
      },
      sourceRoleId: {
        type: "string",
        description:
          "Discord's managed Twitch Subscriber role. Leave blank to detect it automatically.",
      },
      tier: {
        type: "string",
        description: "Only mirror a specific tier, e.g. \"Tier 2\" (optional)",
      },
      removeWhenUnsubscribed: {
        type: "boolean",
        default: true,
        description: "Take the role away when someone stops subscribing",
      },
      syncIntervalMinutes: {
        type: "number",
        default: 30,
        minimum: 5,
        maximum: 1440,
        description: "How often to reconcile everyone, catching anything missed while offline",
      },
    },
    required: ["subsRoleName"],
  },
  defaultConfig: {
    guildId: "",
    subsRoleName: "Subscriber",
    sourceRoleId: "",
    tier: "",
    removeWhenUnsubscribed: true,
    syncIntervalMinutes: 30,
  },
  commands: [
    new SlashCommandBuilder()
      .setName("subs")
      .setDescription("Twitch subscriber role sync")
      .addSubcommand((sub) =>
        sub.setName("status").setDescription("Show which roles are being mirrored, and how many hold them")
      )
      .addSubcommand((sub) =>
        sub.setName("sync").setDescription("Reconcile every member now")
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .toJSON() as any,
  ],

  async createInstance(config: Record<string, unknown>): Promise<FunctionInstance> {
    const currentConfig = { ...config };
    let clientRef: any = null;
    let timer: NodeJS.Timeout | null = null;
    let added = 0;
    let removed = 0;
    let lastSyncAt: number | null = null;
    let lastError: string | null = null;

    async function resolveGuild(): Promise<any | null> {
      if (!clientRef) return null;
      const guildId = String(currentConfig.guildId ?? "").trim();
      if (guildId) return clientRef.guilds.cache.get(guildId) ?? (await clientRef.guilds.fetch(guildId).catch(() => null));
      // With one guild and no explicit setting, use it rather than doing nothing.
      const first = clientRef.guilds.cache.first();
      return first ?? null;
    }

    /** The Discord-managed Twitch role we take our signal from. */
    function resolveSourceRole(guild: any): RoleLike | undefined {
      const explicit = String(currentConfig.sourceRoleId ?? "").trim();
      if (explicit) {
        const role = guild.roles.cache.get(explicit);
        if (role) return role;
        log("warn", `configured sourceRoleId ${explicit} does not exist in this server`);
      }
      const roles = [...guild.roles.cache.values()] as RoleLike[];
      return findTwitchSubscriberRole(roles, String(currentConfig.tier ?? "") || undefined);
    }

    /** The role we grant. Created on first use if it is not there yet. */
    async function resolveTargetRole(guild: any): Promise<any | null> {
      const name = String(currentConfig.subsRoleName ?? "").trim();
      if (!name) {
        lastError = "No role name configured";
        return null;
      }

      const existing = findRoleByName([...guild.roles.cache.values()] as RoleLike[], name);
      if (existing) return guild.roles.cache.get(existing.id);

      try {
        const created = await guild.roles.create({
          name,
          reason: "Subscriber sync — mirrors the Twitch subscriber role",
        });
        log("info", `created role "${name}" (${created.id})`, { guildId: guild.id });
        return created;
      } catch (err: any) {
        lastError = `Could not create the "${name}" role: ${err.message}`;
        log("error", lastError);
        return null;
      }
    }

    /** Full reconcile. Returns a summary suitable for showing a human. */
    async function reconcile(reason: string): Promise<string> {
      const guild = await resolveGuild();
      if (!guild) {
        lastError = "No Discord server resolved";
        log("warn", `sync skipped (${reason}): ${lastError}`);
        return lastError;
      }

      const sourceRole = resolveSourceRole(guild);
      if (!sourceRole) {
        lastError =
          "No managed Twitch Subscriber role found. Connect Twitch in Server Settings → Integrations and turn on subscriber sync.";
        log("warn", `sync skipped (${reason}): ${lastError}`, { guildId: guild.id });
        return lastError;
      }

      const targetRole = await resolveTargetRole(guild);
      if (!targetRole) return lastError ?? "No target role";

      try {
        // Requires the privileged GuildMembers intent; without it this returns
        // only cached members and the sync would be silently partial.
        const members = await guild.members.fetch();
        const plan = planSync(
          [...members.values()].map((m: any) => ({
            id: m.id,
            roleIds: [...m.roles.cache.keys()],
            isBot: m.user?.bot,
          })),
          sourceRole.id,
          targetRole.id,
          { removeWhenUnsubscribed: currentConfig.removeWhenUnsubscribed !== false }
        );

        let addedNow = 0;
        let removedNow = 0;
        const failures: string[] = [];

        for (const id of plan.toAdd) {
          try {
            await members.get(id)?.roles.add(targetRole.id, "Subscribed on Twitch");
            addedNow++;
            log("info", `granted "${targetRole.name}" to ${id}`, { guildId: guild.id, memberId: id });
          } catch (err: any) {
            failures.push(`${id}: ${err.message}`);
          }
        }

        for (const id of plan.toRemove) {
          try {
            await members.get(id)?.roles.remove(targetRole.id, "No longer subscribed on Twitch");
            removedNow++;
            log("info", `removed "${targetRole.name}" from ${id}`, { guildId: guild.id, memberId: id });
          } catch (err: any) {
            failures.push(`${id}: ${err.message}`);
          }
        }

        added += addedNow;
        removed += removedNow;
        lastSyncAt = Date.now();
        lastError = failures.length ? `${failures.length} role change(s) failed: ${failures[0]}` : null;

        const summary =
          `Synced ${members.size} member(s): +${addedNow} −${removedNow}, ${plan.unchanged} unchanged` +
          (failures.length ? `, ${failures.length} failed` : "");
        log(failures.length ? "warn" : "info", `${summary} (${reason})`, {
          guildId: guild.id,
          sourceRole: sourceRole.name,
          targetRole: targetRole.name,
        });
        return summary;
      } catch (err: any) {
        lastError = err.message;
        log("error", `sync failed (${reason}): ${err.message}`);
        return `Sync failed: ${err.message}`;
      }
    }

    function scheduleReconcile(): void {
      if (timer) clearInterval(timer);
      const minutes = Math.min(
        1440,
        Math.max(5, Number(currentConfig.syncIntervalMinutes ?? 30) || 30)
      );
      timer = setInterval(() => {
        void reconcile("scheduled");
      }, minutes * 60_000);
      log("info", `reconcile scheduled every ${minutes} minute(s)`);
    }

    return {
      name: "subs",
      config: currentConfig,

      async onLoad(bot: any) {
        clientRef = bot?.client ?? null;
        log("info", `Loaded — mirroring onto "${String(currentConfig.subsRoleName ?? "")}"`);
        // Catch up on anything that changed while this bot was down.
        void reconcile("startup");
        scheduleReconcile();
      },

      async onUnload() {
        if (timer) clearInterval(timer);
        timer = null;
        log("info", "Unloaded — scheduled reconcile stopped");
      },

      async onConfigChange(newConfig: Record<string, unknown>) {
        const before = {
          role: currentConfig.subsRoleName,
          interval: currentConfig.syncIntervalMinutes,
        };
        Object.assign(currentConfig, newConfig);
        log("info", "Config changed", {
          roleName: currentConfig.subsRoleName,
          interval: currentConfig.syncIntervalMinutes,
        });
        if (before.interval !== currentConfig.syncIntervalMinutes) scheduleReconcile();
        if (before.role !== currentConfig.subsRoleName) void reconcile("role renamed");
      },

      /**
       * Live path: react the moment Discord's integration grants or revokes the
       * managed role, rather than waiting for the next reconcile.
       */
      async onMemberUpdate(before: any, after: any) {
        try {
          const guildId = String(currentConfig.guildId ?? "").trim();
          if (guildId && after?.guild?.id !== guildId) return;
          if (after?.user?.bot) return;

          const guild = after?.guild;
          if (!guild) return;

          const sourceRole = resolveSourceRole(guild);
          if (!sourceRole) return;

          const targetName = String(currentConfig.subsRoleName ?? "").trim();
          const target = findRoleByName([...guild.roles.cache.values()] as RoleLike[], targetName);
          // Do not create the role here: this fires on every member edit in the
          // guild, and a missing role is the reconcile's job to sort out.
          if (!target) return;

          const action = reactToRoleChange(
            [...before.roles.cache.keys()],
            [...after.roles.cache.keys()],
            sourceRole.id,
            target.id,
            { removeWhenUnsubscribed: currentConfig.removeWhenUnsubscribed !== false }
          );
          if (!action) return;

          if (action === "add") {
            await after.roles.add(target.id, "Subscribed on Twitch");
            added++;
            log("info", `granted "${targetName}" to ${after.id} (live)`, {
              guildId: guild.id,
              memberId: after.id,
            });
          } else {
            await after.roles.remove(target.id, "No longer subscribed on Twitch");
            removed++;
            log("info", `removed "${targetName}" from ${after.id} (live)`, {
              guildId: guild.id,
              memberId: after.id,
            });
          }
        } catch (err: any) {
          lastError = err.message;
          log("error", `live role update failed: ${err.message}`);
        }
      },

      async handleCommand(interaction: any) {
        if (interaction.commandName !== "subs") return;
        const sub = interaction.options.getSubcommand();

        if (sub === "sync") {
          await interaction.deferReply({ ephemeral: true });
          const summary = await reconcile(`manual by ${interaction.user?.id}`);
          await interaction.editReply({ content: summary });
          return;
        }

        if (sub !== "status") return;

        const guild = await resolveGuild();
        const sourceRole = guild ? resolveSourceRole(guild) : undefined;
        const targetName = String(currentConfig.subsRoleName ?? "(not set)");
        const target = guild
          ? findRoleByName([...guild.roles.cache.values()] as RoleLike[], targetName)
          : undefined;

        const holders =
          guild && target
            ? [...guild.roles.cache.get(target.id)?.members?.values?.() ?? []].length
            : 0;

        const lines = [
          `**Source (Discord-managed):** ${sourceRole ? `${sourceRole.name} (${sourceRole.id})` : "not found"}`,
          `**Mirrored role:** ${targetName}${target ? ` (${target.id})` : " — not created yet"}`,
          `**Members holding it:** ${holders}`,
          `**Granted / removed this session:** ${added} / ${removed}`,
          `**Last sync:** ${lastSyncAt ? new Date(lastSyncAt).toISOString() : "not yet"}`,
        ];
        if (!sourceRole) {
          lines.push(
            "",
            "⚠️ Discord's Twitch integration provides the subscriber data. Connect Twitch in **Server Settings → Integrations** and enable subscriber sync."
          );
        }
        if (lastError) lines.push("", `**Last error:** ${lastError}`);

        await interaction.reply({ content: lines.join("\n").slice(0, 1900), ephemeral: true });
      },

      getStats() {
        return { added, removed, lastSyncAt, lastError };
      },
    };
  },
};

export { subsManifest };
