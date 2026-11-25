import "server-only";
import crypto from "node:crypto";
import { adjustStock } from "./db/core";
import { friendly, getEngine, type Row } from "./db";
import { publish } from "./events";
import { notifyAmbassador } from "./ambassador/notify";
import { affiliateDiscountCents, commissionCents } from "./affiliate-math";
import { normalizeLebanesePhone } from "./phone";
import { deliveryFee } from "./delivery";
import { paymentMethod } from "./payments";
import { inMaintenance } from "./site-mode";
import type { OrderStatus } from "./status";

/** Money is computed in integer cents and only converted to dollars for display and the API of this module. */
const cents = (dollars: number) => Math.round(Number(dollars) * 100);
const dollars = (c: number) => c / 100;

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
  /** Set when the code is an influencer's affiliate code (percent values are x100: 15% = 1500). */
  affiliate?: { id: string; code: string; discountPercentX100: number; commissionPercentX100: number; phone: string };
};

const q1 = (table: string) => getEngine().from(table);
const one = (r: { data: any; error: { message: string } | null }) => {
  if (r.error) throw new Error(friendly(r.error.message));
  return r.data;
};

/** Price an order from database prices (never from the browser). Synchronous, so it can run inside the order transaction. */
export function quoteSync(input: { items: LineInput[]; region?: string; code?: string }): Quote {
  const empty = (error: string): Quote => ({ ok: false, error, lines: [], subtotal: 0, discount: 0, shipping: 0, total: 0, freeDelivery: false });
  const items = (input.items ?? []).filter((i) => i && Number.isInteger(i.qty) && i.qty > 0 && i.qty <= 99);
  if (!items.length) return empty("Your cart is empty.");

  const prods = one(q1("products").select("*").in("id", items.map((i) => i.productId)).eq("status", "active").execute()) as Row[];
  const lines: QuoteLine[] = [];
  for (const it of items) {
    const p = prods.find((x) => x.id === it.productId);
    if (!p) return empty("A product in your cart is no longer available.");
    lines.push({ productId: p.id, name: p.name, unitPrice: Number(p.price), qty: it.qty, slug: p.slug });
  }
  const subtotalC = lines.reduce((n, l) => n + cents(l.unitPrice) * l.qty, 0);

  let zone: Row | undefined;
  if (input.region) zone = (one(q1("shipping_zones").select("*").eq("name", input.region).eq("active", true).execute()) as Row[])[0];
  // ONE flat delivery fee for every order and every region (Settings > Shipping & delivery). The zone only matters for the free-delivery line below.
  let shippingC = cents(deliveryFee());

  let discountC = 0;
  let code: string | undefined;
  let codeMessage: string | undefined;
  let freeDelivery = false;
  let affiliate: Quote["affiliate"];
  if (input.code?.trim()) {
    const c = input.code.trim().toUpperCase();
    const d = (one(q1("discounts").select("*").eq("code", c).execute()) as Row[])[0];
    const now = new Date().toISOString();
    const aff = d
      ? undefined
      : (getEngine().sqlite
          .prepare("SELECT id, code, status, phone, customer_discount_percent_x100 AS pct, commission_rate_x100 AS rate FROM affiliates WHERE code = ?")
          .get(c) as { id: string; code: string; status: string; phone: string; pct: number; rate: number } | undefined);
    if (aff) {
      // an influencer's code: valid only while the affiliate is active; the follower discount is a share of the PRODUCTS subtotal
      if (aff.status !== "active") codeMessage = "That code isn't valid.";
      else {
        discountC = affiliateDiscountCents(subtotalC, aff.pct);
        code = aff.code;
        affiliate = { id: aff.id, code: aff.code, discountPercentX100: aff.pct, commissionPercentX100: aff.rate, phone: aff.phone };
        codeMessage = discountC ? `Code applied: ${aff.pct / 100}% off your products.` : "Code applied.";
      }
    } else if (!d || !d.active) codeMessage = "That code isn't valid.";
    else if (d.starts_at && now < d.starts_at) codeMessage = "That code isn't active yet.";
    else if (d.ends_at && now > d.ends_at) codeMessage = "That code has expired.";
    else if (d.usage_limit != null && d.used_count >= d.usage_limit) codeMessage = "That code has been fully used.";
    else if (subtotalC < cents(d.min_order)) codeMessage = `Spend at least $${Number(d.min_order)} to use this code.`;
    else {
      const eligibleC = d.product_ids?.length
        ? lines.filter((l) => d.product_ids.includes(l.productId)).reduce((n, l) => n + cents(l.unitPrice) * l.qty, 0)
        : subtotalC;
      if (d.product_ids?.length && eligibleC === 0) codeMessage = "That code doesn't apply to these products.";
      else {
        if (d.type === "percent") discountC = Math.round((eligibleC * Number(d.value)) / 100);
        else if (d.type === "fixed") discountC = Math.min(cents(d.value), eligibleC);
        else if (d.type === "free_delivery") freeDelivery = true;
        code = c;
        codeMessage = "Code applied.";
      }
    }
  }
  if (zone && zone.free_over != null && subtotalC - discountC >= cents(zone.free_over)) freeDelivery = true;
  if (freeDelivery) shippingC = 0;
  return {
    ok: true, lines, subtotal: dollars(subtotalC), discount: dollars(discountC), shipping: dollars(shippingC),
    total: dollars(Math.max(0, subtotalC - discountC) + shippingC), zone, code, codeMessage, freeDelivery, affiliate,
  };
}

