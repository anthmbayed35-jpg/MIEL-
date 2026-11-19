import "server-only";
import { headers } from "next/headers";
import { getDb } from "./db";
import { ipFromHeaders } from "./client-ip";
import { hmac } from "./crypto";
import { rateCount, rateHit } from "./rate-limit";

export { PASSWORD_MIN, passwordProblem } from "./passwords";

/**
 * Sign-in abuse protection. Counters live in the database (table rate_limits) so they survive restarts, and every
 * attempt is written to the audit log. IPs and emails are stored only as keyed hashes.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return ipFromHeaders(h);
}

type Kind = "login_failed" | "reset_requested" | "mfa_failed" | "invite_sent" | "member_created";
const MIN = 60_000;
const LIMITS: Record<Kind, { ip: number; email: number; windowMs: number }> = {
  login_failed: { ip: 12, email: 5, windowMs: 15 * MIN },
  reset_requested: { ip: 6, email: 3, windowMs: 60 * MIN },
  mfa_failed: { ip: 12, email: 6, windowMs: 15 * MIN },
  invite_sent: { ip: 30, email: 10, windowMs: 60 * MIN },
  member_created: { ip: 30, email: 10, windowMs: 60 * MIN }, // also counts regenerated temporary passwords, per owner
};
const keyIp = (kind: string, ip: string) => `${kind}:ip:${hmac(ip)}`;
const keyEmail = (kind: string, email: string) => `${kind}:email:${hmac(email)}`;

export type AuthEvent = Kind | "login" | "logout" | "logout_all" | "invite_accepted" | "password_set" | "password_changed" | "reset_link_used" | "mfa_enabled" | "mfa_disabled" | "mfa_verified" | "recovery_code_used" | "session_revoked";

export async function recordAuthEvent(kind: AuthEvent, opts: { ip: string; email?: string; actorId?: string | null; actorEmail?: string; details?: Record<string, unknown> }) {
  try {
    if (kind in LIMITS) {
      const lim = LIMITS[kind as Kind];
      rateHit(keyIp(kind, opts.ip), lim.windowMs);
      if (opts.email) rateHit(keyEmail(kind, opts.email), lim.windowMs);
    }
    await getDb().from("audit_log").insert({
      actor_id: opts.actorId ?? null,
      actor_email: opts.actorEmail ?? (opts.email ? `hash:${hmac(opts.email)}` : "anonymous"),
      action: kind,
      entity: "auth",
      entity_id: `ip:${hmac(opts.ip).slice(0, 12)}`,
      details: opts.details ?? {},
    });
  } catch {}
}

/** True when this IP or email has too many recent attempts of this kind. */
export async function isThrottled(kind: Kind, ip: string, email?: string): Promise<boolean> {
  try {
    const lim = LIMITS[kind];
    if (rateCount(keyIp(kind, ip)) >= lim.ip) return true;
    if (email && rateCount(keyEmail(kind, email)) >= lim.email) return true;
  } catch {
    return false; // never lock everyone out because the counter table was unreachable
  }
  return false;
}
