/** Member features: bookmarks stored per account and a private iCal feed token. */

import type { Database } from "bun:sqlite";
import { nowIso } from "../db.ts";
import { randomToken } from "./users.ts";

export function getFavorites(db: Database, userId: number): number[] {
  return (db.query("SELECT event_id FROM user_favorites WHERE user_id = ? ORDER BY created_at").all(userId) as { event_id: number }[]).map(
    (r) => r.event_id,
  );
}

/** Replaces the bookmarks of a user; unknown event ids are ignored. */
export function setFavorites(db: Database, userId: number, ids: number[]): number[] {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 1000);
  db.transaction(() => {
    db.query("DELETE FROM user_favorites WHERE user_id = ?").run(userId);
    const insert = db.query("INSERT OR IGNORE INTO user_favorites (user_id, event_id, created_at) SELECT ?, id, ? FROM events WHERE id = ?");
    const now = nowIso();
    for (const id of unique) insert.run(userId, now, id);
  })();
  return getFavorites(db, userId);
}

/** Returns the private feed token of a user, creating it on first use (or anew with rotate). */
export function feedToken(db: Database, userId: number, rotate = false): string {
  const row = db.query("SELECT feed_token FROM users WHERE id = ?").get(userId) as { feed_token: string | null } | null;
  if (row?.feed_token && !rotate) return row.feed_token;
  const token = randomToken("", 18);
  db.query("UPDATE users SET feed_token = ? WHERE id = ?").run(token, userId);
  return token;
}

export function userIdByFeedToken(db: Database, token: string): number | null {
  if (!token || token.length < 16) return null;
  const row = db.query("SELECT id FROM users WHERE feed_token = ? AND disabled = 0").get(token) as { id: number } | null;
  return row?.id ?? null;
}
