import { describe, it, expect, beforeEach, vi } from "vitest";

import { ticketsManifest } from "functions/tickets/index";
import { configStore } from "config/index";
import type { FunctionInstance } from "functions/registry/types";

/**
 * Regression tests for `/ticket purge`.
 *
 * The original implementation called `guild.threads.fetch(...)`, but discord.js
 * only exposes a `threads` manager on channel classes — `Guild` has none. Every
 * iteration therefore threw `TypeError: Cannot read properties of undefined`,
 * was swallowed by the catch, and counted as a failure: purge deleted nothing,
 * ever. These tests pin the corrected behaviour.
 */

const ADMIN_ROLE = "role-admin";

interface FakeThread {
  id: string;
  archived: boolean;
  deleted: boolean;
  isThread(): boolean;
  setArchived(value: boolean, reason?: string): Promise<void>;
  delete(reason?: string): Promise<void>;
}

function makeThread(id: string, archived = true): FakeThread {
  const thread: FakeThread = {
    id,
    archived,
    deleted: false,
    isThread: () => true,
    async setArchived(value: boolean) {
      thread.archived = value;
    },
    async delete() {
      thread.deleted = true;
    },
  };
  return thread;
}

/** Discord's "Unknown Channel" API error. */
function unknownChannelError(): Error & { code: number } {
  return Object.assign(new Error("Unknown Channel"), { code: 10003 });
}

function makeInteraction(opts: {
  channels: Map<string, unknown>;
  days?: number | null;
  hasAdminRole?: boolean;
  fetchImpl?: (id: string) => Promise<unknown>;
}) {
  const replies: { content?: string }[] = [];
  const edits: { content?: string }[] = [];

  const fetch =
    opts.fetchImpl ??
    (async (id: string) => {
      if (!opts.channels.has(id)) throw unknownChannelError();
      return opts.channels.get(id);
    });

  return {
    replies,
    edits,
    interaction: {
      commandName: "ticket",
      user: { id: "u-admin", tag: "admin#0001" },
      guildId: "g1",
      channelId: "c1",
      options: {
        getSubcommand: () => "purge",
        getInteger: () => opts.days ?? null,
      },
      member: {
        roles: { cache: { has: (r: string) => (opts.hasAdminRole ?? true) && r === ADMIN_ROLE } },
      },
      guild: { channels: { fetch } },
      client: { guilds: { cache: { get: () => undefined } } },
      async reply(payload: { content?: string }) {
        replies.push(payload);
      },
      async deferReply() {},
      async editReply(payload: { content?: string }) {
        edits.push(payload);
      },
    },
  };
}

async function makeInstance(): Promise<FunctionInstance> {
  return ticketsManifest.createInstance({
    adminChannelId: "c-admin",
    adminRoleId: ADMIN_ROLE,
    logChannelId: "",
  });
}

function seedLogs(entries: { ticketId: string; threadId: string; closedAt?: number }[]) {
  for (const e of entries) {
    const record = configStore.logTicket({
      ticketId: e.ticketId,
      threadName: `${e.ticketId} — subject`,
      threadId: e.threadId,
      submitterId: "u-submitter",
      closedBy: "u-admin",
      rating: 5,
    });
    // logTicket stamps closedAt=now; rewrite it when a test needs an older one.
    if (e.closedAt !== undefined) record.closedAt = e.closedAt;
  }
}

