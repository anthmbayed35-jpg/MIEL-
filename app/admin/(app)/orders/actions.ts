"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requirePerm } from "@/lib/auth";
import { getDb, must, type Row } from "@/lib/db";
import { formVersion, guarded, orFail } from "@/lib/version";
import { addEvent, createOrder, setOrderStatus } from "@/lib/orders";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/status";
import type { ActionState } from "@/components/admin/ActionForm";

const done = (id?: string) => {
  revalidatePath("/admin/orders");
  if (id) revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin");
};
const fail = (e: unknown): ActionState => ({ error: e instanceof Error ? e.message : "Something went wrong." });

export async function changeStatus(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("orders.write");
  const id = String(fd.get("id"));
  const to = String(fd.get("to")) as OrderStatus;
  if (!ORDER_STATUSES.includes(to)) return { error: "Unknown status." };
  try {
    await setOrderStatus(id, to, admin.email, { reason: String(fd.get("reason") ?? ""), expectedVersion: formVersion(fd) });
    await audit(admin, "order_status", "order", id, { to });
    done(id);
    return { ok: `Status changed to ${to.replace(/_/g, " ")}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function bulkStatus(ids: string[], to: OrderStatus): Promise<ActionState> {
  const admin = await requirePerm("orders.write");
  if (!ORDER_STATUSES.includes(to) || to === "cancelled") return { error: "Choose a status (cancel orders one by one, with a reason)." };
  let ok = 0;
  const errors: string[] = [];
  for (const id of ids) {
    try {
      await setOrderStatus(id, to, admin.email);
      ok++;
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  await audit(admin, "order_bulk_status", "order", ids.join(","), { to, ok });
  done();
  return errors.length ? { error: `Updated ${ok}, skipped ${errors.length}: ${errors[0]}` } : { ok: `Updated ${ok} order(s) to ${to.replace(/_/g, " ")}.` };
}

export async function toggleCod(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(() => toggleCodImpl(_p, fd));
}

async function toggleCodImpl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("orders.write");
  const id = String(fd.get("id"));
  const collected = fd.get("collected") === "1";
  const o = must(await getDb().from("orders").select("*").eq("id", id).single()) as Row;
  if (["cancelled", "draft"].includes(o.status)) return { error: "This order can't take payment." };
  must(await guarded(getDb().from("orders").update({ cod_collected: collected, payment_status: collected ? "collected" : "pending", cod_settled_at: collected ? o.cod_settled_at : null, updated_at: new Date().toISOString() }).eq("id", id), fd));
  await addEvent(id, "payment", collected ? `COD collected: $${Number(o.cod_amount_due).toFixed(2)}` : "COD marked as not collected", admin.email);
  await audit(admin, collected ? "cod_collected" : "cod_uncollected", "order", id);
  done(id);
  return { ok: collected ? "Marked as collected." : "Marked as not collected." };
}

export async function saveDelivery(_p: ActionState, fd: FormData): Promise<ActionState> {
  return orFail(() => saveDeliveryImpl(_p, fd));
}

async function saveDeliveryImpl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("orders.write");
  const id = String(fd.get("id"));
  const partner = String(fd.get("partner") ?? "") || null;
  const tracking = String(fd.get("tracking") ?? "").trim().slice(0, 80);
  must(await guarded(getDb().from("orders").update({ delivery_partner_id: partner, tracking_number: tracking, updated_at: new Date().toISOString() }).eq("id", id), fd));
  await addEvent(id, "delivery", `Delivery updated${tracking ? `: tracking ${tracking}` : ""}`, admin.email);
  await audit(admin, "order_delivery", "order", id, { partner, tracking });
  done(id);
  return { ok: "Delivery details saved." };
}

export async function addComment(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("orders.write");
  const id = String(fd.get("id"));
  const text = String(fd.get("text") ?? "").trim();
  if (!text) return { error: "Write a comment first." };
  await addEvent(id, "comment", text.slice(0, 1000), admin.name || admin.email);
  done(id);
  return { ok: "Comment added." };
}

export async function cancelOrder(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("orders.write");
  const id = String(fd.get("id"));
  try {
    await setOrderStatus(id, "cancelled", admin.email, { reason: String(fd.get("reason") ?? ""), expectedVersion: formVersion(fd) });
    await audit(admin, "order_cancel", "order", id, { reason: fd.get("reason") });
    done(id);
    return { ok: "Order cancelled and stock restored." };
  } catch (e) {
    return fail(e);
  }
}

/** Return flow: marks the order returned, restores stock, and refunds the COD if it had been collected. */
export async function returnOrder(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("orders.write");
  const id = String(fd.get("id"));
  const note = String(fd.get("note") ?? "").trim();
  try {
    const before = must(await getDb().from("orders").select("*").eq("id", id).single()) as Row;
    if (before.status !== "delivered") return { error: "Only delivered orders can be returned." };
    await setOrderStatus(id, "returned", admin.email, { message: `Returned${note ? `: ${note}` : ""} (stock restored)`, expectedVersion: formVersion(fd) });
    if (before.cod_collected) await addEvent(id, "refund", `Refund due to customer: $${Number(before.total).toFixed(2)}`, admin.email);
    await audit(admin, "order_return", "order", id, { note });
    done(id);
    return { ok: before.cod_collected ? "Returned. Stock restored. Refund noted." : "Returned. Stock restored." };
  } catch (e) {
    return fail(e);
  }
}

/** Manual / WhatsApp order, or a draft. Items arrive as qty_<productId> fields. */
export async function createManualOrder(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("orders.write");
  const items = [...fd.entries()]
    .filter(([k, v]) => k.startsWith("qty_") && Number(v) > 0)
    .map(([k, v]) => ({ productId: k.slice(4), qty: Math.min(99, Math.floor(Number(v))) }));
  if (!items.length) return { error: "Add at least one product." };
  const draft = fd.get("intent") === "draft";
  let id = "";
  try {
    const { order } = await createOrder({
      customer: {
        name: String(fd.get("name") ?? ""), phone: String(fd.get("phone") ?? ""), address: String(fd.get("address") ?? ""),
        notes: String(fd.get("notes") ?? ""),
      },
      items, region: String(fd.get("region") ?? ""), code: String(fd.get("code") ?? ""),
      source: fd.get("source") === "whatsapp" ? "whatsapp" : "manual", draft, actor: admin.email,
    });
    id = order.id;
    await audit(admin, draft ? "order_draft" : "order_create", "order", id);
  } catch (e) {
    return fail(e);
  }
  done(id);
  redirect(`/admin/orders/${id}`);
}
