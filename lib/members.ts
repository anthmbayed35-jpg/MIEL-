import "server-only";
import crypto from "node:crypto";
import { getEngine } from "./db/core";
import { hashPassword } from "./passwords";
import { canGrantRole, type Role } from "./roles";
import { generateTemporaryPassword, TEMP_PASSWORD_TTL_MS } from "./temp-password";

/**
 * "Add member": the owner creates an ACTIVE account at once, with a generated temporary password that is shown to the
 * owner a single time. Only its argon2id hash is stored. The member is flagged must_change_password and must_enroll_mfa:
 * at first login they choose their own password, then enrol two-factor, before anything else in the admin opens.
 * The temporary password stops working after 48 hours if unused; the owner can regenerate it.
 * The only place (besides invites, lib/invites.ts) that inserts into admin_users. Passwords are never logged or audited.
 */
export class MemberError extends Error {}

const iso = (ms: number) => new Date(ms).toISOString();

export type Created = { id: string; email: string; role: Role; temporaryPassword: string; expiresAt: string };

export async function createMember(input: { actorRole: Role; email: string; name: string; role: Role }): Promise<Created> {
  const email = input.email.trim().toLowerCase();
  if (!canGrantRole(input.actorRole, input.role)) throw new MemberError("You can't give a role higher than your own.");
  const db = getEngine().sqlite;
  if (db.prepare("SELECT 1 FROM admin_users WHERE email = ?").get(email)) throw new MemberError("That email already has an account. Reactivate or reset that person from the list instead.");
  const temporaryPassword = generateTemporaryPassword();
  const hash = await hashPassword(temporaryPassword);
  const id = crypto.randomUUID();
  const expiresAt = iso(Date.now() + TEMP_PASSWORD_TTL_MS);
  getEngine().tx(() => {
    db.prepare("UPDATE invites SET used_at = ? WHERE email = ? AND used_at IS NULL").run(iso(Date.now()), email); // a pending invite must not later overwrite this account
    db.prepare("INSERT INTO admin_users (id, email, name, role, active, password_hash, must_change_password, must_enroll_mfa, temp_password_expires_at) VALUES (?,?,?,?,1,?,1,1,?)").run(
      id, email, input.name.trim().slice(0, 80), input.role, hash, expiresAt,
    );
  });
  return { id, email, role: input.role, temporaryPassword, expiresAt };
}

/** New temporary password for a member who has not chosen their own yet. Old password and all their sessions stop working. */
export async function regenerateTemporaryPassword(userId: string): Promise<{ email: string; temporaryPassword: string; expiresAt: string }> {
  const db = getEngine().sqlite;
  const u = db.prepare("SELECT email, active, must_change_password FROM admin_users WHERE id = ?").get(userId) as { email: string; active: number; must_change_password: number } | undefined;
  if (!u) throw new MemberError("That person isn't on the team.");
  if (!u.active) throw new MemberError("That person is deactivated. Reactivate them first.");
  if (!u.must_change_password) throw new MemberError("They already chose their own password. Use \"Send reset link\" instead.");
  const temporaryPassword = generateTemporaryPassword();
  const hash = await hashPassword(temporaryPassword);
  const expiresAt = iso(Date.now() + TEMP_PASSWORD_TTL_MS);
  getEngine().tx(() => {
    db.prepare("UPDATE admin_users SET password_hash = ?, must_change_password = 1, must_enroll_mfa = 1, temp_password_expires_at = ?, version = version + 1, updated_at = ? WHERE id = ?").run(hash, expiresAt, iso(Date.now()), userId);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  });
  return { email: u.email, temporaryPassword, expiresAt };
}

/** Members who still have to replace their temporary password. */
export const pendingMembers = () =>
  (getEngine().sqlite.prepare("SELECT id, temp_password_expires_at FROM admin_users WHERE must_change_password = 1 AND active = 1").all() as { id: string; temp_password_expires_at: string | null }[]).map((p) => ({ id: p.id, expiresAt: p.temp_password_expires_at, expired: !!p.temp_password_expires_at && Date.parse(p.temp_password_expires_at) < Date.now() }));
