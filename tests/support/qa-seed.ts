/**
 * Realistic LARGE test data for the QA audit, in a throwaway folder that mimics the Railway volume:
 *   <dir>/db/miel.db  (the database)   <dir>/db/uploads, <dir>/db/backups (created by the app)
 *   ~200 products (singles, bundles, variants; active/draft/archived), ~2,000 customers, ~5,000 orders over 13 months
 *   with items, timeline events and stock movements, 20 discounts, the standard shipping zones and content, and the three
 *   team accounts of the E2E suite (throwaway passwords, see tests/support/e2e-env.ts).
 * The stock LEDGER is consistent by construction: every item's on_hand equals the sum of its movements.
 *   tsx --conditions=react-server tests/support/qa-seed.ts <dir> [orders=5000] [customers=2000] [products=200]
 */
import crypto from "node:crypto";
import path from "node:path";
import { getEngine } from "../../lib/db/core";
import { hashPassword } from "../../lib/passwords";
import { seedBase } from "../../lib/seed";
import { E2E_PASSWORD, USERS } from "./e2e-env";

export async function qaSeed(dir: string, opts: { orders?: number; customers?: number; products?: number } = {}) {
  const nOrders = opts.orders ?? 5000;
  const nCustomers = opts.customers ?? 2000;
  const nProducts = opts.products ?? 200;
  process.env.DATABASE_PATH = path.join(dir, "db", "miel.db");
  const e = getEngine();
  const db = e.sqlite;
  await seedBase(); // the 3 real products, zones, content
  const rnd = mulberry(20261119);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const uuid = () => crypto.randomUUID();
  const now = Date.now();
  const iso = (t: number) => new Date(t).toISOString();

  const hash = await hashPassword(E2E_PASSWORD);
  const insUser = db.prepare("INSERT OR IGNORE INTO admin_users (id, email, name, role, active, password_hash) VALUES (?,?,?,?,1,?)");
  for (const u of Object.values(USERS)) insUser.run(u.id, u.email, u.name, u.role, hash);

  db.transaction(() => {
    // ---- products + inventory
    const flavours = ["Pomegranate", "Vanilla", "Citrus", "Cocoa", "Berry", "Mint", "Mango", "Coffee", "Ginger", "Plain"];
    const insProd = db.prepare(
      "INSERT INTO products (id, slug, kind, name, descriptor, flavor, description, spec, price_cents, sachet_count, chips, status, sort, bundle_items) VALUES (?,?,?,?,?,?,?,?,?,12,?,?,?,?)",
    );
    const insInv = db.prepare("INSERT INTO inventory_items (id, product_id, sku, on_hand, low_stock_threshold) VALUES (?,?,?,?,?)");
    const have = (db.prepare("SELECT COUNT(*) n FROM products").get() as { n: number }).n;
    const singles: { id: string; inv: string; price: number; name: string }[] = [];
    for (let i = have; i < nProducts; i++) {
      const id = uuid();
      const bundle = i % 10 === 0;
      const status = i % 40 === 7 ? "draft" : i % 40 === 17 ? "archived" : "active";
      const price = 1500 + Math.floor(rnd() * 4000);
      const name = `${pick(flavours)} ${bundle ? "Bundle" : "Pouch"} ${String(i).padStart(3, "0")}`;
      insProd.run(id, `qa-product-${i}`, bundle ? "bundle" : "single", name, "Test Honey", pick(flavours), "Seeded for the QA audit.", "20G · TEST", price, JSON.stringify(["12 SACHETS", "20G EACH"]), status, i, bundle ? JSON.stringify([]) : null);
      if (!bundle) {
        const inv = uuid();
        insInv.run(inv, id, `QA-${i}`, 0, 10);
        if (status === "active") singles.push({ id, inv, price, name });
      }
    }
    // the real products take part too (their inventory exists from seedBase)
    for (const r of db.prepare("SELECT p.id, p.name, p.price_cents, i.id AS inv FROM products p JOIN inventory_items i ON i.product_id = p.id WHERE p.slug IN ('red-burn','gold','creatine')").all() as { id: string; name: string; price_cents: number; inv: string }[])
      singles.push({ id: r.id, inv: r.inv, price: r.price_cents, name: r.name });

    // ---- customers
    const insCust = db.prepare("INSERT INTO customers (id, name, phone, email, tags, notes, created_at) VALUES (?,?,?,?,?,?,?)");
    const customers: string[] = [];
    const first = ["Rami", "Lina", "Karim", "Nour", "Georges", "Maya", "Omar", "Tala", "Hadi", "Yara", "Elie", "Dana", "Ziad", "Rita", "Samir", "Joelle"];
    const last = ["Khoury", "Haddad", "Saad", "Fadel", "Mansour", "Salameh", "Itani", "Daher", "Nassar", "Chahine", "Frem", "Karam"];
    for (let i = 0; i < nCustomers; i++) {
      const id = uuid();
      insCust.run(id, `${pick(first)} ${pick(last)} ${i}`, `+9617${String(1000000 + i).slice(-7)}`, null, JSON.stringify(i % 50 === 0 ? ["vip"] : []), "", iso(now - Math.floor(rnd() * 400) * 86_400_000));
      customers.push(id);
    }

    // ---- discounts + partners
    const insDisc = db.prepare("INSERT INTO discounts (id, code, type, value_x100, min_order_cents, usage_limit, used_count, active) VALUES (?,?,?,?,?,?,?,1)");
    for (let i = 0; i < 20; i++) insDisc.run(uuid(), `QA${i}OFF`, i % 3 === 0 ? "fixed" : "percent", i % 3 === 0 ? 300 : 500 + i * 100, 0, 500, Math.floor(rnd() * 50));
    const partners: string[] = [];
    const insPartner = db.prepare("INSERT INTO delivery_partners (id, name, phone) VALUES (?,?,?)");
    for (const n of ["QA Express", "QA Riders", "QA Couriers"]) {
      const id = uuid();
      insPartner.run(id, n, "+9613000000");
      partners.push(id);
    }
    const zones = db.prepare("SELECT name, fee_cents FROM shipping_zones").all() as { name: string; fee_cents: number }[];

    // ---- orders (+ items, events, stock movements)
    const insOrder = db.prepare(
      `INSERT INTO orders (id, order_number, customer_id, status, payment_status, subtotal_cents, discount_total_cents, shipping_fee_cents, total_cents, cod_amount_due_cents, cod_collected,
        region, address, source, utm_source, stock_deducted, delivery_partner_id, delivered_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    const insItem = db.prepare("INSERT INTO order_items (id, order_id, product_id, name, unit_price_cents, qty) VALUES (?,?,?,?,?,?)");
    const insEvent = db.prepare("INSERT INTO order_events (id, order_id, type, message, from_status, to_status, actor, created_at) VALUES (?,?,?,?,?,?,?,?)");
    const insMove = db.prepare("INSERT INTO stock_movements (id, inventory_item_id, delta, reason, note, order_id, actor, created_at) VALUES (?,?,?,?,?,?,?,?)");
    const net = new Map<string, number>(); // inventory item -> units sold net of restores
    const statusPool = ["delivered", "delivered", "delivered", "delivered", "delivered", "out_for_delivery", "packed", "confirmed", "new", "cancelled", "returned"];
    for (let n = 0; n < nOrders; n++) {
      const id = uuid();
      const status = n > nOrders - 40 ? pick(["new", "new", "confirmed"]) : pick(statusPool);
      const at = now - Math.floor(rnd() * 395) * 86_400_000 - Math.floor(rnd() * 86_400_000);
      const lines = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => ({ p: pick(singles), qty: 1 + Math.floor(rnd() * 3) }));
      const sub = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
      const zone = pick(zones);
      const disc = rnd() < 0.2 ? Math.round(sub * 0.1) : 0;
      const total = sub - disc + zone.fee_cents;
      const collected = status === "delivered" && rnd() < 0.8;
      insOrder.run(
        id, 1001 + n, pick(customers), status, collected ? "collected" : status === "returned" ? "refunded" : "pending", sub, disc, zone.fee_cents, total, total, collected ? 1 : 0,
        zone.name, "QA street 1", pick(["web", "web", "web", "whatsapp", "manual"]), pick([null, "instagram", "facebook"]), 0, status === "delivered" && rnd() < 0.6 ? pick(partners) : null,
        status === "delivered" ? iso(at + 2 * 86_400_000) : null, iso(at), iso(at),
      );
      for (const l of lines) insItem.run(uuid(), id, l.p.id, l.p.name, l.p.price, l.qty);
      insEvent.run(uuid(), id, "created", "Order placed (seed)", null, "new", "customer", iso(at));
      if (status !== "new") insEvent.run(uuid(), id, "status", `Status: new → ${status}`, "new", status, "seed", iso(at + 3_600_000));
      for (const l of lines) {
        insMove.run(uuid(), l.p.inv, -l.qty, "sale", `Order #${1001 + n}`, id, "customer", iso(at));
        let sold = l.qty;
        if (status === "cancelled" || status === "returned") {
          insMove.run(uuid(), l.p.inv, l.qty, status === "cancelled" ? "cancel_restore" : "return", `Order #${1001 + n}`, id, "seed", iso(at + 7_200_000));
          sold = 0;
        }
        net.set(l.p.inv, (net.get(l.p.inv) ?? 0) + sold);
      }
      db.prepare("UPDATE orders SET stock_deducted = ? WHERE id = ?").run(status === "cancelled" || status === "returned" ? 0 : 1, id);
    }
    db.prepare("UPDATE counters SET value = ? WHERE name = 'order_number'").run(1000 + nOrders);

    // ---- opening stock (a 'receive' movement) so that on_hand = received - net sold, always >= 0 and the ledger balances
    const setStock = db.prepare("UPDATE inventory_items SET on_hand = ? WHERE id = ?");
    const rec = db.prepare("SELECT id FROM inventory_items").all() as { id: string }[];
    for (const r of rec) {
      const sold = net.get(r.id) ?? 0;
      const receive = sold + (rnd() < 0.08 ? 3 : 20 + Math.floor(rnd() * 150)); // some items end up low on stock
      insMove.run(uuid(), r.id, receive, "receive", "Opening stock (seed)", null, "seed", iso(now - 400 * 86_400_000));
      setStock.run(receive - sold, r.id);
    }
  })();
  const counts = Object.fromEntries(["products", "inventory_items", "customers", "orders", "order_items", "order_events", "stock_movements", "discounts"].map((t) => [t, (db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n]));
  db.pragma("wal_checkpoint(TRUNCATE)");
  e.close();
  return counts;
}

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

if (process.argv[1] && /qa-seed\.ts$/.test(process.argv[1].replace(/\\/g, "/"))) {
  const [dir, o, c, p] = process.argv.slice(2);
  if (!dir) throw new Error("usage: qa-seed.ts <dir> [orders] [customers] [products]");
  qaSeed(dir, { orders: o ? Number(o) : undefined, customers: c ? Number(c) : undefined, products: p ? Number(p) : undefined }).then((c2) => console.log("qa seed:", JSON.stringify(c2)));
}
