"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { authConfirmUrl } from "@/lib/site-url";
import { requirePerm } from "@/lib/auth";
import { getDb, must, type Row } from "@/lib/db";
import { adminAuthClient, authClient } from "@/lib/supabase-server";
import type { ActionState } from "@/components/admin/ActionForm";

const ROLES = ["owner", "manager", "staff"];
const redirectTo = () => authConfirmUrl();

async function activeOwners(excludeId?: string) {
  return (must(await getDb().from("admin_users").select("*").eq("role", "owner").eq("active", true)) as Row[]).filter((u) => u.id !== excludeId).length;
}

/**
 * Invite someone: Supabase emails them a link, they choose their own password. No password is ever created or shown here.
 * The person only gets in once they accept (the link) AND are listed here as active.
 */
export async function inviteMember(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("team.manage");
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  const role = String(fd.get("role"));
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 200) return { error: "Enter a valid email." };
  if (!ROLES.includes(role)) return { error: "Pick a role." };
  const db = getDb();
  const existing = (must(await db.from("admin_users").select("*").eq("email", email)) as Row[])[0];
  if (existing?.active) return { error: "That person is already on the team." };

  if (existing && !existing.active) {
    // Previously deactivated: reactivate with the chosen role and send a fresh reset link instead of a new invite.
    must(await db.from("admin_users").update({ active: true, role, name: name || existing.name }).eq("id", existing.id));
    await (await authClient()).auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
    await audit(admin, "invite_sent", "admin_user", existing.id, { email, role, reactivated: true });
    revalidatePath("/admin/settings/team");
    return { ok: `${email} was reactivated and sent a link to set a new password.` };
  }

  const { data, error } = await adminAuthClient().auth.admin.inviteUserByEmail(email, { data: { name }, redirectTo: redirectTo() });
  if (error || !data?.user) return { error: /already|registered/i.test(error?.message ?? "") ? "That email already has an account. Ask them to use 'Forgot password', or contact support." : "Couldn't send the invite. Check the email address and your Supabase email settings." };
  try {
    must(await db.from("admin_users").insert({ id: data.user.id, email, name, role, active: true }));
  } catch (e) {
    return { error: `Invite sent, but saving the team record failed: ${(e as Error).message}` };
  }
  await audit(admin, "invite_sent", "admin_user", data.user.id, { email, role });
  revalidatePath("/admin/settings/team");
  return { ok: `Invite sent to ${email}. They choose their own password from the link (valid for 24 hours).` };
}

export async function setRole(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("team.manage");
  const id = String(fd.get("id"));
  const role = String(fd.get("role"));
  if (!ROLES.includes(role)) return { error: "Pick a role." };
  const db = getDb();
  const before = (must(await db.from("admin_users").select("*").eq("id", id).maybeSingle()) as Row | null);
  if (!before) return { error: "That person isn't on the team." };
  if (before.role === "owner" && role !== "owner" && (await activeOwners(id)) === 0) return { error: "There must be at least one active owner." };
  must(await db.from("admin_users").update({ role }).eq("id", id));
  await audit(admin, "role_change", "admin_user", id, { email: before.email, from: before.role, to: role });
  revalidatePath("/admin/settings/team");
  return { ok: "Role updated. It applies on their next request." };
}

/** Deactivation takes effect immediately: every request re-checks that the person is an active team member. */
export async function setActive(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("team.manage");
  const id = String(fd.get("id"));
  const active = fd.get("active") === "1";
  if (!active && id === admin.id) return { error: "You can't deactivate yourself." };
  if (!active && (await activeOwners(id)) === 0) return { error: "There must be at least one active owner." };
  must(await getDb().from("admin_users").update({ active }).eq("id", id));
  await audit(admin, active ? "team_activate" : "team_deactivate", "admin_user", id);
  revalidatePath("/admin/settings/team");
  return { ok: active ? "Reactivated." : "Deactivated. They are locked out immediately." };
}

export async function sendReset(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("team.manage");
  const id = String(fd.get("id"));
  const row = (must(await getDb().from("admin_users").select("*").eq("id", id).maybeSingle()) as Row | null);
  if (!row?.active) return { error: "That person isn't an active team member." };
  await (await authClient()).auth.resetPasswordForEmail(row.email, { redirectTo: redirectTo() });
  await audit(admin, "password_reset_sent", "admin_user", id, { email: row.email });
  return { ok: `Reset link sent to ${row.email}.` };
}
