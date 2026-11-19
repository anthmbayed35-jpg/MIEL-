import { getDb, must, type Row } from "../lib/db";
import { assertEnv } from "../lib/env";
import { addEvent, createOrder, restoreStock } from "../lib/orders";
import { seedBase } from "../lib/seed";

/**
 * DEMO DATA GENERATOR (development / staging ONLY). Everything it creates is flagged is_demo = true so that
 * `npm run purge-demo` can find, back up and remove it. It REFUSES to run against production:
 *   - NODE_ENV or MIEL_ENV is production, or the Railway environment is named production, or
 *   - MIEL_ENV is not staging or development (it cannot prove this is not the production database).
 * Run:  npm run seed-demo -- --yes
 */
const DAY = 86_400_000;

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

const NAMES = ["Rami Khoury", "Lina Haddad", "Karim Saad", "Nour Fadel", "Georges Mansour", "Maya Salameh", "Omar Itani", "Tala Daher", "Hadi Nassar", "Yara Chahine", "Elie Frem", "Dana Karam", "Ziad Hamdan", "Rita Aoun", "Samir Jaber", "Joelle Abi Nader", "Fadi Rizk", "Maria Tabet", "Walid Sleiman", "Cynthia Boulos", "Nabil Gemayel", "Hala Mrad", "Tony Khalil", "Reem Yazbek", "Charbel Awad", "Sarah Kanaan", "Mazen Hajj", "Lara Matar"];
const STREETS = ["Hamra St", "Achrafieh, Sassine Sq", "Jounieh Highway", "Verdun, Rafic Hariri Ave", "Jal el Dib", "Dbayeh", "Mar Mikhael", "Zalka", "Tripoli, El Mina", "Saida, Riad el Solh", "Zahle, Main Rd", "Nabatieh, Mall St", "Batroun Old Souk", "Jbeil, Byblos"];
const REGION_FOR = (st: string) => (/Tripoli|Batroun/.test(st) ? "North Lebanon" : /Saida/.test(st) ? "South Lebanon" : /Zahle/.test(st) ? "Bekaa" : /Nabatieh/.test(st) ? "Nabatieh" : /Hamra|Achrafieh|Verdun|Mar Mikhael/.test(st) ? "Beirut" : "Mount Lebanon");