export async function quoteOrder(input: { items: LineInput[]; region?: string; code?: string }): Promise<Quote> {
  return quoteSync(input);
}

/** Inventory items (and quantities) consumed by order lines. Bundles consume their components. */
function stockNeeds(lines: { productId: string; qty: number }[]) {
  const prods = one(q1("products").select("id, kind, bundle_items, name").in("id", lines.map((l) => l.productId)).execute()) as Row[];
  const need = new Map<string, number>(); // product_id -> qty
  for (const l of lines) {
    const p = prods.find((x) => x.id === l.productId);
    if (p?.kind === "bundle" && p.bundle_items?.length)
      for (const b of p.bundle_items as { product_id: string; qty: number }[]) need.set(b.product_id, (need.get(b.product_id) ?? 0) + b.qty * l.qty);
    else need.set(l.productId, (need.get(l.productId) ?? 0) + l.qty);
  }
  const items = one(q1("inventory_items").select("*").in("product_id", [...need.keys()]).execute()) as Row[];
  return [...need.entries()].map(([productId, qty]) => ({ productId, qty, item: items.find((i) => i.product_id === productId) }));
}

/** Take stock for an order. Runs inside the caller's transaction: any shortage throws and everything rolls back. */
function deductStockSync(orderId: string, orderNumber: number, lines: { productId: string; qty: number }[], actor: string, demo: boolean) {
  const sqlite = getEngine().sqlite;
  for (const n of stockNeeds(lines)) {
    if (!n.item) continue; // product without inventory tracking
    try {
      adjustStock(sqlite, { p_item: n.item.id, p_delta: -n.qty, p_reason: "sale", p_note: `Order #${orderNumber}`, p_order: orderId, p_actor: actor, p_demo: demo });
    } catch {
      const name = (one(q1("products").select("name").eq("id", n.productId).single().execute()) as Row).name;
      const left = (sqlite.prepare("SELECT on_hand FROM inventory_items WHERE id = ?").get(n.item.id) as { on_hand: number } | undefined)?.on_hand ?? 0;
      throw new Error(left > 0 ? `Only ${left} left of ${name}. Lower the quantity in your cart.` : `${name} is out of stock.`);
    }
  }
}

/** Give stock back exactly once: the `stock_deducted` flag is cleared with a guarded UPDATE in the same transaction. */
function restoreStockSync(orderId: string, orderNumber: number, reason: "cancel_restore" | "return", actor: string) {
  const sqlite = getEngine().sqlite;
  const flag = sqlite.prepare("UPDATE orders SET stock_deducted = 0 WHERE id = ? AND stock_deducted = 1 RETURNING is_demo").get(orderId) as { is_demo: number } | undefined;
  if (!flag) return; // nothing was deducted, or it was already restored
  const items = one(q1("order_items").select("*").eq("order_id", orderId).execute()) as Row[];
  for (const n of stockNeeds(items.map((i) => ({ productId: i.product_id, qty: i.qty })))) {
    if (!n.item) continue;
    adjustStock(sqlite, { p_item: n.item.id, p_delta: n.qty, p_reason: reason, p_note: `Order #${orderNumber}`, p_order: orderId, p_actor: actor, p_demo: !!flag.is_demo });
  }
}

