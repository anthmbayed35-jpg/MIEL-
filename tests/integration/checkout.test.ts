import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { getEngine } from "../../lib/db/core";
import { placeOrder, quoteAction } from "@/app/actions/checkout";
import { changeStatus } from "@/app/admin/(app)/orders/actions";
import { listOrders } from "@/lib/queries";
import { orderByToken } from "@/lib/order-view";
import { orderRef, parseOrderRef } from "@/lib/order-ref";
import { addressLine } from "@/lib/lebanon";
import { activePaymentMethods, paymentMethod } from "@/lib/payments";
import { setOrderStatus } from "@/lib/orders";
import { h, ID, reqHeaders, resetState } from "../support/state";
import { seedStore } from "../support/seed";
import { checkoutInput, D, deliveryTo } from "../support/checkout";

let S: Awaited<ReturnType<typeof seedStore>>;
const sql = () => getEngine().sqlite;
const onHand = (productId: string) => (sql().prepare("SELECT on_hand FROM inventory_items WHERE product_id = ?").get(productId) as { on_hand: number }).on_hand;
const orders = () => sql().prepare("SELECT * FROM orders ORDER BY order_number").all() as Record<string, string | number>[];
let ip = 1;
beforeEach(async () => {
  resetState();
  S = await seedStore();
  h.user = null;
  reqHeaders["x-forwarded-for"] = `10.1.1.${ip++}`; // a fresh connection each time, so the rate limit never interferes
});
const place = (over: Parameters<typeof checkoutInput>[1] = {}, product = S.red.id) => placeOrder(checkoutInput(product, over));

describe("prices, delivery fee and free delivery", () => {
  it("prices come from the database: subtotal, the flat $5 delivery, total", async () => {
    const q = await quoteAction([{ productId: S.red.id, qty: 2 }, { productId: S.gold.id, qty: 1 }], "Beirut", "");
    expect(q).toMatchObject({ ok: true, subtotal: 90, shipping: 0, total: 90, freeDelivery: true }); // $90 is over the Beirut free-delivery line ($60)
    const small = await quoteAction([{ productId: S.red.id, qty: 1 }], "Beirut", "");
    expect(small).toMatchObject({ subtotal: 30, shipping: 5, total: 35, freeDelivery: false });
    const bekaa = await quoteAction([{ productId: S.red.id, qty: 3 }], "Bekaa", "");
    expect(bekaa).toMatchObject({ subtotal: 90, shipping: 5, total: 95 }); // the same $5 as Beirut (Bekaa has no free-delivery line in this seed)
    expect(await quoteAction([{ productId: S.red.id, qty: 1 }], "", "")).toMatchObject({ shipping: 5, total: 35 }); // no area chosen yet: the flat fee is already shown
  });

  it("the free-delivery line counts the products AFTER the discount; a promo code keeps working", async () => {
    // 2 pouches = $60 = exactly the line. With 10% off the products are $54, under the line: delivery is charged.
    expect(await quoteAction([{ productId: S.red.id, qty: 2 }], "Beirut", "")).toMatchObject({ total: 60, shipping: 0 });
    expect(await quoteAction([{ productId: S.red.id, qty: 2 }], "Beirut", "WELCOME10")).toMatchObject({ subtotal: 60, discount: 6, shipping: 5, total: 59 });
    const r = await place({ qty: 2, code: "WELCOME10" });
    expect(r).toMatchObject({ ok: true });
    expect(orders()[0]).toMatchObject({ discount_code: "WELCOME10", total_cents: 5900, shipping_fee_cents: 500 });
  });

  it("a tampered request cannot change a price: only product ids and quantities are read; bad quantities are refused", async () => {
    const tampered = { ...checkoutInput(S.red.id), items: [{ productId: S.red.id, qty: 1, price: 0.01, unitPrice: 0.01 }], total: 0.01, shipping: 0, region: "Nowhere" } as never;
    const r = await placeOrder(tampered);
    expect(r).toMatchObject({ ok: true });
    expect(orders()[0]).toMatchObject({ subtotal_cents: 3000, shipping_fee_cents: 500, total_cents: 3500, region: "Beirut" });
    expect(sql().prepare("SELECT unit_price_cents FROM order_items").get()).toEqual({ unit_price_cents: 3000 });
    for (const qty of [0, -3, 1.5, 100, Number.NaN]) {
      const bad = await place({ qty });
      expect(bad, `qty ${qty}`).toMatchObject({ ok: false });
    }
    expect(orders()).toHaveLength(1);
  });
});

