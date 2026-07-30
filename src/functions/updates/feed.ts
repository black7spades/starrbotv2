/**
 * Minimal RSS 2.0 + Atom 1.0 parser.
 *
 * Both formats matter now that sources are native feeds: YouTube and GitHub
 * serve Atom (<entry>, <link href="...">), while Reddit, Bluesky and Mastodon
 * serve RSS (<item>, <link>text</link>). The previous implementation only
 * understood <item>, so every Atom feed parsed to zero entries and silently
 * posted nothing.
 *
 * This is deliberately regex-based rather than a full XML parser: feeds are
 * read-only, we only need four fields, and adding a parser dependency for that
 * is not worth it. It is tolerant by design — a feed that is 99% well-formed
 * should still yield its entries.
 */

export interface FeedItem {
  title: string;
  link: string;
  description?: string;
  /** Epoch ms when the entry was published, when the feed says. */
  publishedAt?: number;
}

/** Undoes the five XML entities that appear in practice, plus numeric refs. */
export function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    // Ampersand last, so an encoded &amp;lt; does not become a tag.
    .replace(/&amp;/g, "&");
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, "");
}

/** Reads a simple element's text, preferring CDATA when present. */
function tagText(block: string, tag: string): string | undefined {
  const cdata = block.match(
    new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i")
  );
  if (cdata) return cdata[1];
  const plain = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return plain?.[1];
}

/**
 * Atom links are attributes, and a feed may carry several. Prefer
 * rel="alternate" (the human-readable page), then a link with no rel.
 */
function atomLink(block: string): string | undefined {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
  const withHref = links
    .map((attrs) => ({
      href: attrs.match(/href\s*=\s*["']([^"']+)["']/i)?.[1],
      rel: attrs.match(/rel\s*=\s*["']([^"']+)["']/i)?.[1],
    }))
    .filter((l): l is { href: string; rel: string | undefined } => Boolean(l.href));

  return (
    withHref.find((l) => l.rel === "alternate")?.href ??
    withHref.find((l) => !l.rel)?.href ??
    withHref[0]?.href
  );
}

function toEpoch(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value.trim());
  return Number.isNaN(ms) ? undefined : ms;
}

function clean(value: string | undefined, limit = 500): string | undefined {
  if (value === undefined) return undefined;
  const text = decodeEntities(stripTags(value)).replace(/\s+/g, " ").trim();
  return text ? text.slice(0, limit) : undefined;
}

/**
 * Parses a feed document into items, newest-first where the feed provides
 * dates. Returns an empty array for anything unparseable rather than throwing —
 * a bad feed should skip a cycle, not crash the check loop.
 */
export function parseFeed(xml: string): FeedItem[] {
  if (!xml) return [];
  const items: FeedItem[] = [];

  // RSS: <item>
  for (const match of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const block = match[0];
    const link = clean(tagText(block, "link"), 2000) ?? atomLink(block);
    if (!link) continue;
    items.push({
      title: clean(tagText(block, "title"), 300) ?? "Untitled",
      link,
      description: clean(tagText(block, "description")),
      publishedAt: toEpoch(tagText(block, "pubDate") ?? tagText(block, "dc:date")),
    });
  }

  // Atom: <entry>
  for (const match of xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)) {
    const block = match[0];
    const link = atomLink(block) ?? clean(tagText(block, "id"), 2000);
    if (!link || !/^https?:/i.test(link)) continue;
    items.push({
      title: clean(tagText(block, "title"), 300) ?? "Untitled",
      link: decodeEntities(link),
      description:
        clean(tagText(block, "summary")) ??
        clean(tagText(block, "content")) ??
        clean(tagText(block, "media:description")),
      publishedAt: toEpoch(tagText(block, "published") ?? tagText(block, "updated")),
    });
  }

  // Stable order: dated entries newest-first, undated ones keep feed order after.
  const dated = items.filter((i) => i.publishedAt !== undefined);
  const undated = items.filter((i) => i.publishedAt === undefined);
  dated.sort((a, b) => b.publishedAt! - a.publishedAt!);
  return [...dated, ...undated];
}

/**
 * Fetches and parses a feed. Sends a descriptive User-Agent because some
 * origins (Reddit in particular) reject unattributed automated requests.
 */
export async function fetchFeed(url: string, timeoutMs = 10000): Promise<FeedItem[]> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "User-Agent": "StarrBot/2 (+https://github.com/black7spades/starrbotv2)",
      Accept: "application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFeed(await res.text());
}
