import { describe, it, expect, beforeEach } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

import { ticketsManifest } from "functions/tickets/index";
import { configStore } from "config/index";
import { TRANSCRIPT_DIR } from "functions/tickets/transcript";
import type { FunctionInstance } from "functions/registry/types";

/**
 * Covers the close path end to end: a closed ticket must leave a transcript on
 * disk, a log entry pointing at it, and a summary in the log channel with the
 * transcript attached — so deleting the thread later is no longer lossy.
 */

const ADMIN_ROLE = "role-admin";
const LOG_CHANNEL = "chan-log";
const DATA_DIR = process.env.STARRBOT_DATA_DIR!;

class FakeCollection<V> extends Map<string, V> {
  last(): V | undefined {
    return [...this.values()][this.size - 1];
  }
}

interface Sent {
  embeds?: any[];
  files?: any[];
  content?: string;
  components?: any[];
}

function makeThread(opts: { id: string; name: string; messages?: { author: string; content: string; ts: number }[] }) {
  const sent: Sent[] = [];
  let collectHandler: ((i: any) => Promise<void>) | undefined;
  let endHandler: ((c: any) => Promise<void>) | undefined;

  const raw = (opts.messages ?? []).map((m, i) => ({
    id: `m${i}`,
    createdTimestamp: m.ts,
    author: { tag: m.author, id: m.author, bot: false },
    content: m.content,
    attachments: new Map(),
    embeds: [],
  }));

  const thread = {
    id: opts.id,
    name: opts.name,
    archived: false,
    locked: false,
    isThread: () => true,
    members: { remove: async () => {} },
    messages: {
      // Newest-first, like Discord.
      fetch: async () => new FakeCollection<any>([...raw].reverse().map((r) => [r.id, r])) as any,
    },
    async send(payload: Sent) {
      sent.push(payload);
      return {
        id: "rating-msg",
        createMessageComponentCollector() {
          return {
            on(event: string, handler: any) {
              if (event === "collect") collectHandler = handler;
              if (event === "end") endHandler = handler;
            },
          };
        },
      };
    },
    async setLocked(v: boolean) {
      thread.locked = v;
    },
    async setArchived(v: boolean) {
      thread.archived = v;
    },
  };

  return {
    thread,
    sent,
    collect: (i: any) => collectHandler!(i),
    end: (c: any) => endHandler!(c),
    hasCollector: () => collectHandler !== undefined,
  };
}

function makeLogChannel() {
  const posted: Sent[] = [];
  return {
    posted,
    channel: {
      id: LOG_CHANNEL,
      isTextBased: () => true,
      async send(payload: Sent) {
        posted.push(payload);
      },
    },
  };
}

function makeCloseInteraction(thread: any, logChannel: any, opts: { userId?: string } = {}) {
  return {
    commandName: "ticket",
    user: { id: opts.userId ?? "admin-1", tag: "admin#0001" },
    guildId: "g1",
    channelId: thread.id,
    channel: thread,
    options: { getSubcommand: () => "close", getInteger: () => null, getString: () => "" },
    member: { roles: { cache: { has: (r: string) => r === ADMIN_ROLE } } },
    client: { channels: { fetch: async () => logChannel } },
    async reply() {},
    async deferReply() {},
    async editReply() {},
  };
}

async function makeInstance(): Promise<FunctionInstance> {
  return ticketsManifest.createInstance({
    adminChannelId: "chan-admin",
    adminRoleId: ADMIN_ROLE,
    logChannelId: LOG_CHANNEL,
  });
}

/** The close path reads the opener from data/ticket-openers.json. */
function seedOpener(threadId: string, userId: string) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(join(DATA_DIR, "ticket-openers.json"), JSON.stringify({ [threadId]: userId }));
}

function clearOpeners() {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(join(DATA_DIR, "ticket-openers.json"), "{}");
}

function latestLog(threadId: string) {
  return configStore.getTicketLogs(1000).find((t) => t.threadId === threadId);
}

