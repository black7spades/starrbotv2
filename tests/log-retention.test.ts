import { describe, it, expect } from "vitest";
import {
  DEFAULT_LIMITS,
  clampEntry,
  entrySize,
  prune,
  type RetainableEntry,
  type RetentionLimits,
} from "utils/logRetention";

const HOUR = 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

function entry(overrides: Partial<RetainableEntry> = {}): RetainableEntry {
  return {
    id: 1,
    timestamp: NOW,
    level: "info",
    message: "hello",
    source: "system",
    ...overrides,
  };
}

/** N entries, oldest first, each `spacingMs` apart ending at `NOW`. */
function series(count: number, spacingMs = 1000, message = "hello"): RetainableEntry[] {
  return Array.from({ length: count }, (_, i) =>
    entry({
      id: i + 1,
      timestamp: NOW - (count - 1 - i) * spacingMs,
      message,
    })
  );
}

const LIMITS: RetentionLimits = {
  maxEntries: 100,
  maxBytes: 100_000,
  maxAgeMs: 24 * HOUR,
  maxMessageLength: 50,
  maxContextBytes: 200,
};

describe("entrySize", () => {
  it("grows with the message, the source and the context", () => {
    const base = entrySize(entry({ message: "", source: "" }));
    expect(entrySize(entry({ message: "x".repeat(10), source: "" }))).toBe(base + 10);
    expect(entrySize(entry({ message: "", source: "abc" }))).toBe(base + 3);
    expect(entrySize(entry({ message: "", source: "", context: { a: 1 } }))).toBe(
      base + JSON.stringify({ a: 1 }).length
    );
  });

  it("still returns a size for a context that cannot be serialised", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(entrySize(entry({ context: circular }))).toBeGreaterThan(0);
  });
});

describe("clampEntry", () => {
  it("leaves an entry within the limits untouched", () => {
    const original = entry({ message: "short", context: { a: 1 } });
    expect(clampEntry(original, LIMITS)).toEqual(original);
  });

  it("truncates an over-long message and says how much was cut", () => {
    const clamped = clampEntry(entry({ message: "x".repeat(120) }), LIMITS);
    expect(clamped.message).toContain("truncated 70 chars");
    expect(clamped.message.startsWith("x".repeat(50))).toBe(true);
  });

  it("replaces an oversized context with a note rather than dropping the entry", () => {
    const clamped = clampEntry(entry({ context: { blob: "x".repeat(500) } }), LIMITS);
    expect(clamped.message).toBe("hello");
    expect(String(clamped.context?._note)).toContain("context omitted");
  });

  it("survives a context that cannot be serialised", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const clamped = clampEntry(entry({ context: circular }), LIMITS);
    expect(clamped.context).toEqual({ _note: "context could not be serialised" });
  });
});

describe("prune", () => {
  it("keeps everything when nothing binds", () => {
    const result = prune(series(10), LIMITS, NOW);
    expect(result.kept).toHaveLength(10);
    expect(result.droppedByAge + result.droppedByCount + result.droppedByBytes).toBe(0);
    expect(result.bytes).toBeGreaterThan(0);
  });

  it("drops entries older than the age limit", () => {
    const entries = [
      entry({ id: 1, timestamp: NOW - 48 * HOUR }),
      entry({ id: 2, timestamp: NOW - 25 * HOUR }),
      entry({ id: 3, timestamp: NOW - 1 * HOUR }),
    ];
    const result = prune(entries, LIMITS, NOW);
    expect(result.droppedByAge).toBe(2);
    expect(result.kept.map((e) => e.id)).toEqual([3]);
  });

  it("keeps the newest entries when the count cap binds", () => {
    const result = prune(series(150), { ...LIMITS, maxEntries: 100 }, NOW);
    expect(result.kept).toHaveLength(100);
    expect(result.droppedByCount).toBe(50);
    expect(result.kept[0].id).toBe(51);
    expect(result.kept[99].id).toBe(150);
  });

  it("enforces the byte cap even when the count cap is satisfied", () => {
    // Ten entries well under the count cap, but each ~1 KB of message.
    const entries = series(10, 1000, "x".repeat(1000));
    const oneEntry = entrySize(entries[0]);
    const result = prune(entries, { ...LIMITS, maxBytes: oneEntry * 3 }, NOW);

    expect(result.droppedByCount).toBe(0);
    expect(result.droppedByBytes).toBe(7);
    expect(result.kept.map((e) => e.id)).toEqual([8, 9, 10]);
    expect(result.bytes).toBeLessThanOrEqual(oneEntry * 3);
  });

  it("reports bytes for what it kept, not for what it was given", () => {
    const entries = series(10, 1000, "x".repeat(1000));
    const oneEntry = entrySize(entries[0]);
    const result = prune(entries, { ...LIMITS, maxBytes: oneEntry * 2 }, NOW);
    expect(result.bytes).toBe(result.kept.reduce((sum, e) => sum + entrySize(e), 0));
  });

  it("applies age before the size caps, so expiry frees room", () => {
    const entries = [
      ...series(5, HOUR, "x".repeat(1000)).map((e, i) => ({
        ...e,
        id: i + 1,
        timestamp: NOW - 48 * HOUR,
      })),
      ...series(5, 1000, "x".repeat(1000)).map((e, i) => ({ ...e, id: i + 6 })),
    ];
    const oneEntry = entrySize(entries[0]);
    const result = prune(entries, { ...LIMITS, maxBytes: oneEntry * 5 }, NOW);

    // The five stale entries go on age alone; the five recent ones then fit.
    expect(result.droppedByAge).toBe(5);
    expect(result.droppedByBytes).toBe(0);
    expect(result.kept.map((e) => e.id)).toEqual([6, 7, 8, 9, 10]);
  });

  it("empties out when a single entry exceeds the whole byte budget", () => {
    const result = prune(series(3, 1000, "x".repeat(1000)), { ...LIMITS, maxBytes: 10 }, NOW);
    expect(result.kept).toHaveLength(0);
    expect(result.bytes).toBe(0);
  });

  it("handles an empty input", () => {
    const result = prune([], LIMITS, NOW);
    expect(result.kept).toEqual([]);
    expect(result.bytes).toBe(0);
  });
});

describe("DEFAULT_LIMITS", () => {
  it("bounds a full log to a few megabytes", () => {
    const full = series(DEFAULT_LIMITS.maxEntries, 1000, "x".repeat(200));
    const result = prune(full, DEFAULT_LIMITS, NOW);
    expect(result.bytes).toBeLessThanOrEqual(DEFAULT_LIMITS.maxBytes);
  });
});
