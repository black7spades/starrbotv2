import { describe, it, expect } from "vitest";
import {
  PROVIDERS,
  getProvider,
  buildFeedUrl,
  providerCatalogue,
} from "functions/updates/providers";

describe("provider registry", () => {
  it("exposes every provider by id", () => {
    for (const p of PROVIDERS) {
      expect(getProvider(p.id)).toBe(p);
    }
  });

  it("has unique ids", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rejects an unknown provider", () => {
    const res = buildFeedUrl("myspace", {});
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Unknown source type");
  });

  it("produces a serialisable catalogue without build functions", () => {
    const cat = providerCatalogue();
    expect(cat).toHaveLength(PROVIDERS.length);
    for (const entry of cat) {
      expect(entry).not.toHaveProperty("build");
      expect(typeof entry.label).toBe("string");
      expect(Array.isArray(entry.fields)).toBe(true);
    }
    expect(() => JSON.stringify(cat)).not.toThrow();
  });

  it("every provider declares at least one required field", () => {
    for (const p of PROVIDERS) {
      expect(p.fields.some((f) => f.required)).toBe(true);
    }
  });

  it("every provider rejects empty input rather than building a bad URL", () => {
    for (const p of PROVIDERS) {
      const res = p.build({});
      expect(res.ok).toBe(false);
      expect(res.url).toBeUndefined();
      expect(res.error).toBeTruthy();
    }
  });

  it("every successful build returns an absolute https URL", () => {
    const samples: Record<string, Record<string, string>> = {
      youtube: { channelId: "UCBa659QWEk1AI4Tg--mrJ2A" },
      "youtube-playlist": { playlistId: "PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf" },
      bluesky: { handle: "bsky.app" },
      mastodon: { account: "@Gargron@mastodon.social" },
      reddit: { subreddit: "programming" },
      "github-releases": { repo: "facebook/react" },
      "github-commits": { repo: "facebook/react" },
      rss: { url: "https://example.com/feed.xml" },
    };
    for (const p of PROVIDERS) {
      const res = p.build(samples[p.id]);
      expect(res.ok, `${p.id} should build`).toBe(true);
      expect(res.url!.startsWith("https://"), `${p.id} -> ${res.url}`).toBe(true);
    }
  });
});

describe("YouTube", () => {
  it("builds a channel feed from a bare id", () => {
    expect(buildFeedUrl("youtube", { channelId: "UCBa659QWEk1AI4Tg--mrJ2A" })).toEqual({
      ok: true,
      url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCBa659QWEk1AI4Tg--mrJ2A",
    });
  });

  it("accepts a pasted channel URL", () => {
    const res = buildFeedUrl("youtube", {
      channelId: "https://www.youtube.com/channel/UCBa659QWEk1AI4Tg--mrJ2A",
    });
    expect(res.ok).toBe(true);
    expect(res.url).toContain("channel_id=UCBa659QWEk1AI4Tg--mrJ2A");
  });

  it("rejects an @handle with an explanation", () => {
    const res = buildFeedUrl("youtube", { channelId: "@someuser" });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("UC");
  });

  it("builds a playlist feed and accepts a full playlist URL", () => {
    const bare = buildFeedUrl("youtube-playlist", { playlistId: "PLrAXtmErZgOeiKm4sgNOknGvNj" });
    expect(bare.url).toContain("playlist_id=PLrAXtmErZgOeiKm4sgNOknGvNj");

    const fromUrl = buildFeedUrl("youtube-playlist", {
      playlistId: "https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNj",
    });
    expect(fromUrl.url).toContain("playlist_id=PLrAXtmErZgOeiKm4sgNOknGvNj");
  });
});

describe("Bluesky", () => {
  it("builds a profile feed", () => {
    expect(buildFeedUrl("bluesky", { handle: "someone.bsky.social" }).url).toBe(
      "https://bsky.app/profile/someone.bsky.social/rss"
    );
  });

  it("tolerates a leading @ and a pasted profile URL", () => {
    expect(buildFeedUrl("bluesky", { handle: "@someone.bsky.social" }).url).toContain(
      "someone.bsky.social/rss"
    );
    expect(
      buildFeedUrl("bluesky", { handle: "https://bsky.app/profile/someone.bsky.social" }).url
    ).toBe("https://bsky.app/profile/someone.bsky.social/rss");
  });

  it("rejects a DID, which the RSS endpoint does not serve", () => {
    const res = buildFeedUrl("bluesky", { handle: "did:plc:oky5czdrnfjpqslsw2a5iclo" });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("DID");
  });

  it("rejects something that is not a handle", () => {
    expect(buildFeedUrl("bluesky", { handle: "nodots" }).ok).toBe(false);
  });
});

