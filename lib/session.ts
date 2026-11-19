import crypto from "node:crypto";
import { getEngine } from "./db/core";
import { newToken, sha256 } from "./crypto";

/**
 * Database-backed sessions. The cookie holds a random token; the database holds only its sha256, so a leaked database
 * file cannot be replayed as a login. No "server-only" import: proxy.ts calls lookupSession() too.
 * Idle timeout 12 h, hard limit 7 days.
 */
export const SESSION_COOKIE = "miel_session";
export const IDLE_MS = 12 * 60 * 60 * 1000;
export const ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;
const TOUCH_EVERY_MS = 60_000; // don't write on every request

export type SessionUser = { id: string; email: string; name: string; role: "owner" | "manager" | "staff"; active: boolean; totpEnabled: boolean };
export type SessionInfo = { id: string; userId: string; mfaOk: boolean; createdAt: string; lastSeenAt: string; user: SessionUser };
export type Lookup = { ok: true; session: SessionInfo } | { ok: false; reason: "none" | "expired" };

const iso = (ms: number) => new Date(ms).toISOString();

export function createSession(userId: string, opts: { mfaOk?: boolean; ip?: string; userAgent?: string } = {}): { token: string; maxAgeSec: number } {
  const db = getEngine().sqlite;
  const token = newToken();
  const now = Date.now();
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(iso(now)); // housekeeping
  db.prepare("INSERT INTO sessions (id, user_id, mfa_ok, ip, user_agent, created_at, last_seen_at, expires_at) VALUES (?,?,?,?,?,?,?,?)").run(
    sha256(token), userId, opts.mfaOk ? 1 : 0, (opts.ip ?? "").slice(0, 64), (opts.userAgent ?? "").slice(0, 200), iso(now), iso(now), iso(now + ABSOLUTE_MS),
  );
  return { token, maxAgeSec: Math.floor(ABSOLUTE_MS / 1000) };
}

export function lookupSession(token: string | undefined | null, now = Date.now()): Lookup {
  if (!token || token.length < 20 || token.length > 200) return { ok: false, reason: "none" };
  const db = getEngine().sqlite;
  const id = sha256(token);
  const r = db
    .prepare(
      `SELECT s.id, s.user_id, s.mfa_ok, s.created_at, s.last_seen_at, s.expires_at, u.email, u.name, u.role, u.active, u.totp_enabled
       FROM sessions s JOIN admin_users u ON u.id = s.user_id WHERE s.id = ?`,
    )
    .get(id) as Record<string, any> | undefined;
  if (!r) return { ok: false, reason: "none" };
  const idle = now - Date.parse(r.last_seen_at) > IDLE_MS;
  if (idle || Date.parse(r.expires_at) < now) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return { ok: false, reason: "expired" };
  }
  if (!r.active) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return { ok: false, reason: "none" };
  }
  if (now - Date.parse(r.last_seen_at) > TOUCH_EVERY_MS) db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(iso(now), id);
  return {
    ok: true,
    session: {
      id, userId: r.user_id, mfaOk: !!r.mfa_ok, createdAt: r.created_at, lastSeenAt: r.last_seen_at,
      user: { id: r.user_id, email: r.email, name: r.name, role: r.role, active: true, totpEnabled: !!r.totp_enabled },
    },
  };
}

export const markMfaOk = (token: string) => void getEngine().sqlite.prepare("UPDATE sessions SET mfa_ok = 1 WHERE id = ?").run(sha256(token));
export const destroySession = (token: string) => void getEngine().sqlite.prepare("DELETE FROM sessions WHERE id = ?").run(sha256(token));
/** Sign out everywhere (optionally keeping the current session). */
export const destroyUserSessions = (userId: string, exceptToken?: string) =>
  void getEngine().sqlite.prepare("DELETE FROM sessions WHERE user_id = ? AND id <> ?").run(userId, exceptToken ? sha256(exceptToken) : "");
export const destroySessionById = (userId: string, id: string) => getEngine().sqlite.prepare("DELETE FROM sessions WHERE user_id = ? AND id = ?").run(userId, id).changes > 0;

export function listSessions(userId: string, currentToken?: string) {
  const cur = currentToken ? sha256(currentToken) : "";
  return (getEngine().sqlite.prepare("SELECT id, ip, user_agent, created_at, last_seen_at, mfa_ok FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC").all(userId, iso(Date.now())) as Record<string, any>[]).map((r) => ({
    id: r.id as string, ip: r.ip as string, userAgent: r.user_agent as string, createdAt: r.created_at as string, lastSeenAt: r.last_seen_at as string, current: r.id === cur,
  }));
}

export const randomId = () => crypto.randomUUID();
