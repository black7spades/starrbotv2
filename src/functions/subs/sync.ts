/**
 * Subscriber role sync: which members should gain or lose the role.
 *
 * ## Why this mirrors a role instead of asking Twitch
 *
 * Knowing "is this Discord member subscribed on Twitch" needs a link between
 * the two identities. Discord *has* that link — users connect their Twitch
 * account — but a bot cannot read another member's connections; that requires
 * an OAuth `connections` grant from each individual user. So a bot-built sync
 * would mean every subscriber manually linking through our own OAuth flow, and
 * anyone who did not would silently miss out.
 *
 * Discord's own Twitch integration already does this properly: the broadcaster
 * connects Twitch in Server Settings → Integrations, and Discord maintains a
 * managed "Twitch Subscriber" role from privileged data we cannot see.
 *
 * So the authoritative signal is that managed role, and this function mirrors
 * it onto a role you control and name. That is the part Discord does not give
 * you — its managed roles cannot be reused freely, and driving your own
 * permissions and automation off a managed role is awkward.
 *
 * These functions are pure so the add/remove decision is testable without a
 * gateway connection.
 */

export interface MemberRoles {
  id: string;
  /** Role ids currently on the member. */
  roleIds: string[];
  /** Bots are never synced. */
  isBot?: boolean;
}

export interface SyncPlan {
  /** Members who are subscribed but lack the mirrored role. */
  toAdd: string[];
  /** Members who hold the mirrored role but are no longer subscribed. */
  toRemove: string[];
  unchanged: number;
}

/**
 * Works out the difference between "holds the source role" and "holds the
 * mirrored role" across a set of members.
 */
export function planSync(
  members: readonly MemberRoles[],
  sourceRoleId: string,
  targetRoleId: string,
  options: { removeWhenUnsubscribed?: boolean } = {}
): SyncPlan {
  const removeWhenUnsubscribed = options.removeWhenUnsubscribed ?? true;
  const toAdd: string[] = [];
  const toRemove: string[] = [];
  let unchanged = 0;

  for (const member of members) {
    if (member.isBot) continue;

    const subscribed = member.roleIds.includes(sourceRoleId);
    const mirrored = member.roleIds.includes(targetRoleId);

    if (subscribed && !mirrored) {
      toAdd.push(member.id);
    } else if (!subscribed && mirrored) {
      if (removeWhenUnsubscribed) toRemove.push(member.id);
      else unchanged++;
    } else {
      unchanged++;
    }
  }

  return { toAdd, toRemove, unchanged };
}

/**
 * Decides what a single role change means, for the live path.
 *
 * Returns null when the update is irrelevant, so the caller does no work for
 * the vast majority of member updates (nickname changes, other roles, and so
 * on) — this fires for every member edit in the guild.
 */
export function reactToRoleChange(
  beforeRoleIds: readonly string[],
  afterRoleIds: readonly string[],
  sourceRoleId: string,
  targetRoleId: string,
  options: { removeWhenUnsubscribed?: boolean } = {}
): "add" | "remove" | null {
  const was = beforeRoleIds.includes(sourceRoleId);
  const now = afterRoleIds.includes(sourceRoleId);
  if (was === now) return null;

  if (now) {
    return afterRoleIds.includes(targetRoleId) ? null : "add";
  }
  if (!(options.removeWhenUnsubscribed ?? true)) return null;
  return afterRoleIds.includes(targetRoleId) ? "remove" : null;
}

export interface RoleLike {
  id: string;
  name: string;
  managed?: boolean;
  /** discord.js Role.tags — an integration role carries integrationId. */
  tags?: { integrationId?: string; botId?: string; premiumSubscriberRole?: boolean } | null;
}

/**
 * Finds the Discord-managed Twitch subscriber role.
 *
 * Identified by being an integration-managed role whose name Discord assigns —
 * "Twitch Subscriber", optionally with a tier suffix. Name alone is not enough,
 * because someone could create an ordinary role with the same name and it would
 * not carry Discord's subscriber data.
 */
export function findTwitchSubscriberRole(
  roles: readonly RoleLike[],
  tier?: string
): RoleLike | undefined {
  const managed = roles.filter(
    (r) => r.managed && r.tags?.integrationId && !r.tags?.botId && !r.tags?.premiumSubscriberRole
  );

  const twitchRoles = managed.filter((r) => /^twitch subscriber/i.test(r.name.trim()));
  if (twitchRoles.length === 0) return undefined;

  if (tier) {
    const wanted = twitchRoles.find((r) => r.name.toLowerCase().includes(tier.toLowerCase()));
    if (wanted) return wanted;
  }

  // Prefer the untiered "Twitch Subscriber", which covers every tier.
  return (
    twitchRoles.find((r) => /^twitch subscriber$/i.test(r.name.trim())) ?? twitchRoles[0]
  );
}

/** Finds a role by name, case-insensitively, ignoring surrounding whitespace. */
export function findRoleByName(roles: readonly RoleLike[], name: string): RoleLike | undefined {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return undefined;
  return roles.find((r) => r.name.trim().toLowerCase() === wanted);
}
