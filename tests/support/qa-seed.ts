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
import { closeEngine, getEngine } from "../../lib/db/core";
import { affiliateDiscountCents, commissionCents } from "../../lib/affiliate-math";
import { TIER_RULES, type AffiliateTier } from "../../config/affiliates";
import { hashPassword } from "../../lib/passwords";
import { seedBase } from "../../lib/seed";
import { E2E_PASSWORD, USERS } from "./e2e-env";

export async function qaSeed(dir: string, opts: { orders?: number; customers?: number; products?: number; affiliates?: number; affiliateOrders?: number } = {}) {
  const nOrders = opts.orders ?? 5000;
  const nCustomers = opts.customers ?? 2000;
  const nProducts = opts.products ?? 200;
  const nAffiliates = opts.affiliates ?? 20;
  const nAffOrders = Math.min(opts.affiliateOrders ?? 500, nOrders);
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
  // two throwaway members in the middle of the forced steps, so the QA can visit /admin/change-password and /admin/mfa for real
  const insFlow = db.prepare("INSERT OR IGNORE INTO admin_users (id, email, name, role, active, password_hash, must_change_password, must_enroll_mfa, temp_password_expires_at) VALUES (?,?,?,?,1,?,?,?,?)");
  insFlow.run("00000000-0000-4000-8000-0000000000b1", "qa.change@e2e.test", "QA Must Change", "staff", hash, 1, 1, new Date(Date.now() + 48 * 3_600_000).toISOString());
  insFlow.run("00000000-0000-4000-8000-0000000000b2", "qa.mfa@e2e.test", "QA Must Enroll", "staff", hash, 0, 1, null);

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

    // ---- affiliates: all three tiers, active / paused / ended, their private tokens
    const TIERS: AffiliateTier[] = ["seed", "athlete", "ambassador"];
    const insAff = db.prepare("INSERT INTO affiliates (id, name, instagram_handle, phone, email, code, tier, commission_rate_x100, customer_discount_percent_x100, status, payout_method, notes, private_token, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    const affiliates = Array.from({ length: nAffiliates }, (_, i) => {
      const tier = TIERS[i < Math.ceil(nAffiliates * 0.4) ? 0 : i < Math.ceil(nAffiliates * 0.75) ? 1 : 2];
      const status = i % 5 === 3 ? "paused" : i % 10 === 9 ? "ended" : "active";
      const a = { id: uuid(), code: `QAAFF${String(i).padStart(2, "0")}`, tier, status, rate: TIER_RULES[tier].commissionPercent * 100, pct: i % 7 === 3 ? 750 : i % 7 === 5 ? 1250 : 1000, name: `${pick(first)} ${pick(last)} Aff${i}` };
      insAff.run(a.id, a.name, `aff.${i}`, `+96170${String(900000 + i)}`, `aff${i}@qa.test`, a.code, tier, a.rate, a.pct, status, pick(["Whish money", "Cash", "Bank transfer"]), "", crypto.randomBytes(24).toString("base64url"), iso(now - 300 * 86_400_000));
      return a;
    });
    const affEvery = nAffiliates && nAffOrders ? Math.max(1, Math.floor(nOrders / nAffOrders)) : 0;
    let affAssigned = 0;
    const affOrders: { id: string; aff: (typeof affiliates)[number]; commission: number; status: string; deliveredAt: string | null; old: boolean }[] = [];

    // ---- orders (+ items, events, stock movements)
    const insOrder = db.prepare(
      `INSERT INTO orders (id, order_number, customer_id, status, payment_status, subtotal_cents, discount_total_cents, shipping_fee_cents, total_cents, cod_amount_due_cents, cod_collected,
        region, address, source, utm_source, stock_deducted, delivery_partner_id, delivered_at, created_at, updated_at, affiliate_id, code_used, discount_code, discount_amount_cents, commission_amount_cents, commission_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
      const isAff = affEvery > 0 && n % affEvery === 0 && affAssigned < nAffOrders && status !== "draft";
      const aff = isAff ? affiliates[affAssigned % nAffiliates] : null;
      if (isAff) affAssigned++;
      const disc = aff ? affiliateDiscountCents(sub, aff.pct) : rnd() < 0.2 ? Math.round(sub * 0.1) : 0;
      const commission = aff ? commissionCents(sub, disc, aff.rate) : 0;
      const total = sub - disc + zone.fee_cents;
      const collected = status === "delivered" && rnd() < 0.8;
      insOrder.run(
        id, 1001 + n, pick(customers), status, collected ? "collected" : status === "returned" ? "refunded" : "pending", sub, disc, zone.fee_cents, total, total, collected ? 1 : 0,
        zone.name, "QA street 1", pick(["web", "web", "web", "whatsapp", "manual"]), pick([null, "instagram", "facebook"]), 0, status === "delivered" && rnd() < 0.6 ? pick(partners) : null,
        status === "delivered" ? iso(at + 2 * 86_400_000) : null, iso(at), iso(at),
        aff?.id ?? null, aff?.code ?? null, aff?.code ?? (disc ? "QAOFF" : null), aff ? disc : 0, commission, aff ? (status === "cancelled" || status === "returned" ? "void" : "pending") : null,
      );
      if (aff) affOrders.push({ id, aff, commission, status, deliveredAt: status === "delivered" ? iso(at + 2 * 86_400_000) : null, old: at + 2 * 86_400_000 < now - 14 * 86_400_000 });
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

    // ---- commission lifecycle and payouts (the same rules the app applies: approved 14 days after delivery; paid via payouts; a paid
    //      commission whose order was returned stays as a correction owed back, deducted by the next payout)
    const setComm = db.prepare("UPDATE orders SET commission_status = ?, commission_payout_id = ?, commission_correction_payout_id = ? WHERE id = ?");
    const insPayout = db.prepare("INSERT INTO affiliate_payouts (id, affiliate_id, amount_cents, gross_cents, corrections_cents, method, note, paid_at) VALUES (?,?,?,?,?,?,?,?)");
    for (const a of affiliates) {
      const mine = affOrders.filter((o) => o.aff.id === a.id);
      const approved = mine.filter((o) => o.status === "delivered" && o.old).sort((x, y) => String(x.deliveredAt).localeCompare(String(y.deliveredAt)));
      for (const o of approved) setComm.run("approved", null, null, o.id);
      const returnedOld = mine.filter((o) => o.status === "returned" && o.old && rnd() < 0.6); // returned AFTER they were paid
      const firstBatch = approved.slice(0, Math.ceil(approved.length * 0.6));
      let p1: string | null = null;
      if (firstBatch.length + returnedOld.length > 0 && rnd() < 0.85) {
        p1 = uuid();
        const gross = [...firstBatch, ...returnedOld].reduce((n, o) => n + o.commission, 0);
        if (gross > 0) {
          insPayout.run(p1, a.id, gross, gross, 0, "Whish money", "Seeded payout", iso(now - 25 * 86_400_000));
          for (const o of firstBatch) setComm.run("paid", p1, null, o.id);
          for (const o of returnedOld) setComm.run("void", p1, null, o.id); // paid, then returned: owed back
        } else p1 = null;
      }
      const rest = approved.slice(firstBatch.length);
      if (p1 && rest.length && rnd() < 0.6) {
        const gross = rest.reduce((n, o) => n + o.commission, 0);
        const corr = returnedOld.reduce((n, o) => n + o.commission, 0);
        if (gross - corr > 0) {
          const p2 = uuid();
          insPayout.run(p2, a.id, gross - corr, gross, corr, "Whish money", "Seeded payout with a correction", iso(now - 8 * 86_400_000));
          for (const o of rest) setComm.run("paid", p2, null, o.id);
          for (const o of returnedOld) setComm.run("void", p1, p2, o.id); // correction settled
        }
      }
    }

    // ---- ambassador applications
    const insApp = db.prepare("INSERT INTO affiliate_applications (id, name, instagram_handle, tiktok_handle, followers, city, sport, message, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
    for (let i = 0; i < 40; i++) insApp.run(uuid(), `${pick(first)} ${pick(last)} Applicant${i}`, `applicant.${i}`, i % 3 ? `tt.applicant${i}` : "", pick(["3k", "12k", "45k", "120k"]), pick(["Beirut", "Jounieh", "Saida", "Tripoli"]), pick(["Running", "CrossFit", "Football", "Cycling"]), "Seeded application.", i < 12 ? "new" : i < 30 ? "approved" : "rejected", iso(now - (i + 1) * 36 * 3_600_000));

    // ---- policy pages (so /policies/<name> exists on the storefront)
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('policies', ?)").run(JSON.stringify({ shipping: "Delivery across Lebanon in 1 to 3 days. Pay cash on delivery.", returns: "Unopened pouches can be returned within 7 days.", privacy: "We use your phone number only to deliver your order.", terms: "Orders are confirmed by phone." }));

    // ---- stock lots with expiry dates for the real products (expired, soon, mid, far)
    const insBatch = db.prepare("INSERT INTO batches (id, inventory_item_id, lot_number, expiry_date, quantity, status, received_at) VALUES (?,?,?,?,?,?,?)");
    const day = (d: number) => new Date(now + d * 86_400_000).toISOString().slice(0, 10);
    for (const r of db.prepare("SELECT i.id, p.slug FROM inventory_items i JOIN products p ON p.id = i.product_id WHERE p.slug IN ('red-burn','gold','creatine')").all() as { id: string; slug: string }[])
      [-20, 12, 75, 420].forEach((d, k) => insBatch.run(uuid(), r.id, `${r.slug.toUpperCase()}-L${k + 1}`, day(d), 200 + k * 50, k === 3 ? "incoming" : "received", k === 3 ? null : iso(now - 60 * 86_400_000)));
  })();
  const counts = Object.fromEntries(["products", "inventory_items", "customers", "orders", "order_items", "order_events", "stock_movements", "discounts", "affiliates", "affiliate_payouts", "affiliate_applications", "batches"].map((t) => [t, (db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n]));
  db.pragma("wal_checkpoint(TRUNCATE)");
  closeEngine();
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
  const [dir, o, c, p, af, ao] = process.argv.slice(2);
  if (!dir) throw new Error("usage: qa-seed.ts <dir> [orders] [customers] [products]");
  qaSeed(dir, { orders: o ? Number(o) : undefined, customers: c ? Number(c) : undefined, products: p ? Number(p) : undefined, affiliates: af ? Number(af) : undefined, affiliateOrders: ao ? Number(ao) : undefined }).then((c2) => console.log("qa seed:", JSON.stringify(c2)));
}
