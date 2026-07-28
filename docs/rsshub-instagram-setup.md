# RSSHub + Instagram Setup Guide

## What This Does

RSSHub turns Instagram (and 200+ other sites) into RSS feeds. StarrBot's **Updates** function reads those feeds and posts new content to your Discord channel.

---

## Step 1: Deploy RSSHub (Docker)

Already included in your `docker-compose.yml` as the `rsshub` service.

---

## Step 2: Get Your Instagram Cookie

Instagram requires multiple cookies to serve feeds. You need the **full cookie string**, not just `sessionid`.

### Chrome / Edge

1. Open Instagram in your browser and log in
2. Press `F12` → **Network** tab
3. Refresh the page
4. Click any request to `instagram.com`
5. In the **Headers** tab, find `Cookie:` under **Request Headers**
6. Copy the **entire value** — it looks like this:
   ```
   ds_user_id=184371779; sessionid=184371779%3A...%3A17%3A...; csrftoken=abc123...; mid=xyz...; ig_did=...; rur=...
   ```
7. That whole string is what you need

> **Important:** Do NOT just copy `sessionid`. RSSHub needs all the cookies together.

---

## Step 3: Set the Cookie in Docker

Edit your `docker-compose.yml` and replace the `INSTAGRAM_COOKIE` value with the full cookie string:

```yaml
environment:
  - INSTAGRAM_COOKIE=ds_user_id=184371779; sessionid=184371779%3A...; csrftoken=abc123...
```

Restart RSSHub:

```bash
docker compose restart rsshub
```

---

## Step 4: Test the Feed

Open in your browser:

```
http://localhost:1200/instagram/2/user/USERNAME
```

You should see RSS XML with their recent posts. If you see `429 Too Many Requests`, wait 10-30 minutes — Instagram rate-limits IPs that make too many unauthenticated requests.

---

## Step 5: Add the Feed to StarrBot

### Option A: Via Dashboard (Recommended)

1. Go to your bot → **Functions** → **Updates**
2. Click **+ Add Social** or pick a platform from the grid
3. The wizard guides you through: enter username → test feed → name it → add

### Option B: Via Discord Command

```
/updates add url:instagram/2/user/mkittyxoxo label:My Friend
```

---

## Troubleshooting

### 429 Too Many Requests
- Wait 10-30 minutes — Instagram rate-limits IPs aggressively
- Make sure you set the FULL cookie string, not just sessionid
- Check the cookie hasn't expired (log back into Instagram and copy fresh cookies)

### Feed returns 0 items
- Your cookie has expired — get a fresh one from the browser
- The profile may be private — Instagram private profiles require a valid session

### "ECONNREFUSED" when checking feeds
- `rsshubUrl` should be `http://rsshub:1200` (Docker service name), not `localhost`
