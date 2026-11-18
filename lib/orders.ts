import "server-only";
import { getDb, must, type Row } from "./db";
import { normalizeLebanesePhone } from "./phone";
import type { OrderStatus } from "./status";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type LineInput = { productId: string; qty: number };
export type QuoteLine = { productId: string; name: string; unitPrice: number; qty: number; slug: string };
export type Quote = {
  ok: boolean;
  error?: string;
  lines: QuoteLine[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  zone?: Row;
  code?: string;
  codeMessage?: string;
  freeDelivery: boolean;
};

/** Price an order on the SERVER from database prices. Never trust prices sent by the browser. */
export async function quoteOrder(input: { items: LineInput[]; region?: string; code?: string }): Promise<Quote> {
  const db = getDb();
  const empty = (error: string): Quote => ({ ok: false, error, lines: [], subtotal: 0, discount: 0, shipping: 0, total: 0, freeDelivery: false });
  const items = (input.items ?? []).filter((i) => i && Number.isInteger(i.qty) && i.qty > 0 && i.qty <= 99);
  if (!items.length) return empty("Your cart is empty.");

  const prods = must(await db.from("products").select("*").in("id", items.map((i) => i.productId)).eq("status", "active")) as Row[];
  const lines: QuoteLine[] = [];
  for (const it of items) {
    const p = prods.find((x) => x.id === it.productId);
    if (!p) return empty("A product in your cart is no longer available.");
    lines.push({ productId: p.id, name: p.name, unitPrice: Number(p.price), qty: it.qty, slug: p.slug });
  }
  const subtotal = r2(lines.reduce((n, l) => n + l.unitPrice * l.qty, 0));

  let zone: Row | undefined;
  if (input.region) zone = (must(await db.from("shipping_zones").select("*").eq("name", input.region).eq("active", true)) as Row[])[0];
  let shipping = zone ? Number(zone.fee) : 0;

  let discount = 0;
  let code: string | undefined;
  let codeMessage: string | undefined;
  let freeDelivery = false;
  if (input.code?.trim()) {
    const c = input.code.trim().toUpperCase();
    const d = (must(await db.from("discounts").select("*").eq("code", c)) as Row[])[0];
    const now = new Date().toISOString();
    if (!d || !d.active) codeMessage = "That code isn't valid.";
    else if (d.starts_at && now < d.starts_at) codeMessage = "That code isn't active yet.";
    else if (d.ends_at && now > d.ends_at) codeMessage = "That code has expired.";
    else if (d.usage_limit != null && d.used_count >= d.usage_limit) codeMessage = "That code has been fully used.";
    else if (subtotal < Number(d.min_order)) codeMessage = `Spend at least $${Number(d.min_order)} to use this code.`;
    else {
      const eligible = d.product_ids?.length
        ? lines.filter((l) => d.product_ids.includes(l.productId)).reduce((n, l) => n + l.unitPrice * l.qty, 0)
        : subtotal;
      if (d.product_ids?.length && eligible === 0) codeMessage = "That code doesn't apply to these products.";
      else {
        if (d.type === "percent") discount = r2((eligible * Number(d.value)) / 100);
        else if (d.type === "fixed") discount = r2(Math.min(Number(d.value), eligible));
        else if (d.type === "free_delivery") freeDelivery = true;
        code = c;
        codeMessage = "Code applied.";
      }
    }
  }
  if (zone && zone.free_over != null && subtotal - discount >= Number(zone.free_over)) freeDelivery = true;
  if (freeDelivery) shipping = 0;
  return { ok: true, lines, subtotal, discount, shipping, total: r2(Math.max(0, subtotal - discount) + shipping), zone, code, codeMessage, freeDelivery };
}

/** Inventory items (and quantities) consumed by an order line. Bundles consume their components. */
async function stockNeeds(lines: { productId: string; qty: number }[]) {
  const db = getDb();
  const prods = must(await db.from("products").select("id, kind, bundle_items, name").in("id", lines.map((l) => l.productId))) as Row[];
  const need = new Map<string, number>(); // product_id -> qty
  for (const l of lines) {
    const p = prods.find((x) => x.id === l.productId);
    if (p?.kind === "bundle" && p.bundle_items?.length)
      for (const b of p.bundle_items as { product_id: string; qty: number }[]) need.set(b.product_id, (need.get(b.product_id) ?? 0) + b.qty * l.qty);
    else need.set(l.productId, (need.get(l.productId) ?? 0) + l.qty);
  }
  const items = must(await db.from("inventory_items").select("*").in("product_id", [...need.keys()])) as Row[];
  return [...need.entries()].map(([productId, qty]) => ({ productId, qty, item: items.find((i) => i.product_id === productId) }));
}

export async function deductStock(orderId: string, orderNumber: number, lines: { productId: string; qty: number }[], actor: string, demo = false) {
  const db = getDb();
  const done: { id: string; qty: number }[] = [];
  for (const n of await stockNeeds(lines)) {
    if (!n.item) continue; // product without inventory tracking
    const res = await db.rpc("adjust_stock", { p_item: n.item.id, p_delta: -n.qty, p_reason: "sale", p_note: `Order #${orderNumber}`, p_order: orderId, p_actor: actor, p_demo: demo });
    if (res.error) {
      for (const d of done) await db.rpc("adjust_stock", { p_item: d.id, p_delta: d.qty, p_reason: "rollback", p_note: `Order #${orderNumber} failed`, p_order: orderId, p_actor: actor, p_demo: demo });
      const name = (must(await db.from("products").select("name").eq("id", n.productId).single()) as Row).name;
      throw new Error(`${name} is out of stock.`);
    }
    done.push({ id: n.item.id, qty: n.qty });
  }
}

export async function restoreStock(orderId: string, orderNumber: number, reason: "cancel_restore" | "return", actor: string) {
  const db = getDb();
  const order = must(await db.from("orders").select("stock_deducted, is_demo").eq("id", orderId).single()) as Row;
  if (!order.stock_deducted) return;
  const items = must(await db.from("order_items").select("*").eq("order_id", orderId)) as Row[];
  for (const n of await stockNeeds(items.map((i) => ({ productId: i.product_id, qty: i.qty })))) {
    if (!n.item) continue;
    await db.rpc("adjust_stock", { p_item: n.item.id, p_delta: n.qty, p_reason: reason, p_note: `Order #${orderNumber}`, p_order: orderId, p_actor: actor, p_demo: !!order.is_demo });
  }
  must(await db.from("orders").update({ stock_deducted: false }).eq("id", orderId));
}

export async function addEvent(orderId: string, type: string, message: string, actor: string, from?: string, to?: string, at?: string) {
  must(await getDb().from("order_events").insert({ order_id: orderId, type, message, from_status: from ?? null, to_status: to ?? null, actor, ...(at ? { created_at: at } : {}) }));
}

export type CreateOrderInput = {
  customer: { name: string; phone: string; address: string; notes?: string; email?: string };
  items: LineInput[];
  region: string;
  code?: string;
  source: "web" | "whatsapp" | "manual";
  draft?: boolean;
  utm?: { source?: string; medium?: string; campaign?: string };
  actor: string;
  demo?: boolean;
  createdAt?: string;
};

/** Create customer + order + items (+ stock deduction) from validated input. Throws Error(message) on user-facing problems. */
export async function createOrder(input: CreateOrderInput) {
  const db = getDb();
  const phone = normalizeLebanesePhone(input.customer.phone);
  if (!phone) throw new Error("Enter a valid Lebanese phone number, e.g. 03 123 456 or +961 70 123 456.");
  if (input.customer.name.trim().length < 2) throw new Error("Enter your name.");
  if (input.customer.address.trim().length < 5) throw new Error("Enter your delivery address.");
  const q = await quoteOrder({ items: input.items, region: input.region, code: input.code });
  if (!q.ok) throw new Error(q.error ?? "Could not price the order.");

  let customer = (must(await db.from("customers").select("*").eq("phone", phone)) as Row[])[0];
  if (customer?.blocked) throw new Error("We can't take this order online. Please contact us on WhatsApp.");
  if (!customer) {
    customer = must(await db.from("customers").insert({ name: input.customer.name.trim(), phone, email: input.customer.email ?? null, tags: [], notes: "", blocked: false, is_demo: !!input.demo, ...(input.createdAt ? { created_at: input.createdAt } : {}) }).select().single());
  }

  const number = must(await db.rpc("next_order_number")) as number;
  const status: OrderStatus = input.draft ? "draft" : "new";
  const stamp = input.createdAt ?? new Date().toISOString();
  const order = must(
    await db.from("orders").insert({
      order_number: number, customer_id: customer.id, status, payment_method: "cod", payment_status: "pending",
      subtotal: q.subtotal, discount_total: q.discount, shipping_fee: q.shipping, total: q.total, cod_amount_due: q.total, cod_collected: false,
      discount_code: q.code ?? null, region: input.region, address: input.customer.address.trim(), customer_notes: input.customer.notes?.trim() ?? "",
      delivery_partner_id: null, tracking_number: "", source: input.source,
      utm_source: input.utm?.source ?? null, utm_medium: input.utm?.medium ?? null, utm_campaign: input.utm?.campaign ?? null,
      stock_deducted: false, is_demo: !!input.demo, created_at: stamp, updated_at: stamp,
    }).select().single(),
  ) as Row;
  must(await db.from("order_items").insert(q.lines.map((l) => ({ order_id: order.id, product_id: l.productId, name: l.name, unit_price: l.unitPrice, qty: l.qty }))));

  if (!input.draft) {
    try {
      await deductStock(order.id, number, q.lines, input.actor, input.demo);
      must(await db.from("orders").update({ stock_deducted: true }).eq("id", order.id));
    } catch (e) {
      await db.from("order_items").delete().eq("order_id", order.id);
      await db.from("orders").delete().eq("id", order.id);
      throw e;
    }
    if (q.code) {
      const d = (must(await db.from("discounts").select("id, used_count").eq("code", q.code)) as Row[])[0];
      if (d) must(await db.from("discounts").update({ used_count: d.used_count + 1 }).eq("id", d.id));
    }
  }
  await addEvent(order.id, "created", input.draft ? "Draft created" : `Order placed (${input.source}), cash on delivery`, input.actor, undefined, status, input.createdAt);
  return { order: { ...order, stock_deducted: !input.draft } as Row, customer: customer as Row, quote: q };
}

/** Change status with all side effects (stock restore on cancel/return, delivered timestamp, draft confirmation). */
export async function setOrderStatus(orderId: string, to: OrderStatus, actor: string, opts: { reason?: string; message?: string } = {}) {
  const db = getDb();
  const o = must(await db.from("orders").select("*").eq("id", orderId).single()) as Row;
  const from = o.status as OrderStatus;
  if (from === to) return o;
  if (["cancelled", "returned"].includes(from)) throw new Error(`A ${from} order can't change status.`);
  if (to === "cancelled" && !opts.reason?.trim()) throw new Error("Add a reason for cancelling.");

  const patch: Row = { status: to, updated_at: new Date().toISOString() };
  if (to === "delivered") patch.delivered_at = new Date().toISOString();

  if (from === "draft" && to !== "cancelled") {
    const items = must(await db.from("order_items").select("*").eq("order_id", orderId)) as Row[];
    await deductStock(orderId, o.order_number, items.map((i) => ({ productId: i.product_id, qty: i.qty })), actor, !!o.is_demo);
    patch.stock_deducted = true;
  }
  if (to === "cancelled") {
    patch.cancel_reason = opts.reason!.trim();
    await restoreStock(orderId, o.order_number, "cancel_restore", actor);
    patch.cod_collected = false;
  }
  if (to === "returned") {
    await restoreStock(orderId, o.order_number, "return", actor);
    if (o.cod_collected) patch.payment_status = "refunded";
  }
  must(await db.from("orders").update(patch).eq("id", orderId));
  await addEvent(orderId, "status", opts.message ?? (to === "cancelled" ? `Cancelled: ${opts.reason}` : to === "returned" ? "Marked as returned (stock restored)" : `Status: ${from} → ${to}`), actor, from, to);
  return { ...o, ...patch };
}
