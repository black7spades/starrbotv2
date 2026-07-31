import { describe, it, expect } from "vitest";
import {
  findRoleByName,
  findTwitchSubscriberRole,
  planSync,
  reactToRoleChange,
  type RoleLike,
} from "functions/subs/sync";

const SOURCE = "role-twitch-sub";
const TARGET = "role-mirrored";

describe("planSync", () => {
  it("grants the role to subscribers who lack it", () => {
    const plan = planSync([{ id: "a", roleIds: [SOURCE] }], SOURCE, TARGET);
    expect(plan.toAdd).toEqual(["a"]);
    expect(plan.toRemove).toEqual([]);
  });

  it("removes the role from members who stopped subscribing", () => {
    const plan = planSync([{ id: "a", roleIds: [TARGET] }], SOURCE, TARGET);
    expect(plan.toRemove).toEqual(["a"]);
    expect(plan.toAdd).toEqual([]);
  });

  it("leaves correctly-synced members alone", () => {
    const plan = planSync(
      [
        { id: "synced", roleIds: [SOURCE, TARGET] },
        { id: "neither", roleIds: [] },
      ],
      SOURCE,
      TARGET
    );
    expect(plan.toAdd).toEqual([]);
    expect(plan.toRemove).toEqual([]);
    expect(plan.unchanged).toBe(2);
  });

  it("keeps the role when removeWhenUnsubscribed is off", () => {
    const plan = planSync([{ id: "a", roleIds: [TARGET] }], SOURCE, TARGET, {
      removeWhenUnsubscribed: false,
    });
    expect(plan.toRemove).toEqual([]);
    expect(plan.unchanged).toBe(1);
  });

  it("never touches bots", () => {
    const plan = planSync(
      [
        { id: "bot", roleIds: [SOURCE], isBot: true },
        { id: "human", roleIds: [SOURCE] },
      ],
      SOURCE,
      TARGET
    );
    expect(plan.toAdd).toEqual(["human"]);
  });

  it("handles a mixed guild in one pass", () => {
    const plan = planSync(
      [
        { id: "new-sub", roleIds: [SOURCE] },
        { id: "lapsed", roleIds: [TARGET] },
        { id: "steady", roleIds: [SOURCE, TARGET] },
        { id: "nobody", roleIds: ["unrelated"] },
      ],
      SOURCE,
      TARGET
    );
    expect(plan.toAdd).toEqual(["new-sub"]);
    expect(plan.toRemove).toEqual(["lapsed"]);
    expect(plan.unchanged).toBe(2);
  });

  it("copes with an empty guild", () => {
    expect(planSync([], SOURCE, TARGET)).toEqual({ toAdd: [], toRemove: [], unchanged: 0 });
  });
});

describe("reactToRoleChange", () => {
  it("adds when the source role appears", () => {
    expect(reactToRoleChange([], [SOURCE], SOURCE, TARGET)).toBe("add");
  });

  it("removes when the source role disappears", () => {
    expect(reactToRoleChange([SOURCE, TARGET], [TARGET], SOURCE, TARGET)).toBe("remove");
  });

  it("does nothing when the source role did not change", () => {
    expect(reactToRoleChange([SOURCE], [SOURCE, "other"], SOURCE, TARGET)).toBeNull();
    expect(reactToRoleChange(["a"], ["a", "b"], SOURCE, TARGET)).toBeNull();
  });

  it("does nothing when the member already has the right state", () => {
    // Gained the source role but already mirrored — nothing to do.
    expect(reactToRoleChange([TARGET], [SOURCE, TARGET], SOURCE, TARGET)).toBeNull();
    // Lost the source role but never had the mirror.
    expect(reactToRoleChange([SOURCE], [], SOURCE, TARGET)).toBeNull();
  });

  it("does not remove when removeWhenUnsubscribed is off", () => {
    expect(
      reactToRoleChange([SOURCE, TARGET], [TARGET], SOURCE, TARGET, {
        removeWhenUnsubscribed: false,
      })
    ).toBeNull();
  });
});

describe("findTwitchSubscriberRole", () => {
  const managed = (over: Partial<RoleLike>): RoleLike => ({
    id: "x",
    name: "Twitch Subscriber",
    managed: true,
    tags: { integrationId: "int-1" },
    ...over,
  });

  it("finds the managed Twitch subscriber role", () => {
    const role = findTwitchSubscriberRole([managed({ id: "r1" })]);
    expect(role?.id).toBe("r1");
  });

  it("ignores an ordinary role with the same name", () => {
    // Anyone can create a role called "Twitch Subscriber"; only Discord's
    // managed one actually carries subscriber data.
    const impostor: RoleLike = { id: "fake", name: "Twitch Subscriber", managed: false };
    expect(findTwitchSubscriberRole([impostor])).toBeUndefined();
  });

  it("ignores a bot's managed role", () => {
    const botRole = managed({ id: "b", name: "Twitch Subscriber", tags: { integrationId: "i", botId: "bot" } });
    expect(findTwitchSubscriberRole([botRole])).toBeUndefined();
  });

  it("ignores the Nitro booster role", () => {
    const booster = managed({
      id: "boost",
      name: "Twitch Subscriber",
      tags: { integrationId: "i", premiumSubscriberRole: true },
    });
    expect(findTwitchSubscriberRole([booster])).toBeUndefined();
  });

  it("prefers the untiered role, which covers every tier", () => {
    const roles = [
      managed({ id: "t1", name: "Twitch Subscriber: Tier 1" }),
      managed({ id: "all", name: "Twitch Subscriber" }),
    ];
    expect(findTwitchSubscriberRole(roles)?.id).toBe("all");
  });

  it("honours an explicit tier", () => {
    const roles = [
      managed({ id: "all", name: "Twitch Subscriber" }),
      managed({ id: "t2", name: "Twitch Subscriber: Tier 2" }),
    ];
    expect(findTwitchSubscriberRole(roles, "Tier 2")?.id).toBe("t2");
  });

  it("falls back to the untiered role when the requested tier is absent", () => {
    const roles = [managed({ id: "all", name: "Twitch Subscriber" })];
    expect(findTwitchSubscriberRole(roles, "Tier 3")?.id).toBe("all");
  });

  it("returns undefined when the integration is not set up", () => {
    expect(findTwitchSubscriberRole([{ id: "a", name: "Moderator", managed: false }])).toBeUndefined();
    expect(findTwitchSubscriberRole([])).toBeUndefined();
  });
});

describe("findRoleByName", () => {
  const roles: RoleLike[] = [
    { id: "1", name: "Subscriber" },
    { id: "2", name: "Moderator" },
  ];

  it("matches case- and whitespace-insensitively", () => {
    expect(findRoleByName(roles, "subscriber")?.id).toBe("1");
    expect(findRoleByName(roles, "  SUBSCRIBER  ")?.id).toBe("1");
  });

  it("returns undefined for a missing or blank name", () => {
    expect(findRoleByName(roles, "Nope")).toBeUndefined();
    expect(findRoleByName(roles, "")).toBeUndefined();
    expect(findRoleByName(roles, "   ")).toBeUndefined();
  });
});
