/**
 * The welcome phrase pool: selection and editing.
 *
 * Kept free of discord.js so the rules — how a phrase is picked, how
 * placeholders are filled, what happens to an empty pool — are directly
 * testable.
 */

export interface WelcomeVars {
  /** Mention, e.g. <@123>. */
  user: string;
  /** Display name without the mention. */
  username: string;
  server: string;
  /** Ordinal position, e.g. "42nd". */
  memberCount: string;
}

export const DEFAULT_PHRASES = [
  "Welcome, {user}! Glad you made it.",
  "{user} just landed in {server}. Say hi!",
  "Look who it is — welcome, {user}!",
  "{user} has entered the chat. Member number {memberCount}.",
  "A wild {username} appears! Welcome to {server}.",
];

/** Placeholders a phrase may use. Anything else is left alone. */
export const PLACEHOLDERS = ["user", "username", "server", "memberCount"] as const;

export const MAX_PHRASE_LENGTH = 500;
export const MAX_PHRASES = 100;

/**
 * Substitutes {placeholders}. An unknown placeholder is left verbatim rather
 * than blanked, so a typo is visible instead of silently producing a gap.
 */
export function render(phrase: string, vars: WelcomeVars): string {
  return phrase.replace(/\{(\w+)\}/g, (whole, key: string) => {
    return key in vars ? String(vars[key as keyof WelcomeVars]) : whole;
  });
}

/**
 * Picks a phrase at random.
 *
 * `lastIndex` is the previously used index: with more than one phrase the same
 * one is never chosen twice in a row, because back-to-back repeats are the most
 * obvious way a "random" pool stops feeling random.
 */
export function pick(
  phrases: readonly string[],
  lastIndex: number | null = null,
  random: () => number = Math.random
): { phrase: string; index: number } | null {
  const usable = phrases.filter((p) => p.trim().length > 0);
  if (usable.length === 0) return null;
  if (usable.length === 1) return { phrase: usable[0], index: 0 };

  let index = Math.floor(random() * usable.length);
  if (index >= usable.length) index = usable.length - 1; // guards random() === 1
  if (lastIndex !== null && index === lastIndex) {
    index = (index + 1) % usable.length;
  }
  return { phrase: usable[index], index };
}

export interface EditResult {
  ok: boolean;
  phrases: string[];
  message: string;
}

export function addPhrase(phrases: readonly string[], phrase: string): EditResult {
  const trimmed = phrase.trim();
  if (!trimmed) {
    return { ok: false, phrases: [...phrases], message: "A phrase cannot be empty." };
  }
  if (trimmed.length > MAX_PHRASE_LENGTH) {
    return {
      ok: false,
      phrases: [...phrases],
      message: `Phrases are limited to ${MAX_PHRASE_LENGTH} characters.`,
    };
  }
  if (phrases.length >= MAX_PHRASES) {
    return {
      ok: false,
      phrases: [...phrases],
      message: `The pool is full (${MAX_PHRASES} phrases).`,
    };
  }
  if (phrases.some((p) => p.trim() === trimmed)) {
    return { ok: false, phrases: [...phrases], message: "That phrase is already in the pool." };
  }
  return {
    ok: true,
    phrases: [...phrases, trimmed],
    message: `Added. The pool now has ${phrases.length + 1} phrase(s).`,
  };
}

/** Positions are 1-based, because that is what the command shows the user. */
export function removePhrase(phrases: readonly string[], position: number): EditResult {
  if (!Number.isInteger(position) || position < 1 || position > phrases.length) {
    return {
      ok: false,
      phrases: [...phrases],
      message: `Pick a number between 1 and ${phrases.length}.`,
    };
  }
  const next = [...phrases];
  const [removed] = next.splice(position - 1, 1);
  return { ok: true, phrases: next, message: `Removed: "${removed}"` };
}

export function editPhrase(
  phrases: readonly string[],
  position: number,
  phrase: string
): EditResult {
  if (!Number.isInteger(position) || position < 1 || position > phrases.length) {
    return {
      ok: false,
      phrases: [...phrases],
      message: `Pick a number between 1 and ${phrases.length}.`,
    };
  }
  const trimmed = phrase.trim();
  if (!trimmed) {
    return { ok: false, phrases: [...phrases], message: "A phrase cannot be empty." };
  }
  if (trimmed.length > MAX_PHRASE_LENGTH) {
    return {
      ok: false,
      phrases: [...phrases],
      message: `Phrases are limited to ${MAX_PHRASE_LENGTH} characters.`,
    };
  }
  const next = [...phrases];
  next[position - 1] = trimmed;
  return { ok: true, phrases: next, message: `Updated phrase ${position}.` };
}

/** English ordinal, for "the 42nd member". */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
