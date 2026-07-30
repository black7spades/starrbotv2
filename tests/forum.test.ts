import { describe, it, expect } from "vitest";

import { findTagId, openTags, resolvedTags, MAX_APPLIED_TAGS } from "functions/tickets/forum";

const forum = {
  availableTags: [
    { id: "t-open", name: "Open" },
    { id: "t-resolved", name: "Resolved" },
    { id: "t-billing", name: "Billing" },
  ],
};

describe("findTagId", () => {
  it("finds a tag by exact name", () => {
    expect(findTagId(forum, "Open")).toBe("t-open");
    expect(findTagId(forum, "Resolved")).toBe("t-resolved");
  });

  it("ignores case and surrounding whitespace", () => {
    expect(findTagId(forum, "open")).toBe("t-open");
    expect(findTagId(forum, "  RESOLVED  ")).toBe("t-resolved");
  });

  it("returns undefined for a tag that does not exist", () => {
    expect(findTagId(forum, "Nope")).toBeUndefined();
  });

  it("returns undefined for an empty or missing name", () => {
    expect(findTagId(forum, "")).toBeUndefined();
    expect(findTagId(forum, "   ")).toBeUndefined();
    expect(findTagId(forum, undefined as any)).toBeUndefined();
  });

  it("tolerates a forum with no tags", () => {
    expect(findTagId({ availableTags: [] }, "Open")).toBeUndefined();
    expect(findTagId({}, "Open")).toBeUndefined();
    expect(findTagId(null, "Open")).toBeUndefined();
  });
});

describe("openTags", () => {
  it("applies the open tag when it resolves", () => {
    expect(openTags("t-open")).toEqual(["t-open"]);
  });

  it("applies nothing when the tag is missing", () => {
    expect(openTags(undefined)).toEqual([]);
  });
});

describe("resolvedTags", () => {
  it("swaps open for resolved", () => {
    expect(resolvedTags(["t-open"], "t-open", "t-resolved")).toEqual(["t-resolved"]);
  });

  it("keeps unrelated tags a human applied", () => {
    const next = resolvedTags(["t-open", "t-billing"], "t-open", "t-resolved");
    expect(next).toContain("t-resolved");
    expect(next).toContain("t-billing");
    expect(next).not.toContain("t-open");
  });

  it("adds resolved when the post was never tagged open", () => {
    expect(resolvedTags(["t-billing"], "t-open", "t-resolved")).toEqual(["t-resolved", "t-billing"]);
  });

  it("works when the open tag does not exist at all", () => {
    expect(resolvedTags(["t-billing"], undefined, "t-resolved")).toEqual([
      "t-resolved",
      "t-billing",
    ]);
  });

  it("returns null when there is no resolved tag to apply", () => {
    expect(resolvedTags(["t-open"], "t-open", undefined)).toBeNull();
  });

  it("returns null when the post is already exactly resolved", () => {
    expect(resolvedTags(["t-resolved"], "t-open", "t-resolved")).toBeNull();
  });

  it("still reorders when resolved is present but not first", () => {
    expect(resolvedTags(["t-billing", "t-resolved"], "t-open", "t-resolved")).toEqual([
      "t-resolved",
      "t-billing",
    ]);
  });

  it("does not duplicate the resolved tag", () => {
    const next = resolvedTags(["t-resolved", "t-open"], "t-open", "t-resolved")!;
    expect(next.filter((t) => t === "t-resolved")).toHaveLength(1);
  });

  it("respects Discord's five-tag cap, keeping resolved", () => {
    const current = ["a", "b", "c", "d", "e"];
    const next = resolvedTags(current, "t-open", "t-resolved")!;
    expect(next).toHaveLength(MAX_APPLIED_TAGS);
    expect(next[0]).toBe("t-resolved");
  });

  it("handles an empty starting tag set", () => {
    expect(resolvedTags([], "t-open", "t-resolved")).toEqual(["t-resolved"]);
  });
});
