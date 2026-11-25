import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { getEngine } from "../../lib/db/core";
import { checkLedger } from "@/lib/ledger";
import { placeOrder, setOrderStatus } from "@/lib/orders";
import { saveDiscount } from "@/app/admin/(app)/marketing/actions";
import { saveFreeOver } from "@/app/admin/(app)/settings/shipping/actions";
import { saveCustomer } from "@/app/admin/(app)/customers/actions";
import { changeStatus, saveDelivery } from "@/app/admin/(app)/orders/actions";
import { h, ID, resetState } from "../support/state";
import { seedStore } from "../support/seed";

let S: Awaited<ReturnType<typeof seedStore>>;
const sql = () => getEngine().sqlite;
const stock = () => (sql().prepare("SELECT on_hand FROM inventory_items WHERE product_id = ?").get(S.gold.id) as { on_hand: number }).on_hand;
const person = (n: number) => ({ name: `Customer ${n}`, phone: `03 ${String(n).padStart(6, "0")}`, address: "Hamra, Bldg 5" });
const buy = (n: number, qty = 1, extra: object = {}) => placeOrder({ customer: person(n), items: [{ productId: S.gold.id, qty }], region: "Beirut", source: "web", actor: "customer", ...extra });
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};

beforeEach(async () => {
  resetState();
  S = await seedStore();
  // opening stock goes through the ledger like a real receipt, so the invariant holds from the start
  sql().prepare("UPDATE inventory_items SET on_hand = 1").run();
  sql().prepare("DELETE FROM stock_movements").run();
  sql().prepare("INSERT INTO stock_movements (id, inventory_item_id, delta, reason, actor) SELECT ?||id, id, 1, 'receive', 'test' FROM inventory_items").run("m-");
  h.user = { id: ID.owner, email: "owner@example.com" };
});

describe("stock ledger: displayed stock always equals the sum of movements", () => {
  it("parallel checkouts for the last unit: one wins, the ledger balances", () => {
    const results = Array.from({ length: 12 }, (_, i) => {
      try {
        return buy(i + 1, 1);
      } catch (e) {
        return e as Error;
      }
    });
    expect(results.filter((r) => !(r instanceof Error))).toHaveLength(1);
    expect(stock()).toBe(0);
    expect(checkLedger()).toEqual([]);
  });

  it("double submit with the same idempotency key takes one unit and keeps the ledger balanced", () => {
    sql().prepare("UPDATE inventory_items SET on_hand = 5 WHERE product_id = ?").run(S.gold.id);
    sql().prepare("INSERT INTO stock_movements (id, inventory_item_id, delta, reason, actor) SELECT 'top-up', id, 4, 'receive', 't' FROM inventory_items WHERE product_id = ?").run(S.gold.id);
    const key = crypto.randomUUID();
    const a = buy(1, 1, { idempotencyKey: key });
    const b = buy(1, 1, { idempotencyKey: key });
    expect(b.order.id).toBe(a.order.id);
    expect(stock()).toBe(4);
    expect(checkLedger()).toEqual([]);
  });

  it("cancel, repeated cancel, and return each restore exactly once", async () => {
    const { order } = buy(1, 1);
    expect(stock()).toBe(0);
    await setOrderStatus(order.id, "cancelled", "t", { reason: "test" });
    await setOrderStatus(order.id, "cancelled", "t", { reason: "test" });
    await expect(setOrderStatus(order.id, "returned", "t")).rejects.toThrow();
    expect(stock()).toBe(1);
    expect(checkLedger()).toEqual([]);
    const { order: o2 } = buy(2, 1);
    for (const s of ["confirmed", "delivered", "returned"] as const) await setOrderStatus(o2.id, s, "t");
    expect(stock()).toBe(1);
    expect(checkLedger()).toEqual([]);
  });

  it("an order that fails half-way leaves no stock or ledger trace", () => {
    expect(() => placeOrder({ customer: person(3), items: [{ productId: S.gold.id, qty: 1 }, { productId: S.gold.id, qty: 5 }], region: "Beirut", source: "web", actor: "c" })).toThrow();
    expect(stock()).toBe(1);
    expect(checkLedger()).toEqual([]);
  });
});

describe("two admin tabs: a stale save is refused with a clear message, never a silent overwrite", () => {
  it("order status", async () => {
    const { order } = buy(1, 1);
    const a = await changeStatus({}, form({ id: order.id, version: String(order.version), to: "confirmed" }));
    expect(a?.ok).toBeTruthy();
    const b = await changeStatus({}, form({ id: order.id, version: String(order.version), to: "packed" }));
    expect(b?.error).toMatch(/Someone else changed/);
    expect((sql().prepare("SELECT status FROM orders WHERE id = ?").get(order.id) as { status: string }).status).toBe("confirmed");
  });

  it("order delivery details", async () => {
    const { order } = buy(1, 1);
    await saveDelivery({}, form({ id: order.id, version: String(order.version), tracking: "AAA" }));
    const stale = await saveDelivery({}, form({ id: order.id, version: String(order.version), tracking: "BBB" }));
    expect(stale?.error).toMatch(/Someone else changed/);
    expect((sql().prepare("SELECT tracking_number t FROM orders WHERE id = ?").get(order.id) as { t: string }).t).toBe("AAA");
  });

  it("discounts, shipping zones and customers", async () => {
    const mk = { code: "WELCOME10", type: "percent", value: "10", active: "on" };
    await saveDiscount({}, form(mk));
    const d = sql().prepare("SELECT id, version FROM discounts WHERE code = 'WELCOME10'").get() as { id: string; version: number };
    expect((await saveDiscount({}, form({ ...mk, id: d.id, version: String(d.version), value: "15" })))?.error).toBeUndefined();
    expect((await saveDiscount({}, form({ ...mk, id: d.id, version: String(d.version), value: "20" })))?.error).toMatch(/Someone else changed/);
    expect((sql().prepare("SELECT value_x100 v FROM discounts WHERE id = ?").get(d.id) as { v: number }).v).toBe(1500);

    const z = sql().prepare("SELECT id, version FROM shipping_zones LIMIT 1").get() as { id: string; version: number };
    const zf = { id: z.id, version: String(z.version), free_over: "70" };
    expect((await saveFreeOver({}, form(zf)))?.error).toBeUndefined();
    expect((await saveFreeOver({}, form({ ...zf, free_over: "99" })))?.error).toMatch(/Someone else changed/);

    const c = placeOrderCustomer();
    const cf = { id: c.id, version: String(c.version), name: "First", tags: "vip", notes: "" };
    expect((await saveCustomer({}, form(cf)))?.error).toBeUndefined();
    expect((await saveCustomer({}, form({ ...cf, name: "Second" })))?.error).toMatch(/Someone else changed/);
    expect((sql().prepare("SELECT name FROM customers WHERE id = ?").get(c.id) as { name: string }).name).toBe("First");
  });
});

function placeOrderCustomer() {
  const { customer } = buy(77, 1);
  return sql().prepare("SELECT id, version FROM customers WHERE id = ?").get(customer.id) as { id: string; version: number };
}
