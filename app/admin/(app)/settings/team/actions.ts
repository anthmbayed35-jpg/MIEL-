"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requirePerm } from "@/lib/auth";
import { getDb, must, type Row } from "@/lib/db";
import { createInvite, createReset, InviteError, revokeInvite as revoke } from "@/lib/invites";
import { clientIp, isThrottled, recordAuthEvent } from "@/lib/security";
import { destroyUserSessions } from "@/lib/session";
import type { ActionState } from "@/components/admin/ActionForm";

const ROLES = ["owner", "manager", "staff"];

async function activeOwners(excludeId?: string) {
  return (must(await getDb().from("admin_users").select("*").eq("role", "owner").eq("active", true)) as Row[]).filter((u) => u.id !== excludeId).length;
}

/**
 * Invite someone: they get an email with a single-use link and choose their own password. No password is ever created or
 * shown here. They only get in once they accept AND are listed as active.
 */
export async function inviteMember(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("team.manage");
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  const role = String(fd.get("role"));
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 200) return { error: "Enter a valid email." };
  if (!ROLES.includes(role)) return { error: "Pick a role." };
  const ip = await clientIp();
  if (await isThrottled("invite_sent", ip, admin.email)) return { error: "Too many invites. Try again in an hour." };
  let delivery;
  try {
    delivery = await createInvite({ email, name, role: role as "owner" | "manager" | "staff", invitedBy: admin.id });
  } catch (e) {
    if (e instanceof InviteError) return { error: e.message };
    return { error: `The invite email could not be sent (${(e as Error).message}). Nothing was lost: fix the email settings and send it again.` };
  }
  await recordAuthEvent("invite_sent", { ip, email: admin.email, actorId: admin.id, actorEmail: admin.email });
  await audit(admin, "invite_sent", "admin_user", email, { email, role, delivery: delivery.emailed ? "email" : "manual_link" });
  revalidatePath("/admin/settings/team");
  if (!delivery.emailed)
    return { ok: `Invite created for ${email}. Email isn't configured yet, so copy the link below and send it to them yourself.`, copy: { label: "One-time invite link (valid 48 hours)", value: delivery.link! } };
  return { ok: `Invite sent to ${email}. They choose their own password from the link (valid for 48 hours, works once).` };
}

export async function cancelInvite(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("team.manage");
  const id = String(fd.get("id"));
  if (revoke(id)) await audit(admin, "invite_revoked", "admin_user", id);
  revalidatePath("/admin/settings/team");
  return { ok: "Invite cancelled." };
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

/** Deactivation takes effect immediately: their sessions are deleted and every request re-checks that they are active. */
export async function setActive(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("team.manage");
  const id = String(fd.get("id"));
  const active = fd.get("active") === "1";
  if (!active && id === admin.id) return { error: "You can't deactivate yourself." };
  if (!active && (await activeOwners(id)) === 0) return { error: "There must be at least one active owner." };
  must(await getDb().from("admin_users").update({ active }).eq("id", id));
  if (!active) destroyUserSessions(id);
  await audit(admin, active ? "team_activate" : "team_deactivate", "admin_user", id);
  revalidatePath("/admin/settings/team");
  return { ok: active ? "Reactivated." : "Deactivated. They are locked out immediately." };
}

export async function sendReset(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("team.manage");
  const id = String(fd.get("id"));
  const row = (must(await getDb().from("admin_users").select("*").eq("id", id).maybeSingle()) as Row | null);
  if (!row?.active) return { error: "That person isn't an active team member." };
  let delivery;
  try {
    delivery = await createReset(id);
  } catch (e) {
    return { error: `The email could not be sent (${(e as Error).message}).` };
  }
  await audit(admin, "password_reset_sent", "admin_user", id, { email: row.email, delivery: delivery.emailed ? "email" : "manual_link" });
  if (!delivery.emailed) return { ok: `Reset link for ${row.email}. Email isn't configured yet, so copy it and send it to them yourself.`, copy: { label: "One-time reset link (valid 1 hour)", value: delivery.link! } };
  return { ok: `Reset link sent to ${row.email}.` };
}

/** Owner support: remove someone's two-factor setup (lost phone AND lost recovery codes). */
export async function resetMfa(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("team.manage");
  const id = String(fd.get("id"));
  const row = (must(await getDb().from("admin_users").select("*").eq("id", id).maybeSingle()) as Row | null);
  if (!row) return { error: "That person isn't on the team." };
  must(await getDb().from("admin_users").update({ totp_enabled: false, totp_secret: null, recovery_codes: [], totp_last_step: 0 }).eq("id", id));
  destroyUserSessions(id);
  await audit(admin, "mfa_reset", "admin_user", id, { email: row.email });
  revalidatePath("/admin/settings/team");
  return { ok: "Two-factor setup removed. They sign in with their password and set it up again." };
}
