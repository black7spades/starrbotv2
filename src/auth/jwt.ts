import { sign, verify, SignOptions, VerifyOptions } from "jsonwebtoken";
import { JWTPayload } from "config/schema";

const DEV_ACCESS_SECRET = "dev-access-secret-change-in-production";
const DEV_REFRESH_SECRET = "dev-refresh-secret-change-in-production";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? DEV_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? DEV_REFRESH_SECRET;

// These fallbacks are published in the repo, so anyone could mint a valid
// admin token against them. Refuse to run with them outside development.
if (
  process.env.NODE_ENV === "production" &&
  (ACCESS_SECRET === DEV_ACCESS_SECRET || REFRESH_SECRET === DEV_REFRESH_SECRET)
) {
  throw new Error(
    "Refusing to start in production with default JWT secrets. " +
      "Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET."
  );
}
const ACCESS_EXPIRY = "24h";
const REFRESH_EXPIRY = "7d";

const signOptions: SignOptions = { algorithm: "HS256" };
const verifyOptions: VerifyOptions = { algorithms: ["HS256"] };

export function generateAccessToken(payload: Omit<JWTPayload, "iat" | "exp">): string {
  return sign(payload, ACCESS_SECRET, { ...signOptions, expiresIn: ACCESS_EXPIRY });
}

export function generateRefreshToken(payload: Omit<JWTPayload, "iat" | "exp">): string {
  return sign(payload, REFRESH_SECRET, { ...signOptions, expiresIn: REFRESH_EXPIRY });
}

export function verifyAccessToken(token: string): JWTPayload | null {
  try {
    return verify(token, ACCESS_SECRET, verifyOptions) as JWTPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): JWTPayload | null {
  try {
    return verify(token, REFRESH_SECRET, verifyOptions) as JWTPayload;
  } catch {
    return null;
  }
}

export function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader) return null;
  const [type, token] = authHeader.split(" ");
  if (type !== "Bearer" || !token) return null;
  return token;
}

export function extractTokenFromCookie(cookies: Record<string, string>, name: string): string | null {
  return cookies[name] ?? null;
}
