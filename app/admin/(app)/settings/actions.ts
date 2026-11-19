"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requirePerm } from "@/lib/auth";
import { runBackup } from "@/lib/backup";
import { seedBase } from "@/lib/seed";
import { getDb, must, type Row } from "@/lib/db";
import type { ActionState } from "@/components/admin/ActionForm";

export async function seedStoreAction(): Promise<ActionState> {
  const admin = await requirePerm("settings.write");
  const { created } = await seedBase();
  await audit(admin, "seed_store", "store", "", { created });
  revalidatePath("/", "layout");
  return { ok: created ? `Added ${created} product(s) from the config.` : "Everything from the config is already in the database." };
}

/** Take a backup right now (owner only). */
export async function backupNow(): Promise<ActionState> {
  const admin = await requirePerm("backup.download");
  try {
    const r = await runBackup();
    await audit(admin, "backup_created", "backup", r.file, { offsite: r.offsite });
    revalidatePath("/admin/settings");
    return { ok: `Backup saved: ${r.file}${r.offsite ? " (and copied off-site)" : ""}.` };
  } catch (e) {
    return { error: `Backup failed: ${(e as Error).message}` };
  }
}

async function putSetting(key: string, value: unknown) {
  must(await getDb().from("settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" }));
}

export async function saveStore(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("settings.write");
  const whatsapp = String(fd.get("whatsapp") ?? "").replace(/\D/g, "");
  if (whatsapp && (whatsapp.length < 8 || whatsapp.length > 15)) return { error: "WhatsApp number: digits only with country code, e.g. 96170123456." };
  const prev = (must(await getDb().from("settings").select("*").eq("key", "store")) as Row[])[0]?.value ?? {};
  await putSetting("store", {
    ...prev,
    name: String(fd.get("name") ?? "").trim() || "MIEL+",
    email: String(fd.get("email") ?? "").trim(), phone: String(fd.get("phone") ?? "").trim(), whatsapp,
    instagram_handle: String(fd.get("instagram_handle") ?? "").trim(), instagram_url: String(fd.get("instagram_url") ?? "").trim(),
    currency: "USD", timezone: "Asia/Beirut", cod_enabled: fd.get("cod_enabled") === "on", free_delivery_note: String(fd.get("free_delivery_note") ?? "").trim(),
  });
  await audit(admin, "settings_store", "settings", "store", { whatsapp: !!whatsapp, cod: fd.get("cod_enabled") === "on" });
  revalidatePath("/", "layout");
  return { ok: "Store settings saved." };
}

export async function saveNotifications(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("settings.write");
  await putSetting("notifications", {
    email: String(fd.get("email") ?? "").trim(), whatsapp_number: String(fd.get("whatsapp_number") ?? "").replace(/\D/g, ""),
    email_on_new_order: fd.get("email_on_new_order") === "on", whatsapp_on_new_order: fd.get("whatsapp_on_new_order") === "on",
  });
  await audit(admin, "settings_notifications", "settings", "notifications");
  return { ok: "Notification preferences saved." };
}

export async function savePolicies(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("settings.write");
  await putSetting("policies", {
    shipping: String(fd.get("shipping") ?? ""), returns: String(fd.get("returns") ?? ""), privacy: String(fd.get("privacy") ?? ""), terms: String(fd.get("terms") ?? ""),
  });
  await audit(admin, "settings_policies", "settings", "policies");
  revalidatePath("/", "layout");
  return { ok: "Policy pages saved. They are live at /policies/shipping, /returns, /privacy and /terms." };
}

/** Owner-only: require 2FA for every team member. People without it are sent to set it up at their next request. */
export async function saveSecurity(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("settings.write");
  const require2fa = fd.get("require_2fa") === "on";
  await putSetting("security", { require_2fa: require2fa });
  await audit(admin, "settings_security", "settings", "security", { require_2fa: require2fa });
  return { ok: require2fa ? "Two-factor authentication is now required for everyone." : "Two-factor authentication is optional again." };
}
