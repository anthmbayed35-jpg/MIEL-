"use server";

import { redirect } from "next/navigation";
import { hasSupabase } from "@/lib/db";
import { safeNext } from "@/lib/cookies";
import { clientIp, recordAuthEvent } from "@/lib/security";
import { authClient } from "@/lib/supabase-server";

/**
 * Exchanges the one-time token from an invite or reset email for a session.
 * It runs from a button click (not on page load) so email link scanners can't use the token up.
 */
export async function confirmLink(fd: FormData) {
  if (!hasSupabase()) redirect("/admin/login?error=link");
  const token = String(fd.get("token_hash") ?? "");
  const type = String(fd.get("type") ?? "");
  const next = safeNext(String(fd.get("next") ?? ""), "/admin/set-password");
  if (!token || !["invite", "recovery", "email"].includes(type)) redirect("/admin/login?error=link");
  const ip = await clientIp();
  const supabase = await authClient();
  const { data, error } = await supabase.auth.verifyOtp({ type: type as "invite" | "recovery" | "email", token_hash: token });
  if (error || !data.user) {
    await recordAuthEvent("login_failed", { ip, details: { reason: "bad_link", type } });
    redirect("/admin/login?error=link");
  }
  await recordAuthEvent(type === "invite" ? "invite_accepted" : "reset_link_used", { ip, actorId: data.user.id, actorEmail: data.user.email ?? "" });
  redirect(next);
}
