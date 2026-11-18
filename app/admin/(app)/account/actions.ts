"use server";

import { requireAdmin } from "@/lib/auth";
import { clientIp, isThrottled, passwordProblem, recordAuthEvent } from "@/lib/security";
import { authClient } from "@/lib/supabase-server";
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
  const supabase = await authClient();
  const { error: reauth } = await supabase.auth.signInWithPassword({ email: admin.email, password: String(fd.get("current") ?? "") });
  if (reauth) {
    await recordAuthEvent("login_failed", { ip, email: admin.email, details: { reason: "change_password_reauth" } });
    return { error: "Your current password is wrong." };
  }
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: "Couldn't save that password. Try a longer, less common one." };
  await recordAuthEvent("password_changed", { ip, actorId: admin.id, actorEmail: admin.email });
  return { ok: "Password changed. Other devices stay signed in until you use 'Sign out everywhere'." };
}
