import "server-only";
import crypto from "node:crypto";
import { headers } from "next/headers";
import { getDb, must, type Row } from "./db";

/**
 * Auth abuse protection that works across serverless instances: every attempt is written to audit_log
 * (entity "auth") and counted from the database. Emails are stored only as salted hashes in those rows.
 */
const WINDOW_MS = 15 * 60_000;

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "unknown").split(",")[0].trim().slice(0, 64);
}

export const hashEmail = (email: string) =>
  crypto.createHash("sha256").update(`${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}|${email.trim().toLowerCase()}`).digest("hex").slice(0, 24);

type Kind = "login_failed" | "reset_requested" | "mfa_failed";
const LIMITS: Record<Kind, { ip: number; email: number; windowMs: number }> = {
  login_failed: { ip: 12, email: 5, windowMs: WINDOW_MS },
  reset_requested: { ip: 6, email: 3, windowMs: 60 * 60_000 },
  mfa_failed: { ip: 12, email: 6, windowMs: WINDOW_MS },
};

export async function recordAuthEvent(kind: Kind | "login" | "logout" | "logout_all" | "invite_accepted" | "password_set" | "password_changed" | "reset_link_used" | "mfa_enabled" | "mfa_disabled" | "mfa_verified", opts: { ip: string; email?: string; actorId?: string | null; actorEmail?: string; details?: Row }) {
  try {
    await getDb().from("audit_log").insert({
      actor_id: opts.actorId ?? null,
      actor_email: opts.actorEmail ?? (opts.email ? `hash:${hashEmail(opts.email)}` : "anonymous"),
      action: kind,
      entity: "auth",
      entity_id: `ip:${opts.ip}`,
      details: opts.details ?? {},
    });
  } catch {}
}

/** True when this IP or email has too many recent failures of this kind. */
export async function isThrottled(kind: Kind, ip: string, email?: string): Promise<boolean> {
  const lim = LIMITS[kind];
  const since = new Date(Date.now() - lim.windowMs).toISOString();
  try {
    const byIp = must(await getDb().from("audit_log").select("id", { count: "exact" }).eq("action", kind).eq("entity_id", `ip:${ip}`).gte("created_at", since)) as Row[];
    if (byIp.length >= lim.ip) return true;
    if (email) {
      const byEmail = must(await getDb().from("audit_log").select("id", { count: "exact" }).eq("action", kind).eq("actor_email", `hash:${hashEmail(email)}`).gte("created_at", since)) as Row[];
      if (byEmail.length >= lim.email) return true;
    }
  } catch {
    return false; // never lock everyone out because the audit table was unreachable
  }
  return false;
}

export const PASSWORD_MIN = 12;
export function passwordProblem(p: string): string | null {
  if (p.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (p.length > 128) return "That password is too long.";
  if (!/[a-z]/i.test(p) || !/\d/.test(p)) return "Mix letters and numbers (a passphrase of several words works well).";
  return null;
}
