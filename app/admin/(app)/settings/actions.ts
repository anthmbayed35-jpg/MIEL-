"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requirePerm } from "@/lib/auth";
import { seedDemo, wipeDemo } from "@/lib/demo";
import { seedBase } from "@/lib/seed";
import type { ActionState } from "@/components/admin/ActionForm";

export async function seedStoreAction(): Promise<ActionState> {
  const admin = await requirePerm("settings.write");
  const { created } = await seedBase();
  await audit(admin, "seed_store", "store", "", { created });
  revalidatePath("/", "layout");
  return { ok: created ? `Added ${created} product(s) from the config.` : "Everything from the config is already in the database." };
}

export async function loadDemoAction(): Promise<ActionState> {
  const admin = await requirePerm("settings.write");
  try {
    const { orders } = await seedDemo(admin.email);
    await audit(admin, "load_demo", "demo", "", { orders });
    revalidatePath("/admin", "layout");
    return { ok: `Demo data loaded (${orders} orders). Wipe it any time below.` };
  } catch (e: any) {
    return { error: e?.message ?? "Could not load the demo data." };
  }
}

export async function wipeDemoAction(): Promise<ActionState> {
  const admin = await requirePerm("settings.write");
  const { orders } = await wipeDemo();
  await audit(admin, "wipe_demo", "demo", "", { orders });
  revalidatePath("/admin", "layout");
  return { ok: `Removed ${orders} demo orders and all other demo rows. Stock was restored.` };
}
