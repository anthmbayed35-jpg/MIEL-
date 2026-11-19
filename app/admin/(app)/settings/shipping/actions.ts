"use server";

import { revalidatePath } from "next/cache";
import { guarded, orFail } from "@/lib/version";
import { audit } from "@/lib/audit";
import { requirePerm } from "@/lib/auth";
import { getDb, must, type Row } from "@/lib/db";
import { addEvent } from "@/lib/orders";
import type { ActionState } from "@/components/admin/ActionForm";

const done = () => {
  revalidatePath("/admin/settings/shipping");
  revalidatePath("/", "layout"); // zones appear at checkout
};

export async function saveZone(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("shipping.manage");
  const db = getDb();
  const id = String(fd.get("id") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { error: "Give the zone a name." };
  const fee = Number(fd.get("fee"));
  if (!Number.isFinite(fee) || fee < 0) return { error: "Enter a valid delivery fee." };
  const row = {
    name, fee, free_over: String(fd.get("free_over") ?? "").trim() === "" ? null : Number(fd.get("free_over")),
    eta: String(fd.get("eta") ?? "").trim(), active: fd.get("active") === "on",
  };
  try {
    if (id) must(await guarded(db.from("shipping_zones").update(row).eq("id", id), fd));
    else {
      const n = (must(await db.from("shipping_zones").select("id")) as Row[]).length;
      must(await db.from("shipping_zones").insert({ ...row, sort: n + 1 }));
    }
  } catch (e) {
    return { error: /duplicate|unique/i.test((e as Error).message) ? "A zone with that name exists." : (e as Error).message };
  }
  await audit(admin, id ? "zone_update" : "zone_create", "shipping_zone", id || name, row);
  done();
  return { ok: id ? "Zone saved." : `Zone ${name} added.` };
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
  const orders = (must(await (partner ? q.eq("delivery_partner_id", partner) : q.is("delivery_partner_id", null))) as Row[]).filter((o) => !["cancelled", "returned"].includes(o.status));
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
