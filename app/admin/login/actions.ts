"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { getAdminState } from "@/lib/auth";
import { cookies } from "next/headers";
import { SEEN_COOKIE } from "@/lib/cookies";
import { getDb, hasSupabase, must } from "@/lib/db";
import { clientIp, isThrottled, recordAuthEvent } from "@/lib/security";
import { authClient } from "@/lib/supabase-server";
import type { ActionState } from "@/components/admin/ActionForm";

const GENERIC = "Wrong email or password.";
const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

export async function login(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (!hasSupabase()) return { error: "Admin isn't configured on this deployment yet." };
  const ip = await clientIp();
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(fd.get("password") ?? "").slice(0, 200);
  if (!email || !password) return { error: GENERIC };
  if (await isThrottled("login_failed", ip, email)) return { error: "Too many attempts. Wait 15 minutes and try again." };

  const supabase = await authClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    await recordAuthEvent("login_failed", { ip, email, details: { reason: "bad_credentials" } });
    return { error: GENERIC };
  }
  // Only active team members may enter, even with a valid Supabase account. Same generic message either way.
  const row = must(await getDb().from("admin_users").select("*").eq("id", data.user.id).maybeSingle());
  if (!row || !row.active) {
    await supabase.auth.signOut();
    await recordAuthEvent("login_failed", { ip, email, details: { reason: "not_an_active_admin" } });
    return { error: GENERIC };
  }
  await recordAuthEvent("login", { ip, actorId: row.id, actorEmail: row.email });
  redirect("/admin");
}

/** End this browser's session. */
export async function logout() {
  if (hasSupabase()) {
    const st = await getAdminState();
    const ip = await clientIp();
    await (await authClient()).auth.signOut({ scope: "local" });
    if (st) await recordAuthEvent("logout", { ip, actorId: st.admin.id, actorEmail: st.admin.email });
  }
  (await cookies()).delete(SEEN_COOKIE);
  redirect("/admin/login");
}

/** End every session of this account, on every device. */
export async function logoutEverywhere() {
  if (hasSupabase()) {
    const st = await getAdminState();
    const ip = await clientIp();
    await (await authClient()).auth.signOut({ scope: "global" });
    if (st) await recordAuthEvent("logout_all", { ip, actorId: st.admin.id, actorEmail: st.admin.email });
  }
  (await cookies()).delete(SEEN_COOKIE);
  redirect("/admin/login");
}

/** Password reset by email. The answer is always the same, whether or not the address belongs to a team member. */
export async function requestReset(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const SAME: ActionState = { ok: "If that address belongs to a team member, a reset link is on its way. It expires in an hour." };
  if (!hasSupabase()) return { error: "Admin isn't configured on this deployment yet." };
  const ip = await clientIp();
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  if (!/^\S+@\S+\.\S+$/.test(email)) return SAME;
  if (await isThrottled("reset_requested", ip, email)) return SAME; // silently ignore floods
  await recordAuthEvent("reset_requested", { ip, email });
  const row = must(await getDb().from("admin_users").select("id, active").eq("email", email).maybeSingle());
  if (row?.active) {
    // The email template links to /admin/auth/confirm?token_hash=...&type=recovery (see docs/OPERATIONS.md)
    await (await authClient()).auth.resetPasswordForEmail(email, { redirectTo: `${SITE()}/admin/auth/confirm?next=/admin/set-password` });
    await audit({ id: row.id, email }, "password_reset_requested", "admin_user", row.id);
  }
  return SAME;
}
