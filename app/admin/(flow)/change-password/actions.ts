"use server";

import { redirect } from "next/navigation";
import { getAdminState, sessionToken } from "@/lib/auth";
import { getEngine } from "@/lib/db";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/passwords";
import { destroyUserSessions } from "@/lib/session";
import { clientIp, isThrottled, recordAuthEvent } from "@/lib/security";
import type { ActionState } from "@/components/admin/ActionForm";

/**
 * First login of a member the owner added: replace the temporary password with your own. Only available while the
 * account is flagged must_change_password. The new password must pass the normal strength rules and differ from the
 * temporary one. Afterwards the next step is forced two-factor enrolment (the pages redirect there).
 */
export async function forceChangePassword(_p: ActionState, fd: FormData): Promise<ActionState> {
  const st = await getAdminState();
  if (!st) redirect("/admin/login");
  if (!st.mustChangePassword) redirect("/admin");
  const ip = await clientIp();
  if (await isThrottled("login_failed", ip, st.admin.email)) return { error: "Too many attempts. Wait 15 minutes." };
  const next = String(fd.get("password") ?? "");
  if (next !== String(fd.get("confirm") ?? "")) return { error: "The two passwords don't match." };
  const problem = passwordProblem(next);
  if (problem) return { error: problem };
  const db = getEngine().sqlite;
  const row = db.prepare("SELECT password_hash FROM admin_users WHERE id = ?").get(st.admin.id) as { password_hash: string | null };
  if (await verifyPassword(row.password_hash, next)) return { error: "Choose a different password from the temporary one." };
  db.prepare("UPDATE admin_users SET password_hash = ?, must_change_password = 0, temp_password_expires_at = NULL, version = version + 1, updated_at = ? WHERE id = ?").run(await hashPassword(next), new Date().toISOString(), st.admin.id);
  destroyUserSessions(st.admin.id, await sessionToken()); // every other session of this account ends
  await recordAuthEvent("password_set", { ip, actorId: st.admin.id, actorEmail: st.admin.email, details: { first_login: true } });
  redirect("/admin"); // requireAdmin sends them on to two-factor enrolment
}
