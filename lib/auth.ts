import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { dbMode, getDb, must } from "./db";
import { authClient } from "./supabase-server";
import { can, type Admin, type Perm, type Role } from "./roles";

export { can };
export type { Admin, Role, Perm };

export const LOCAL_COOKIE = "miel_local_admin";

/** The current admin, or null. Supabase mode: verified JWT + active row in admin_users. Local mode: demo cookie. */
export const getAdmin = cache(async (): Promise<Admin | null> => {
  const mode = dbMode();
  if (mode === "none") return null;
  if (mode === "local") {
    const role = (await cookies()).get(LOCAL_COOKIE)?.value as Role | undefined;
    if (role && ["owner", "manager", "staff"].includes(role)) {
      const name = role === "owner" ? "Nixtio" : role === "manager" ? "Maya" : "Karim";
      return { id: `local-${role}`, email: `${role}@demo.local`, name, role };
    }
    return null;
  }
  const supabase = await authClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const row = must(await getDb().from("admin_users").select("*").eq("id", data.user.id).maybeSingle());
  if (!row || !row.active) return null;
  return { id: row.id, email: row.email, name: row.name || row.email.split("@")[0], role: row.role };
});

export async function requireAdmin(): Promise<Admin> {
  const a = await getAdmin();
  if (!a) redirect("/admin/login");
  return a;
}

/** Use at the top of every admin page and server action. */
export async function requirePerm(perm: Perm): Promise<Admin> {
  const a = await requireAdmin();
  if (!can(a.role, perm)) redirect("/admin?denied=" + encodeURIComponent(perm));
  return a;
}
