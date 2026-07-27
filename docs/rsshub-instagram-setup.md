# RSSHub + Instagram Setup Guide

## What This Does

RSSHub turns Instagram (and 200+ other sites) into RSS feeds. StarrBot's **Updates** function reads those feeds and posts new content to your Discord channel.

---

## Step 1: Deploy RSSHub (Docker)

Add this to your `docker-compose.yml` alongside StarrBot:

```yaml
services:
  rsshub:
    image: diygod/rsshub:chromium-bundled
    container_name: rsshub
    ports:
      - "1200:1200"
    environment:
      - NODE_ENV=production
      - CACHE_EXPIRE=3600
    restart: unless-stopped
```

Start it:

```bash
docker compose up -d rsshub
```

Verify it's running: open `http://localhost:1200` in your browser — you should see the RSSHub welcome page.

> **Note:** Instagram routes require the `chromium-bundled` image (for anti-bot measures). The standard `diygod/rsshub` image won't work for Instagram.

---

## Step 2: Get Your Instagram Cookie

Instagram requires authentication to serve feeds. You need to extract your browser cookie.

### Chrome / Edge

1. Open Instagram in your browser and log in
2. Press `F12` → **Application** tab → **Cookies** → `https://www.instagram.com`
3. Find the cookie named `sessionid`
4. Copy its full value (a long string like `52894649401%3AXyz123abcDEF%3A12%3AAYd...`)

### Firefox

1. Open Instagram, press `F12` → **Storage** tab → **Cookies**
2. Find `sessionid` under `https://www.instagram.com`
3. Copy the value

> **Important:** This cookie expires. When it does, Instagram feeds will stop working — just repeat this step with a fresh login.

---

## Step 3: Configure RSSHub for Instagram

Set the cookie as an environment variable in your RSSHub container:

```yaml
services:
  rsshub:
    image: diygod/rsshub:chromium-bundled
    container_name: rsshub
    ports:
      - "1200:1200"
    environment:
      - NODE_ENV=production
      - CACHE_EXPIRE=3600
      - INSTAGRAM_COOKIE=sessionid=YOUR_COOKIE_VALUE_HERE
    restart: unless-stopped
```

Restart RSSHub:

```bash
docker compose up -d rsshub
```

---

## Step 4: Test the Feed

Find the Instagram username you want to follow (without `@`), then open:

```
http://localhost:1200/instagram/2/user/USERNAME
```

Example for `natgeo`:
```
http://localhost:1200/instagram/2/user/natgeo
```

You should see RSS XML with their recent posts. If you see an error, check that your cookie is valid.

---

## Step 5: Add the Feed to StarrBot

### Option A: Via Dashboard

1. Go to your bot → **Functions** → **Updates**
2. Click to configure
3. Set **RSSHub URL** to `http://rsshub:1200` (use the Docker service name, not `localhost`)
4. Set **Channel ID** to the Discord channel where updates should post
5. Under **Sources**, add a new entry:
   - **URL:** `instagram/2/user/natgeo` (the path after your RSSHub domain, NOT the full URL)
   - **Label:** `National Geographic`
6. Save and enable the function

### Option B: Via Discord Command

Use `/updates add` in your Discord server:

```
/updates add url:instagram/2/user/natgeo label:National Geographic
```

---

## Step 6: Start the Bot

Click **Start** on your bot in the dashboard. It will check feeds at the interval you configured (default: every 15 minutes).

---

## Supported Platforms

The same pattern works for any RSSHub-supported site. Some examples:

| Platform | RSSHub Route | Example URL |
|----------|-------------|-------------|
| Instagram (user) | `instagram/2/user/{username}` | `instagram/2/user/natgeo` |
| Instagram (hashtag) | `instagram/2/tags/{tag}` | `instagram/2/tags/travel` |
| Twitter/X | `twitter/user/{username}` | `twitter/user/elonmusk` |
| YouTube | `youtube/channel/{channelId}` | `youtube/channel/UCBJycsmduvYEL83R_U4JriQ` |
| Reddit | `reddit/hot/{subreddit}` | `reddit/hot/programming` |
| GitHub | `github/repos/{user}` | `github/repos/diygod` |
| Bluesky | `bsky/app/profile/{handle}` | `bsky/app/profile/bsky.app` |
| TikTok | `tiktok/user/{username}` | `tiktok/user/billieeilish` |

Full list: [docs.rsshub.app](https://docs.rsshub.app)

---

## Troubleshooting

### "Failed to register commands: Missing Access"
The bot needs to be re-invited with the `applications.commands` scope. Use the **Invite to Server** button in the dashboard.

### Instagram feed returns empty or errors
- Your cookie has expired — log back into Instagram and copy a fresh `sessionid`
- Make sure you set `INSTAGRAM_COOKIE` (not `IG_COOKIE`)
- Restart the RSSHub container after changing the cookie

### "ECONNREFUSED" when checking feeds
- Ensure `rsshubUrl` in the Updates function config is `http://rsshub:1200` (Docker service name), not `http://localhost:1200`
- Make sure RSSHub is running: `docker compose ps`

### Feeds show old posts only
- RSSHub caches feeds — default TTL is 5 minutes for most routes
- Force a manual check with `/updates check`