async function seedDemo(actor: string) {
  await seedBase();
  const db = getDb();
  const rand = rng(42);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];

  const products = must(await db.from("products").select("*").eq("status", "active")) as Row[];
  const inv = must(await db.from("inventory_items").select("*")) as Row[];
  // Plenty of stock to cover the demo orders, then leave GOLD low so the low-stock alert has something to show.
  for (const i of inv) await db.rpc("adjust_stock", { p_item: i.id, p_delta: 400, p_reason: "receive", p_note: "Demo stock", p_actor: actor, p_demo: true });

  const partners = must(
    await db.from("delivery_partners").insert([
      { name: "Zoom Express (demo)", phone: "+961 3 000 111", notes: "Demo partner", active: true, is_demo: true },
      { name: "Beirut Riders (demo)", phone: "+961 70 000 222", notes: "Demo partner", active: true, is_demo: true },
    ]).select(),
  ) as Row[];
  await db.from("discounts").insert([
    { code: "WELCOME10", type: "percent", value: 10, min_order: 0, product_ids: null, starts_at: null, ends_at: null, usage_limit: 200, used_count: 0, active: true, is_demo: true },
    { code: "FREESHIP", type: "free_delivery", value: 0, min_order: 40, product_ids: null, starts_at: null, ends_at: null, usage_limit: null, used_count: 0, active: true, is_demo: true },
    { code: "TAKE5", type: "fixed", value: 5, min_order: 30, product_ids: null, starts_at: null, ends_at: null, usage_limit: 50, used_count: 0, active: true, is_demo: true },
  ]);

  const customers = NAMES.map((n, i) => ({ name: n, phone: `03${String(100000 + ((i * 7919) % 899999)).padStart(6, "0")}`, street: STREETS[i % STREETS.length] }));
  const now = Date.now();
  let made = 0;

  for (let daysAgo = 89; daysAgo >= 0; daysAgo--) {
    const base = 1 + (90 - daysAgo) / 40; // growing trend
    const n = Math.max(0, Math.round(base + (rand() - 0.35) * 2.5));
    for (let k = 0; k < n; k++) {
      const c = customers[Math.floor(Math.pow(rand(), 1.6) * customers.length)]; // some customers repeat a lot
      const at = new Date(now - daysAgo * DAY - Math.floor(rand() * 12 * 3_600_000) - 3_600_000).toISOString();
      const lines = [{ productId: pick(products).id, qty: 1 + (rand() > 0.7 ? 1 : 0) }];
      if (rand() > 0.72) lines.push({ productId: pick(products).id, qty: 1 });
      const merged = lines.reduce<{ productId: string; qty: number }[]>((acc, l) => {
        const e = acc.find((x) => x.productId === l.productId);
        if (e) e.qty += l.qty;
        else acc.push({ ...l });
        return acc;
      }, []);
      try {
        const { order } = await createOrder({
          customer: { name: c.name, phone: c.phone, address: `${c.street}, Bldg ${1 + Math.floor(rand() * 40)}`, notes: rand() > 0.85 ? "Call before arriving" : "" },
          items: merged,
          region: REGION_FOR(c.street),
          code: rand() > 0.88 ? "WELCOME10" : "",
          source: rand() > 0.75 ? "whatsapp" : "web",
          utm: rand() > 0.5 ? { source: pick(["instagram", "instagram", "facebook", "google", "friend"]), medium: "social" } : undefined,
          actor: "demo",
          demo: true,
          createdAt: at,
        });
        made++;

        // Move the order along to a realistic final status for its age
        const age = daysAgo;
        const r = rand();
        let status = "new";
        if (age > 6) status = r < 0.86 ? "delivered" : r < 0.93 ? "cancelled" : r < 0.97 ? "returned" : "delivered";
        else if (age > 2) status = r < 0.55 ? "delivered" : r < 0.75 ? "out_for_delivery" : r < 0.9 ? "packed" : "confirmed";
        else status = r < 0.3 ? "new" : r < 0.55 ? "confirmed" : r < 0.8 ? "packed" : "out_for_delivery";

        const t0 = +new Date(at);
        const steps: [string, number][] = [["confirmed", 1], ["packed", 3], ["out_for_delivery", 8], ["delivered", 22]];
        let cur = "new";
        const patch: Row = { updated_at: at };
        for (const [s, hrs] of steps) {
          if (status === "cancelled" || status === "returned") break;
          if (steps.findIndex(([x]) => x === s) > steps.findIndex(([x]) => x === status)) break;
          await addEvent(order.id, "status", `Status: ${cur} → ${s}`, "demo", cur, s, new Date(t0 + hrs * 3_600_000).toISOString());
          cur = s;
          if (s === "delivered") patch.delivered_at = new Date(t0 + hrs * 3_600_000).toISOString();
        }
        if (["out_for_delivery", "delivered"].includes(status)) {
          const p = pick(partners);
          patch.delivery_partner_id = p.id;
          patch.tracking_number = `ZE${100000 + Math.floor(rand() * 899999)}`;
        }
        if (status === "delivered") {
          const collected = rand() > 0.18 || age > 12;
          patch.cod_collected = collected;
          patch.payment_status = collected ? "collected" : "pending";
          if (collected && age > 14) patch.cod_settled_at = new Date(t0 + 5 * DAY).toISOString();
        }
        patch.status = status;
        if (status === "cancelled") {
          patch.cancel_reason = pick(["Customer changed their mind", "Wrong address, unreachable", "Duplicate order"]);
          await db.from("orders").update(patch).eq("id", order.id);
          await restoreStock(order.id, order.order_number, "cancel_restore", "demo");
          await addEvent(order.id, "status", `Cancelled: ${patch.cancel_reason}`, "demo", "new", "cancelled", new Date(t0 + 2 * 3_600_000).toISOString());
        } else if (status === "returned") {
          patch.status = "returned";
          await db.from("orders").update(patch).eq("id", order.id);
          await restoreStock(order.id, order.order_number, "return", "demo");
          await addEvent(order.id, "status", "Marked as returned (stock restored)", "demo", "delivered", "returned", new Date(t0 + 3 * DAY).toISOString());
        } else await db.from("orders").update(patch).eq("id", order.id);
      } catch {
        // out of stock etc.: skip
      }
    }
  }

  // One product runs low so the alert shows
  const gold = products.find((p) => p.slug === "gold") ?? products[0];
  const goldInv = inv.find((i) => i.product_id === gold.id)!;
  const cur = (must(await db.from("inventory_items").select("on_hand").eq("id", goldInv.id).single()) as Row).on_hand as number;
  if (cur > 7) await db.rpc("adjust_stock", { p_item: goldInv.id, p_delta: -(cur - 7), p_reason: "adjustment", p_note: "Demo: stock count", p_actor: actor, p_demo: true });
  // Incoming batch + near-expiry batch
  await db.from("batches").insert([
    { inventory_item_id: goldInv.id, lot_number: "DEMO-G-2611", expiry_date: new Date(now + 280 * DAY).toISOString().slice(0, 10), quantity: 240, status: "incoming", received_at: null },
    { inventory_item_id: inv[0].id, lot_number: "DEMO-R-2509", expiry_date: new Date(now + 38 * DAY).toISOString().slice(0, 10), quantity: 60, status: "received", received_at: new Date(now - 40 * DAY).toISOString() },
  ]);

  // Abandoned checkouts + funnel events
  await db.from("abandoned_checkouts").insert([
    { name: "Sandy Bou Khalil", phone: "+96170555123", items: [{ name: "GOLD", qty: 2, price: 30 }], total: 60, recovered: false, contacted_at: null, utm_source: "instagram", is_demo: true, created_at: new Date(now - 3 * 3_600_000).toISOString() },
    { name: "Patrick Sarkis", phone: "+96171222987", items: [{ name: "RED BURN", qty: 1, price: 30 }, { name: "CREATINE", qty: 1, price: 30 }], total: 60, recovered: false, contacted_at: null, utm_source: "facebook", is_demo: true, created_at: new Date(now - 26 * 3_600_000).toISOString() },
    { name: "Mira Chedid", phone: "+9613777444", items: [{ name: "CREATINE", qty: 1, price: 30 }], total: 30, recovered: false, contacted_at: new Date(now - 20 * 3_600_000).toISOString(), utm_source: null, is_demo: true, created_at: new Date(now - 50 * 3_600_000).toISOString() },
  ]);
  const events: Row[] = [];
  for (let d = 29; d >= 0; d--) {
    const visits = 20 + Math.floor(rand() * 35);
    for (let v = 0; v < visits; v++) {
      const sid = `demo${d}-${v}`;
      const at = new Date(now - d * DAY - Math.floor(rand() * 20 * 3_600_000)).toISOString();
      const src = rand() > 0.4 ? pick(["instagram", "instagram", "facebook", "google"]) : null;
      events.push({ type: "visit", session_id: sid, path: "/", utm_source: src, is_demo: true, created_at: at });
      if (rand() < 0.3) {
        events.push({ type: "add_to_cart", session_id: sid, path: "/", utm_source: src, is_demo: true, created_at: at });
        if (rand() < 0.5) events.push({ type: "begin_checkout", session_id: sid, path: "/", utm_source: src, is_demo: true, created_at: at });
      }
    }
  }
  await db.from("events").insert(events);
  return { orders: made };
}


function refuseIfProduction() {
  const reasons: string[] = [];
  if (process.env.NODE_ENV === "production") reasons.push("NODE_ENV is production");
  if (process.env.MIEL_ENV === "production" || process.env.RAILWAY_ENVIRONMENT_NAME === "production") reasons.push("this is the production environment");
  if (!["staging", "development"].includes(process.env.MIEL_ENV ?? "")) reasons.push("MIEL_ENV must be staging or development");
  if (reasons.length) {
    console.error("Refusing to seed demo data:\n - " + reasons.join("\n - "));
    process.exit(1);
  }
}

async function main() {
  refuseIfProduction();
  assertEnv();
  if (!process.argv.includes("--yes")) {
    console.error("This adds about 230 fake orders and 28 fake customers to the CONFIGURED (staging) database. Re-run with --yes to continue.");
    process.exit(1);
  }
  const { orders } = await seedDemo("seed-script");
  console.log(`Done: ${orders} demo orders created (all flagged is_demo). Remove them with: npm run purge-demo -- --confirm`);
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
