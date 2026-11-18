/**
 * Remove demo data safely.
 *
 *   npm run purge-demo                 dry run: shows what would be deleted and what is ambiguous
 *   npm run purge-demo -- --confirm    backs everything up to /backups/<timestamp>/*.csv, then deletes
 *
 * HOW DEMO ROWS ARE IDENTIFIED: only rows with is_demo = true (orders, customers, stock_movements, discounts,
 * abandoned_checkouts, events, delivery_partners, batches). Their child rows (order_items, order_events) are
 * removed with their orders. Nothing is ever matched by name, date or guess.
 *
 * AMBIGUOUS rows are LISTED AND SKIPPED, never deleted:
 *   - a demo customer that also has a real (non-demo) order
 *   - a demo discount / delivery partner used by a real order
 * Resolve those by hand, then re-run.
 *
 * Stock: the quantities added or taken by demo stock movements are reversed (never below zero).
 * Afterwards, if no orders remain, the order counter is reset so the first real order is #1001.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { assertEnv } from "../lib/env";

type Row = Record<string, any>;
const csv = (rows: Row[]) => {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => `"${(typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "")).replace(/"/g, '""')}"`;
  return "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
};

async function main() {
  const confirm = process.argv.includes("--confirm");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  assertEnv();
  const db = createClient(url, key, { auth: { persistSession: false } });
  const get = async (table: string, filter?: (q: any) => any): Promise<Row[]> => {
    const q = db.from(table).select("*");
    const r = await (filter ? filter(q) : q);
    if (r.error) throw new Error(`${table}: ${r.error.message}`);
    return r.data ?? [];
  };

  const orders = await get("orders", (q) => q.eq("is_demo", true));
  const orderIds = orders.map((o) => o.id);
  const realOrders = await get("orders", (q) => q.eq("is_demo", false));
  const items = orderIds.length ? await get("order_items", (q) => q.in("order_id", orderIds)) : [];
  const events = orderIds.length ? await get("order_events", (q) => q.in("order_id", orderIds)) : [];
  const customers = await get("customers", (q) => q.eq("is_demo", true));
  const discounts = await get("discounts", (q) => q.eq("is_demo", true));
  const partners = await get("delivery_partners", (q) => q.eq("is_demo", true));
  const moves = await get("stock_movements", (q) => q.eq("is_demo", true));
  const abandoned = await get("abandoned_checkouts", (q) => q.eq("is_demo", true));
  const evts = await get("events", (q) => q.eq("is_demo", true));
  const batches = await get("batches", (q) => q.eq("is_demo", true));

  // Ambiguity checks
  const realCustomerIds = new Set(realOrders.map((o) => o.customer_id));
  const keepCustomers = customers.filter((c) => realCustomerIds.has(c.id));
  const realCodes = new Set(realOrders.map((o) => o.discount_code).filter(Boolean));
  const keepDiscounts = discounts.filter((d) => realCodes.has(d.code));
  const realPartnerIds = new Set(realOrders.map((o) => o.delivery_partner_id).filter(Boolean));
  const keepPartners = partners.filter((p) => realPartnerIds.has(p.id));

  const plan = {
    orders, order_items: items, order_events: events,
    customers: customers.filter((c) => !realCustomerIds.has(c.id)),
    discounts: discounts.filter((d) => !realCodes.has(d.code)),
    delivery_partners: partners.filter((p) => !realPartnerIds.has(p.id)),
    stock_movements: moves, abandoned_checkouts: abandoned, events: evts, batches,
  };

  console.log(confirm ? "PURGE (will delete after backup)" : "DRY RUN (nothing is deleted)");
  for (const [t, rows] of Object.entries(plan)) console.log(`  ${t.padEnd(20)} ${rows.length}`);
  if (keepCustomers.length || keepDiscounts.length || keepPartners.length) {
    console.log("\nAMBIGUOUS, SKIPPED (marked demo but connected to REAL orders). Decide what to do with these:");
    for (const c of keepCustomers) console.log(`  customer  ${c.id}  ${c.name}  ${c.phone}`);
    for (const d of keepDiscounts) console.log(`  discount  ${d.id}  ${d.code}`);
    for (const p of keepPartners) console.log(`  partner   ${p.id}  ${p.name}`);
  }
  if (!confirm) {
    console.log("\nRe-run with --confirm to back up to /backups and delete.");
    return;
  }

  // 1. Backup (outside git: /backups is git-ignored)
  const dir = path.join(process.cwd(), "backups", new Date().toISOString().replace(/[:.]/g, "-"));
  fs.mkdirSync(dir, { recursive: true });
  for (const [t, rows] of Object.entries(plan)) if (rows.length) fs.writeFileSync(path.join(dir, `${t}.csv`), csv(rows));
  console.log(`\nBackup written to ${dir}`);

  // 2. Reverse demo stock movements on inventory
  const per = new Map<string, number>();
  for (const m of moves) per.set(m.inventory_item_id, (per.get(m.inventory_item_id) ?? 0) + m.delta);
  for (const [item, delta] of per) {
    const cur = (await get("inventory_items", (q) => q.eq("id", item)))[0]?.on_hand ?? 0;
    const next = Math.max(0, cur - delta);
    if (cur - delta < 0) console.log(`  note: stock for item ${item} would go negative (${cur - delta}); set to 0`);
    await db.from("inventory_items").update({ on_hand: next }).eq("id", item);
  }

  // 3. Delete (children first)
  const del = async (table: string, ids: string[]) => {
    for (let i = 0; i < ids.length; i += 200) {
      const r = await db.from(table).delete().in("id", ids.slice(i, i + 200));
      if (r.error) throw new Error(`${table}: ${r.error.message}`);
    }
  };
  await del("order_events", events.map((r) => r.id));
  await del("order_items", items.map((r) => r.id));
  await del("stock_movements", moves.map((r) => r.id));
  await del("orders", orders.map((r) => r.id));
  await del("customers", plan.customers.map((r) => r.id));
  await del("discounts", plan.discounts.map((r) => r.id));
  await del("delivery_partners", plan.delivery_partners.map((r) => r.id));
  await del("abandoned_checkouts", abandoned.map((r) => r.id));
  await del("events", evts.map((r) => r.id));
  await del("batches", batches.map((r) => r.id));
  await db.from("audit_log").insert({ actor_email: "system", action: "purge_demo", entity: "demo", entity_id: "", details: { orders: orders.length, backup: path.basename(dir) } });

  // 4. Order numbering: first real order is #1001
  const left = await db.from("orders").select("id", { count: "exact", head: true });
  if ((left.count ?? 0) === 0) {
    const r = await db.rpc("reset_order_sequence");
    console.log(r.error ? `  could not reset the order counter: ${r.error.message}` : "  order counter reset: the next order will be #1001");
  } else console.log(`  ${left.count} real order(s) exist, so the order counter was left alone.`);
  console.log("Done.");
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
