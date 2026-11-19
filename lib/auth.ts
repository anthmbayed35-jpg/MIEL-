import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { forbidden, redirect, unauthorized } from "next/navigation";
import { getDb, must, type Row } from "./db";
import { lookupSession, SESSION_COOKIE } from "./session";
import { can, type Admin, type Perm } from "./roles";

export { can };
export type { Admin, Perm };

/** "ok" = fully signed in. "verify" = must enter the TOTP code. "enroll" = the owner requires 2FA and this person has none yet. */
export type MfaState = "ok" | "verify" | "enroll";

/** The raw session token of this request (from the httpOnly cookie), or undefined. */
export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** Signed in (valid, unexpired database session) AND still an active team member. Includes the 2FA state so the MFA pages can use it. */
export const getAdminState = cache(async (): Promise<{ admin: Admin; mfa: MfaState; totpEnabled: boolean } | null> => {
  const token = await sessionToken();
  const found = lookupSession(token);
  if (!found.ok) return null;
  const { session } = found;
  const u = session.user;
  const sec = (must(await getDb().from("settings").select("*").eq("key", "security")) as Row[])[0]?.value as { require_2fa?: boolean } | undefined;
  let mfa: MfaState = "ok";
  if (u.totpEnabled && !session.mfaOk) mfa = "verify";
  else if (!u.totpEnabled && sec?.require_2fa) mfa = "enroll";
  return { admin: { id: u.id, email: u.email, name: u.name || u.email.split("@")[0], role: u.role }, mfa, totpEnabled: u.totpEnabled };
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
