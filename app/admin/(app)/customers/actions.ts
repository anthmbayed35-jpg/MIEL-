"use server";

import { revalidatePath } from "next/cache";
import { guarded, orFail } from "@/lib/version";
import { audit } from "@/lib/audit";
import { requirePerm } from "@/lib/auth";
import { getDb, must } from "@/lib/db";
import type { ActionState } from "@/components/admin/ActionForm";

export async function saveCustomer(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(() => saveCustomerImpl(_p, fd));
}

async function saveCustomerImpl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("customers.write");
  const id = String(fd.get("id"));
  const tags = String(fd.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 12);
  must(await guarded(getDb().from("customers").update({ tags, notes: String(fd.get("notes") ?? "").slice(0, 2000), name: String(fd.get("name") ?? "").trim() || "Customer" }).eq("id", id), fd));
  await audit(admin, "customer_update", "customer", id, { tags });
  revalidatePath(`/admin/customers/${id}`);
  revalidatePath("/admin/customers");
  return { ok: "Customer saved." };
}

export async function toggleBlock(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("customers.block");
  const id = String(fd.get("id"));
  const blocked = fd.get("blocked") === "1";
  must(await getDb().from("customers").update({ blocked }).eq("id", id));
  await audit(admin, blocked ? "customer_block" : "customer_unblock", "customer", id);
  revalidatePath(`/admin/customers/${id}`);
  revalidatePath("/admin/customers");
  return { ok: blocked ? "Customer blocked. They can't order online." : "Customer unblocked." };
}
