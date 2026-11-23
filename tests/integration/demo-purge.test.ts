import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { getEngine } from "../../lib/db/core";
import { reverseDemoStock } from "@/lib/demo-stock";
import { checkLedger } from "@/lib/ledger";
import { placeOrder } from "@/lib/orders";
import { resetState } from "../support/state";
import { seedStore } from "../support/seed";

const sql = () => getEngine().sqlite;
let S: Awaited<ReturnType<typeof seedStore>>;
const item = (productId: string) => (sql().prepare("SELECT id, on_hand FROM inventory_items WHERE product_id = ?").get(productId) as { id: string; on_hand: number });
const move = (inv: string, delta: number, reason: string, demo: boolean) =>
  sql().prepare("INSERT INTO stock_movements (id, inventory_item_id, delta, reason, actor, is_demo) VALUES (?,?,?,?,'t',?)").run(crypto.randomUUID(), inv, delta, reason, demo ? 1 : 0);
/** What the purge script does after reversing the stock: delete the demo movements. */
const deleteDemoMovements = () => sql().prepare("DELETE FROM stock_movements WHERE is_demo = 1").run();
const demoMoves = () => sql().prepare("SELECT inventory_item_id, delta FROM stock_movements WHERE is_demo = 1").all() as { inventory_item_id: string; delta: number }[];

beforeEach(async () => {
  resetState();
  S = await seedStore();
  // a ledger that balances from the start: the opening stock is a real receipt
  sql().prepare("UPDATE inventory_items SET on_hand = 0").run();
  sql().prepare("DELETE FROM stock_movements").run();
});