describe("order creation", () => {
  it("creates the order with a readable number, a private token, the address in parts and the payment method", async () => {
    sql().prepare("INSERT INTO shipping_zones (id, name, fee_cents, eta, active, sort) VALUES (?, 'Mount Lebanon', 400, '1 to 2 days', 1, 3)").run(crypto.randomUUID()); // an old per-zone fee in the database is ignored
    const r = await place({
      customer: { name: "  Lina   Haddad ", phone: "+961 70 123 456", email: "lina@example.com" },
      delivery: deliveryTo(D.meten, 0, { street: "Main street, Bldg 12, floor 4", landmark: "the pharmacy", notes: "Call before" }),
      heardFrom: "Instagram",
    });
    expect(r).toMatchObject({ ok: true, orderNumber: "MP-1001", token: expect.stringMatching(/^[0-9a-f]{32}$/) });
    const o = orders()[0];
    expect(o).toMatchObject({
      order_number: 1001, status: "new", payment_method: "cod", payment_status: "pending", governorate: "Mount Lebanon", district: "El Meten", governorate_id: "LB3", district_id: "LB36", street: "Main street, Bldg 12, floor 4",
      landmark: "the pharmacy", region: "Mount Lebanon", region_id: expect.stringMatching(/^LBN/), region_name: expect.any(String), heard_from: "Instagram", shipping_fee_cents: 500, total_cents: 3500, cod_amount_due_cents: 3500, // the courier collects the whole total
    });
    expect(String(o.address)).toBe(`Main street, Bldg 12, floor 4 · ${o.region_name}, El Meten, Mount Lebanon · Near the pharmacy`);
    expect(String(o.customer_notes)).toBe("Call before");
    expect(sql().prepare("SELECT name FROM customers").get()).toEqual({ name: "Lina Haddad" }); // spaces tidied
  });

  it("keeps the price at the time of purchase, normalizes the phone, links the customer, and tells the team and the customer", async () => {
    const r = await place({ customer: { name: "Rami K", phone: "03 123 456", email: "rami@example.com" } });
    expect(r).toMatchObject({ ok: true });
    expect(sql().prepare("SELECT phone, email FROM customers").get()).toEqual({ phone: "+9613123456", email: "rami@example.com" });
    sql().prepare("UPDATE products SET price_cents = 4500 WHERE id = ?").run(S.red.id); // the price changes later
    expect(sql().prepare("SELECT unit_price_cents, qty FROM order_items").get()).toEqual({ unit_price_cents: 3000, qty: 1 }); // the order keeps what was paid
    expect((r as { whatsappUrl: string }).whatsappUrl).toContain("wa.me/");
    expect(decodeURIComponent((r as { whatsappUrl: string }).whatsappUrl)).toContain("MP-1001");
  });

  it("a double click (same attempt key) creates ONE order and takes stock once", async () => {
    const before = onHand(S.red.id);
    const key = "attempt-1";
    const [a, b] = await Promise.all([place({ idempotencyKey: key }), place({ idempotencyKey: key })]);
    expect(a).toMatchObject({ ok: true });
    expect(b).toMatchObject({ ok: true });
    expect((a as { token: string }).token).toBe((b as { token: string }).token);
    expect(orders()).toHaveLength(1);
    expect(onHand(S.red.id)).toBe(before - 1);
  });

  it("only the active payment method is accepted (online methods can be added later without redesign)", async () => {
    expect(activePaymentMethods().map((m) => m.id)).toEqual(["cod"]);
    expect(paymentMethod("card")).toBeNull();
    expect(await place({ paymentMethod: "card" })).toMatchObject({ ok: false, field: "payment" });
    expect(orders()).toHaveLength(0);
  });
});

