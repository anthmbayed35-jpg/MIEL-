import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { newToken, sha256 } from "../crypto";
import { hardenCookie } from "../cookies";
import { getEngine } from "../db";
import { hashPassword, passwordProblem, verifyPassword } from "../passwords";
import { getProgram } from "../program";
import { rateHit, rateLimit, rateReset } from "../rate-limit";
import { absoluteUrl } from "../site-url";

/**
 * Ambassador accounts. COMPLETELY separate from the admin: their own cookie (miel_amb), their own sessions table, their own
 * password column, no role, no admin permission. An ambassador is a row of `affiliates`; every query in the portal is scoped by the
 * id this module returns, never by an id the browser sends, so one ambassador can never see another one's data.
 */
export const AMB_COOKIE = "miel_amb";
export const IDLE_MS = 7 * 86_400_000;
export const ABSOLUTE_MS = 30 * 86_400_000;
export const INVITE_DAYS = 7;
export const RESET_HOURS = 24;
const sqlite = () => getEngine().sqlite;
const iso = (ms: number) => new Date(ms).toISOString();

// ---------------------------------------------------------------- invite and reset links
export type TokenKind = "invite" | "reset";

/** A fresh one-use link. Any older unused link of the same kind for this person stops working. Returns the raw token (shown once; only its hash is stored). */
export function createToken(affiliateId: string, kind: TokenKind, now = Date.now()): { token: string; expiresAt: string } {
  const token = newToken();
  const expiresAt = iso(now + (kind === "invite" ? INVITE_DAYS * 86_400_000 : RESET_HOURS * 3_600_000));
  getEngine().tx(() => {
    sqlite().prepare("UPDATE ambassador_tokens SET used_at = ? WHERE affiliate_id = ? AND kind = ? AND used_at IS NULL").run(iso(now), affiliateId, kind);
    sqlite().prepare("INSERT INTO ambassador_tokens (id, affiliate_id, kind, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)").run(crypto.randomUUID(), affiliateId, kind, sha256(token), expiresAt);
  });
  return { token, expiresAt };
}

export const setPasswordUrl = (token: string) => absoluteUrl(`/ambassador/set-password?token=${encodeURIComponent(token)}`);

export type TokenInfo = { state: "ok"; kind: TokenKind; affiliateId: string; name: string; expiresAt: string } | { state: "expired" | "used" | "unknown" };
export function tokenInfo(raw: string | null | undefined, now = Date.now()): TokenInfo {
  if (!raw || raw.length < 20 || raw.length > 200) return { state: "unknown" };
  const r = sqlite().prepare("SELECT t.kind, t.affiliate_id, t.expires_at, t.used_at, a.name, a.status FROM ambassador_tokens t JOIN affiliates a ON a.id = t.affiliate_id WHERE t.token_hash = ?").get(sha256(raw)) as
    | { kind: TokenKind; affiliate_id: string; expires_at: string; used_at: string | null; name: string; status: string }
    | undefined;
  if (!r) return { state: "unknown" };
  if (r.used_at) return { state: "used" };
  if (r.expires_at <= iso(now) || r.status === "ended") return { state: "expired" };
  return { state: "ok", kind: r.kind, affiliateId: r.affiliate_id, name: r.name, expiresAt: r.expires_at };
}

/** Set the password with a link. An invite also needs the terms accepted (their version and time are stored). The link works once. */
export async function consumeToken(raw: string, password: string, opts: { acceptTerms?: boolean } = {}): Promise<string> {
  const info = tokenInfo(raw);
  if (info.state === "used") throw new Error("This link was already used. Ask the team for a new one, or log in.");
  if (info.state !== "ok") throw new Error("This link is not valid or has expired. Ask the team for a new one.");
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  if (info.kind === "invite" && !opts.acceptTerms) throw new Error("Accept the ambassador terms to continue.");
  const hash = await hashPassword(password);
  const now = iso(Date.now());
  const program = getProgram();
  getEngine().tx(() => {
    const used = sqlite().prepare("UPDATE ambassador_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL").run(now, sha256(raw));
    if (!used.changes) throw new Error("This link was already used. Ask the team for a new one, or log in.");
    if (info.kind === "invite")
      sqlite().prepare("UPDATE affiliates SET password_hash = ?, terms_version = ?, terms_accepted_at = ?, version = version + 1 WHERE id = ?").run(hash, program.termsVersion, now, info.affiliateId);
    else sqlite().prepare("UPDATE affiliates SET password_hash = ?, version = version + 1 WHERE id = ?").run(hash, info.affiliateId);
    sqlite().prepare("DELETE FROM ambassador_sessions WHERE affiliate_id = ?").run(info.affiliateId); // a new password signs every device out
  });
  return info.affiliateId;
}

// ---------------------------------------------------------------- sessions
export type Ambassador = {
  id: string; name: string; email: string; phone: string; instagram_handle: string; code: string; tier: "seed" | "athlete" | "ambassador"; status: "active" | "paused" | "ended";
  commission_rate_x100: number; customer_discount_percent_x100: number; payout_method: string; payout_details: string; terms_version: number | null; terms_accepted_at: string | null;
  leaderboard_optout: number; rules_read_at: string | null; created_at: string;
};
const COLUMNS = "a.id, a.name, a.email, a.phone, a.instagram_handle, a.code, a.tier, a.status, a.commission_rate_x100, a.customer_discount_percent_x100, a.payout_method, a.payout_details, a.terms_version, a.terms_accepted_at, a.leaderboard_optout, a.rules_read_at, a.created_at";

