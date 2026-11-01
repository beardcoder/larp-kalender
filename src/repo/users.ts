/** Users, browser sessions and personal API tokens. Secrets are stored as SHA-256 hashes only. */

import type { Database } from "bun:sqlite";
import type { ApiToken, User } from "../shared/types.ts";
import type { UserRole } from "../shared/vocab.ts";
import { nowIso } from "../db.ts";

export const SESSION_DAYS = 30;

/** Argon2 needs ~19 MB per call: limit concurrency so login floods cannot exhaust memory. */
const MAX_HASHING = 2;
let hashing = 0;
const waiting: (() => void)[] = [];

async function withHashSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (hashing >= MAX_HASHING) {
    if (waiting.length > 50) throw new Error("Server ausgelastet. Bitte gleich erneut versuchen.");
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  hashing++;
  try {
    return await fn();
  } finally {
    hashing--;
    waiting.shift()?.();
  }
}

const hashPassword = (password: string) =>
  withHashSlot(() => Bun.password.hash(password, { algorithm: "argon2id", memoryCost: 19456, timeCost: 2 }));
const verifyPassword = (password: string, hash: string) => withHashSlot(() => Bun.password.verify(password, hash));

export function randomToken(prefix: string, bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return prefix + Buffer.from(buf).toString("base64url");
}

export function sha256(value: string): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex");
}

interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  role: string;
  disabled: number;
  created_at: string;
  last_login_at: string | null;
}

const toUser = (r: UserRow): User => ({
  id: r.id,
  email: r.email,
  name: r.name,
  role: r.role as UserRole,
  disabled: !!r.disabled,
  createdAt: r.created_at,
  lastLoginAt: r.last_login_at,
});

export const countUsers = (db: Database) => (db.query("SELECT COUNT(*) n FROM users").get() as { n: number }).n;

export const listUsers = (db: Database): User[] =>
  (db.query("SELECT * FROM users ORDER BY name").all() as UserRow[]).map(toUser);

export function getUser(db: Database, id: number): User | null {
  const row = db.query("SELECT * FROM users WHERE id = ?").get(id) as UserRow | null;
  return row ? toUser(row) : null;
}

