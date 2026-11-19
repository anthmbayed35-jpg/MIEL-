import { spawn } from "node:child_process";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { getEngine } from "../../lib/db/core";
import { placeOrder, setOrderStatus } from "@/lib/orders";
import { resetState, testDir } from "../support/state";
import { seedStore } from "../support/seed";

let S: Awaited<ReturnType<typeof seedStore>>;
const sql = () => getEngine().sqlite;
const stock = (productId: string) => (sql().prepare("SELECT on_hand FROM inventory_items WHERE product_id = ?").get(productId) as { on_hand: number }).on_hand;
const person = (n: number) => ({ name: `Customer ${n}`, phone: `03 ${String(n).padStart(6, "0")}`, address: "Hamra, Bldg 5" });
const buy = (n: number, qty = 1, extra: object = {}) => placeOrder({ customer: person(n), items: [{ productId: S.gold.id, qty }], region: "Beirut", source: "web", actor: "customer", ...extra });

beforeEach(async () => {
  resetState();
  S = await seedStore();
  sql().prepare("UPDATE inventory_items SET on_hand = 10 WHERE product_id = ?").run(S.gold.id);
});

describe("stock cannot go negative under concurrent orders", () => {
  it("50 concurrent orders against 10 in stock: exactly 10 succeed, 40 are refused, stock ends at 0", async () => {
    const results = await Promise.allSettled(Array.from({ length: 50 }, (_, i) => Promise.resolve().then(() => buy(i + 1))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    const refused = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(refused).toHaveLength(40);
    for (const r of refused) expect(String(r.reason.message)).toMatch(/out of stock/);
    expect(stock(S.gold.id)).toBe(0);
    expect(sql().prepare("SELECT COUNT(*) n FROM orders").get()).toEqual({ n: 10 });
    expect(sql().prepare("SELECT COUNT(*) n FROM order_items").get()).toEqual({ n: 10 }); // refused orders left nothing behind
    expect(sql().prepare("SELECT COALESCE(SUM(delta),0) s FROM stock_movements WHERE inventory_item_id = (SELECT id FROM inventory_items WHERE product_id = ?)").get(S.gold.id)).toEqual({ s: -10 });
  });

  it("the same under REAL parallelism: 4 separate processes, each with its own connection to the same file", async () => {
    const run = (worker: number) =>
      new Promise<{ ok: number; failed: number }>((resolve, reject) => {
        const child = spawn(process.execPath, ["--import", "tsx", "--conditions=react-server", path.resolve(__dirname, "../support/order-worker.ts"), S.gold.id, "13", String(worker)], {
          env: { ...process.env, DATABASE_PATH: process.env.DATABASE_PATH, AUTH_SECRET: process.env.AUTH_SECRET },
          cwd: path.resolve(__dirname, "../.."),
        });
        let out = "";
        let err = "";
        child.stdout.on("data", (d) => (out += d));
        child.stderr.on("data", (d) => (err += d));
        child.on("close", (code) => (code === 0 ? resolve(JSON.parse(out.trim().split("\n").pop()!)) : reject(new Error(err || `exit ${code}`))));
      });
    const res = await Promise.all([1, 2, 3, 4].map(run));
    expect(res.reduce((n, r) => n + r.ok, 0)).toBe(10);
    expect(res.reduce((n, r) => n + r.failed, 0)).toBe(42);
    expect(stock(S.gold.id)).toBe(0);
    expect(sql().prepare("SELECT COUNT(*) n FROM orders").get()).toEqual({ n: 10 });
    expect((sql().prepare("SELECT COUNT(DISTINCT order_number) n FROM orders").get() as { n: number }).n).toBe(10); // no duplicate order numbers
    void testDir();
  }, 120_000);

  it("a failed order rolls back everything (customer, order, numbering gaps, discount use)", async () => {
    expect(() => buy(1, 11, { code: "WELCOME10" })).toThrow(/out of stock/);
    expect(sql().prepare("SELECT COUNT(*) n FROM customers").get()).toEqual({ n: 0 });
    expect(sql().prepare("SELECT COUNT(*) n FROM orders").get()).toEqual({ n: 0 });
    expect(sql().prepare("SELECT used_count FROM discounts WHERE code = 'WELCOME10'").get()).toEqual({ used_count: 0 });
    expect(sql().prepare("SELECT value FROM counters WHERE name = 'order_number'").get()).toEqual({ value: 1000 }); // the number was not burned
    expect((await buy(2)).order.order_number).toBe(1001);
  });

  it("a discount code with one use left is applied to exactly one of two customers", async () => {
    await Promise.all([1, 2].map((n) => Promise.resolve().then(() => buy(n, 1, { code: "WELCOME10" }))));
    // the second customer still gets an order, but without the exhausted code
    expect(sql().prepare("SELECT COUNT(*) n FROM orders WHERE discount_code = 'WELCOME10'").get()).toEqual({ n: 1 });
    expect(sql().prepare("SELECT used_count FROM discounts WHERE code = 'WELCOME10'").get()).toEqual({ used_count: 1 });
  });
});

describe("idempotency", () => {
  it("the same key twice returns the SAME order and takes stock once", async () => {
    const a = buy(1, 2, { idempotencyKey: "k-1" });
    const b = buy(1, 2, { idempotencyKey: "k-1" });
    expect(b.order.id).toBe(a.order.id);
    expect(b.replayed).toBe(true);
    expect(stock(S.gold.id)).toBe(8);
    expect(sql().prepare("SELECT COUNT(*) n FROM orders").get()).toEqual({ n: 1 });
    expect(b.quote.total).toBe(a.quote.total);
  });
  it("different keys are different orders", () => {
    expect(buy(1, 1, { idempotencyKey: "a" }).order.id).not.toBe(buy(2, 1, { idempotencyKey: "b" }).order.id);
  });
});

describe("cancel and return restore stock exactly once", () => {
  it("cancel restores, a second cancel changes nothing", async () => {
    const { order } = buy(1, 3);
    expect(stock(S.gold.id)).toBe(7);
    await setOrderStatus(order.id, "cancelled", "t", { reason: "customer asked" });
    expect(stock(S.gold.id)).toBe(10);
    await setOrderStatus(order.id, "cancelled", "t", { reason: "again" }); // already cancelled: a no-op
    await expect(setOrderStatus(order.id, "confirmed", "t")).rejects.toThrow(/can't change status/);
    expect(stock(S.gold.id)).toBe(10);
    expect(sql().prepare("SELECT COUNT(*) n FROM stock_movements WHERE reason = 'cancel_restore'").get()).toEqual({ n: 1 });
  });
  it("two simultaneous cancels restore once", async () => {
    const { order } = buy(1, 3);
    const r = await Promise.allSettled([setOrderStatus(order.id, "cancelled", "a", { reason: "x" }), setOrderStatus(order.id, "cancelled", "b", { reason: "y" })]);
    expect(r.every((x) => x.status === "fulfilled")).toBe(true); // the second one is a harmless no-op
    expect(stock(S.gold.id)).toBe(10);
    expect(sql().prepare("SELECT COUNT(*) n FROM stock_movements WHERE reason = 'cancel_restore'").get()).toEqual({ n: 1 });
  });
  it("return after delivery restores once and refunds a collected COD", async () => {
    const { order } = buy(1, 2);
    sql().prepare("UPDATE orders SET cod_collected = 1, payment_status = 'collected' WHERE id = ?").run(order.id);
    await setOrderStatus(order.id, "delivered", "t");
    await setOrderStatus(order.id, "returned", "t");
    expect(stock(S.gold.id)).toBe(10);
    expect(sql().prepare("SELECT payment_status FROM orders WHERE id = ?").get(order.id)).toEqual({ payment_status: "refunded" });
  });
  it("optimistic concurrency on status changes: a stale version is refused", async () => {
    const { order } = buy(1, 1);
    await setOrderStatus(order.id, "confirmed", "a", { expectedVersion: order.version });
    await expect(setOrderStatus(order.id, "packed", "b", { expectedVersion: order.version })).rejects.toThrow(/Someone else changed/);
  });
});

describe("money is stored as integer cents", () => {
  it("prices, totals and discounts are exact (no floating point drift)", async () => {
    sql().prepare("UPDATE products SET price_cents = 1999 WHERE id = ?").run(S.gold.id); // $19.99
    const { order, quote } = buy(1, 3, { code: "WELCOME10" });
    expect(quote.subtotal).toBe(59.97);
    expect(quote.discount).toBe(6); // 10% of 59.97 = 5.997 -> 6.00
    const row = sql().prepare("SELECT subtotal_cents, discount_total_cents, shipping_fee_cents, total_cents FROM orders WHERE id = ?").get(order.id) as Record<string, number>;
    expect(Object.values(row).every(Number.isInteger)).toBe(true);
    expect(row.subtotal_cents).toBe(5997);
    expect(row.total_cents).toBe(row.subtotal_cents - row.discount_total_cents + row.shipping_fee_cents);
  });
});
