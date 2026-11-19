import { getEngine } from "./db/core";

/**
 * Fixed-window rate limits stored in the database (table rate_limits), so they survive restarts and redeploys.
 * Keys look like "<bucket>:<identifier>". Identifiers that are personal (emails, IPs for logins) are HMAC'd by the caller.
 */
let sinceCleanup = 0;

/** Count one attempt. Returns the number of attempts in the current window (including this one). */
export function rateHit(key: string, windowMs: number, now = Date.now()): number {
  const db = getEngine().sqlite;
  if (++sinceCleanup > 200) {
    sinceCleanup = 0;
    db.prepare("DELETE FROM rate_limits WHERE reset_at < ?").run(now);
  }
  const row = db
    .prepare(
      `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
         reset_at = CASE WHEN reset_at <= ? THEN ? ELSE reset_at END
       RETURNING count`,
    )
    .get(key.slice(0, 200), now + windowMs, now, now, now + windowMs) as { count: number };
  return row.count;
}

/** Attempts in the current window without counting a new one. */
export function rateCount(key: string, now = Date.now()): number {
  const r = getEngine().sqlite.prepare("SELECT count FROM rate_limits WHERE key = ? AND reset_at > ?").get(key.slice(0, 200), now) as { count: number } | undefined;
  return r?.count ?? 0;
}

export const rateReset = (key: string) => void getEngine().sqlite.prepare("DELETE FROM rate_limits WHERE key = ?").run(key.slice(0, 200));

/** Count this attempt; true while it is still within `max` per window. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  return rateHit(key, windowMs) <= max;
}