export async function deductStock(orderId: string, orderNumber: number, lines: { productId: string; qty: number }[], actor: string, demo = false) {
  getEngine().tx(() => deductStockSync(orderId, orderNumber, lines, actor, demo));
}
export async function restoreStock(orderId: string, orderNumber: number, reason: "cancel_restore" | "return", actor: string) {
  getEngine().tx(() => restoreStockSync(orderId, orderNumber, reason, actor));
}

function addEventSync(orderId: string, type: string, message: string, actor: string, from?: string, to?: string, at?: string) {
  one(q1("order_events").insert({ order_id: orderId, type, message, from_status: from ?? null, to_status: to ?? null, actor, ...(at ? { created_at: at } : {}) }).execute());
}
export async function addEvent(orderId: string, type: string, message: string, actor: string, from?: string, to?: string, at?: string) {
  addEventSync(orderId, type, message, actor, from, to, at);
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
  /** Same key twice = same order (a double click or a retry after a bad connection never places two orders). */
  idempotencyKey?: string;
  /** Set ONLY by the checkout action for a signed-in admin who explicitly confirmed a TEST order while the storefront is hidden. */
  test?: { by: string };
  /** How the customer reached the code: typed it (code) or arrived through an ambassador's personal link (link). Only a label: the discount and the commission come from the code. */
  attribution?: "code" | "link";
  /** The optional "How did you hear about us?" answer from checkout. */
  heardFrom?: string;
  /** The address in parts (checkout). `customer.address` stays the one readable line. */
  delivery?: {
    governorate: string; district: string; street: string; landmark: string;
    /** The location ids and the region (town or village) name, saved next to the names so a later rename never changes an order. */
    governorateId?: string; districtId?: string; regionId?: string; regionName?: string;
    /** set when the customer's area was not in the list (the order keeps what they typed in regionName) */
    unlistedAreaId?: string;
    /** The optional map pin (checked to be inside Lebanon by the checkout action). */
    pin?: { lat: number; lon: number; link: string };
  };
  /** Payment method id (lib/payments.ts). Defaults to cash on delivery. */
  paymentMethod?: string;
};

export type PlacedOrder = { order: Row; customer: Row; quote: Quote; replayed?: boolean };

/**
 * Place an order. Everything below runs in ONE `BEGIN IMMEDIATE` transaction (the write lock is taken first, so two
 * customers can never both take the last pouch): validate and price, upsert the customer, create the order and items,
 * write stock movements, apply the discount and count its use, add the timeline event, store the idempotency key.
 * Any failure rolls the whole thing back. Throws Error(message) for user-facing problems.
 */
