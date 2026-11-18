"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { audit } from "@/lib/audit";
import { requirePerm } from "@/lib/auth";
import { dbMode, getDb, must, type Row } from "@/lib/db";
import type { ActionState } from "@/components/admin/ActionForm";

const ROLES = ["owner", "manager", "staff"];

async function activeOwners(excludeId?: string) {
  return (must(await getDb().from("admin_users").select("*").eq("role", "owner").eq("active", true)) as Row[]).filter((u) => u.id !== excludeId).length;
}

export async function addMember(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("team.manage");
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const name = String(fd.get("name") ?? "").trim();
  const role = String(fd.get("role"));
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email." };
  if (!ROLES.includes(role)) return { error: "Pick a role." };
  const db = getDb();
  let id: string = crypto.randomUUID();
  let msg = "Added.";
  if (dbMode() === "supabase") {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const password = crypto.randomBytes(12).toString("base64url");
    const created = await sb.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) return { error: created.error.message };
    id = created.data.user.id;
    msg = `Added. Temporary password (shown once, share it privately): ${password}`;
  }
  try {
    must(await db.from("admin_users").insert({ id, email, name, role, active: true }));
  } catch (e) {
    return { error: /duplicate|unique/i.test((e as Error).message) ? "That email is already on the team." : (e as Error).message };
  }
  await audit(admin, "team_add", "admin_user", id, { email, role });
  revalidatePath("/admin/settings/team");
  return { ok: msg };
}

export async function setRole(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("team.manage");
  const id = String(fd.get("id"));
  const role = String(fd.get("role"));
  if (!ROLES.includes(role)) return { error: "Pick a role." };
  if (role !== "owner" && (await activeOwners(id)) === 0) return { error: "There must be at least one active owner." };
  must(await getDb().from("admin_users").update({ role }).eq("id", id));
  await audit(admin, "team_role", "admin_user", id, { role });
  revalidatePath("/admin/settings/team");
  return { ok: "Role updated." };
}

export async function setActive(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("team.manage");
  const id = String(fd.get("id"));
  const active = fd.get("active") === "1";
  if (!active && id === admin.id) return { error: "You can't deactivate yourself." };
  if (!active && (await activeOwners(id)) === 0) return { error: "There must be at least one active owner." };
  must(await getDb().from("admin_users").update({ active }).eq("id", id));
  await audit(admin, active ? "team_activate" : "team_deactivate", "admin_user", id);
  revalidatePath("/admin/settings/team");
  return { ok: active ? "Reactivated." : "Deactivated. They can no longer sign in." };
}
