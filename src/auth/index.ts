import { configStore } from "config/index";
import { hashPassword, verifyPassword, hashToken } from "./argon2";
import {
  generateAccessToken,
  generateRefreshToken,
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

// Takes the password-less user record: callers hold the sanitised shape that
// authenticateUser/getUserById return, and only the identity fields are needed.
export function createSession(
  user: Omit<User, "passwordHash">
): { accessToken: string; refreshToken: string } {
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

/**
 * Changes a user's own password after verifying the current one.
 *
 * Returns false on a wrong current password rather than throwing, so callers
 * answer with 400 instead of leaking the difference between "no such user" and
 * "wrong password".
 */
export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<boolean> {
  const record = configStore.getUsers().find((u) => u.id === userId);
  if (!record) return false;

  const full = configStore.getUserByUsername(record.username);
  if (!full) return false;

  const valid = await verifyPassword(currentPassword, full.passwordHash);
  if (!valid) return false;

  const passwordHash = await hashPassword(newPassword);
  configStore.updateUser(userId, { password: passwordHash });

  // Any session minted with the old password is no longer trustworthy.
  configStore.revokeAllUserRefreshTokens(userId);
  return true;
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