describe("validation in plain language", () => {
  it("every field is checked on the server, with the field named", async () => {
    let n = 0;
    const place = (over: Parameters<typeof checkoutInput>[1] = {}) => {
      reqHeaders["x-forwarded-for"] = `10.3.${n++}.1`; // each attempt from its own connection: this test is about validation, not the rate limit
      return placeOrder(checkoutInput(S.red.id, over));
    };
    expect(await place({ name: "A" })).toMatchObject({ ok: false, field: "name", error: expect.stringMatching(/full name/) });
    for (const phone of ["999", "abc", "12345", "+44 20 7946 0958", ""]) expect(await place({ phone }), phone).toMatchObject({ ok: false, field: "phone", error: expect.stringMatching(/Lebanese phone/) });
    expect(await place({ customer: { name: "Test Customer", phone: "03 123 456", email: "not-an-email" } })).toMatchObject({ ok: false, field: "email" });
    const d = (over: object) => ({ ...deliveryTo(D.beirut), ...over });
    expect(await place({ delivery: d({ governorateId: "" }) })).toMatchObject({ ok: false, field: "governorate" });
    expect(await place({ delivery: d({ governorateId: "LB3" }) })).toMatchObject({ ok: false, field: "district" }); // the district belongs to another governorate
    expect(await place({ delivery: d({ governorateId: "Atlantis" }) })).toMatchObject({ ok: false, field: "governorate" });
    expect(await place({ delivery: d({ districtId: "" }) })).toMatchObject({ ok: false, field: "district" });
    expect(await place({ delivery: d({ regionId: "" }) })).toMatchObject({ ok: false, field: "region" });
    expect(await place({ delivery: deliveryTo(D.meten, 0, { regionId: deliveryTo(D.beirut).regionId }) })).toMatchObject({ ok: false, field: "region" }); // a Beirut neighbourhood in El Meten
    expect(await place({ delivery: d({ regionId: "' OR 1=1 --" }) })).toMatchObject({ ok: false, field: "region" });
    expect(await place({ delivery: d({ street: "x" }) })).toMatchObject({ ok: false, field: "street" });
    expect(await place({ delivery: d({ street: "s".repeat(300) }) })).toMatchObject({ ok: false });
    expect(await placeOrder({ ...checkoutInput(S.red.id), items: [] })).toMatchObject({ ok: false, error: expect.stringMatching(/cart is empty/) });
    expect(orders()).toHaveLength(0);
  });

  it("local and international Lebanese numbers are accepted and stored the same way", async () => {
    for (const [i, phone] of ["03 123 456", "+961 3 123 456", "00961 70 123 456", "70123456", "81 234 567"].entries()) {
      reqHeaders["x-forwarded-for"] = `10.9.9.${i}`;
      expect(await place({ phone, name: `Person ${i}` }), phone).toMatchObject({ ok: true });
    }
    for (const c of sql().prepare("SELECT phone FROM customers").all() as { phone: string }[]) expect(c.phone).toMatch(/^\+961\d{7,8}$/);
  });

  it("every region of every governorate is delivered to, whatever is (or is not) set up as a delivery zone, at the same flat fee", async () => {
    // the seed has the Beirut and Bekaa zones only; the South has no zone at all, and Beirut's zone is switched off
    sql().prepare("UPDATE shipping_zones SET active = 0 WHERE name = 'Beirut'").run();
    expect(await place({ delivery: deliveryTo(D.sidon) })).toMatchObject({ ok: true });
    reqHeaders["x-forwarded-for"] = "10.8.8.8";
    expect(await place({ phone: "03 818 000" })).toMatchObject({ ok: true });
    expect(orders().map((o) => o.shipping_fee_cents)).toEqual([500, 500]);
  });

  it("the spam checks stay: honeypot, and a connection cannot place more than 5 orders in 10 minutes", async () => {
    expect(await place({ website: "http://spam.example" })).toMatchObject({ ok: false });
    reqHeaders["x-forwarded-for"] = "10.200.0.1";
    const results = [];
    for (let n = 0; n < 6; n++) results.push(await place({ phone: `03 22${n} 33${n}`, name: `Buyer ${n}` }));
    expect(results.slice(0, 5).every((r) => r.ok)).toBe(true);
    expect(results[5]).toMatchObject({ ok: false, error: expect.stringMatching(/Too many orders/) });
  });
});

