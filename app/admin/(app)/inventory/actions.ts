"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requirePerm } from "@/lib/auth";
import { publish } from "@/lib/events";
import { getDb, must, type Row } from "@/lib/db";
import type { ActionState } from "@/components/admin/ActionForm";

const done = () => {
  publish({ type: "stock.changed" });
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
};

export async function adjustStock(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("inventory.write");
  const item = String(fd.get("item"));
  const amount = Math.floor(Number(fd.get("amount")));
  const dir = fd.get("dir") === "remove" ? -1 : 1;
  const reason = String(fd.get("reason") ?? "adjustment");
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a quantity above zero." };
  const res = await getDb().rpc("adjust_stock", { p_item: item, p_delta: dir * amount, p_reason: reason, p_note: String(fd.get("note") ?? "").trim(), p_actor: admin.email });
  if (res.error) return { error: /insufficient/.test(res.error.message) ? "That would take stock below zero." : res.error.message };
  await audit(admin, "stock_adjust", "inventory", item, { delta: dir * amount, reason });
  done();
  return { ok: `Stock is now ${res.data}.` };
}

export async function setThreshold(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("inventory.write");
  const item = String(fd.get("item"));
  const t = Math.max(0, Math.floor(Number(fd.get("threshold")) || 0));
  must(await getDb().from("inventory_items").update({ low_stock_threshold: t }).eq("id", item));
  await audit(admin, "stock_threshold", "inventory", item, { threshold: t });
  done();
  return { ok: "Low-stock threshold saved." };
}

export async function addBatch(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("inventory.write");
  const lot = String(fd.get("lot") ?? "").trim();
  const qty = Math.floor(Number(fd.get("qty")));
  if (!lot) return { error: "Enter the lot number." };
  if (!Number.isFinite(qty) || qty <= 0) return { error: "Enter the batch quantity." };
  const b = must(await getDb().from("batches").insert({ inventory_item_id: String(fd.get("item")), lot_number: lot, expiry_date: String(fd.get("expiry") ?? "") || null, quantity: qty, status: "incoming", received_at: null }).select().single()) as Row;
  await audit(admin, "batch_add", "batch", b.id, { lot, qty });
  done();
  return { ok: `Batch ${lot} added as incoming.` };
}

export async function receiveBatch(_p: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requirePerm("inventory.write");
  const db = getDb();
  const id = String(fd.get("batch"));
  const b = must(await db.from("batches").select("*").eq("id", id).single()) as Row;
  if (b.status === "received") return { error: "Already received." };
  const res = await db.rpc("adjust_stock", { p_item: b.inventory_item_id, p_delta: b.quantity, p_reason: "receive", p_note: `Batch ${b.lot_number}`, p_actor: admin.email });
  if (res.error) return { error: res.error.message };
  must(await db.from("batches").update({ status: "received", received_at: new Date().toISOString() }).eq("id", id));
  await audit(admin, "batch_receive", "batch", id, { lot: b.lot_number, qty: b.quantity });
  done();
  return { ok: `Received ${b.quantity} units. Stock is now ${res.data}.` };
}