describe("/ticket close captures a transcript", () => {
  beforeEach(() => {
    const existing = configStore.getTicketLogs(10000);
    configStore.deleteTicketLogs(existing.map((t) => t.threadId));
    clearOpeners();
  });

  it("writes a transcript, logs its path, and attaches it to the summary", async () => {
    const t = makeThread({
      id: "th-1",
      name: "TICKET-0001 — cannot log in",
      messages: [
        { author: "user#1", content: "I cannot log in", ts: 1000 },
        { author: "admin#1", content: "Try resetting your password", ts: 2000 },
        { author: "user#1", content: "That worked, thanks!", ts: 3000 },
      ],
    });
    const log = makeLogChannel();
    seedOpener("th-1", "user-1");

    const instance = await makeInstance();
    await instance.handleCommand!(makeCloseInteraction(t.thread, log.channel), null, null);

    // The rating prompt is posted and a collector registered.
    expect(t.hasCollector()).toBe(true);

    // Submitter rates 5 -> ticket is finalised.
    await t.collect({
      values: ["5"],
      user: { id: "user-1" },
      async reply() {},
    });

    const entry = latestLog("th-1");
    expect(entry).toBeDefined();
    expect(entry!.ticketId).toBe("TICKET-0001");
    expect(entry!.rating).toBe(5);
    expect(entry!.messageCount).toBe(3);
    expect(entry!.transcript).toBe(join("transcripts", "TICKET-0001-th-1.md"));

    // Transcript exists on disk with the conversation in order.
    const full = join(TRANSCRIPT_DIR, "TICKET-0001-th-1.md");
    expect(existsSync(full)).toBe(true);
    const md = readFileSync(full, "utf8");
    expect(md).toContain("# TICKET-0001");
    expect(md).toContain("> I cannot log in");
    expect(md).toContain("> Try resetting your password");
    expect(md).toContain("> That worked, thanks!");
    expect(md.indexOf("cannot log in")).toBeLessThan(md.indexOf("That worked"));

    // Summary carries the transcript as a file attachment.
    const summary = log.posted.at(-1)!;
    expect(summary.files).toHaveLength(1);
    expect(summary.files![0].name).toBe("TICKET-0001.md");
    const embedJson = JSON.stringify(summary.embeds);
    expect(embedJson).toContain("Transcript");
    expect(embedJson).toContain("3 messages");
  });

  it("captures a transcript when the submitter never rates", async () => {
    const t = makeThread({
      id: "th-2",
      name: "TICKET-0002 — no reply",
      messages: [{ author: "user#2", content: "anyone there?", ts: 1000 }],
    });
    const log = makeLogChannel();
    seedOpener("th-2", "user-2");

    const instance = await makeInstance();
    await instance.handleCommand!(makeCloseInteraction(t.thread, log.channel), null, null);

    // Collector times out with nothing collected.
    await t.end({ size: 0 });

    const entry = latestLog("th-2");
    expect(entry).toBeDefined();
    expect(entry!.rating).toBe(0);
    expect(entry!.transcript).toBe(join("transcripts", "TICKET-0002-th-2.md"));
    expect(existsSync(join(TRANSCRIPT_DIR, "TICKET-0002-th-2.md"))).toBe(true);
    expect(readFileSync(join(TRANSCRIPT_DIR, "TICKET-0002-th-2.md"), "utf8")).toContain(
      "> anyone there?"
    );
  });

  it("still records the ticket when the opener is unknown", async () => {
    const t = makeThread({
      id: "th-3",
      name: "TICKET-0003 — orphaned",
      messages: [{ author: "user#3", content: "help", ts: 1000 }],
    });
    const log = makeLogChannel();
    // No opener seeded: the close path cannot identify the submitter.

    const instance = await makeInstance();
    await instance.handleCommand!(makeCloseInteraction(t.thread, log.channel), null, null);

    // No rating prompt is possible, so no collector is registered.
    expect(t.hasCollector()).toBe(false);

    const entry = latestLog("th-3");
    expect(entry).toBeDefined();
    expect(entry!.ticketId).toBe("TICKET-0003");
    expect(entry!.submitterId).toBe("");
    expect(entry!.transcript).toBe(join("transcripts", "TICKET-0003-th-3.md"));
    expect(existsSync(join(TRANSCRIPT_DIR, "TICKET-0003-th-3.md"))).toBe(true);

    // Summary renders "unknown" instead of a broken mention.
    expect(JSON.stringify(log.posted.at(-1)!.embeds)).toContain("unknown");

    // And the thread is still locked and archived.
    expect(t.thread.locked).toBe(true);
    expect(t.thread.archived).toBe(true);
  });

  it("closes the ticket even if transcript capture fails", async () => {
    const t = makeThread({ id: "th-4", name: "TICKET-0004 — broken fetch" });
    t.thread.messages.fetch = async () => {
      throw new Error("Missing Access");
    };
    const log = makeLogChannel();
    seedOpener("th-4", "user-4");

    const instance = await makeInstance();
    await instance.handleCommand!(makeCloseInteraction(t.thread, log.channel), null, null);
    await t.collect({ values: ["3"], user: { id: "user-4" }, async reply() {} });

    // The ticket is still logged, just without a transcript.
    const entry = latestLog("th-4");
    expect(entry).toBeDefined();
    expect(entry!.rating).toBe(3);
    expect(entry!.transcript).toBeUndefined();

    // The summary says so rather than pretending it worked.
    expect(JSON.stringify(log.posted.at(-1)!.embeds)).toContain("capture failed");

    // And the thread still gets archived.
    expect(t.thread.archived).toBe(true);
  });

  it("still archives and logs when there is no log channel configured", async () => {
    const t = makeThread({
      id: "th-5",
      name: "TICKET-0005 — no log channel",
      messages: [{ author: "user#5", content: "hi", ts: 1000 }],
    });
    seedOpener("th-5", "user-5");

    const instance = await ticketsManifest.createInstance({
      adminChannelId: "chan-admin",
      adminRoleId: ADMIN_ROLE,
      logChannelId: "",
    });
    const log = makeLogChannel();
    await instance.handleCommand!(makeCloseInteraction(t.thread, log.channel), null, null);
    await t.collect({ values: ["4"], user: { id: "user-5" }, async reply() {} });

    expect(log.posted).toHaveLength(0);
    // The transcript is still written to disk — it does not depend on Discord.
    const entry = latestLog("th-5");
    expect(entry!.transcript).toBe(join("transcripts", "TICKET-0005-th-5.md"));
    expect(existsSync(join(TRANSCRIPT_DIR, "TICKET-0005-th-5.md"))).toBe(true);
  });

  it("keeps the transcript after the thread is purged", async () => {
    const t = makeThread({
      id: "th-6",
      name: "TICKET-0006 — purge me",
      messages: [{ author: "user#6", content: "important detail", ts: 1000 }],
    });
    const log = makeLogChannel();
    seedOpener("th-6", "user-6");

    const instance = await makeInstance();
    await instance.handleCommand!(makeCloseInteraction(t.thread, log.channel), null, null);
    await t.collect({ values: ["5"], user: { id: "user-6" }, async reply() {} });

    const transcriptPath = join(TRANSCRIPT_DIR, "TICKET-0006-th-6.md");
    expect(existsSync(transcriptPath)).toBe(true);

    // Purge the thread: the log entry goes, the transcript stays.
    const purge = {
      commandName: "ticket",
      user: { id: "admin-1", tag: "admin#0001" },
      guildId: "g1",
      channelId: "c1",
      options: { getSubcommand: () => "purge", getInteger: () => null },
      member: { roles: { cache: { has: (r: string) => r === ADMIN_ROLE } } },
      guild: {
        channels: {
          fetch: async () => ({ ...t.thread, isThread: () => true, delete: async () => {} }),
        },
      },
      client: { guilds: { cache: { get: () => undefined } } },
      async reply() {},
      async deferReply() {},
      async editReply() {},
    };
    await instance.handleCommand!(purge, null, null);

    expect(latestLog("th-6")).toBeUndefined();
    expect(existsSync(transcriptPath)).toBe(true);
    expect(readFileSync(transcriptPath, "utf8")).toContain("important detail");
  });
});