describe("stock", () => {
  it("overselling is blocked, with the number left, and nothing is written", async () => {
    expect(onHand(S.gold.id)).toBe(5);
    expect(await place({ qty: 6 }, S.gold.id)).toMatchObject({ ok: false, error: expect.stringMatching(/Only 5 left of GOLD/) });
    expect(orders()).toHaveLength(0);
    expect(onHand(S.gold.id)).toBe(5);
    expect(await place({ qty: 5 }, S.gold.id)).toMatchObject({ ok: true });
    expect(onHand(S.gold.id)).toBe(0);
    reqHeaders["x-forwarded-for"] = "10.77.7.7";
    expect(await place({ qty: 1, phone: "03 999 888" }, S.gold.id)).toMatchObject({ ok: false, error: expect.stringMatching(/out of stock/) });
  });

  it("placing takes stock; cancelling, refusing or returning gives it back exactly once", async () => {
    const start = onHand(S.red.id);
    const ids: string[] = [];
    for (const [i, status] of (["cancelled", "refused", "returned"] as const).entries()) {
      reqHeaders["x-forwarded-for"] = `10.55.5.${i}`;
      await place({ qty: 2, phone: `03 55${i} 666`, name: `Stock ${i}` });
      const id = (sql().prepare("SELECT id FROM orders ORDER BY order_number DESC LIMIT 1").get() as { id: string }).id;
      ids.push(id);
      expect(onHand(S.red.id)).toBe(start - 2 * (i + 1) + 2 * i); // each previous one already gave its stock back
      if (status === "returned") await setOrderStatus(id, "delivered", "t");
      await setOrderStatus(id, status, "t", { reason: "test" });
      expect(onHand(S.red.id), status).toBe(start);
      await expect(setOrderStatus(id, "new", "t")).rejects.toThrow(/can't change status/); // a closed order stays closed: no second restore
      expect(onHand(S.red.id)).toBe(start);
    }
  });

  it("a cancelled order's stock movements are all recorded", async () => {
    await place({ qty: 2 });
    const id = (sql().prepare("SELECT id FROM orders").get() as { id: string }).id;
    await setOrderStatus(id, "cancelled", "t", { reason: "customer asked" });
    expect(sql().prepare("SELECT reason, delta FROM stock_movements WHERE order_id = ? ORDER BY created_at, rowid").all(id)).toEqual([
      { reason: "sale", delta: -2 },
      { reason: "cancel_restore", delta: 2 },
    ]);
  });
});

describe("status flow and the confirmation page", () => {
  it("new, confirmed, out for delivery, delivered, and the closed statuses cancelled, refused, returned; every change is logged", async () => {
    await place();
    const id = (sql().prepare("SELECT id FROM orders").get() as { id: string }).id;
    h.user = { id: ID.owner, email: "owner@t.test" };
    const fd = (to: string) => {
      const f = new FormData();
      f.set("id", id);
      f.set("to", to);
      return f;
    };
    for (const to of ["confirmed", "out_for_delivery", "delivered"]) expect(await changeStatus(null, fd(to))).toMatchObject({ ok: expect.any(String) });
    expect(sql().prepare("SELECT status, delivered_at FROM orders").get()).toMatchObject({ status: "delivered", delivered_at: expect.any(String) });
    expect(await changeStatus(null, fd("refused"))).toMatchObject({ ok: expect.any(String) });
    expect(sql().prepare("SELECT status FROM orders").get()).toEqual({ status: "refused" });
    expect(sql().prepare("SELECT to_status FROM order_events WHERE type = 'status' ORDER BY created_at, rowid").all().map((r) => (r as { to_status: string }).to_status)).toEqual(["confirmed", "out_for_delivery", "delivered", "refused"]);
    expect(await changeStatus(null, fd("new"))).toMatchObject({ error: expect.any(String) });
  });

  it("the confirmation page finds ONLY the order with that token and exposes no phone or other customer's data", async () => {
    await place({ name: "Alpha One", phone: "03 111 111" });
    reqHeaders["x-forwarded-for"] = "10.66.6.6";
    await place({ name: "Beta Two", phone: "03 222 222" });
    const [a, b] = orders() as { public_token: string; order_number: number }[];
    expect(a.public_token).not.toBe(b.public_token);
    const va = orderByToken(a.public_token)!;
    expect(va).toMatchObject({ number: 1001, name: "Alpha One", total: 35, items: [{ name: "RED BURN", qty: 1, unitPrice: 30 }] });
    const dump = JSON.stringify(va);
    for (const secret of ["Beta", "03 222", "9613222", "9613111", b.public_token]) expect(dump, secret).not.toContain(secret);
    for (const bad of ["", "abc", "1001", "../x", "a".repeat(32), a.public_token.toUpperCase(), a.public_token + "0", "' OR 1=1 --"]) expect(orderByToken(bad), bad).toBeNull();
    // the page itself: not found for a wrong token, found (and noindex) for the right one
    const { default: Page, metadata } = await import("@/app/(store)/order/[token]/page");
    expect(metadata.robots).toMatchObject({ index: false });
    await expect(Page({ params: Promise.resolve({ token: "f".repeat(32) }) })).rejects.toThrow("HTTP_404");
  });
});

describe("admin: search, counts and the order number", () => {
  it("MP numbers, plain numbers, names and phones all find the order", async () => {
    await place({ name: "Findable Person", phone: "03 424 242" });
    h.user = { id: ID.owner, email: "owner@t.test" };
    for (const q of ["MP-1001", "mp1001", "#1001", "1001", "Findable", "424242", "03 424 242"]) expect((await listOrders({ q })).orders, q).toHaveLength(1);
    expect((await listOrders({ q: "MP-9999" })).orders).toHaveLength(0);
    expect((await listOrders({ q: "nobody" })).orders).toHaveLength(0);
    expect(orderRef(1001)).toBe("MP-1001");
    expect(parseOrderRef("MP-1001")).toBe(1001);
    expect(parseOrderRef("hello")).toBeNull();
  });

  it("filters by status and date", async () => {
    await place();
    const rows = await listOrders({ status: "new" });
    expect(rows.orders).toHaveLength(1);
    expect((await listOrders({ status: "delivered" })).orders).toHaveLength(0);
    const today = new Date().toISOString().slice(0, 10);
    expect((await listOrders({ from: today, to: today })).orders).toHaveLength(1);
    expect((await listOrders({ from: "2001-01-01", to: "2001-01-02" })).orders).toHaveLength(0);
  });
});

describe("address helpers", () => {
  it("one readable address line", () => {
    expect(addressLine({ street: "Main st, Bldg 1", region: "Antelias", district: "El Meten", governorate: "Mount Lebanon", landmark: "Pharmacy" })).toBe("Main st, Bldg 1 · Antelias, El Meten, Mount Lebanon · Near Pharmacy");
    expect(addressLine({ street: "Hamra St", region: "Hamra", district: "Beirut", governorate: "Beirut" })).toBe("Hamra St · Hamra, Beirut");
    expect(addressLine({ street: "Hamra St", district: "Beirut", governorate: "Beirut" })).toBe("Hamra St · Beirut");
  });
});
