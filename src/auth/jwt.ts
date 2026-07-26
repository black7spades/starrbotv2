import { sign, verify, SignOptions, VerifyOptions, JwtPayload } from "jsonwebtoken";
import { JWTPayload } from "config/schema";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "dev-access-secret-change-in-production";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret-change-in-production";
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
