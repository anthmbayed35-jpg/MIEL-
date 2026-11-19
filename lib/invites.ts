import "server-only";
import crypto from "node:crypto";
import { getEngine } from "./db/core";
import { newToken, sha256 } from "./crypto";
import { hashPassword } from "./passwords";
import { sendMail } from "./mail";
import { inviteUrl, resetUrl } from "./site-url";
import type { Role } from "./roles";

/**
 * Invites and password resets. A link carries a random token; the database stores only its sha256, a token works once
 * and expires (invite 48 h, reset 1 h). Nothing here accepts or returns a password except hashing the one the person
 * chooses on the set-password form.
 */
export const INVITE_TTL_MS = 48 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;

const iso = (ms: number) => new Date(ms).toISOString();
const sql = () => getEngine().sqlite;

export class InviteError extends Error {}

/** `link` is set ONLY when no email could be sent (email not configured): the owner then hands it over manually. */
export type Delivery = { emailed: boolean; link?: string };

export async function createInvite(input: { email: string; name: string; role: Role; invitedBy: string | null }): Promise<Delivery> {
  const email = input.email.trim().toLowerCase();
  const db = sql();
  const existing = db.prepare("SELECT id, active FROM admin_users WHERE email = ?").get(email) as { id: string; active: number } | undefined;
  if (existing?.active) throw new InviteError("That person is already on the team.");
  const token = newToken();
  db.transaction(() => {
    db.prepare("UPDATE invites SET used_at = ? WHERE email = ? AND used_at IS NULL").run(iso(Date.now()), email); // older links stop working
    db.prepare("INSERT INTO invites (id, email, name, role, token_hash, invited_by, expires_at) VALUES (?,?,?,?,?,?,?)").run(
      crypto.randomUUID(), email, input.name.trim().slice(0, 80), input.role, sha256(token), input.invitedBy, iso(Date.now() + INVITE_TTL_MS),
    );
  })();
  const r = await sendMail({
    to: email,
    subject: "You're invited to the MIEL+ admin",
    text: `You've been invited to run the MIEL+ store as ${input.role}.\n\nChoose your password here (the link works once and expires in 48 hours):\n${inviteUrl(token)}\n\nIf you weren't expecting this, ignore this email.`,
  });
  return r.sent ? { emailed: true } : { emailed: false, link: inviteUrl(token) };
}

export async function createReset(userId: string): Promise<Delivery> {
  const u = sql().prepare("SELECT email FROM admin_users WHERE id = ? AND active = 1").get(userId) as { email: string } | undefined;
  if (!u) return { emailed: false };
  const token = newToken();
  sql().transaction(() => {
    sql().prepare("UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL").run(iso(Date.now()), userId);
    sql().prepare("INSERT INTO password_resets (id, user_id, token_hash, expires_at) VALUES (?,?,?,?)").run(crypto.randomUUID(), userId, sha256(token), iso(Date.now() + RESET_TTL_MS));
  })();
  const r = await sendMail({
    to: u.email,
    subject: "Reset your MIEL+ admin password",
    text: `Choose a new password here (the link works once and expires in 1 hour):\n${resetUrl(token)}\n\nIf you didn't ask for this, ignore this email.`,
  });
  return r.sent ? { emailed: true } : { emailed: false, link: resetUrl(token) };
}

export type TokenKind = "invite" | "reset";
export type Peek = { kind: TokenKind; email: string; name: string };

/** Is this token usable? (Does not consume it.) */
export function peekToken(kind: TokenKind, token: string | undefined, now = Date.now()): Peek | null {
  if (!token || token.length > 200) return null;
  const h = sha256(token);
  if (kind === "invite") {
    const r = sql().prepare("SELECT email, name FROM invites WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?").get(h, iso(now)) as { email: string; name: string } | undefined;
    return r ? { kind, ...r } : null;
  }
  const r = sql().prepare("SELECT u.email, u.name FROM password_resets p JOIN admin_users u ON u.id = p.user_id WHERE p.token_hash = ? AND p.used_at IS NULL AND p.expires_at > ? AND u.active = 1").get(h, iso(now)) as { email: string; name: string } | undefined;
  return r ? { kind, ...r } : null;
}

/** Consume a token and set the person's password. Returns the user id. Throws InviteError if the link is used up, expired or invalid. */
export async function consumeToken(kind: TokenKind, token: string, password: string, now = Date.now()): Promise<string> {
  const hash = await hashPassword(password);
  const db = sql();
  const h = sha256(token);
  return getEngine().tx(() => {
    if (kind === "invite") {
      const inv = db.prepare("UPDATE invites SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING email, name, role").get(iso(now), h, iso(now)) as { email: string; name: string; role: Role } | undefined;
      if (!inv) throw new InviteError("This link has expired or was already used. Ask for a new invite.");
      const existing = db.prepare("SELECT id FROM admin_users WHERE email = ?").get(inv.email) as { id: string } | undefined;
      if (existing) {
        db.prepare("UPDATE admin_users SET password_hash = ?, active = 1, role = ?, name = COALESCE(NULLIF(name, ''), ?), version = version + 1, updated_at = ? WHERE id = ?").run(hash, inv.role, inv.name, iso(now), existing.id);
        return existing.id;
      }
      const id = crypto.randomUUID();
      db.prepare("INSERT INTO admin_users (id, email, name, role, active, password_hash) VALUES (?,?,?,?,1,?)").run(id, inv.email, inv.name, inv.role, hash);
      return id;
    }
    const r = db.prepare("UPDATE password_resets SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING user_id").get(iso(now), h, iso(now)) as { user_id: string } | undefined;
    if (!r) throw new InviteError("This link has expired or was already used. Ask for a new reset.");
    db.prepare("UPDATE admin_users SET password_hash = ?, version = version + 1, updated_at = ? WHERE id = ? AND active = 1").run(hash, iso(now), r.user_id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(r.user_id); // a reset ends every old session
    return r.user_id;
  });
}

export const pendingInvites = () =>
  sql().prepare("SELECT id, email, name, role, expires_at, created_at FROM invites WHERE used_at IS NULL AND expires_at > ? ORDER BY created_at DESC").all(iso(Date.now())) as { id: string; email: string; name: string; role: Role; expires_at: string; created_at: string }[];

export const revokeInvite = (id: string) => sql().prepare("UPDATE invites SET used_at = ? WHERE id = ? AND used_at IS NULL").run(iso(Date.now()), id).changes > 0;
