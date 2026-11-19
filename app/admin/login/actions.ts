"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { audit } from "@/lib/audit";
import { getAdminState, sessionToken } from "@/lib/auth";
import { hardenCookie } from "@/lib/cookies";
import { getEngine } from "@/lib/db";
import { createReset } from "@/lib/invites";
import { mailConfigured } from "@/lib/mail";
import { verifyPassword } from "@/lib/passwords";
import { createSession, destroySession, destroyUserSessions, SESSION_COOKIE } from "@/lib/session";
import { clientIp, isThrottled, recordAuthEvent } from "@/lib/security";
import type { ActionState } from "@/components/admin/ActionForm";

const GENERIC = "Wrong email or password.";

export async function login(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ip = await clientIp();
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(fd.get("password") ?? "").slice(0, 200);
  if (!email || !password) return { error: GENERIC };
  if (await isThrottled("login_failed", ip, email)) return { error: "Too many attempts. Wait 15 minutes and try again." };

  const user = getEngine().sqlite.prepare("SELECT id, email, password_hash, active FROM admin_users WHERE email = ?").get(email) as { id: string; email: string; password_hash: string | null; active: number } | undefined;
  // Always verify something, so the response time never reveals whether the account exists. Same message for every failure.
  const ok = await verifyPassword(user?.password_hash, password);
  if (!user || !ok || !user.active) {
    await recordAuthEvent("login_failed", { ip, email, details: { reason: !user ? "unknown_email" : !ok ? "bad_password" : "inactive" } });
    return { error: GENERIC };
  }
  const ua = (await headers()).get("user-agent") ?? "";
  const { token, maxAgeSec } = createSession(user.id, { ip, userAgent: ua });
  (await cookies()).set(SESSION_COOKIE, token, hardenCookie({ maxAge: maxAgeSec }));
  await recordAuthEvent("login", { ip, actorId: user.id, actorEmail: user.email });
  redirect("/admin");
}

/** End this browser's session. */
export async function logout() {
  const token = await sessionToken();
  if (token) {
    const st = await getAdminState();
    destroySession(token);
    if (st) await recordAuthEvent("logout", { ip: await clientIp(), actorId: st.admin.id, actorEmail: st.admin.email });
  }
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/admin/login");
}

/** End every session of this account, on every device. */
export async function logoutEverywhere() {
  const st = await getAdminState();
  if (st) {
    destroyUserSessions(st.admin.id);
    await recordAuthEvent("logout_all", { ip: await clientIp(), actorId: st.admin.id, actorEmail: st.admin.email });
  }
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/admin/login");
}

/** Password reset by email. The answer is the same whether or not the address belongs to a team member. */
export async function requestReset(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const SAME: ActionState = { ok: "If that address belongs to a team member, a reset link is on its way. It expires in an hour." };
  // No email provider yet: nothing is sent (the answer does not depend on whether the address exists). The owner hands out reset links from Settings > Team.
  if (!mailConfigured()) return { ok: "Password reset by email isn't available yet. Ask the owner for a reset link." };
  const ip = await clientIp();
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  if (!/^\S+@\S+\.\S+$/.test(email)) return SAME;
  if (await isThrottled("reset_requested", ip, email)) return SAME; // silently ignore floods
  await recordAuthEvent("reset_requested", { ip, email });
  const row = getEngine().sqlite.prepare("SELECT id FROM admin_users WHERE email = ? AND active = 1").get(email) as { id: string } | undefined;
  if (row) {
    try {
      await createReset(row.id);
      await audit({ id: row.id, email }, "password_reset_requested", "admin_user", row.id);
    } catch (e) {
      console.error("reset email failed:", (e as Error).message); // logged for the operator, never shown (it would reveal the account exists)
    }
  }
  return SAME;
}
