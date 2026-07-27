import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { configStore } from "config/store";
import { createSession } from "auth/index";
import { hashPassword } from "auth/argon2";

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_CDN = "https://cdn.discordapp.com";

const clientId = () => process.env.DISCORD_CLIENT_ID || "";
const clientSecret = () => process.env.DISCORD_CLIENT_SECRET || "";
const baseUrl = () => process.env.BASE_URL || `http://localhost:${process.env.PORT || "2013"}`;
const redirectUri = (req: any) => `${baseUrl()}/api/auth/discord/callback`;

export const discordRoutes: FastifyPluginAsync = async (fastify) => {
  // Check if Discord OAuth is configured
  fastify.get("/discord/status", async () => {
    return { configured: !!(clientId() && clientSecret()) };
  });

  // Start OAuth flow — redirects to Discord
  fastify.get("/discord", async (request, reply) => {
    if (!clientId()) {
      return reply.code(500).send({ error: "Discord OAuth not configured" });
    }
    const state = Math.random().toString(36).slice(2);
    const params = new URLSearchParams({
      client_id: clientId(),
      redirect_uri: redirectUri(request),
      response_type: "code",
      scope: "identify guilds",
      state,
    });
    reply.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
  });

  // OAuth callback — exchanges code for token, creates/finds user, issues JWT cookie, redirects to dashboard
  fastify.get("/discord/callback", async (request, reply) => {
    const { code } = request.query as { code?: string };
    if (!code) return reply.code(400).send({ error: "Missing code" });

    // Exchange code for token
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId(),
        client_secret: clientSecret(),
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(request),
      }),
    });

    if (!tokenRes.ok) return reply.code(400).send({ error: "Token exchange failed" });
    const tokenData = await tokenRes.json() as { access_token: string };

    // Fetch user info
    const userRes = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userRes.ok) return reply.code(400).send({ error: "Failed to fetch user" });
    const discordUser = await userRes.json() as any;

    // Fetch guilds
    const guildsRes = await fetch(`${DISCORD_API}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const guilds = guildsRes.ok ? await guildsRes.json() as any[] : [];

    // Filter for admin/mod permissions (ADMINISTRATOR=0x8, MANAGE_GUILD=0x20)
    const ADMINS = 0x8;
    const MANAGE_GUILD = 0x20;
    const manageable = guilds
      .filter((g) => {
        const perms = BigInt(g.permissions || "0");
        return (perms & BigInt(ADMINS)) === BigInt(ADMINS) ||
               (perms & BigInt(MANAGE_GUILD)) === BigInt(MANAGE_GUILD);
      })
      .map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon ? `${DISCORD_CDN}/icons/${g.id}/${g.icon}.${g.icon.startsWith("a_") ? "gif" : "png"}?size=64` : null,
        permissions: g.permissions,
      }));

    // Find or create user by Discord ID
    let user = configStore.getUserByDiscordId(discordUser.id);
    if (!user) {
      // Create new user from Discord — no password needed, generate a random one
      const randomPw = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const pwHash = await hashPassword(randomPw);
      const username = discordUser.username;
      // Ensure unique username
      let finalUsername = username;
      let counter = 1;
      while (configStore.getUserByUsername(finalUsername)) {
        finalUsername = `${username}${counter}`;
        counter++;
      }
      user = configStore.createUser({
        username: finalUsername,
        password: pwHash,
        discordId: discordUser.id,
        role: "admin",
      }) as any;
    }

    // Issue JWT cookies
    const { accessToken, refreshToken } = createSession(user as any);
    const accessMaxAge = 24 * 60 * 60;

    reply.setCookie("access_token", accessToken, {
      httpOnly: true,
      secure: request.protocol === "https",
      sameSite: "lax",
      maxAge: accessMaxAge,
      path: "/",
    });

    reply.setCookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: request.protocol === "https",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    // Store guilds data in a cookie for the frontend to read on callback
    const guildData = Buffer.from(JSON.stringify({
      discordId: discordUser.id,
      discordUsername: discordUser.username,
      discordAvatar: discordUser.avatar
        ? `${DISCORD_CDN}/avatars/${discordUser.id}/${discordUser.avatar}.${discordUser.avatar.startsWith("a_") ? "gif" : "png"}?size=64`
        : null,
      guilds: manageable,
    })).toString("base64url");

    reply.redirect(`/discord-callback?data=${guildData}`);
  });
};
