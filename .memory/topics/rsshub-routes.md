# RSSHub Routes

## Twitch
- `/twitch/live/:login` — Live status, tracks when a user goes live
- `/twitch/schedule/:login` — Upcoming broadcast schedule
- `/twitch/video/:login/:filter` — Videos/clips. Filters: `archive` (past broadcasts), `highlights`, `all` (default)

## Instagram
- `/instagram/2/user/:username` — User profile + recent posts (requires full cookie string in RSSHub env)
- Private API: `GET /api/v1/users/web_profile_info/?username=:username` (same endpoint natively hit by `src/functions/instagram/api.ts`)

## YouTube
- `/youtube/user/:username/:embed?` — User videos by legacy username or custom ID
- `/youtube/channel/:id` — Channel feed by alphanumeric channel ID
- `/youtube/playlist/:id` — Videos from a specific public playlist
- `?filterShorts=false` — Query param to exclude YouTube Shorts (applies to user/channel routes)

## Reddit
- `/reddit/hot/:subreddit` — Hot posts from a subreddit
- `/reddit/new/:subreddit` — New posts
- `/reddit/top/:subreddit` — Top posts

## GitHub
- `/github/repos/:user` — User's repositories
- `/github/issues/:user/:repo` — Open issues

## TikTok
- `/tiktok/user/:username` — User videos

## Bluesky
- `/bsky/app/profile/:identifier` — User profile + posts

## Twitch (native — RSSHub alternative)
- `src/functions/instagram/api.ts` pattern can be adapted for Twitch Helix API (requires client ID + OAuth)
