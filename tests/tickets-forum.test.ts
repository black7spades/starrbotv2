import { describe, it, expect, beforeEach } from "vitest";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { ChannelType } from "discord.js";

import { ticketsManifest } from "functions/tickets/index";
import { configStore } from "config/index";
import type { FunctionInstance } from "functions/registry/types";

/**
 * Tickets live in a forum channel: each ticket is a forum post, tagged "Open"
 * on creation and flipped to "Resolved" on close, so closed tickets fall out of
 * the default view without anything being deleted.
 */

const ADMIN_ROLE = "role-admin";
const FORUM_ID = "forum-1";
const DATA_DIR = process.env.STARRBOT_DATA_DIR!;

const TAGS = [
  { id: "t-open", name: "Open" },
  { id: "t-resolved", name: "Resolved" },
  { id: "t-billing", name: "Billing" },
];

class FakeCollection<V> extends Map<string, V> {
  last(): V | undefined {
    return [...this.values()][this.size - 1];
  }
}

function makePost(id: string, name: string, appliedTags: string[] = [], parent?: any) {
  const sent: any[] = [];
  const post: any = {
    id,
    name,
    appliedTags,
    parent,
    parentId: parent?.id,
    archived: false,
    locked: false,
    isThread: () => true,
    members: { add: async () => {}, remove: async () => {} },
    messages: { fetch: async () => new FakeCollection<any>() },
    sent,
    tagCalls: [] as string[][],
    async send(payload: any) {
      sent.push(payload);
      return {
        id: "msg",
        createMessageComponentCollector: () => ({
          on(event: string, handler: any) {
            if (event === "collect") post.collect = handler;
            if (event === "end") post.end = handler;
          },
        }),
      };
    },
    async setAppliedTags(tags: string[]) {
      post.tagCalls.push(tags);
      post.appliedTags = tags;
    },
    async setLocked(v: boolean) {
      post.locked = v;
    },
    async setArchived(v: boolean) {
      post.archived = v;
    },
  };
  return post;
}

function makeForum(opts: { tags?: { id: string; name: string }[] } = {}) {
  const created: any[] = [];
  const forum: any = {
    id: FORUM_ID,
    type: ChannelType.GuildForum,
    availableTags: opts.tags ?? TAGS,
    created,
    threads: {
      async create(options: any) {
        const post = makePost(`post-${created.length + 1}`, options.name, [
          ...(options.appliedTags ?? []),
        ], forum);
        created.push({ options, post });
        return post;
      },
    },
  };
  return forum;
}

function makeCreateInteraction(forum: any, opts: { subject?: string; message?: string } = {}) {
  const replies: any[] = [];
  return {
    replies,
    interaction: {
      commandName: "ticket",
      user: { id: "user-1", tag: "user#0001", username: "user" },
      guildId: "g1",
      channelId: "c1",
      options: {
        getSubcommand: () => "create",
        getString: (name: string) =>
          name === "subject" ? (opts.subject ?? "Cannot log in") : (opts.message ?? "Details here"),
        getInteger: () => null,
      },
      member: { roles: { cache: { has: (r: string) => r === ADMIN_ROLE } } },
      client: { channels: { fetch: async () => forum } },
      async reply() {},
      async deferReply() {},
      async editReply(p: any) {
        replies.push(p);
      },
    },
  };
}

function makeCloseInteraction(post: any, logChannel: any) {
  return {
    commandName: "ticket",
    user: { id: "admin-1", tag: "admin#0001" },
    guildId: "g1",
    channelId: post.id,
    channel: post,
    options: { getSubcommand: () => "close", getInteger: () => null, getString: () => "" },
    member: { roles: { cache: { has: (r: string) => r === ADMIN_ROLE } } },
    client: {
      channels: {
        fetch: async (id: string) => (id === FORUM_ID ? post.parent : logChannel),
      },
    },
    async reply() {},
    async deferReply() {},
    async editReply() {},
  };
}

