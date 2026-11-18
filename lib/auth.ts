import "server-only";
import { cache } from "react";
import { forbidden, redirect, unauthorized } from "next/navigation";
import { getDb, hasSupabase, must, type Row } from "./db";
import { authClient } from "./supabase-server";
import { can, type Admin, type Perm } from "./roles";

export { can };
export type { Admin, Perm };

/** "ok" = fully signed in. "verify" = must enter the TOTP code. "enroll" = owner requires 2FA and this person has none yet. */
export type MfaState = "ok" | "verify" | "enroll";

type SessionUser = { id: string; email: string; currentLevel: string; nextLevel: string };

/** The Supabase Auth user for this request (verified with the Auth server, not just decoded from the cookie). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (!hasSupabase()) return null;
  try {
    const supabase = await authClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return { id: data.user.id, email: data.user.email ?? "", currentLevel: aal?.currentLevel ?? "aal1", nextLevel: aal?.nextLevel ?? "aal1" };
  } catch {
    return null;
  }
});

/** Signed in AND listed as an active team member. Includes the 2FA state so the MFA pages can use it. */
export const getAdminState = cache(async (): Promise<{ admin: Admin; mfa: MfaState } | null> => {
  const s = await getSessionUser();
  if (!s) return null;
  const db = getDb();
  const row = must(await db.from("admin_users").select("*").eq("id", s.id).maybeSingle()) as Row | null;
  if (!row || !row.active) return null;
  const sec = (must(await db.from("settings").select("*").eq("key", "security")) as Row[])[0]?.value as { require_2fa?: boolean } | undefined;
  let mfa: MfaState = "ok";
  if (s.nextLevel === "aal2" && s.currentLevel !== "aal2") mfa = "verify";
  else if (sec?.require_2fa && s.currentLevel !== "aal2") mfa = "enroll";
  return { admin: { id: row.id, email: row.email, name: row.name || String(row.email).split("@")[0], role: row.role }, mfa };
});

/** The current admin, or null. Null also when 2FA is still pending, so APIs treat a half-signed-in session as signed out. */
export async function getAdmin(): Promise<Admin | null> {
  const st = await getAdminState();
  return st && st.mfa === "ok" ? st.admin : null;
}

/** For pages, actions and routes: 401 when not signed in, redirect to the 2FA step when it is pending. */
export async function requireAdmin(): Promise<Admin> {
  const st = await getAdminState();
  if (!st) unauthorized();
  if (st.mfa !== "ok") redirect("/admin/mfa");
  return st.admin;
}

/** Use at the top of every admin page, server action and route. 401 if signed out, 403 if the role can't do this. */
export async function requirePerm(perm: Perm): Promise<Admin> {
  const a = await requireAdmin();
  if (!can(a.role, perm)) forbidden();
  return a;
}
