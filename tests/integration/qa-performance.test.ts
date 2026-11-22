import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { getEngine } from "../../lib/db/core";
import { checkLedger } from "@/lib/ledger";
import { h, resetState, testDir } from "../support/state";
import { USERS } from "../support/e2e-env";
import { qaSeed } from "../support/qa-seed";

const sp = (o: Record<string, string> = {}) => Promise.resolve(o);

/** The big realistic data set: 200 products, 2,000 customers, 5,000 orders. */
beforeAll(async () => {
  resetState();
  const counts = await qaSeed(path.join(testDir(), "qa"), { orders: 5000, customers: 2000, products: 200 });
  expect(counts).toMatchObject({ customers: 2000, orders: 5000 });
  getEngine(); // reopen
  h.user = { id: USERS.owner.id, email: USERS.owner.email };
}, 120_000);

const PAGES: [string, () => Promise<any>, Record<string, string>, number][] = [
  ["dashboard", () => import("@/app/admin/(app)/page"), {}, 1500],
  ["orders", () => import("@/app/admin/(app)/orders/page"), {}, 800],
  ["orders, searched", () => import("@/app/admin/(app)/orders/page"), { q: "Khoury" }, 800],
  ["orders, page 50", () => import("@/app/admin/(app)/orders/page"), { page: "50" }, 800],
  ["orders, COD pending", () => import("@/app/admin/(app)/orders/page"), { cod: "pending" }, 800],
  ["products", () => import("@/app/admin/(app)/products/page"), {}, 800],
  ["inventory", () => import("@/app/admin/(app)/inventory/page"), {}, 800],
  ["inventory, low stock", () => import("@/app/admin/(app)/inventory/page"), { stock: "low" }, 800],
  ["customers", () => import("@/app/admin/(app)/customers/page"), {}, 800],
  ["customers, searched", () => import("@/app/admin/(app)/customers/page"), { q: "Rami" }, 800],
  ["discounts", () => import("@/app/admin/(app)/marketing/discounts/page"), {}, 800],
  ["analytics", () => import("@/app/admin/(app)/analytics/page"), {}, 1500],
  ["affiliates", () => import("@/app/admin/(app)/affiliates/page"), {}, 800],
  ["affiliates, searched", () => import("@/app/admin/(app)/affiliates/page"), { q: "Aff1" }, 800],
  ["affiliate applications", () => import("@/app/admin/(app)/affiliates/applications/page"), {}, 800],
];

describe("large database: lists are paginated, aggregated in SQL and fast", () => {
  for (const [name, load, params, budgetMs] of PAGES)
    it(`${name} renders in under ${budgetMs} ms with a small page`, async () => {
      const mod = await load();
      await mod.default({ searchParams: sp(params), params: Promise.resolve({}) }); // warm the module and the statement cache
      const t0 = performance.now();
      const html = renderToStaticMarkup(await mod.default({ searchParams: sp(params), params: Promise.resolve({}) }));
      const ms = performance.now() - t0;
      expect(ms, `${name} took ${Math.round(ms)} ms`).toBeLessThan(budgetMs);
      expect(Buffer.byteLength(html), `${name} is ${Math.round(Buffer.byteLength(html) / 1024)} KB`).toBeLessThan(450 * 1024);
    });

  it("the seeded stock ledger balances for all items", () => {
    expect(checkLedger()).toEqual([]);
  });

  it("every hot list query uses an index (no full scan of orders or customers for the common filters)", () => {
    const db = getEngine().sqlite;
    const plan = (sql: string) => (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[]).map((r) => r.detail).join(" | ");
    expect(plan("SELECT * FROM orders WHERE customer_id = 'x'")).toMatch(/USING (COVERING )?INDEX/);
    expect(plan("SELECT * FROM orders WHERE status = 'new' ORDER BY created_at DESC LIMIT 25")).toMatch(/USING (COVERING )?INDEX/);
    expect(plan("SELECT * FROM order_items WHERE order_id = 'x'")).toMatch(/USING (COVERING )?INDEX/);
    expect(plan("SELECT * FROM stock_movements WHERE inventory_item_id = 'x' ORDER BY created_at DESC")).toMatch(/USING (COVERING )?INDEX/);
    expect(plan("SELECT * FROM orders WHERE discount_code = 'X'")).toMatch(/USING (COVERING )?INDEX/);
  });
});
