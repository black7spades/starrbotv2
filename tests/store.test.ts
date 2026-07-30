import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

import { configStore } from "config/index";

const DATA_DIR = process.env.STARRBOT_DATA_DIR!;

function resetBots() {
  for (const bot of configStore.getBots()) configStore.deleteBot(bot.id);
}

describe("ConfigStore bot ids", () => {
  beforeEach(resetBots);

  it("derives a slug id from the bot name", () => {
    const bot = configStore.createBot({ name: "My Cool Bot", token: "t", clientId: "c" });
    expect(bot.id).toBe("my-cool-bot");
  });

  it("does not collide when two bots share a name", () => {
    const first = configStore.createBot({ name: "Duplicate", token: "t1", clientId: "c1" });
    const second = configStore.createBot({ name: "Duplicate", token: "t2", clientId: "c2" });

    expect(first.id).not.toBe(second.id);
    expect(configStore.getBots()).toHaveLength(2);

    // Both must remain independently addressable.
    expect(configStore.getBot(first.id)?.token).toBe("t1");
    expect(configStore.getBot(second.id)?.token).toBe("t2");
  });

  it("keeps ids distinct for names that slugify identically", () => {
    const a = configStore.createBot({ name: "Bot!!!", token: "t1", clientId: "c1" });
    const b = configStore.createBot({ name: "bot", token: "t2", clientId: "c2" });
    expect(a.id).not.toBe(b.id);
  });

  it("deleting one of two same-named bots leaves the other intact", () => {
    const first = configStore.createBot({ name: "Twin", token: "t1", clientId: "c1" });
    const second = configStore.createBot({ name: "Twin", token: "t2", clientId: "c2" });

    expect(configStore.deleteBot(first.id)).toBe(true);
    expect(configStore.getBot(first.id)).toBeNull();
    expect(configStore.getBot(second.id)?.token).toBe("t2");
  });

  it("falls back to a usable id when the name has no sluggable characters", () => {
    const bot = configStore.createBot({ name: "!!!", token: "t", clientId: "c" });
    expect(bot.id).not.toBe("");
    expect(configStore.getBot(bot.id)).not.toBeNull();
  });
});

describe("ConfigStore durability", () => {
  beforeEach(resetBots);

  it("writes atomically and leaves no temp files behind", () => {
    configStore.createBot({ name: "Atomic", token: "t", clientId: "c" });
    const leftovers = readdirSync(DATA_DIR).filter((f) => f.includes(".tmp"));
    expect(leftovers).toEqual([]);
  });

  it("produces a complete, parseable file after a write", () => {
    configStore.createBot({ name: "Parseable", token: "t", clientId: "c" });
    const raw = readFileSync(join(DATA_DIR, "bots.json"), "utf8");
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(JSON.parse(raw)).toHaveLength(1);
  });

  it("treats a corrupted file as empty rather than throwing", () => {
    configStore.createBot({ name: "Doomed", token: "t", clientId: "c" });
    writeFileSync(join(DATA_DIR, "bots.json"), "{ this is not json");
    expect(configStore.getBots()).toEqual([]);
  });
});

describe("ConfigStore users", () => {
  it("never returns passwordHash from read methods", () => {
    const created = configStore.createUser({
      username: "secretive",
      password: "already-hashed-value",
      role: "admin",
    });
    expect(created).not.toHaveProperty("passwordHash");

    const byId = configStore.getUserById(created.id);
    expect(byId).not.toHaveProperty("passwordHash");
    expect(configStore.getUsers().every((u) => !("passwordHash" in u))).toBe(true);

    // The private lookup used for login still exposes it, by design.
    expect(configStore.getUserByUsername("secretive")?.passwordHash).toBe("already-hashed-value");
  });
});

describe("ConfigStore ticket logs", () => {
  beforeEach(() => {
    const existing = configStore.getTicketLogs(10000);
    configStore.deleteTicketLogs(existing.map((t) => t.threadId));
  });

  function log(ticketId: string, threadId: string) {
    return configStore.logTicket({
      ticketId,
      threadName: ticketId,
      threadId,
      submitterId: "u1",
      closedBy: "u2",
      rating: 5,
    });
  }

  it("deletes only the requested thread ids and reports the count", () => {
    log("T-1", "a");
    log("T-2", "b");
    log("T-3", "c");

    expect(configStore.deleteTicketLogs(["a", "c"])).toBe(2);
    expect(configStore.getTicketLogs(100).map((t) => t.threadId)).toEqual(["b"]);
  });

  it("is a no-op for an empty list", () => {
    log("T-4", "d");
    expect(configStore.deleteTicketLogs([])).toBe(0);
    expect(configStore.getTicketLogs(100)).toHaveLength(1);
  });

  it("ignores ids that are not present", () => {
    log("T-5", "e");
    expect(configStore.deleteTicketLogs(["nope"])).toBe(0);
    expect(configStore.getTicketLogs(100)).toHaveLength(1);
  });
});