function newSession(affiliateId: string, ip: string, now = Date.now()) {
  const token = newToken();
  sqlite().prepare("DELETE FROM ambassador_sessions WHERE expires_at < ?").run(iso(now));
  sqlite().prepare("INSERT INTO ambassador_sessions (id, affiliate_id, ip, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)").run(sha256(token), affiliateId, ip.slice(0, 64), iso(now), iso(now), iso(now + ABSOLUTE_MS));
  return token;
}

export function lookupAmbassador(token: string | undefined | null, now = Date.now()): Ambassador | null {
  if (!token || token.length < 20 || token.length > 200) return null;
  const r = sqlite().prepare(`SELECT ${COLUMNS}, s.last_seen_at, s.expires_at FROM ambassador_sessions s JOIN affiliates a ON a.id = s.affiliate_id WHERE s.id = ?`).get(sha256(token)) as (Ambassador & { last_seen_at: string; expires_at: string }) | undefined;
  if (!r) return null;
  if (r.expires_at <= iso(now) || now - Date.parse(r.last_seen_at) > IDLE_MS || r.status === "ended") {
    sqlite().prepare("DELETE FROM ambassador_sessions WHERE id = ?").run(sha256(token));
    return null;
  }
  if (now - Date.parse(r.last_seen_at) > 60_000) sqlite().prepare("UPDATE ambassador_sessions SET last_seen_at = ? WHERE id = ?").run(iso(now), sha256(token));
  const { last_seen_at: _l, expires_at: _e, ...me } = r;
  void _l;
  void _e;
  return me;
}

/** The signed-in ambassador for this request, or null. */
export async function getAmbassador(): Promise<Ambassador | null> {
  return lookupAmbassador((await cookies()).get(AMB_COOKIE)?.value);
}

/** Every portal page and action starts here. */
export async function requireAmbassador(): Promise<Ambassador> {
  const me = await getAmbassador();
  if (!me) redirect("/ambassador/login");
  return me;
}

export type LoginResult = { ok: true; token: string; maxAgeSec: number } | { ok: false; error: string };
const GENERIC = "That email and password do not match.";

/** Check the credentials (throttled per connection and per email) and open a session. The answer never says which half was wrong. */
export async function loginAmbassador(email: string, password: string, ip: string): Promise<LoginResult> {
  const e = email.trim().toLowerCase().slice(0, 120);
  if (!rateLimit(`amb-login:ip:${ip}`, 20, 15 * 60_000) || !rateLimit(`amb-login:em:${e}`, 6, 15 * 60_000)) return { ok: false, error: "Too many attempts. Wait a few minutes and try again." };
  const row = e ? (sqlite().prepare("SELECT id, password_hash, status FROM affiliates WHERE lower(email) = ? ORDER BY created_at LIMIT 1").get(e) as { id: string; password_hash: string | null; status: string } | undefined) : undefined;
  const good = await verifyPassword(row?.password_hash, password); // also runs a hash when there is no account, so timing does not reveal one
  if (!row || !row.password_hash || !good || row.status === "ended") return { ok: false, error: GENERIC };
  rateReset(`amb-login:em:${e}`);
  const token = newSession(row.id, ip);
  sqlite().prepare("UPDATE affiliates SET last_login_at = ? WHERE id = ?").run(iso(Date.now()), row.id);
  return { ok: true, token, maxAgeSec: Math.floor(ABSOLUTE_MS / 1000) };
}

export async function startSession(affiliateId: string, ip: string) {
  const token = newSession(affiliateId, ip);
  (await cookies()).set(AMB_COOKIE, token, hardenCookie({ maxAge: Math.floor(ABSOLUTE_MS / 1000) }));
}

export async function endSession() {
  const jar = await cookies();
  const t = jar.get(AMB_COOKIE)?.value;
  if (t) sqlite().prepare("DELETE FROM ambassador_sessions WHERE id = ?").run(sha256(t));
  jar.delete(AMB_COOKIE);
}

/** Change the password from the profile page (the current one is required). Other devices are signed out. */
export async function changeOwnPassword(id: string, current: string, next: string, keepToken?: string): Promise<void> {
  if (!rateLimit(`amb-pw:${id}`, 8, 15 * 60_000)) throw new Error("Too many attempts. Wait a few minutes and try again.");
  const row = sqlite().prepare("SELECT password_hash FROM affiliates WHERE id = ?").get(id) as { password_hash: string | null } | undefined;
  if (!(await verifyPassword(row?.password_hash, current))) {
    rateHit(`amb-pw:${id}`, 15 * 60_000);
    throw new Error("Your current password is not right.");
  }
  const problem = passwordProblem(next);
  if (problem) throw new Error(problem);
  const hash = await hashPassword(next);
  getEngine().tx(() => {
    sqlite().prepare("UPDATE affiliates SET password_hash = ?, version = version + 1 WHERE id = ?").run(hash, id);
    sqlite().prepare("DELETE FROM ambassador_sessions WHERE affiliate_id = ? AND id <> ?").run(id, keepToken ? sha256(keepToken) : "");
  });
}
