"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, sessionToken } from "@/lib/auth";
import { getEngine } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { destroySessionById, destroyUserSessions } from "@/lib/session";
import { clientIp, isThrottled, passwordProblem, recordAuthEvent } from "@/lib/security";
import { sha256 } from "@/lib/crypto";
import type { ActionState } from "@/components/admin/ActionForm";

/** Change your own password. Re-checks the current password first, so a borrowed open session can't change it. */
export async function changePassword(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const ip = await clientIp();
  if (await isThrottled("login_failed", ip, admin.email)) return { error: "Too many attempts. Wait 15 minutes." };
  const next = String(fd.get("password") ?? "");
  if (next !== String(fd.get("confirm") ?? "")) return { error: "The two new passwords don't match." };
  const problem = passwordProblem(next);
  if (problem) return { error: problem };
  const db = getEngine().sqlite;
  const row = db.prepare("SELECT password_hash FROM admin_users WHERE id = ?").get(admin.id) as { password_hash: string | null };
  if (!(await verifyPassword(row.password_hash, String(fd.get("current") ?? "")))) {
    await recordAuthEvent("login_failed", { ip, email: admin.email, details: { reason: "change_password_reauth" } });
    return { error: "Your current password is wrong." };
  }
  db.prepare("UPDATE admin_users SET password_hash = ?, version = version + 1, updated_at = ? WHERE id = ?").run(await hashPassword(next), new Date().toISOString(), admin.id);
  const token = await sessionToken();
  destroyUserSessions(admin.id, token); // every other device is signed out
  await recordAuthEvent("password_changed", { ip, actorId: admin.id, actorEmail: admin.email });
  return { ok: "Password changed. Your other devices were signed out." };
}

/** Sign one specific session out (from the active-sessions list). */
export async function revokeSession(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const cur = await sessionToken();
  if (cur && sha256(cur) === id) return { error: "That's this browser. Use Sign out instead." };
  const done = destroySessionById(admin.id, id); // scoped to the caller's own sessions
  if (done) await recordAuthEvent("session_revoked", { ip: await clientIp(), actorId: admin.id, actorEmail: admin.email });
  revalidatePath("/admin/account");
  return done ? { ok: "Signed out." } : { error: "That session is already gone." };
}