export function placeOrder(input: CreateOrderInput): PlacedOrder {
  // Last line of defence: nobody orders through the storefront while it is hidden, admins included, UNLESS the order is an
  // explicitly confirmed TEST order (flagged is_test, kept out of statistics). Orders typed in by the team in the admin still work.
  if (input.source === "web" && inMaintenance() && !input.test) throw new Error("MIEL+ isn't taking orders yet. Something new is coming.");
  const testBy = input.test && inMaintenance() ? input.test.by : null;
  const phone = normalizeLebanesePhone(input.customer.phone);
  if (!phone) throw new Error("Enter a valid Lebanese phone number, e.g. 03 123 456 or +961 70 123 456.");
  if (input.customer.name.trim().length < 2) throw new Error("Enter your name.");
  if (input.customer.address.trim().length < 5) throw new Error("Enter your delivery address.");
  const key = input.idempotencyKey?.slice(0, 80);
  const pay = paymentMethod(input.paymentMethod ?? "cod");
  if (!pay) throw new Error("That payment method is not available.");

  const e = getEngine();
  const out = e.tx((): PlacedOrder => {
    if (key) {
      const seen = e.sqlite.prepare("SELECT order_id FROM idempotency_keys WHERE key = ?").get(key) as { order_id: string } | undefined;
      if (seen) {
        const order = one(q1("orders").select("*").eq("id", seen.order_id).single().execute()) as Row;
        const customer = one(q1("customers").select("*").eq("id", order.customer_id).single().execute()) as Row;
        const items = one(q1("order_items").select("*").eq("order_id", order.id).execute()) as Row[];
        const quote: Quote = {
          ok: true, lines: items.map((i) => ({ productId: i.product_id, name: i.name, unitPrice: Number(i.unit_price), qty: i.qty, slug: "" })),
          subtotal: order.subtotal, discount: order.discount_total, shipping: order.shipping_fee, total: order.total, code: order.discount_code ?? undefined, freeDelivery: false,
        };
        return { order, customer, quote, replayed: true };
      }
    }
    const q = quoteSync({ items: input.items, region: input.region, code: input.code });
    if (!q.ok) throw new Error(q.error ?? "Could not price the order.");

    let customer = (one(q1("customers").select("*").eq("phone", phone).execute()) as Row[])[0];
    if (customer?.blocked) throw new Error("We can't take this order online. Please contact us on WhatsApp.");
    if (q.affiliate && normalizeLebanesePhone(q.affiliate.phone) === phone) throw new Error("You can't use your own affiliate code.");
    if (!customer) {
      customer = one(
        q1("customers").insert({ name: input.customer.name.trim(), phone, email: input.customer.email ?? null, tags: [], notes: "", blocked: false, is_demo: !!input.demo, ...(input.createdAt ? { created_at: input.createdAt } : {}) }).select().single().execute(),
      );
    }

    const number = (e.sqlite.prepare("UPDATE counters SET value = value + 1 WHERE name = 'order_number' RETURNING value").get() as { value: number }).value;
    const status: OrderStatus = input.draft ? "draft" : "new";
    // affiliate attribution (never for a TEST order): the commission is fixed now, on the discounted products subtotal, and starts pending
    const aff = q.affiliate && !testBy ? q.affiliate : null;
    const subtotalC = cents(q.subtotal);
    const discountC = cents(q.discount);
    const stamp = input.createdAt ?? new Date().toISOString();
    const order = one(
      q1("orders").insert({
        order_number: number, customer_id: customer.id, status, payment_method: pay.id, payment_status: "pending", public_token: crypto.randomBytes(16).toString("hex"),
        subtotal: q.subtotal, discount_total: q.discount, shipping_fee: q.shipping, total: q.total, cod_amount_due: pay.collectOnDelivery ? q.total : 0, cod_collected: false,
        discount_code: q.code ?? null, attribution: aff ? (input.attribution === "link" ? "link" : "code") : null,
        heard_from: input.heardFrom?.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80) || null,
        affiliate_id: aff?.id ?? null, code_used: aff?.code ?? null, discount_amount: aff ? q.discount : 0,
        commission_amount: aff ? dollars(commissionCents(subtotalC, discountC, aff.commissionPercentX100)) : 0, commission_status: aff ? "pending" : null,
        region: input.region, address: input.customer.address.trim(),
        governorate: input.delivery?.governorate ?? "", district: input.delivery?.district ?? "", street: input.delivery?.street.trim() ?? "", landmark: input.delivery?.landmark.trim() ?? "",
        governorate_id: input.delivery?.governorateId ?? "", district_id: input.delivery?.districtId ?? "", region_id: input.delivery?.regionId ?? "", region_name: input.delivery?.regionName ?? "",
        unlisted_area_id: input.delivery?.unlistedAreaId ?? "", pin_lat: input.delivery?.pin?.lat ?? null, pin_lon: input.delivery?.pin?.lon ?? null, pin_link: input.delivery?.pin?.link ?? "", customer_notes: (testBy ? "[TEST ORDER] " : "") + (input.customer.notes?.trim() ?? ""),
        delivery_partner_id: null, tracking_number: "", source: input.source,
        utm_source: input.utm?.source ?? null, utm_medium: input.utm?.medium ?? null, utm_campaign: input.utm?.campaign ?? null,
        stock_deducted: false, is_demo: !!input.demo, is_test: !!testBy, created_at: stamp, updated_at: stamp,
      }).select().single().execute(),
    ) as Row;
    if (aff && status !== "draft") notifyAmbassador(e.sqlite, aff.id, "sale", `New order #${number}`, `Commission ${(commissionCents(subtotalC, discountC, aff.commissionPercentX100) / 100).toFixed(2)}, pending until delivery.`, "/ambassador/sales");
    one(q1("order_items").insert(q.lines.map((l) => ({ order_id: order.id, product_id: l.productId, name: l.name, unit_price: l.unitPrice, qty: l.qty }))).execute());

    if (!input.draft) {
      deductStockSync(order.id, number, q.lines, input.actor, !!input.demo);
      one(q1("orders").update({ stock_deducted: true }).eq("id", order.id).execute());
      if (q.code && !q.affiliate) {
        // guarded: if two customers race for the last use of a code, only one wins
        const used = e.sqlite.prepare("UPDATE discounts SET used_count = used_count + 1, version = version + 1 WHERE code = ? AND (usage_limit IS NULL OR used_count < usage_limit) RETURNING id").get(q.code);
        if (!used) throw new Error("That code has been fully used.");
      }
    }
    addEventSync(order.id, "created", testBy ? `TEST order placed by ${testBy} while previewing the hidden storefront (not a real sale)` : input.draft ? "Draft created" : `Order placed (${input.source}), cash on delivery`, input.actor, undefined, status, input.createdAt);
    if (key) e.sqlite.prepare("INSERT INTO idempotency_keys (key, order_id) VALUES (?, ?)").run(key, order.id);
    const fresh = one(q1("orders").select("*").eq("id", order.id).single().execute()) as Row; // with its current version
    return { order: fresh, customer, quote: q };
  });
  if (!out.replayed && !input.draft) publish({ type: "order.created", orderId: out.order.id, number: out.order.order_number, total: out.order.total });
  return out;
}

