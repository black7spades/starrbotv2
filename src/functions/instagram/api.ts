/**
 * Instagram Private API client — hits the same endpoints as instagrapi / RSSHub
 * but without any external dependency beyond fetch + tough-cookie.
 */

const IG_APP_ID = "936619743392459";
const IG_ASBD_ID = "1296711383340516";
const BASE_URL = "https://www.instagram.com";
const API_URL = `${BASE_URL}/api/v1`;

export interface IgUser {
  id: string;
  username: string;
  full_name: string;
  biography: string;
  profile_pic_url_hd: string;
  is_private: boolean;
}

export interface IgMedia {
  id: string;
  shortcode: string;
  display_url: string;
  is_video: boolean;
  video_url?: string;
  caption?: string;
  taken_at: number;
  like_count?: number;
  comment_count?: number;
  media_type: number; // 1=single, 2=carousel, 3=video
  edge_media_to_caption?: { edges: { node: { text: string } }[] };
  carousel_media?: { display_url: string; is_video: boolean; video_url?: string }[];
}

export interface IgUserPosts {
  user: IgUser;
  posts: IgMedia[];
}

export class InstagramAPI {
  private cookieJar: Map<string, string> = new Map();
  private csrfToken: string = "";
  private initialized = false;

  constructor(private cookieString: string) {
    this.parseCookies(cookieString);
  }

  private parseCookies(raw: string): void {
    for (const part of raw.split("; ")) {
      const eq = part.indexOf("=");
      if (eq > 0) {
        const name = part.slice(0, eq).trim();
        const value = part.slice(eq + 1).trim();
        this.cookieJar.set(name, value);
        if (name === "csrftoken") this.csrfToken = value;
      }
    }
  }

  private getCookieHeader(): string {
    return Array.from(this.cookieJar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private generateCsrfToken(): string {
    const hex = "0123456789abcdef";
    let token = "";
    for (let i = 0; i < 32; i++) token += hex[Math.floor(Math.random() * 16)];
    return token;
  }

  private async init(): Promise<void> {
    if (this.initialized) return;
    // If no CSRF token in cookie, fetch it from the homepage
    if (!this.csrfToken) {
      try {
        const res = await fetch(BASE_URL, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Cookie": this.getCookieHeader(),
          },
          redirect: "follow",
          signal: AbortSignal.timeout(15000),
        });
        // Extract CSRF from set-cookie headers
        const setCookies = res.headers.getSetCookie?.() ?? [];
        for (const sc of setCookies) {
          const match = sc.match(/^([^=]+)=([^;]+)/);
          if (match) {
            const [, name, value] = match;
            this.cookieJar.set(name, value);
            if (name === "csrftoken") this.csrfToken = value;
          }
        }
      } catch {
        // If we can't init, generate a random CSRF — Instagram only checks header matches cookie
        this.csrfToken = this.generateCsrfToken();
        this.cookieJar.set("csrftoken", this.csrfToken);
      }
    }
    this.initialized = true;
  }

  private async apiGet<T>(endpoint: string): Promise<T> {
    await this.init();
    const res = await fetch(`${API_URL}${endpoint}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "X-IG-App-ID": IG_APP_ID,
        "X-ASBD-ID": IG_ASBD_ID,
        "X-CSRFToken": this.csrfToken,
        "X-Requested-With": "XMLHttpRequest",
        "Cookie": this.getCookieHeader(),
        "Referer": `${BASE_URL}/`,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`Instagram API ${res.status}: ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * Fetch user info and recent posts by username.
   */
  async getUserPosts(username: string): Promise<IgUserPosts> {
    const data = await this.apiGet<any>(
      `/users/web_profile_info/?username=${encodeURIComponent(username)}`
    );

    const user = data?.data?.user;
    if (!user) throw new Error(`User @${username} not found`);

    const igUser: IgUser = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      biography: user.biography,
      profile_pic_url_hd: user.profile_pic_url_hd || user.profile_pic_url,
      is_private: user.is_private,
    };

    if (user.is_private) {
      return { user: igUser, posts: [] };
    }

    const edges = user.edge_owner_to_timeline_media?.edges || [];
    const posts: IgMedia[] = edges.map((edge: any) => {
      const node = edge.node;
      return {
        id: node.id,
        shortcode: node.shortcode,
        display_url: node.display_url,
        is_video: node.is_video,
        video_url: node.video_url,
        caption: node.edge_media_to_caption?.edges?.[0]?.node?.text || "",
        taken_at: node.taken_at,
        like_count: node.edge_media_preview_like?.count,
        comment_count: node.edge_media_to_comment?.count,
        media_type: node.media_type,
        carousel_media: node.edge_sidecar_to_children?.edges?.map((e: any) => ({
          display_url: e.node.display_url,
          is_video: e.node.is_video,
          video_url: e.node.video_url,
        })),
      };
    });

    return { user: igUser, posts };
  }
}
