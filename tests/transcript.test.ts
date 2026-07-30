import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, isAbsolute } from "path";

import {
  renderTranscript,
  saveTranscript,
  collectMessages,
  transcriptFileName,
  TRANSCRIPT_DIR,
  type TranscriptMessage,
  type TranscriptMeta,
} from "functions/tickets/transcript";

const META: TranscriptMeta = {
  ticketId: "TICKET-0007",
  threadName: "TICKET-0007 — printer on fire",
  threadId: "thread-7",
  submitterId: "user-1",
  closedBy: "admin-1",
  rating: 4,
  ratingLabel: "Satisfied",
  closedAt: Date.parse("2026-07-30T10:00:00.000Z"),
};

function msg(over: Partial<TranscriptMessage> = {}): TranscriptMessage {
  return {
    id: "m1",
    createdTimestamp: Date.parse("2026-07-30T09:00:00.000Z"),
    authorTag: "user#0001",
    authorId: "user-1",
    bot: false,
    content: "hello",
    attachments: [],
    embeds: [],
    ...over,
  };
}

describe("renderTranscript", () => {
  it("includes the ticket metadata header", () => {
    const md = renderTranscript(META, [msg()]);
    expect(md).toContain("# TICKET-0007");
    expect(md).toContain("printer on fire");
    expect(md).toContain("`thread-7`");
    expect(md).toContain("`user-1`");
    expect(md).toContain("`admin-1`");
    expect(md).toContain("4/5 — Satisfied");
    expect(md).toContain("2026-07-30 10:00:00Z");
    expect(md).toContain("**Messages:** 1");
  });

  it("records 'No response' when there is no rating", () => {
    const md = renderTranscript({ ...META, rating: 0, ratingLabel: "No response" }, []);
    expect(md).toContain("**Rating:** No response");
  });

  it("notes when a ticket had no messages", () => {
    const md = renderTranscript(META, []);
    expect(md).toContain("No messages were captured");
  });

  it("renders messages in the given order with author and time", () => {
    const md = renderTranscript(META, [
      msg({ id: "a", content: "first", createdTimestamp: Date.parse("2026-07-30T09:00:00Z") }),
      msg({
        id: "b",
        content: "second",
        authorTag: "admin#0002",
        createdTimestamp: Date.parse("2026-07-30T09:05:00Z"),
      }),
    ]);
    expect(md.indexOf("first")).toBeLessThan(md.indexOf("second"));
    expect(md).toContain("### user#0001 — 2026-07-30 09:00:00Z");
    expect(md).toContain("### admin#0002 — 2026-07-30 09:05:00Z");
  });

  it("marks bot messages", () => {
    const md = renderTranscript(META, [msg({ authorTag: "starrbot#0000", bot: true })]);
    expect(md).toContain("starrbot#0000 [bot]");
  });

  it("quotes message content so it cannot restructure the document", () => {
    const md = renderTranscript(META, [
      msg({ content: "### Fake heading\n---\n# Not a title" }),
    ]);
    expect(md).toContain("> ### Fake heading");
    expect(md).toContain("> # Not a title");
    // The only real headings are the title and the per-message headers.
    const headings = md.split("\n").filter((l) => /^#{1,3} /.test(l));
    expect(headings).toEqual(["# TICKET-0007", "### user#0001 — 2026-07-30 09:00:00Z"]);
  });

  it("preserves multi-line content as quoted lines", () => {
    const md = renderTranscript(META, [msg({ content: "line one\nline two" })]);
    expect(md).toContain("> line one");
    expect(md).toContain("> line two");
  });

  it("records attachment names and urls", () => {
    const md = renderTranscript(META, [
      msg({ attachments: [{ name: "screenshot.png", url: "https://cdn.example/x.png" }] }),
    ]);
    expect(md).toContain("[attachment]");
    expect(md).toContain("screenshot.png");
    expect(md).toContain("https://cdn.example/x.png");
  });

  it("records embed titles and descriptions", () => {
    const md = renderTranscript(META, [
      msg({ content: "", embeds: [{ title: "Rate Your Experience", description: "pick one" }] }),
    ]);
    expect(md).toContain("[embed]");
    expect(md).toContain("Rate Your Experience");
    expect(md).toContain("> pick one");
  });

  it("marks a message that carries nothing at all", () => {
    const md = renderTranscript(META, [msg({ content: "" })]);
    expect(md).toContain("_(no content)_");
  });
});

describe("transcriptFileName", () => {
  it("uses the ticket id and thread id", () => {
    expect(transcriptFileName("TICKET-0007", "thread-7")).toBe("TICKET-0007-thread-7.md");
  });

  it("neutralises path separators and traversal", () => {
    const name = transcriptFileName("../../etc/passwd", "t1");
    expect(name).not.toContain("/");
    expect(name).not.toContain("..");
    expect(name.endsWith(".md")).toBe(true);
  });

  it("falls back when the id has no usable characters", () => {
    expect(transcriptFileName("///", "t1")).toBe("ticket-t1.md");
  });

  it("keeps distinct threads distinct even with the same ticket id", () => {
    expect(transcriptFileName("TICKET-1", "a")).not.toBe(transcriptFileName("TICKET-1", "b"));
  });
});

describe("saveTranscript", () => {
  it("writes the file and returns a data-dir-relative path", () => {
    const rel = saveTranscript("TICKET-0100", "thread-100", "# body\n");

    expect(isAbsolute(rel)).toBe(false);
    expect(rel).toBe(join("transcripts", "TICKET-0100-thread-100.md"));

    const full = join(TRANSCRIPT_DIR, "TICKET-0100-thread-100.md");
    expect(existsSync(full)).toBe(true);
    expect(readFileSync(full, "utf8")).toBe("# body\n");
  });

  it("leaves no temp files behind", () => {
    saveTranscript("TICKET-0101", "thread-101", "x");
    expect(readdirSync(TRANSCRIPT_DIR).filter((f) => f.includes(".tmp"))).toEqual([]);
  });

  it("overwrites a re-saved transcript rather than failing", () => {
    saveTranscript("TICKET-0102", "thread-102", "first");
    const rel = saveTranscript("TICKET-0102", "thread-102", "second");
    expect(readFileSync(join(TRANSCRIPT_DIR, "TICKET-0102-thread-102.md"), "utf8")).toBe("second");
    expect(rel).toContain("TICKET-0102");
  });

  it("writes somewhere inside the transcripts dir even for a hostile id", () => {
    const rel = saveTranscript("../../escape", "thread-103", "contained");
    expect(rel.startsWith("transcripts")).toBe(true);
    expect(rel).not.toContain("..");
  });
});

/**
 * Fake discord.js Collection: a real Map (so `size`/`values()` behave) plus the
 * `last()` helper discord.js adds. Entries are newest-first, like the real API.
 */
class FakeCollection<V> extends Map<string, V> {
  last(): V | undefined {
    return [...this.values()][this.size - 1];
  }
}

function batch(items: { id: string; ts: number }[]) {
  return new FakeCollection<any>(
    items.map((i) => [
      i.id,
      {
        id: i.id,
        createdTimestamp: i.ts,
        author: { tag: "u#1", id: "u", bot: false },
        content: i.id,
        attachments: new Map(),
        embeds: [],
      },
    ])
  );
}

function single(raw: any) {
  return new FakeCollection<any>([[String(raw.id), raw]]);
}

describe("collectMessages", () => {
  it("returns messages oldest-first", async () => {
    const thread = {
      messages: {
        fetch: async () =>
          batch([
            { id: "new", ts: 300 },
            { id: "mid", ts: 200 },
            { id: "old", ts: 100 },
          ]) as any,
      },
    };

    const out = await collectMessages(thread, 100);
    expect(out.map((m) => m.id)).toEqual(["old", "mid", "new"]);
  });

  it("pages backwards until a short batch arrives", async () => {
    const calls: (string | undefined)[] = [];
    let page = 0;
    const thread = {
      messages: {
        fetch: async (opts: { limit: number; before?: string }) => {
          calls.push(opts.before);
          page += 1;
          if (page === 1) {
            return batch(
              Array.from({ length: 100 }, (_, i) => ({ id: `p1-${i}`, ts: 10_000 - i }))
            ) as any;
          }
          return batch([{ id: "tail", ts: 1 }]) as any;
        },
      },
    };

    const out = await collectMessages(thread, 1000);
    expect(out).toHaveLength(101);
    // First call has no cursor; second pages before the oldest of batch one.
    expect(calls[0]).toBeUndefined();
    expect(calls[1]).toBe("p1-99");
    expect(out[0].id).toBe("tail");
  });

  it("stops at the max and does not over-fetch", async () => {
    let fetches = 0;
    const thread = {
      messages: {
        fetch: async (opts: { limit: number }) => {
          fetches += 1;
          expect(opts.limit).toBeLessThanOrEqual(5);
          return batch(
            Array.from({ length: opts.limit }, (_, i) => ({ id: `f${fetches}-${i}`, ts: 1000 - i }))
          ) as any;
        },
      },
    };

    const out = await collectMessages(thread, 5);
    expect(out).toHaveLength(5);
    expect(fetches).toBe(1);
  });

  it("returns an empty list for an empty thread", async () => {
    const thread = { messages: { fetch: async () => batch([]) as any } };
    expect(await collectMessages(thread, 100)).toEqual([]);
  });

  it("maps author, attachments and embeds off the raw message", async () => {
    const raw = {
      id: "m9",
      createdTimestamp: 500,
      author: { tag: "bot#0000", id: "b1", bot: true },
      content: "body",
      attachments: new Map([["a", { name: "f.png", url: "https://cdn/f.png" }]]),
      embeds: [{ title: "T", description: "D" }],
    };
    const thread = { messages: { fetch: async () => single(raw) as any } };

    const [out] = await collectMessages(thread, 10);
    expect(out).toMatchObject({
      id: "m9",
      authorTag: "bot#0000",
      authorId: "b1",
      bot: true,
      content: "body",
      attachments: [{ name: "f.png", url: "https://cdn/f.png" }],
      embeds: [{ title: "T", description: "D" }],
    });
  });

  it("tolerates a message with missing fields", async () => {
    const raw = { id: "m0" };
    const thread = { messages: { fetch: async () => single(raw) as any } };

    const [out] = await collectMessages(thread, 10);
    expect(out.authorTag).toBe("unknown");
    expect(out.content).toBe("");
    expect(out.attachments).toEqual([]);
    expect(out.embeds).toEqual([]);
  });
});
