/**
 * Helpers for running tickets as posts in a Discord forum channel.
 *
 * Kept free of discord.js imports so the tag arithmetic can be tested directly;
 * callers pass in the plain shapes they already hold.
 */

/** Discord allows at most 5 tags applied to a forum post. */
export const MAX_APPLIED_TAGS = 5;

export interface ForumTagLike {
  id: string;
  name: string;
}

export interface ForumLike {
  availableTags?: ForumTagLike[];
}

/**
 * Finds a forum tag by name, case- and whitespace-insensitively.
 *
 * Tags are matched by name rather than id so the config stays human-editable —
 * an admin creates "Open"/"Resolved" in Discord's channel settings and never
 * has to copy snowflakes around.
 */
export function findTagId(forum: ForumLike | null | undefined, name: string): string | undefined {
  const wanted = String(name ?? "").trim().toLowerCase();
  if (!wanted) return undefined;
  const tags = forum?.availableTags ?? [];
  return tags.find((t) => String(t?.name ?? "").trim().toLowerCase() === wanted)?.id;
}

/**
 * Computes the tag set for a ticket being closed: drop the "open" tag, add the
 * "resolved" one, preserve anything else a human applied, and stay within
 * Discord's limit.
 *
 * Returns null when there is nothing to change, so callers can skip the API
 * call entirely.
 */
export function resolvedTags(
  current: readonly string[],
  openTagId: string | undefined,
  resolvedTagId: string | undefined,
): string[] | null {
  if (!resolvedTagId) return null;

  const kept = current.filter((id) => id !== openTagId && id !== resolvedTagId);
  // Put the resolved tag first so it survives the cap when a post is already
  // carrying five human-applied tags.
  const next = [resolvedTagId, ...kept].slice(0, MAX_APPLIED_TAGS);

  const unchanged =
    next.length === current.length && next.every((id, i) => id === current[i]);
  return unchanged ? null : next;
}

/**
 * Tag set for a newly opened ticket. Returns an empty array when the open tag
 * isn't configured or doesn't exist, which Discord accepts as "no tags".
 */
export function openTags(openTagId: string | undefined): string[] {
  return openTagId ? [openTagId] : [];
}
