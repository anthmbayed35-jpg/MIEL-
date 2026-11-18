"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { LOCAL_COOKIE } from "@/lib/auth";
import { dbMode, getDb, must } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { authClient } from "@/lib/supabase-server";
import type { ActionState } from "@/components/admin/ActionForm";

export async function login(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const mode = dbMode();
  if (mode === "none") return { error: "Admin isn't configured on this deployment yet. See the setup steps." };

  if (mode === "local") {
    const role = String(fd.get("role") ?? "owner");
    if (!["owner", "manager", "staff"].includes(role)) return { error: "Pick a role." };
    (await cookies()).set(LOCAL_COOKIE, role, { httpOnly: true, sameSite: "lax", path: "/" });
    redirect("/admin");
  }

  const ip = ((await headers()).get("x-forwarded-for") ?? "u").split(",")[0].trim();
  if (!rateLimit(`login:${ip}`, 8, 10 * 60_000)) return { error: "Too many attempts. Wait a few minutes and try again." };

  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await authClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "Wrong email or password." };

  // Only people listed (and active) in admin_users may enter, even if they hold a valid Supabase account.
  const row = must(await getDb().from("admin_users").select("*").eq("id", data.user.id).maybeSingle());
  if (!row || !row.active) {
    await supabase.auth.signOut();
    return { error: "This account doesn't have admin access." };
  }
  await audit({ id: row.id, email: row.email }, "login", "admin_user", row.id);
  redirect("/admin");
}

export async function logout() {
  const mode = dbMode();
  if (mode === "local") (await cookies()).delete(LOCAL_COOKIE);
  else if (mode === "supabase") await (await authClient()).auth.signOut();
  redirect("/admin/login");
}
