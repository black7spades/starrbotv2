import { describe, it, expect } from "vitest";
import {
  DEFAULT_PHRASES,
  MAX_PHRASES,
  MAX_PHRASE_LENGTH,
  addPhrase,
  editPhrase,
  ordinal,
  pick,
  removePhrase,
  render,
} from "functions/welcome/pool";

const VARS = {
  user: "<@123>",
  username: "jamie",
  server: "The Server",
  memberCount: "42nd",
};

describe("render", () => {
  it("substitutes every supported placeholder", () => {
    expect(render("{user} {username} {server} {memberCount}", VARS)).toBe(
      "<@123> jamie The Server 42nd"
    );
  });

  it("substitutes a placeholder used more than once", () => {
    expect(render("{username}, hello {username}", VARS)).toBe("jamie, hello jamie");
  });

  it("leaves an unknown placeholder visible rather than blanking it", () => {
    // A typo should be obvious, not silently produce a gap.
    expect(render("hi {usrname}", VARS)).toBe("hi {usrname}");
  });

  it("passes through a phrase with no placeholders", () => {
    expect(render("just hello", VARS)).toBe("just hello");
  });

  it("every default phrase renders without leftovers", () => {
    for (const phrase of DEFAULT_PHRASES) {
      expect(render(phrase, VARS)).not.toMatch(/\{(user|username|server|memberCount)\}/);
    }
  });
});

describe("pick", () => {
  it("returns null for an empty pool", () => {
    expect(pick([])).toBeNull();
  });

  it("ignores blank entries", () => {
    expect(pick(["", "   ", "real"])).toEqual({ phrase: "real", index: 0 });
  });

  it("returns null when every entry is blank", () => {
    expect(pick(["", "  "])).toBeNull();
  });

  it("always returns the only phrase when there is one", () => {
    expect(pick(["only"], null, () => 0.99)).toEqual({ phrase: "only", index: 0 });
  });

  it("never repeats the previous phrase back to back", () => {
    const pool = ["a", "b", "c"];
    // Force the RNG to keep choosing index 1.
    const result = pick(pool, 1, () => 0.5);
    expect(result!.index).not.toBe(1);
  });

  it("does not go out of bounds when random() returns 1", () => {
    const pool = ["a", "b", "c"];
    const result = pick(pool, null, () => 1);
    expect(result).not.toBeNull();
    expect(pool).toContain(result!.phrase);
  });

  it("can reach every phrase in the pool", () => {
    const pool = ["a", "b", "c"];
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(pick(pool, null)!.phrase);
    }
    expect(seen.size).toBe(3);
  });
});

describe("addPhrase", () => {
  it("appends and reports the new size", () => {
    const res = addPhrase(["a"], "b");
    expect(res.ok).toBe(true);
    expect(res.phrases).toEqual(["a", "b"]);
    expect(res.message).toContain("2");
  });

  it("trims surrounding whitespace", () => {
    expect(addPhrase([], "  padded  ").phrases).toEqual(["padded"]);
  });

  it("rejects an empty or whitespace-only phrase", () => {
    expect(addPhrase([], "").ok).toBe(false);
    expect(addPhrase([], "   ").ok).toBe(false);
  });

  it("rejects a duplicate", () => {
    const res = addPhrase(["hello"], "hello");
    expect(res.ok).toBe(false);
    expect(res.phrases).toEqual(["hello"]);
  });

  it("rejects an over-long phrase", () => {
    expect(addPhrase([], "x".repeat(MAX_PHRASE_LENGTH + 1)).ok).toBe(false);
    expect(addPhrase([], "x".repeat(MAX_PHRASE_LENGTH)).ok).toBe(true);
  });

  it("rejects once the pool is full", () => {
    const full = Array.from({ length: MAX_PHRASES }, (_, i) => `p${i}`);
    const res = addPhrase(full, "one more");
    expect(res.ok).toBe(false);
    expect(res.phrases).toHaveLength(MAX_PHRASES);
  });

  it("does not mutate the input", () => {
    const original = ["a"];
    addPhrase(original, "b");
    expect(original).toEqual(["a"]);
  });
});

describe("removePhrase", () => {
  it("removes by 1-based position", () => {
    const res = removePhrase(["a", "b", "c"], 2);
    expect(res.ok).toBe(true);
    expect(res.phrases).toEqual(["a", "c"]);
    expect(res.message).toContain("b");
  });

  it("rejects out-of-range and non-integer positions", () => {
    for (const bad of [0, 4, -1, 1.5, NaN]) {
      const res = removePhrase(["a", "b", "c"], bad);
      expect(res.ok, String(bad)).toBe(false);
      expect(res.phrases).toEqual(["a", "b", "c"]);
    }
  });

  it("does not mutate the input", () => {
    const original = ["a", "b"];
    removePhrase(original, 1);
    expect(original).toEqual(["a", "b"]);
  });
});

describe("editPhrase", () => {
  it("replaces in place", () => {
    const res = editPhrase(["a", "b"], 2, "new");
    expect(res.ok).toBe(true);
    expect(res.phrases).toEqual(["a", "new"]);
  });

  it("rejects an out-of-range position", () => {
    expect(editPhrase(["a"], 2, "x").ok).toBe(false);
  });

  it("rejects an empty replacement", () => {
    const res = editPhrase(["a"], 1, "  ");
    expect(res.ok).toBe(false);
    expect(res.phrases).toEqual(["a"]);
  });

  it("rejects an over-long replacement", () => {
    expect(editPhrase(["a"], 1, "x".repeat(MAX_PHRASE_LENGTH + 1)).ok).toBe(false);
  });
});

describe("ordinal", () => {
  it("handles the common cases", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(4)).toBe("4th");
    expect(ordinal(42)).toBe("42nd");
    expect(ordinal(101)).toBe("101st");
  });

  it("handles the teens, which are the exception", () => {
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(13)).toBe("13th");
    expect(ordinal(111)).toBe("111th");
    expect(ordinal(112)).toBe("112th");
  });
});