describe("purge-demo logs its stock change as a movement and keeps the ledger balanced", () => {
  it("real stock + demo receipts and sales: stock returns to the real level, one demo_purge movement explains it, ledger equals stock", () => {
    const g = item(S.gold.id).id;
    sql().prepare("UPDATE inventory_items SET on_hand = 45 WHERE id = ?").run(g);
    move(g, 20, "receive", false); // real opening stock
    move(g, 30, "receive", true); // demo
    move(g, -5, "sale", true); // demo
    expect(checkLedger()).toEqual([]);

    const res = reverseDemoStock(sql(), demoMoves());
    expect(res).toEqual([{ item: g, before: 45, after: 20, demoTotal: 25, marker: 0, clamped: false }]);
    deleteDemoMovements();

    expect(item(S.gold.id).on_hand).toBe(20);
    expect(checkLedger()).toEqual([]);
    const log = sql().prepare("SELECT delta, reason, note, is_demo FROM stock_movements WHERE reason = 'demo_purge'").all();
    expect(log).toEqual([{ delta: 0, reason: "demo_purge", note: "Demo data removed: stock 45 -> 20 (demo movements totalled 25)", is_demo: 0 }]);
  });

  it("stock that would go below zero is clamped to 0, the clamp is a visible movement, and the ledger still balances", () => {
    const r = item(S.red.id).id;
    sql().prepare("UPDATE inventory_items SET on_hand = 10 WHERE id = ?").run(r);
    move(r, 10, "receive", false);
    move(r, 25, "receive", true); // the demo added more than is now in stock (sold or adjusted since)
    sql().prepare("UPDATE inventory_items SET on_hand = 10 WHERE id = ?").run(r); // drifted: 10 on hand, ledger says 35
    const res = reverseDemoStock(sql(), demoMoves());
    expect(res[0]).toMatchObject({ before: 10, after: 0, demoTotal: 25, clamped: true });
    deleteDemoMovements();
    expect(item(S.red.id).on_hand).toBe(0);
    expect(checkLedger()).toEqual([]); // the demo_purge row carries the difference
    expect(sql().prepare("SELECT delta FROM stock_movements WHERE reason = 'demo_purge'").get()).toEqual({ delta: -10 });
  });

  it("demo orders placed through the real order code: purge restores real stock exactly", () => {
    const g = item(S.gold.id).id;
    sql().prepare("UPDATE inventory_items SET on_hand = 50 WHERE id = ?").run(g);
    move(g, 50, "receive", false);
    for (let i = 0; i < 3; i++)
      placeOrder({ customer: { name: `Demo ${i}`, phone: `03 55${String(1000 + i)}`, address: "Hamra, Bldg 5" }, items: [{ productId: S.gold.id, qty: 2 }], region: "Beirut", source: "web", actor: "demo", demo: true });
    expect(item(S.gold.id).on_hand).toBe(44);
    expect(checkLedger()).toEqual([]);
    reverseDemoStock(sql(), demoMoves());
    // the script now deletes the demo orders' movements
    deleteDemoMovements();
    expect(item(S.gold.id).on_hand).toBe(50);
    expect(checkLedger()).toEqual([]);
    expect(sql().prepare("SELECT COUNT(*) n FROM stock_movements WHERE reason = 'demo_purge'").get()).toEqual({ n: 1 });
  });

  it("items without demo movements are not touched, and an item that no longer exists is skipped", () => {
    const r = item(S.red.id).id;
    sql().prepare("UPDATE inventory_items SET on_hand = 7 WHERE id = ?").run(r);
    move(r, 7, "receive", false);
    expect(reverseDemoStock(sql(), [])).toEqual([]);
    expect(reverseDemoStock(sql(), [{ inventory_item_id: "missing", delta: 3 }])).toEqual([]);
    expect(item(S.red.id).on_hand).toBe(7);
    expect(sql().prepare("SELECT COUNT(*) n FROM stock_movements WHERE reason = 'demo_purge'").get()).toEqual({ n: 0 });
  });

  it("the script no longer writes on_hand itself: the only direct writer is the function that also writes the movement", async () => {
    const fs = await import("node:fs");
    const script = fs.readFileSync(new URL("../../scripts/purge-demo.ts", import.meta.url), "utf8");
    expect(script).not.toMatch(/update\(\{\s*on_hand/);
    expect(script).toContain("reverseDemoStock");
  });
});

describe("the purge-demo script itself, run for real on a copy of a large database", () => {
  it("removes the demo orders, their stock movements and the DEMO- lots, and the stock ledger balances afterwards", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { spawnSync } = await import("node:child_process");
    const { closeEngine } = await import("../../lib/db/core");
    const { qaSeed } = await import("../support/qa-seed");
    const { testDir } = await import("../support/state");
    const root = path.resolve(__dirname, "../..");
    const dir = path.join(testDir(), "purge");
    await qaSeed(dir, { orders: 150, customers: 80, products: 8, affiliates: 3, affiliateOrders: 20 });
    const dbFile = path.join(dir, "db", "miel.db");
    closeEngine();
    process.env.DATABASE_PATH = dbFile;
    const e = getEngine().sqlite;
    e.prepare("UPDATE orders SET is_demo = 1 WHERE order_number <= 1010").run();
    e.prepare("UPDATE stock_movements SET is_demo = 1 WHERE order_id IN (SELECT id FROM orders WHERE is_demo = 1)").run();
    e.prepare("INSERT INTO batches (id, inventory_item_id, lot_number, quantity, status) SELECT 'demo-lot', id, 'DEMO-T-1', 5, 'received' FROM inventory_items LIMIT 1").run();
    expect(checkLedger()).toEqual([]);
    closeEngine();

    const r = spawnSync(process.execPath, [path.join(root, "node_modules/tsx/dist/cli.mjs"), "--conditions=react-server", path.join(root, "scripts/purge-demo.ts"), "--confirm"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, MIEL_ENV: "staging", DATABASE_PATH: dbFile, AUTH_SECRET: "throwaway-secret-for-the-purge-test-0123456789", NEXT_PUBLIC_SITE_URL: "http://localhost:3999" },
    });
    const backup = (r.stdout.match(/Backup written to (.+)/) ?? [])[1]?.trim();
    try {
      expect(r.status, r.stderr).toBe(0);
      process.env.DATABASE_PATH = dbFile;
      const db = getEngine().sqlite;
      expect(db.prepare("SELECT COUNT(*) n FROM orders WHERE is_demo = 1").get()).toEqual({ n: 0 });
      expect(db.prepare("SELECT COUNT(*) n FROM batches WHERE lot_number LIKE 'DEMO-%'").get()).toEqual({ n: 0 });
      expect(db.prepare("SELECT COUNT(*) n FROM stock_movements WHERE is_demo = 1").get()).toEqual({ n: 0 });
      expect((db.prepare("SELECT COUNT(*) n FROM stock_movements WHERE reason = 'demo_purge'").get() as { n: number }).n).toBeGreaterThan(0); // every stock change is logged
      expect(checkLedger()).toEqual([]);
      expect(backup && fs.existsSync(backup)).toBeTruthy(); // the CSV backup was taken first
    } finally {
      if (backup) fs.rmSync(backup, { recursive: true, force: true });
    }
  }, 60_000);
});
