import { createLocalClient } from "./local-db";
import { ID } from "./state";

/** Minimal store: a team (owner/manager/staff), two products with stock, zones, a discount. */
export async function seedStore() {
  const db = createLocalClient() as any;
  await db.from("admin_users").insert([
    { id: ID.owner, email: "owner@t.test", name: "Owner", role: "owner", active: true },
    { id: ID.manager, email: "manager@t.test", name: "Manager", role: "manager", active: true },
    { id: ID.staff, email: "staff@t.test", name: "Staff", role: "staff", active: true },
  ]);
  const gold = (await db.from("products").insert({ slug: "gold", kind: "single", name: "GOLD", price: 30, status: "active", sort: 1, bundle_items: null }).select().single()).data;
  const red = (await db.from("products").insert({ slug: "red-burn", kind: "single", name: "RED BURN", price: 30, status: "active", sort: 0, bundle_items: null }).select().single()).data;
  await db.from("inventory_items").insert([
    { product_id: gold.id, sku: "G", on_hand: 5, low_stock_threshold: 2 },
    { product_id: red.id, sku: "R", on_hand: 50, low_stock_threshold: 10 },
  ]);
  await db.from("shipping_zones").insert([
    { name: "Beirut", fee: 3, free_over: 60, eta: "1 day", active: true, sort: 1 },
    { name: "Bekaa", fee: 6, free_over: null, eta: "3 days", active: true, sort: 2 },
  ]);
  await db.from("discounts").insert({ code: "WELCOME10", type: "percent", value: 10, min_order: 0, product_ids: null, starts_at: null, ends_at: null, usage_limit: 1, used_count: 0, active: true, is_demo: false });
  return { gold, red, db };
}