describe("/ticket purge", () => {
  beforeEach(() => {
    // Start each test from an empty ticket log.
    const existing = configStore.getTicketLogs(10000);
    configStore.deleteTicketLogs(existing.map((t) => t.threadId));
    expect(configStore.getTicketLogs(10000)).toHaveLength(0);
  });

  it("deletes the threads recorded in the ticket log", async () => {
    seedLogs([
      { ticketId: "TICKET-1", threadId: "t1" },
      { ticketId: "TICKET-2", threadId: "t2" },
    ]);

    const t1 = makeThread("t1");
    const t2 = makeThread("t2");
    const channels = new Map<string, unknown>([
      ["t1", t1],
      ["t2", t2],
    ]);

    const { interaction, edits } = makeInteraction({ channels });
    const instance = await makeInstance();
    await instance.handleCommand!(interaction, null, null);

    expect(t1.deleted).toBe(true);
    expect(t2.deleted).toBe(true);
    expect(edits.at(-1)?.content).toContain("**2** deleted");
  });

  it("unarchives an archived thread before deleting it", async () => {
    seedLogs([{ ticketId: "TICKET-3", threadId: "t3" }]);
    const t3 = makeThread("t3", true);

    const { interaction } = makeInteraction({ channels: new Map([["t3", t3]]) });
    const instance = await makeInstance();
    await instance.handleCommand!(interaction, null, null);

    expect(t3.archived).toBe(false);
    expect(t3.deleted).toBe(true);
  });

  it("still deletes when unarchiving fails", async () => {
    seedLogs([{ ticketId: "TICKET-4", threadId: "t4" }]);
    const t4 = makeThread("t4", true);
    t4.setArchived = async () => {
      throw new Error("Missing Permissions");
    };

    const { interaction, edits } = makeInteraction({ channels: new Map([["t4", t4]]) });
    const instance = await makeInstance();
    await instance.handleCommand!(interaction, null, null);

    expect(t4.deleted).toBe(true);
    expect(edits.at(-1)?.content).toContain("**1** deleted");
  });

  it("counts an already-deleted thread (API 10003) as 'already gone', not a failure", async () => {
    seedLogs([{ ticketId: "TICKET-5", threadId: "gone" }]);

    const { interaction, edits } = makeInteraction({ channels: new Map() });
    const instance = await makeInstance();
    await instance.handleCommand!(interaction, null, null);

    const msg = edits.at(-1)?.content ?? "";
    expect(msg).toContain("**1** already gone");
    expect(msg).not.toContain("failed");
  });

  it("refuses to delete an id that resolves to a non-thread channel", async () => {
    seedLogs([{ ticketId: "TICKET-6", threadId: "c-regular" }]);

    let deleted = false;
    const regularChannel = {
      id: "c-regular",
      isThread: () => false,
      delete: async () => {
        deleted = true;
      },
    };

    const { interaction, edits } = makeInteraction({
      channels: new Map([["c-regular", regularChannel]]),
    });
    const instance = await makeInstance();
    await instance.handleCommand!(interaction, null, null);

    expect(deleted).toBe(false);
    expect(edits.at(-1)?.content).toContain("**1** failed");
  });

  it("prunes settled tickets from the log so a second purge is a no-op", async () => {
    seedLogs([{ ticketId: "TICKET-7", threadId: "t7" }]);
    const t7 = makeThread("t7");
    const channels = new Map<string, unknown>([["t7", t7]]);

    const instance = await makeInstance();

    const first = makeInteraction({ channels });
    await instance.handleCommand!(first.interaction, null, null);
    expect(first.edits.at(-1)?.content).toContain("**1** deleted");
    expect(configStore.getTicketLogs(10000)).toHaveLength(0);

    // Second run: nothing left in the log to act on.
    const second = makeInteraction({ channels: new Map() });
    await instance.handleCommand!(second.interaction, null, null);
    expect(second.edits.at(-1)?.content).toBe("No closed tickets found.");
  });

  it("keeps failed tickets in the log so they can be retried", async () => {
    seedLogs([{ ticketId: "TICKET-8", threadId: "t8" }]);
    const t8 = makeThread("t8");
    t8.delete = async () => {
      throw new Error("Missing Permissions");
    };

    const { interaction, edits } = makeInteraction({ channels: new Map([["t8", t8]]) });
    const instance = await makeInstance();
    await instance.handleCommand!(interaction, null, null);

    expect(edits.at(-1)?.content).toContain("**1** failed");
    expect(configStore.getTicketLogs(10000)).toHaveLength(1);
  });

  it("honours the days filter and leaves older tickets alone", async () => {
    // logTicket stamps closedAt from Date.now(), so drive the clock to seed one
    // ticket 30 days old and one from today.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
      seedLogs([{ ticketId: "TICKET-OLD", threadId: "old" }]);

      vi.setSystemTime(new Date("2026-07-01T00:00:00Z"));
      seedLogs([{ ticketId: "TICKET-NEW", threadId: "recent" }]);

      const oldThread = makeThread("old");
      const recentThread = makeThread("recent");
      const channels = new Map<string, unknown>([
        ["old", oldThread],
        ["recent", recentThread],
      ]);

      // days=7 as of 2026-07-01 excludes the 30-day-old ticket.
      const { interaction, edits } = makeInteraction({ channels, days: 7 });
      const instance = await makeInstance();
      await instance.handleCommand!(interaction, null, null);

      expect(recentThread.deleted).toBe(true);
      expect(oldThread.deleted).toBe(false);

      const msg = edits.at(-1)?.content ?? "";
      expect(msg).toContain("**1** deleted");
      expect(msg).toContain("closed within last 7 day(s)");

      // The out-of-window ticket must survive in the log.
      const remaining = configStore.getTicketLogs(10000);
      expect(remaining.map((t) => t.threadId)).toEqual(["old"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports nothing to do when no ticket falls inside the window", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
      seedLogs([{ ticketId: "TICKET-ANCIENT", threadId: "ancient" }]);
      vi.setSystemTime(new Date("2026-07-01T00:00:00Z"));

      const ancient = makeThread("ancient");
      const { interaction, edits } = makeInteraction({
        channels: new Map([["ancient", ancient]]),
        days: 3,
      });
      const instance = await makeInstance();
      await instance.handleCommand!(interaction, null, null);

      expect(ancient.deleted).toBe(false);
      expect(edits.at(-1)?.content).toBe("No tickets closed in the last 3 day(s).");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a caller without the admin role", async () => {
    seedLogs([{ ticketId: "TICKET-11", threadId: "t11" }]);
    const t11 = makeThread("t11");

    const { interaction, replies } = makeInteraction({
      channels: new Map([["t11", t11]]),
      hasAdminRole: false,
    });
    const instance = await makeInstance();
    await instance.handleCommand!(interaction, null, null);

    expect(replies.at(-1)?.content).toContain("Only admins can purge tickets");
    expect(t11.deleted).toBe(false);
  });

  it("never reaches for a `threads` manager on the guild", async () => {
    // Guard against the original bug returning: Guild has no `threads`, so any
    // access to it means the regression is back.
    seedLogs([{ ticketId: "TICKET-12", threadId: "t12" }]);
    const t12 = makeThread("t12");

    const threadsGetter = vi.fn(() => undefined);
    const { interaction } = makeInteraction({ channels: new Map([["t12", t12]]) });
    Object.defineProperty(interaction.guild, "threads", { get: threadsGetter });

    const instance = await makeInstance();
    await instance.handleCommand!(interaction, null, null);

    expect(threadsGetter).not.toHaveBeenCalled();
    expect(t12.deleted).toBe(true);
  });
});
