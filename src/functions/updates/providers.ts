/**
 * Sources the Updates function can follow.
 *
 * Every provider here resolves to a feed the *origin service publishes itself*.
 * That is the whole point of the registry: RSSHub was a third-party scraper
 * standing between us and each site, so any of its ~5000 routes could break
 * without notice, and a self-hosted instance was one more container to keep
 * alive. A URL the platform serves is one the platform is committed to.
 *
 * Adding a provider means adding one entry to PROVIDERS. Nothing else in the
 * Updates function knows about specific services.
 */

export interface ProviderField {
  key: string;
  label: string;
  placeholder: string;
  /** Shown under the input to explain where to find the value. */
  hint?: string;
  required?: boolean;
}

export interface BuildResult {
  ok: boolean;
  url?: string;
  error?: string;
}

export interface Provider {
  id: string;
  label: string;
  /** One line, shown in the picker. */
  description: string;
  /** Icon name understood by the dashboard's Icon component. */
  icon: string;
  /** Where the feed comes from, for the "why is this reliable" note in the UI. */
  feedSource: string;
  fields: ProviderField[];
  build(input: Record<string, string>): BuildResult;
}

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

/** Strips a leading @ and any wrapping URL noise from a handle-ish input. */
function bareHandle(value: string): string {
  return clean(value)
    .replace(/^https?:\/\/[^/]+\//, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "");
}

const YOUTUBE: Provider = {
  id: "youtube",
  label: "YouTube",
  description: "New uploads from a channel",
  icon: "play",
  feedSource: "youtube.com/feeds/videos.xml",
  fields: [
    {
      key: "channelId",
      label: "Channel ID",
      placeholder: "UCxxxxxxxxxxxxxxxxxxxxxx",
      hint: "Open the channel, View Source, and search for \"channelId\". Starts with UC.",
      required: true,
    },
  ],
  build(input) {
    const raw = clean(input.channelId);
    if (!raw) return { ok: false, error: "Channel ID is required" };

    // Accept a pasted channel URL as well as a bare id.
    const fromUrl = raw.match(/channel\/(UC[\w-]{20,})/)?.[1];
    const id = fromUrl ?? raw;

    if (!/^UC[\w-]{20,}$/.test(id)) {
      return {
        ok: false,
        error:
          "That does not look like a channel ID. It starts with UC — an @handle will not work here.",
      };
    }
    return { ok: true, url: `https://www.youtube.com/feeds/videos.xml?channel_id=${id}` };
  },
};

const YOUTUBE_PLAYLIST: Provider = {
  id: "youtube-playlist",
  label: "YouTube playlist",
  description: "New videos added to a playlist",
  icon: "play",
  feedSource: "youtube.com/feeds/videos.xml",
  fields: [
    {
      key: "playlistId",
      label: "Playlist ID",
      placeholder: "PLxxxxxxxxxxxxxxxx",
      hint: "The list= value in a playlist URL.",
      required: true,
    },
  ],
  build(input) {
    const raw = clean(input.playlistId);
    if (!raw) return { ok: false, error: "Playlist ID is required" };
    const id = raw.match(/[?&]list=([\w-]+)/)?.[1] ?? raw;
    if (!/^[\w-]{10,}$/.test(id)) return { ok: false, error: "That does not look like a playlist ID" };
    return { ok: true, url: `https://www.youtube.com/feeds/videos.xml?playlist_id=${id}` };
  },
};

const BLUESKY: Provider = {
  id: "bluesky",
  label: "Bluesky",
  description: "Posts from an account",
  icon: "rss",
  feedSource: "bsky.app/profile/<handle>/rss",
  fields: [
    {
      key: "handle",
      label: "Handle",
      placeholder: "someone.bsky.social",
      hint: "The handle as it appears on the profile, with or without the @.",
      required: true,
    },
  ],
  build(input) {
    const handle = bareHandle(input.handle).replace(/^profile\//, "");
    if (!handle) return { ok: false, error: "Handle is required" };
    if (handle.startsWith("did:")) {
      return { ok: false, error: "Use the handle (name.bsky.social), not the DID" };
    }
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(handle)) {
      return { ok: false, error: "That does not look like a Bluesky handle" };
    }
    return { ok: true, url: `https://bsky.app/profile/${handle}/rss` };
  },
};

const REDDIT: Provider = {
  id: "reddit",
  label: "Reddit",
  description: "New posts in a subreddit",
  icon: "rss",
  feedSource: "reddit.com/r/<sub>/.rss",
  fields: [
    {
      key: "subreddit",
      label: "Subreddit",
      placeholder: "programming",
      hint: "Without the r/ prefix.",
      required: true,
    },
  ],
  build(input) {
    const sub = bareHandle(input.subreddit).replace(/^r\//, "");
    if (!sub) return { ok: false, error: "Subreddit is required" };
    if (!/^[A-Za-z0-9_]{2,21}$/.test(sub)) {
      return { ok: false, error: "That does not look like a subreddit name" };
    }
    return { ok: true, url: `https://www.reddit.com/r/${sub}/.rss` };
  },
};

const MASTODON: Provider = {
  id: "mastodon",
  label: "Mastodon",
  description: "Posts from an account",
  icon: "rss",
  feedSource: "<instance>/@<user>.rss",
  fields: [
    {
      key: "account",
      label: "Account",
      placeholder: "@someone@mastodon.social",
      hint: "Full address including the instance.",
      required: true,
    },
  ],
  build(input) {
    const raw = clean(input.account).replace(/^@/, "");
    if (!raw) return { ok: false, error: "Account is required" };

    // Accept both @user@instance and a profile URL.
    const urlMatch = raw.match(/^https?:\/\/([^/]+)\/@([^/?#]+)/);
    const [user, instance] = urlMatch
      ? [urlMatch[2], urlMatch[1]]
      : raw.includes("@")
        ? raw.split("@")
        : [];

    if (!user || !instance) {
      return { ok: false, error: "Use the full address, like @someone@mastodon.social" };
    }
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(instance)) {
      return { ok: false, error: "That instance does not look like a domain" };
    }
    return { ok: true, url: `https://${instance}/@${user}.rss` };
  },
};

const GITHUB_RELEASES: Provider = {
  id: "github-releases",
  label: "GitHub releases",
  description: "New releases from a repository",
  icon: "link",
  feedSource: "github.com/<owner>/<repo>/releases.atom",
  fields: [
    {
      key: "repo",
      label: "Repository",
      placeholder: "owner/repo",
      required: true,
    },
  ],
  build(input) {
    const repo = bareHandle(input.repo).replace(/\.git$/, "");
    if (!repo) return { ok: false, error: "Repository is required" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      return { ok: false, error: "Use the owner/repo form" };
    }
    return { ok: true, url: `https://github.com/${repo}/releases.atom` };
  },
};

const GITHUB_COMMITS: Provider = {
  id: "github-commits",
  label: "GitHub commits",
  description: "Commits on a branch",
  icon: "link",
  feedSource: "github.com/<owner>/<repo>/commits/<branch>.atom",
  fields: [
    { key: "repo", label: "Repository", placeholder: "owner/repo", required: true },
    { key: "branch", label: "Branch", placeholder: "main" },
  ],
  build(input) {
    const repo = bareHandle(input.repo).replace(/\.git$/, "");
    if (!repo) return { ok: false, error: "Repository is required" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      return { ok: false, error: "Use the owner/repo form" };
    }
    const branch = clean(input.branch) || "main";
    if (!/^[\w./-]+$/.test(branch)) return { ok: false, error: "That branch name is not valid" };
    return { ok: true, url: `https://github.com/${repo}/commits/${branch}.atom` };
  },
};

const CUSTOM: Provider = {
  id: "rss",
  label: "Any RSS / Atom feed",
  description: "A feed URL you already have",
  icon: "rss",
  feedSource: "the URL you provide",
  fields: [
    {
      key: "url",
      label: "Feed URL",
      placeholder: "https://example.com/feed.xml",
      required: true,
    },
  ],
  build(input) {
    const raw = clean(input.url);
    if (!raw) return { ok: false, error: "Feed URL is required" };
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return { ok: false, error: "That is not a valid URL" };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: "Only http and https feeds are supported" };
    }
    return { ok: true, url: parsed.toString() };
  },
};

export const PROVIDERS: Provider[] = [
  YOUTUBE,
  YOUTUBE_PLAYLIST,
  BLUESKY,
  MASTODON,
  REDDIT,
  GITHUB_RELEASES,
  GITHUB_COMMITS,
  CUSTOM,
];

export function getProvider(id: string): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/**
 * Resolves a source definition to a concrete feed URL.
 *
 * Sources store the provider id plus the raw field values rather than only the
 * built URL, so a provider can change how it builds a URL later (a service
 * moving its feed path, say) and existing sources pick it up.
 */
export function buildFeedUrl(providerId: string, input: Record<string, string>): BuildResult {
  const provider = getProvider(providerId);
  if (!provider) return { ok: false, error: `Unknown source type: ${providerId}` };
  return provider.build(input);
}

/** Provider list shaped for the dashboard; `build` is not serialisable. */
export function providerCatalogue() {
  return PROVIDERS.map(({ build: _build, ...rest }) => rest);
}