export async function createUser(
  db: Database,
  input: { email: string; name: string; password: string; role: UserRole },
): Promise<User> {
  const hash = await hashPassword(input.password);
  const res = db
    .query("INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(input.email.trim().toLowerCase(), input.name.trim(), hash, input.role, nowIso());
  return getUser(db, Number(res.lastInsertRowid))!;
}

export async function updateUser(
  db: Database,
  id: number,
  patch: { name?: string; email?: string; role?: UserRole; disabled?: boolean; password?: string },
): Promise<User | null> {
  const sets: string[] = [];
  const params: (string | number)[] = [];
  if (patch.name !== undefined) sets.push("name = ?"), params.push(patch.name.trim());
  if (patch.email !== undefined) sets.push("email = ?"), params.push(patch.email.trim().toLowerCase());
  if (patch.role !== undefined) sets.push("role = ?"), params.push(patch.role);
  if (patch.disabled !== undefined) sets.push("disabled = ?"), params.push(patch.disabled ? 1 : 0);
  if (patch.password) {
    sets.push("password_hash = ?");
    params.push(await hashPassword(patch.password));
  }
  if (sets.length) db.query(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...params, id);
  if (patch.disabled || patch.password) revokeUserSessions(db, id);
  return getUser(db, id);
}

export function deleteUser(db: Database, id: number): boolean {
  return db.query("DELETE FROM users WHERE id = ?").run(id).changes > 0;
}

// A fixed hash so that unknown e-mails take as long as wrong passwords (no user enumeration via timing).
let dummyHash: Promise<string> | null = null;

export async function verifyLogin(db: Database, email: string, password: string): Promise<User | null> {
  const row = db.query("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase()) as UserRow | null;
  if (!row) {
    dummyHash ??= hashPassword("dummy-password");
    await verifyPassword(password, await dummyHash);
    return null;
  }
  if (row.disabled || !(await verifyPassword(password, row.password_hash))) return null;
  db.query("UPDATE users SET last_login_at = ? WHERE id = ?").run(nowIso(), row.id);
  return toUser(row);
}

/* ---------- sessions ---------- */

export function createSession(db: Database, userId: number): string {
  const token = randomToken("", 32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  db.query("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    sha256(token),
    userId,
    nowIso(),
    expires,
  );
  return token;
}

export function sessionUser(db: Database, token: string | undefined): User | null {
  if (!token) return null;
  const row = db
    .query(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0`,
    )
    .get(sha256(token), nowIso()) as UserRow | null;
  return row ? toUser(row) : null;
}

export function deleteSession(db: Database, token: string): void {
  db.query("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
}

export function revokeUserSessions(db: Database, userId: number): void {
  db.query("DELETE FROM sessions WHERE user_id = ?").run(userId);
  db.query("DELETE FROM oauth_tokens WHERE user_id = ?").run(userId);
  db.query("DELETE FROM api_tokens WHERE user_id = ?").run(userId);
}

/* ---------- personal API tokens (Bearer, for MCP clients with static headers and REST automation) ---------- */

export function createApiToken(db: Database, userId: number, name: string): { token: string; info: ApiToken } {
  const token = randomToken("lk_", 30);
  const res = db
    .query("INSERT INTO api_tokens (user_id, name, prefix, token_hash, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(userId, name.trim(), token.slice(0, 9), sha256(token), nowIso());
  return { token, info: listApiTokens(db, userId).find((t) => t.id === Number(res.lastInsertRowid))! };
}

export function listApiTokens(db: Database, userId: number): ApiToken[] {
  return (
    db
      .query("SELECT id, name, prefix, created_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC")
      .all(userId) as { id: number; name: string; prefix: string; created_at: string; last_used_at: string | null }[]
  ).map((r) => ({ id: r.id, name: r.name, prefix: r.prefix, createdAt: r.created_at, lastUsedAt: r.last_used_at }));
}

export function deleteApiToken(db: Database, userId: number, id: number): boolean {
  return db.query("DELETE FROM api_tokens WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
}

/** Resolves a Bearer token (personal API token or OAuth access token) to its user. */
export function bearerUser(db: Database, token: string | undefined): User | null {
  if (!token) return null;
  const hash = sha256(token);
  const now = nowIso();
  if (token.startsWith("lk_")) {
    const row = db
      .query("SELECT u.*, t.id AS token_id FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ? AND u.disabled = 0")
      .get(hash) as (UserRow & { token_id: number }) | null;
    if (!row) return null;
    db.query("UPDATE api_tokens SET last_used_at = ? WHERE id = ?").run(now, row.token_id);
    return toUser(row);
  }
  const row = db
    .query(
      `SELECT u.* FROM oauth_tokens t JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = ? AND t.kind = 'access' AND t.expires_at > ? AND u.disabled = 0`,
    )
    .get(hash, now) as UserRow | null;
  if (!row) return null;
  db.query("UPDATE oauth_tokens SET last_used_at = ? WHERE token_hash = ?").run(now, hash);
  return toUser(row);
}

export function cleanupExpired(db: Database): void {
  const now = nowIso();
  db.query("DELETE FROM sessions WHERE expires_at <= ?").run(now);
  db.query("DELETE FROM oauth_codes WHERE expires_at <= ?").run(now);
  db.query("DELETE FROM oauth_tokens WHERE expires_at <= ?").run(now);
  // Registered clients that never completed an authorization.
  db.query(
    `DELETE FROM oauth_clients WHERE created_at <= ? AND NOT EXISTS (SELECT 1 FROM oauth_tokens t WHERE t.client_id = oauth_clients.client_id)`,
  ).run(new Date(Date.now() - 86_400_000).toISOString());
}
