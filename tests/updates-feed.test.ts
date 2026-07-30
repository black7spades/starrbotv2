import { describe, it, expect } from "vitest";
import { parseFeed, decodeEntities } from "functions/updates/feed";

/** Shaped like a real YouTube channel feed, which is Atom. */
const YOUTUBE_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
  <title>Some Channel</title>
  <link rel="alternate" href="https://www.youtube.com/channel/UC123"/>
  <entry>
    <id>yt:video:aaa</id>
    <title>First &amp; Best Video</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=aaa"/>
    <published>2026-07-20T10:00:00+00:00</published>
    <media:group><media:description>A description here</media:description></media:group>
  </entry>
  <entry>
    <id>yt:video:bbb</id>
    <title>Second Video</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=bbb"/>
    <published>2026-07-25T10:00:00+00:00</published>
  </entry>
</feed>`;

/** Shaped like a Reddit/Bluesky feed, which is RSS 2.0. */
const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>r/programming</title>
  <item>
    <title><![CDATA[Older post]]></title>
    <link>https://example.com/older</link>
    <description><![CDATA[<p>Some <b>html</b> body</p>]]></description>
    <pubDate>Mon, 20 Jul 2026 10:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Newer post</title>
    <link>https://example.com/newer</link>
    <description>Plain description</description>
    <pubDate>Sat, 25 Jul 2026 10:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

describe("decodeEntities", () => {
  it("decodes the standard five", () => {
    expect(decodeEntities("&lt;a&gt; &quot;x&quot; &apos;y&apos; &amp;")).toBe(`<a> "x" 'y' &`);
  });

  it("decodes numeric and hex references", () => {
    expect(decodeEntities("&#65;&#x42;")).toBe("AB");
  });

  it("decodes ampersand last so double-encoding does not create tags", () => {
    expect(decodeEntities("&amp;lt;script&amp;gt;")).toBe("&lt;script&gt;");
  });
});

describe("parseFeed — Atom", () => {
  it("reads entries, which the old <item>-only parser missed entirely", () => {
    const items = parseFeed(YOUTUBE_ATOM);
    expect(items).toHaveLength(2);
  });

  it("takes the href from rel=alternate rather than the feed's own link", () => {
    const items = parseFeed(YOUTUBE_ATOM);
    expect(items.map((i) => i.link)).toEqual([
      "https://www.youtube.com/watch?v=bbb",
      "https://www.youtube.com/watch?v=aaa",
    ]);
  });

  it("decodes entities in titles", () => {
    const items = parseFeed(YOUTUBE_ATOM);
    expect(items.find((i) => i.link.endsWith("aaa"))!.title).toBe("First & Best Video");
  });

  it("reads published dates and orders newest-first", () => {
    const items = parseFeed(YOUTUBE_ATOM);
    expect(items[0].title).toBe("Second Video");
    expect(items[0].publishedAt).toBe(Date.parse("2026-07-25T10:00:00Z"));
  });

  it("picks up a media:description", () => {
    const items = parseFeed(YOUTUBE_ATOM);
    expect(items.find((i) => i.link.endsWith("aaa"))!.description).toBe("A description here");
  });

  it("skips an entry whose only id is not a URL", () => {
    const feed = `<feed><entry><id>urn:uuid:1234</id><title>No link</title></entry></feed>`;
    expect(parseFeed(feed)).toEqual([]);
  });
});

describe("parseFeed — RSS", () => {
  it("reads items", () => {
    expect(parseFeed(RSS)).toHaveLength(2);
  });

  it("orders newest-first by pubDate", () => {
    const items = parseFeed(RSS);
    expect(items[0].title).toBe("Newer post");
    expect(items[1].title).toBe("Older post");
  });

  it("unwraps CDATA and strips HTML from descriptions", () => {
    const older = parseFeed(RSS).find((i) => i.title === "Older post")!;
    expect(older.description).toBe("Some html body");
  });

  it("keeps plain descriptions", () => {
    const newer = parseFeed(RSS).find((i) => i.title === "Newer post")!;
    expect(newer.description).toBe("Plain description");
  });

  it("skips an item with no link", () => {
    const feed = `<rss><channel><item><title>Linkless</title></item></channel></rss>`;
    expect(parseFeed(feed)).toEqual([]);
  });
});

describe("parseFeed — robustness", () => {
  it("returns empty for empty or junk input rather than throwing", () => {
    for (const input of ["", "not xml at all", "<html><body>hi</body></html>"]) {
      expect(() => parseFeed(input)).not.toThrow();
      expect(parseFeed(input)).toEqual([]);
    }
  });

  it("handles a feed containing both item and entry elements", () => {
    const mixed = `<feed>
      <item><title>R</title><link>https://example.com/r</link></item>
      <entry><title>A</title><link rel="alternate" href="https://example.com/a"/></entry>
    </feed>`;
    const items = parseFeed(mixed);
    expect(items.map((i) => i.title).sort()).toEqual(["A", "R"]);
  });

  it("truncates a very long description", () => {
    const long = "x".repeat(2000);
    const feed = `<rss><channel><item><title>T</title><link>https://e.com/1</link><description>${long}</description></item></channel></rss>`;
    expect(parseFeed(feed)[0].description!.length).toBe(500);
  });

  it("falls back to Untitled when there is no title", () => {
    const feed = `<rss><channel><item><link>https://e.com/1</link></item></channel></rss>`;
    expect(parseFeed(feed)[0].title).toBe("Untitled");
  });

  it("keeps undated entries after dated ones instead of dropping them", () => {
    const feed = `<rss><channel>
      <item><title>Dated</title><link>https://e.com/1</link><pubDate>Sat, 25 Jul 2026 10:00:00 GMT</pubDate></item>
      <item><title>Undated</title><link>https://e.com/2</link></item>
    </channel></rss>`;
    const items = parseFeed(feed);
    expect(items.map((i) => i.title)).toEqual(["Dated", "Undated"]);
  });

  it("ignores an unparseable date rather than dropping the item", () => {
    const feed = `<rss><channel><item><title>T</title><link>https://e.com/1</link><pubDate>whenever</pubDate></item></channel></rss>`;
    const items = parseFeed(feed);
    expect(items).toHaveLength(1);
    expect(items[0].publishedAt).toBeUndefined();
  });
});