/** Create customer + order + items (+ stock deduction) from validated input. Throws Error(message) on user-facing problems. */
export async function createOrder(input: CreateOrderInput): Promise<PlacedOrder> {
  return placeOrder(input);
}

/** Change status with all side effects (stock restore on cancel/return, delivered timestamp, draft confirmation), atomically. */
export async function setOrderStatus(orderId: string, to: OrderStatus, actor: string, opts: { reason?: string; message?: string; expectedVersion?: number } = {}) {
  const e = getEngine();
  const result = e.tx(() => {
    const o = one(q1("orders").select("*").eq("id", orderId).single().execute()) as Row;
    const from = o.status as OrderStatus;
    if (from === to) return o;
    if (["cancelled", "returned", "refused"].includes(from)) throw new Error(`A ${from} order can't change status.`);
    if (to === "cancelled" && !opts.reason?.trim()) throw new Error("Add a reason for cancelling.");

    const patch: Row = { status: to, updated_at: new Date().toISOString() };
    if (to === "delivered") patch.delivered_at = new Date().toISOString();

    if (from === "draft" && to !== "cancelled") {
      const items = one(q1("order_items").select("*").eq("order_id", orderId).execute()) as Row[];
      deductStockSync(orderId, o.order_number, items.map((i) => ({ productId: i.product_id, qty: i.qty })), actor, !!o.is_demo);
      patch.stock_deducted = true;
    }
    // a cancelled or returned order earns no commission. If it was ALREADY PAID it keeps its payout link, which makes it a visible
    // correction on the affiliate's balance (deducted from their next payout), never a silent disappearance.
    const wasPaid = o.commission_status === "paid";
    if ((to === "cancelled" || to === "returned" || to === "refused") && (o.commission_status === "pending" || o.commission_status === "approved" || wasPaid)) patch.commission_status = "void";
    if (to === "cancelled") {
      patch.cancel_reason = opts.reason!.trim();
      restoreStockSync(orderId, o.order_number, "cancel_restore", actor);
      patch.cod_collected = false;
    }
    if (to === "returned" || to === "refused") {
      // refused at the door: the pouches come back, so stock is restored exactly once, like a return
      restoreStockSync(orderId, o.order_number, "return", actor);
      if (o.cod_collected) patch.payment_status = "refunded";
    }
    const upd = q1("orders").update(patch).eq("id", orderId);
    if (opts.expectedVersion !== undefined) upd.ifVersion(opts.expectedVersion);
    one(upd.execute());
    if (wasPaid && (to === "cancelled" || to === "returned" || to === "refused")) addEventSync(orderId, "commission", `Affiliate commission of ${Number(o.commission_amount).toFixed(2)} was already paid out: a correction of the same amount is recorded on the affiliate's balance.`, actor);
    addEventSync(orderId, "status", opts.message ?? (to === "cancelled" ? `Cancelled: ${opts.reason}` : to === "returned" ? "Marked as returned (stock restored)" : to === "refused" ? "Refused by the customer (stock restored)" : `Status: ${from} → ${to}`), actor, from, to);
    return { ...o, ...patch, changed: true };
  });
  if (result.changed) publish({ type: "order.status", orderId, number: result.order_number, status: to });
  return result;
}

export const newIdempotencyKey = () => crypto.randomUUID();
