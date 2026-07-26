import { configStore } from "config/index";
import { hashPassword, verifyPassword, hashToken } from "./argon2";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "./jwt";
import type { User, CreateUserInput, UpdateUserInput } from "config/schema";

export async function authenticateUser(username: string, password: string): Promise<Omit<User, "passwordHash"> | null> {
  const user = configStore.getUserByUsername(username);
  if (!user) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  const { passwordHash, ...rest } = user;
  return rest;
}

export function createSession(user: User): { accessToken: string; refreshToken: string } {
  const accessToken = generateAccessToken({ sub: user.id, username: user.username, role: user.role });
  const refreshToken = generateRefreshToken({ sub: user.id, username: user.username, role: user.role });
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

  configStore.storeRefreshToken(refreshTokenHash, user.id, expiresAt);

  return { accessToken, refreshToken };
}

export function refreshSession(refreshToken: string): { accessToken: string; refreshToken: string } | null {
  const payload = verifyRefreshToken(refreshToken);
  if (!payload) return null;

  const refreshTokenHash = hashToken(refreshToken);
  const stored = configStore.getRefreshToken(refreshTokenHash);
  if (!stored) return null;

  const user = configStore.getUserById(payload.sub);
  if (!user) return null;

  configStore.revokeRefreshToken(refreshTokenHash);

  return createSession(user);
}

export function revokeSession(refreshToken: string): boolean {
  const refreshTokenHash = hashToken(refreshToken);
  return configStore.revokeRefreshToken(refreshTokenHash);
}

export function revokeAllUserSessions(userId: string): void {
  configStore.revokeAllUserRefreshTokens(userId);
}

export async function createUser(input: CreateUserInput): Promise<Omit<User, "passwordHash">> {
  const passwordHash = await hashPassword(input.password);
  const created = configStore.createUser({ ...input, password: passwordHash });
  return created;
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<Omit<User, "passwordHash"> | null> {
  const updates: UpdateUserInput = { ...input };
  if (input.password) {
    updates.password = await hashPassword(input.password);
  }
  return configStore.updateUser(id, updates);
}

export function getUserById(id: string): Omit<User, "passwordHash"> | null {
  return configStore.getUserById(id);
}

export function getAllUsers(): Omit<User, "passwordHash">[] {
  return configStore.getUsers();
}

export function deleteUser(id: string): boolean {
  return configStore.deleteUser(id);
}