function makeLogChannel() {
  const posted: any[] = [];
  return {
    posted,
    channel: { id: "chan-log", isTextBased: () => true, async send(p: any) { posted.push(p); } },
  };
}

async function makeInstance(over: Record<string, unknown> = {}): Promise<FunctionInstance> {
  return ticketsManifest.createInstance({
    adminChannelId: FORUM_ID,
    adminRoleId: ADMIN_ROLE,
    logChannelId: "chan-log",
    openTagName: "Open",
    resolvedTagName: "Resolved",
    ...over,
  });
}

function seedOpener(threadId: string, userId: string) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(join(DATA_DIR, "ticket-openers.json"), JSON.stringify({ [threadId]: userId }));
}

describe("creating a ticket as a forum post", () => {
  beforeEach(() => {
    const existing = configStore.getTicketLogs(10000);
    configStore.deleteTicketLogs(existing.map((t) => t.threadId));
  });

  it("creates a forum post carrying the ticket embed as its starter message", async () => {
    const forum = makeForum();
    const { interaction } = makeCreateInteraction(forum, { subject: "Cannot log in" });

    const instance = await makeInstance();
    await instance.handleCommand!(interaction, null, null);

    expect(forum.created).toHaveLength(1);
    const { options, post } = forum.created[0];

    // A forum post must be created with its message; it cannot be posted into
    // after the fact the way a text-channel thread is.
    expect(options.message).toBeDefined();
    expect(options.message.embeds).toHaveLength(1);
    expect(JSON.stringify(options.message.embeds[0])).toContain("Cannot log in");
    expect(options.name).toMatch(/^TICKET-\d+ — Cannot log in$/);

    // The embed is not sent a second time into the post.
    expect(post.sent.every((s: any) => !s?.embeds)).toBe(true);
    // The admin role is still pinged.
    expect(post.sent.some((s: any) => String(s).includes(ADMIN_ROLE))).toBe(true);
  });

  it("tags the new post Open", async () => {
    const forum = makeForum();
    const { interaction } = makeCreateInteraction(forum);

    const instance = await makeInstance();
    await instance.handleCommand!(interaction, null, null);

    expect(forum.created[0].options.appliedTags).toEqual(["t-open"]);
  });

  it("still creates the ticket when the Open tag does not exist", async () => {
    const forum = makeForum({ tags: [{ id: "t-resolved", name: "Resolved" }] });
    const { interaction } = makeCreateInteraction(forum);

    const instance = await makeInstance();
    await instance.handleCommand!(interaction, null, null);

    expect(forum.created).toHaveLength(1);
    expect(forum.created[0].options.appliedTags).toEqual([]);
  });

  it("refuses a channel that is not a forum, with a message saying so", async () => {
    const textChannel = { id: "chan-text", type: ChannelType.GuildText, threads: { create: async () => { throw new Error("should not be called"); } } };
    const { interaction, replies } = makeCreateInteraction(textChannel as any);

    const instance = await makeInstance();
    await instance.handleCommand!(interaction, null, null);

    expect(replies.at(-1)?.content).toContain("not a forum channel");
  });
});

