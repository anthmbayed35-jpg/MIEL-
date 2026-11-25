"use server";

import { revalidatePath } from "next/cache";
import { guarded, orFail } from "@/lib/version";
import { saveVersioned } from "@/lib/versioned";
import { audit } from "@/lib/audit";
import { requirePerm } from "@/lib/auth";
import { getDb, must, type Row } from "@/lib/db";
import { addEvent } from "@/lib/orders";
import type { ActionState } from "@/components/admin/ActionForm";

const done = () => {
  revalidatePath("/admin/settings/shipping");
  revalidatePath("/", "layout"); // the fee appears in the cart and at checkout
};

/** The ONE delivery fee for every order in every region (USD). Orders already placed keep the fee they were created with. */
export async function saveDeliveryFee(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(async () => {
    const admin = await requirePerm("shipping.manage");
    const raw = String(fd.get("fee") ?? "").trim();
    const fee = Number(raw);
    if (raw === "" || !Number.isFinite(fee) || fee < 0 || fee > 1000) return { error: "Enter a delivery fee between 0 and 1000 (for example 5)." };
    const value = { fee: Math.round(fee * 100) / 100 };
    saveVersioned("settings", "delivery", value, fd);
    await audit(admin, "delivery_fee_update", "settings", "delivery", value);
    done();
    return { ok: `Delivery fee saved: $${value.fee.toFixed(2)} for every order.` };
  });
}

/** The free-delivery line of a zone (unchanged behaviour: above this products value, after discounts, delivery is free). */
export async function saveFreeOver(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("shipping.manage");
  const db = getDb();
  const id = String(fd.get("id") ?? "");
  const raw = String(fd.get("free_over") ?? "").trim();
  const freeOver = raw === "" ? null : Number(raw);
  if (freeOver !== null && (!Number.isFinite(freeOver) || freeOver < 0)) return { error: "Enter a valid amount, or leave it empty for no free-delivery line." };
  try {
    must(await guarded(db.from("shipping_zones").update({ free_over: freeOver }).eq("id", id), fd));
  } catch (e) {
    return { error: (e as Error).message };
  }
  await audit(admin, "free_delivery_line_update", "shipping_zone", id, { free_over: freeOver });
  done();
  return { ok: "Saved." };
}

export async function savePartner(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(() => savePartnerImpl(_p, fd));
}

async function savePartnerImpl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("shipping.manage");
  const db = getDb();
  const id = String(fd.get("id") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { error: "Give the partner a name." };
  const row = { name, phone: String(fd.get("phone") ?? "").trim(), notes: String(fd.get("notes") ?? "").trim(), active: fd.get("active") === "on" };
  if (id) must(await guarded(db.from("delivery_partners").update(row).eq("id", id), fd));
  else must(await db.from("delivery_partners").insert({ ...row, is_demo: false }));
  await audit(admin, id ? "partner_update" : "partner_create", "delivery_partner", id || name);
  done();
  return { ok: id ? "Partner saved." : `Partner ${name} added.` };
}

/** Mark all collected-but-unsettled COD orders of a partner as settled (cash handed over to the store). */
export async function settlePartner(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("shipping.manage");
  const db = getDb();
  const partner = String(fd.get("partner") ?? "");
  const q = db.from("orders").select("*").eq("cod_collected", true).is("cod_settled_at", null);
  const orders = (must(await (partner ? q.eq("delivery_partner_id", partner) : q.is("delivery_partner_id", null))) as Row[]).filter((o) => !["cancelled", "returned", "refused"].includes(o.status));
  if (!orders.length) return { error: "Nothing to settle." };
  const now = new Date().toISOString();
  let sum = 0;
  for (const o of orders) {
    must(await db.from("orders").update({ cod_settled_at: now }).eq("id", o.id));
    await addEvent(o.id, "payment", "COD settled with the store", admin.email);
    sum += Number(o.cod_amount_due);
  }
  await audit(admin, "cod_settle", "delivery_partner", partner || "unassigned", { orders: orders.length, amount: sum });
  done();
  revalidatePath("/admin/orders");
  return { ok: `Settled ${orders.length} orders ($${sum.toFixed(2)}).` };
}
