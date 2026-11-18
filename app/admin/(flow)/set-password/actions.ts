"use server";

import { redirect } from "next/navigation";
import { getAdminState } from "@/lib/auth";
import { passwordProblem, clientIp, recordAuthEvent } from "@/lib/security";
import { authClient } from "@/lib/supabase-server";
import type { ActionState } from "@/components/admin/ActionForm";

/** Choose a password after an invite or a reset link. Needs the short-lived session created by /admin/auth/confirm. */
export async function setPassword(_p: ActionState, fd: FormData): Promise<ActionState> {
  const st = await getAdminState();
  if (!st) return { error: "This link has expired. Ask for a new invite or reset." };
  if (st.mfa === "verify") redirect("/admin/mfa");
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("confirm") ?? "")) return { error: "The two passwords don't match." };
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  const { error } = await (await authClient()).auth.updateUser({ password });
  if (error) return { error: "Couldn't save that password. Try a longer, less common one." };
  await recordAuthEvent("password_set", { ip: await clientIp(), actorId: st.admin.id, actorEmail: st.admin.email });
  redirect("/admin");
}