describe("closing a ticket flips its forum tags", () => {
  beforeEach(() => {
    const existing = configStore.getTicketLogs(10000);
    configStore.deleteTicketLogs(existing.map((t) => t.threadId));
  });

  it("swaps Open for Resolved", async () => {
    const forum = makeForum();
    const post = makePost("post-x", "TICKET-0001 — thing", ["t-open"], forum);
    const log = makeLogChannel();
    seedOpener("post-x", "user-1");

    const instance = await makeInstance();
    await instance.handleCommand!(makeCloseInteraction(post, log.channel), null, null);
    await post.collect({ values: ["5"], user: { id: "user-1" }, async reply() {} });

    expect(post.appliedTags).toEqual(["t-resolved"]);
    expect(post.archived).toBe(true);
    expect(post.locked).toBe(true);
  });

  it("preserves other tags a human applied", async () => {
    const forum = makeForum();
    const post = makePost("post-y", "TICKET-0002 — billing", ["t-open", "t-billing"], forum);
    const log = makeLogChannel();
    seedOpener("post-y", "user-2");

    const instance = await makeInstance();
    await instance.handleCommand!(makeCloseInteraction(post, log.channel), null, null);
    await post.collect({ values: ["4"], user: { id: "user-2" }, async reply() {} });

    expect(post.appliedTags).toContain("t-resolved");
    expect(post.appliedTags).toContain("t-billing");
    expect(post.appliedTags).not.toContain("t-open");
  });

  it("tags a ticket that timed out without a rating", async () => {
    const forum = makeForum();
    const post = makePost("post-z", "TICKET-0003 — quiet", ["t-open"], forum);
    const log = makeLogChannel();
    seedOpener("post-z", "user-3");

    const instance = await makeInstance();
    await instance.handleCommand!(makeCloseInteraction(post, log.channel), null, null);
    await post.end({ size: 0 });

    expect(post.appliedTags).toEqual(["t-resolved"]);
  });

  it("closes normally when the Resolved tag is missing", async () => {
    const forum = makeForum({ tags: [{ id: "t-open", name: "Open" }] });
    const post = makePost("post-n", "TICKET-0004 — no tag", ["t-open"], forum);
    const log = makeLogChannel();
    seedOpener("post-n", "user-4");

    const instance = await makeInstance();
    await instance.handleCommand!(makeCloseInteraction(post, log.channel), null, null);
    await post.collect({ values: ["3"], user: { id: "user-4" }, async reply() {} });

    // Tags untouched, but the ticket is still closed and recorded.
    expect(post.tagCalls).toHaveLength(0);
    expect(post.archived).toBe(true);
    expect(configStore.getTicketLogs(100).some((t) => t.threadId === "post-n")).toBe(true);
  });

  it("closes the ticket even if applying tags fails", async () => {
    const forum = makeForum();
    const post = makePost("post-f", "TICKET-0005 — perms", ["t-open"], forum);
    post.setAppliedTags = async () => {
      throw new Error("Missing Permissions");
    };
    const log = makeLogChannel();
    seedOpener("post-f", "user-5");

    const instance = await makeInstance();
    await instance.handleCommand!(makeCloseInteraction(post, log.channel), null, null);
    await post.collect({ values: ["5"], user: { id: "user-5" }, async reply() {} });

    expect(post.archived).toBe(true);
    expect(configStore.getTicketLogs(100).some((t) => t.threadId === "post-f")).toBe(true);
  });

  it("resolves the parent forum by id when it is not cached", async () => {
    const forum = makeForum();
    const post = makePost("post-u", "TICKET-0006 — uncached", ["t-open"], forum);
    // Simulate an uncached parent: only the id is available.
    post.parent = undefined;
    post.parentId = FORUM_ID;
    const log = makeLogChannel();
    seedOpener("post-u", "user-6");

    const close = makeCloseInteraction(post, log.channel);
    close.client.channels.fetch = async (id: string) => (id === FORUM_ID ? forum : log.channel);

    const instance = await makeInstance();
    await instance.handleCommand!(close, null, null);
    await post.collect({ values: ["5"], user: { id: "user-6" }, async reply() {} });

    expect(post.appliedTags).toEqual(["t-resolved"]);
  });

  it("leaves tags alone for a ticket whose parent is not a forum", async () => {
    const textParent = { id: "chan-text", type: ChannelType.GuildText };
    const post = makePost("post-t", "TICKET-0007 — legacy", [], textParent);
    const log = makeLogChannel();
    seedOpener("post-t", "user-7");

    const instance = await makeInstance();
    await instance.handleCommand!(makeCloseInteraction(post, log.channel), null, null);
    await post.collect({ values: ["5"], user: { id: "user-7" }, async reply() {} });

    expect(post.tagCalls).toHaveLength(0);
    expect(post.archived).toBe(true);
  });
});