describe("Mastodon", () => {
  it("builds from a full address", () => {
    expect(buildFeedUrl("mastodon", { account: "@Gargron@mastodon.social" }).url).toBe(
      "https://mastodon.social/@Gargron.rss"
    );
  });

  it("builds from a profile URL", () => {
    expect(buildFeedUrl("mastodon", { account: "https://mastodon.social/@Gargron" }).url).toBe(
      "https://mastodon.social/@Gargron.rss"
    );
  });

  it("requires the instance", () => {
    const res = buildFeedUrl("mastodon", { account: "@Gargron" });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("full address");
  });
});

describe("Reddit", () => {
  it("builds a subreddit feed", () => {
    expect(buildFeedUrl("reddit", { subreddit: "programming" }).url).toBe(
      "https://www.reddit.com/r/programming/.rss"
    );
  });

  it("strips an r/ prefix and a pasted URL", () => {
    expect(buildFeedUrl("reddit", { subreddit: "r/programming" }).url).toContain("/r/programming/");
    expect(
      buildFeedUrl("reddit", { subreddit: "https://www.reddit.com/r/programming" }).url
    ).toContain("/r/programming/");
  });

  it("rejects an invalid name", () => {
    expect(buildFeedUrl("reddit", { subreddit: "has spaces" }).ok).toBe(false);
  });
});

describe("GitHub", () => {
  it("builds a releases feed", () => {
    expect(buildFeedUrl("github-releases", { repo: "facebook/react" }).url).toBe(
      "https://github.com/facebook/react/releases.atom"
    );
  });

  it("accepts a pasted repo URL and a .git suffix", () => {
    expect(buildFeedUrl("github-releases", { repo: "https://github.com/facebook/react" }).url).toBe(
      "https://github.com/facebook/react/releases.atom"
    );
    expect(buildFeedUrl("github-releases", { repo: "facebook/react.git" }).url).toBe(
      "https://github.com/facebook/react/releases.atom"
    );
  });

  it("defaults the commits branch to main", () => {
    expect(buildFeedUrl("github-commits", { repo: "facebook/react" }).url).toBe(
      "https://github.com/facebook/react/commits/main.atom"
    );
  });

  it("honours an explicit branch", () => {
    expect(buildFeedUrl("github-commits", { repo: "facebook/react", branch: "canary" }).url).toBe(
      "https://github.com/facebook/react/commits/canary.atom"
    );
  });

  it("rejects a bare repo name", () => {
    expect(buildFeedUrl("github-releases", { repo: "react" }).ok).toBe(false);
  });
});

describe("custom feed", () => {
  it("passes a valid https URL through", () => {
    expect(buildFeedUrl("rss", { url: "https://example.com/feed.xml" }).url).toBe(
      "https://example.com/feed.xml"
    );
  });

  it("allows plain http", () => {
    expect(buildFeedUrl("rss", { url: "http://example.com/feed.xml" }).ok).toBe(true);
  });

  it("rejects other schemes", () => {
    for (const url of ["file:///etc/passwd", "ftp://example.com/feed"]) {
      const res = buildFeedUrl("rss", { url });
      expect(res.ok, url).toBe(false);
    }
  });

  it("rejects nonsense", () => {
    expect(buildFeedUrl("rss", { url: "not a url" }).ok).toBe(false);
  });
});

describe("no provider depends on RSSHub", () => {
  it("never produces an rsshub URL", () => {
    const samples: Record<string, string>[] = [
      { channelId: "UCBa659QWEk1AI4Tg--mrJ2A" },
      { playlistId: "PLrAXtmErZgOeiKm4sgNOknGvNj" },
      { handle: "bsky.app" },
      { account: "@a@mastodon.social" },
      { subreddit: "programming" },
      { repo: "facebook/react" },
      { url: "https://example.com/feed.xml" },
    ];
    for (const p of PROVIDERS) {
      for (const s of samples) {
        const res = p.build(s);
        if (res.ok) expect(res.url!.toLowerCase()).not.toContain("rsshub");
      }
    }
  });
});
