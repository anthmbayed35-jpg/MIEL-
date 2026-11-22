import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { closeEngine, getEngine, loadMigrations, migrate, openSqlite } from "../../lib/db/core";
import { checkAffiliateBooks, createAffiliate, recordPayout, approveDueCommissions } from "@/lib/affiliates";
import { placeOrder, setOrderStatus } from "@/lib/orders";
import { resetState, testDir } from "../support/state";

/**
 * The database a real store has TODAY has orders but no affiliate tables. Prove that the affiliate migrations (0005, 0006) on a COPY
 * of such a database lose nothing, change no existing value, are idempotent and survive restarts.
 */
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function preAffiliateMigrations(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  for (const m of loadMigrations().filter((x) => x.version < 5)) fs.writeFileSync(path.join(dir, `${String(m.version).padStart(4, "0")}_${m.name.replace(/^\d+_?/, "")}.sql`), m.sql);
  return dir;
}

/** A believable pre-affiliate store: customers, orders in every status, items, events, stock movements, discounts. */
function seedOldStore(file: string, dir: string) {
  const db = openSqlite(file);
  migrate(db, dir, file);
  const id = () => crypto.randomUUID();
  db.transaction(() => {
    const prod = ["red-burn", "gold", "creatine"].map((slug, i) => {
      const pid = id();
      db.prepare("INSERT INTO products (id, slug, kind, name, price_cents, status, sort) VALUES (?,?,'single',?,?, 'active', ?)").run(pid, slug, slug.toUpperCase(), 1500 + i * 100, i);
      const inv = id();
      db.prepare("INSERT INTO inventory_items (id, product_id, sku, on_hand) VALUES (?,?,?,?)").run(inv, pid, slug, 900);
      db.prepare("INSERT INTO batches (id, inventory_item_id, lot_number, expiry_date, quantity, status) VALUES (?,?,?,?,?, 'received')").run(id(), inv, `LOT-${slug}`, "2027-06-30", 900);
      return { pid, inv };
    });
    const cust = Array.from({ length: 60 }, (_, i) => {
      const cid = id();
      db.prepare("INSERT INTO customers (id, name, phone) VALUES (?,?,?)").run(cid, `Customer ${i}`, `+9617${String(1000000 + i).slice(-7)}`);
      return cid;
    });
    db.prepare("INSERT INTO discounts (id, code, type, value_x100, usage_limit, used_count, active) VALUES (?, 'WELCOME10', 'percent', 1000, 100, 7, 1)").run(id());
    const statuses = ["new", "confirmed", "packed", "out_for_delivery", "delivered", "delivered", "cancelled", "returned"];
    for (let n = 0; n < 200; n++) {
      const oid = id();
      const p = prod[n % 3];
      const sub = (1500 + (n % 3) * 100) * (1 + (n % 2));
      const st = statuses[n % statuses.length];
      db.prepare(
        `INSERT INTO orders (id, order_number, customer_id, status, payment_status, subtotal_cents, discount_total_cents, shipping_fee_cents, total_cents, cod_amount_due_cents, cod_collected, discount_code, region, address, source, stock_deducted, delivered_at, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(oid, 1001 + n, cust[n % cust.length], st, st === "delivered" ? "collected" : "pending", sub, n % 10 === 0 ? 150 : 0, 300, sub - (n % 10 === 0 ? 150 : 0) + 300, sub + 300, st === "delivered" ? 1 : 0, n % 10 === 0 ? "WELCOME10" : null, "Beirut", "Hamra", "web", st === "cancelled" || st === "returned" ? 0 : 1, st === "delivered" ? "2026-01-10T10:00:00.000Z" : null, `2026-01-${String(1 + (n % 28)).padStart(2, "0")}T08:00:00.000Z`, `2026-01-${String(1 + (n % 28)).padStart(2, "0")}T08:00:00.000Z`);
      db.prepare("INSERT INTO order_items (id, order_id, product_id, name, unit_price_cents, qty) VALUES (?,?,?,?,?,?)").run(id(), oid, p.pid, "item", 1500, 1 + (n % 2));
      db.prepare("INSERT INTO order_events (id, order_id, type, message, to_status, actor) VALUES (?,?,?,?,?,?)").run(id(), oid, "created", "Order placed", "new", "customer");
      db.prepare("INSERT INTO stock_movements (id, inventory_item_id, delta, reason, order_id, actor) VALUES (?,?,?,?,?,?)").run(id(), p.inv, -(1 + (n % 2)), "sale", oid, "customer");
    }
    db.prepare("UPDATE counters SET value = 1200 WHERE name = 'order_number'").run();
  })();
  db.pragma("wal_checkpoint(TRUNCATE)");
  db.close();
}

const OLD_TABLES = ["products", "inventory_items", "batches", "customers", "discounts", "orders", "order_items", "order_events", "stock_movements", "counters", "admin_users", "settings"];
/** Every existing column of every existing table, in a stable order, hashed: any changed or lost value changes the hash. */
function fingerprint(file: string, onlyColumnsOf?: Record<string, string[]>) {
  const db = openSqlite(file);
  const out: Record<string, { n: number; hash: string }> = {};
  for (const t of OLD_TABLES) {
    const cols = onlyColumnsOf?.[t] ?? (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
    const rows = db.prepare(`SELECT ${cols.map((c) => `"${c}"`).join(",")} FROM ${t} ORDER BY ${cols.map((c) => `"${c}"`).join(",")}`).all();
    out[t] = { n: rows.length, hash: sha(JSON.stringify(rows)) };
  }
  db.close();
  return out;
}
const columnsOf = (file: string) => {
  const db = openSqlite(file);
  const r = Object.fromEntries(OLD_TABLES.map((t) => [t, (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name)]));
  db.close();
  return r;
};

beforeEach(() => resetState());

describe("migrating a copy of a real pre-affiliate database", () => {
  it("loses nothing, changes no existing value, is idempotent, survives restarts, and affiliates work on the result", async () => {
    closeEngine();
    const root = path.join(testDir(), "migration-qa");
    fs.mkdirSync(root, { recursive: true });
    const oldDb = path.join(root, "old", "miel.db");
    fs.mkdirSync(path.dirname(oldDb), { recursive: true });
    seedOldStore(oldDb, preAffiliateMigrations(path.join(root, "old-migrations")));
    const oldCols = columnsOf(oldDb);
    const before = fingerprint(oldDb);
    expect(before.orders.n).toBe(200);
    const originalBytes = sha(fs.readFileSync(oldDb).toString("base64"));

    // a COPY, like a restored backup on a staging volume
    const copyDir = path.join(root, "copy");
    fs.mkdirSync(copyDir, { recursive: true });
    const copy = path.join(copyDir, "miel.db");
    fs.copyFileSync(oldDb, copy);

    const db = openSqlite(copy);
    expect(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'affiliates'").get()).toEqual({ n: 0 });
    expect(migrate(db, undefined, copy)).toEqual([5, 6]); // exactly the new migrations
    expect(db.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(db.pragma("foreign_key_check")).toEqual([]);
    expect(migrate(db, undefined, copy)).toEqual([]); // idempotent
    // a safety copy was taken before changing a database that had data
    expect(fs.readdirSync(path.join(copyDir, "backups")).some((f) => f.startsWith("pre-migration-"))).toBe(true);
    db.close();

    // not one existing value changed, not one row lost (compare only the columns that existed before)
    expect(fingerprint(copy, oldCols)).toEqual(before);
    // the new order columns are empty, never invented
    const db2 = openSqlite(copy);
    expect(db2.prepare("SELECT COUNT(*) n FROM orders WHERE affiliate_id IS NOT NULL OR code_used IS NOT NULL OR commission_status IS NOT NULL OR discount_amount_cents <> 0 OR commission_amount_cents <> 0").get()).toEqual({ n: 0 });
    for (const t of ["affiliates", "affiliate_payouts", "affiliate_applications"]) expect(db2.prepare(`SELECT COUNT(*) n FROM ${t}`).get()).toEqual({ n: 0 });
    db2.close();

    // restarts change nothing
    for (let i = 0; i < 3; i++) {
      const d = openSqlite(copy);
      expect(migrate(d, undefined, copy)).toEqual([]);
      d.close();
      expect(fingerprint(copy, oldCols)).toEqual(before);
    }
    // the original file was never touched
    expect(sha(fs.readFileSync(oldDb).toString("base64"))).toBe(originalBytes);

    // and the real application runs on the migrated copy: old orders still readable, affiliates work, books balance
    process.env.DATABASE_PATH = copy;
    getEngine();
    const prod = getEngine().sqlite.prepare("SELECT id FROM products WHERE slug = 'red-burn'").get() as { id: string };
    getEngine().sqlite.prepare("INSERT OR IGNORE INTO shipping_zones (id, name, fee_cents, eta, active, sort) VALUES (?, 'Beirut', 300, '1 day', 1, 1)").run(crypto.randomUUID());
    const a = createAffiliate({ name: "Rami", code: "RAMI10" });
    const { order } = placeOrder({ customer: { name: "New Buyer", phone: "03 777 123", address: "Hamra, Bldg 5" }, items: [{ productId: prod.id, qty: 2 }], region: "Beirut", source: "web", actor: "c", code: "rami10" });
    expect(order.order_number).toBe(1201); // numbering continues from the old store
    for (const s of ["confirmed", "delivered"] as const) await setOrderStatus(order.id, s, "t");
    getEngine().sqlite.prepare("UPDATE orders SET delivered_at = ? WHERE id = ?").run(new Date(Date.now() - 20 * 86_400_000).toISOString(), order.id);
    approveDueCommissions();
    expect(recordPayout(a.id, {}).amountCents).toBe(Math.round((3000 - 300) * 0.15));
    expect(checkAffiliateBooks()).toEqual([]);
    expect(getEngine().sqlite.prepare("SELECT COUNT(*) n FROM orders").get()).toEqual({ n: 201 });
  });
});
