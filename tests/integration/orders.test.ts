import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createLocalClient } from "../support/local-db";
import { h, ID, reqHeaders, resetState } from "../support/state";
import { seedStore } from "../support/seed";
import { createOrder, quoteOrder, setOrderStatus } from "@/lib/orders";

const db = () => createLocalClient() as any;
const person = (n = 1) => ({ name: `Customer ${n}`, phone: `03 12${String(n).padStart(4, "0")}`, address: "Hamra, Bldg 5" });
let S: Awaited<ReturnType<typeof seedStore>>;
const stock = async (productId: string) => (await db().from("inventory_items").select("on_hand").eq("product_id", productId).single()).data.on_hand as number;

beforeEach(async () => {
  resetState();
  S = await seedStore();
  reqHeaders["x-forwarded-for"] = "1.1.1.1";
});

describe("order numbering", () => {
  it("the first order is #1001, then #1002", async () => {
    const a = await createOrder({ customer: person(1), items: [{ productId: S.red.id, qty: 1 }], region: "Beirut", source: "web", actor: "customer" });
    const b = await createOrder({ customer: person(2), items: [{ productId: S.red.id, qty: 1 }], region: "Beirut", source: "web", actor: "customer" });
    expect(a.order.order_number).toBe(1001);
    expect(b.order.order_number).toBe(1002);
  });
});

describe("pricing is computed on the server", () => {
  it("uses database prices; the browser sends only product ids and quantities", async () => {
    const q = await quoteOrder({ items: [{ productId: S.red.id, qty: 2 }], region: "Bekaa" });
    expect(q).toMatchObject({ ok: true, subtotal: 60, shipping: 6, total: 66 });
    await db().from("products").update({ price: 35 }).eq("id", S.red.id);
    expect((await quoteOrder({ items: [{ productId: S.red.id, qty: 1 }], region: "Beirut" })).subtotal).toBe(35);
  });
  it("free delivery above the zone threshold", async () => {
    const q = await quoteOrder({ items: [{ productId: S.red.id, qty: 2 }], region: "Beirut" });
    expect(q).toMatchObject({ subtotal: 60, shipping: 0, freeDelivery: true, total: 60 });
  });
  it("rejects crafted quantities, unknown or inactive products", async () => {
    expect((await quoteOrder({ items: [{ productId: S.red.id, qty: -5 }], region: "Beirut" })).ok).toBe(false);
    expect((await quoteOrder({ items: [{ productId: S.red.id, qty: 1000 }], region: "Beirut" })).ok).toBe(false);
    expect((await quoteOrder({ items: [{ productId: "00000000-0000-0000-0000-00000000dead", qty: 1 }], region: "Beirut" })).ok).toBe(false);
    await db().from("products").update({ status: "draft" }).eq("id", S.red.id);
    expect((await quoteOrder({ items: [{ productId: S.red.id, qty: 1 }], region: "Beirut" })).ok).toBe(false);
  });
  it("discount codes apply once and respect their usage limit", async () => {
    const a = await createOrder({ customer: person(1), items: [{ productId: S.red.id, qty: 1 }], region: "Beirut", code: "welcome10", source: "web", actor: "customer" });
    expect(a.order).toMatchObject({ discount_code: "WELCOME10", discount_total: 3, total: 30 }); // 30 - 3 + 3 delivery
    const q = await quoteOrder({ items: [{ productId: S.red.id, qty: 1 }], region: "Beirut", code: "WELCOME10" });
    expect(q.codeMessage).toMatch(/fully used/);
    expect(q.discount).toBe(0);
  });
});

describe("stock", () => {
  it("is deducted when an order is placed", async () => {
    await createOrder({ customer: person(1), items: [{ productId: S.red.id, qty: 3 }], region: "Beirut", source: "web", actor: "customer" });
    expect(await stock(S.red.id)).toBe(47);
    expect((await db().from("stock_movements").select("*")).data).toHaveLength(1);
  });
  it("out of stock: the order is refused and nothing is left behind", async () => {
    await expect(createOrder({ customer: person(1), items: [{ productId: S.gold.id, qty: 6 }], region: "Beirut", source: "web", actor: "customer" })).rejects.toThrow(/out of stock/);
    expect(await stock(S.gold.id)).toBe(5);
    expect((await db().from("orders").select("*")).data).toHaveLength(0);
    expect((await db().from("order_items").select("*")).data).toHaveLength(0);
  });
  it("a multi-product order that fails half-way restores what it took", async () => {
    await expect(createOrder({ customer: person(1), items: [{ productId: S.red.id, qty: 2 }, { productId: S.gold.id, qty: 9 }], region: "Beirut", source: "web", actor: "customer" })).rejects.toThrow(/out of stock/);
    expect(await stock(S.red.id)).toBe(50);
    expect(await stock(S.gold.id)).toBe(5);
  });
  it("cancelling restores stock (once)", async () => {
    const { order } = await createOrder({ customer: person(1), items: [{ productId: S.red.id, qty: 4 }], region: "Beirut", source: "web", actor: "customer" });
    await expect(setOrderStatus(order.id, "cancelled", "a@t.test", {})).rejects.toThrow(/reason/);
    await setOrderStatus(order.id, "cancelled", "a@t.test", { reason: "Customer changed their mind" });
    expect(await stock(S.red.id)).toBe(50);
    await expect(setOrderStatus(order.id, "confirmed", "a@t.test")).rejects.toThrow(/can't change status/);
    expect(await stock(S.red.id)).toBe(50);
  });
  it("returns restore stock; drafts don't deduct until confirmed", async () => {
    const d = await createOrder({ customer: person(1), items: [{ productId: S.red.id, qty: 2 }], region: "Beirut", source: "manual", draft: true, actor: "a@t.test" });
    expect(await stock(S.red.id)).toBe(50);
    await setOrderStatus(d.order.id, "new", "a@t.test");
    expect(await stock(S.red.id)).toBe(48);
    await setOrderStatus(d.order.id, "delivered", "a@t.test");
    await setOrderStatus(d.order.id, "returned", "a@t.test");
    expect(await stock(S.red.id)).toBe(50);
  });
});

describe("customers", () => {
  it("are matched by normalised phone and blocked customers cannot order", async () => {
    await createOrder({ customer: { ...person(1), phone: "03 123 456" }, items: [{ productId: S.red.id, qty: 1 }], region: "Beirut", source: "web", actor: "customer" });
    await createOrder({ customer: { ...person(1), phone: "+961 3 123 456" }, items: [{ productId: S.red.id, qty: 1 }], region: "Beirut", source: "web", actor: "customer" });
    expect((await db().from("customers").select("*")).data).toHaveLength(1);
    await db().from("customers").update({ blocked: true }).eq("phone", "+9613123456");
    await expect(createOrder({ customer: { ...person(1), phone: "03123456" }, items: [{ productId: S.red.id, qty: 1 }], region: "Beirut", source: "web", actor: "customer" })).rejects.toThrow(/can't take this order/);
  });
  it("invalid phones and short names/addresses are refused", async () => {
    await expect(createOrder({ customer: { ...person(1), phone: "12345" }, items: [{ productId: S.red.id, qty: 1 }], region: "Beirut", source: "web", actor: "customer" })).rejects.toThrow(/Lebanese phone/);
    await expect(createOrder({ customer: { ...person(1), name: "A" }, items: [{ productId: S.red.id, qty: 1 }], region: "Beirut", source: "web", actor: "customer" })).rejects.toThrow(/name/);
  });
});

describe("storefront checkout (server action)", () => {
  const input = (n: number, over: Record<string, unknown> = {}) => ({
    items: [{ productId: S.red.id, qty: 1 }],
    customer: { ...person(n), notes: "" },
    region: "Beirut",
    code: "",
    ...over,
  });
  async function placeOrder(i: any) {
    const mod = await import("@/app/actions/checkout");
    return mod.placeOrder(i);
  }

  it("creates a real order, decrements stock and builds the WhatsApp message to the store's number", async () => {
    await db().from("settings").insert({ key: "store", value: { whatsapp: "96170999111", cod_enabled: true } });
    const r: any = await placeOrder(input(1));
    expect(r.ok).toBe(true);
    expect(r.orderNumber).toBe("1001");
    expect(r.whatsappUrl).toContain("wa.me/96170999111");
    expect(decodeURIComponent(r.whatsappUrl)).toContain("#1001");
    expect(await stock(S.red.id)).toBe(49);
    const o = (await db().from("orders").select("*").single()).data;
    expect(o).toMatchObject({ status: "new", payment_method: "cod", cod_amount_due: 33, source: "web" });
    expect((await db().from("order_events").select("*")).data.map((e: any) => e.type)).toContain("created");
  });
  it("refuses the honeypot, bad phones, and can be paused by the owner", async () => {
    expect(await placeOrder(input(1, { website: "http://spam" }))).toMatchObject({ ok: false });
    expect(await placeOrder(input(2, { customer: { ...person(2), phone: "999" } }))).toMatchObject({ ok: false, error: expect.stringMatching(/Lebanese phone/) });
    await db().from("settings").insert({ key: "store", value: { whatsapp: "961", cod_enabled: false } });
    expect(await placeOrder(input(3))).toMatchObject({ ok: false, error: expect.stringMatching(/paused/) });
    expect((await db().from("orders").select("*")).data).toHaveLength(0);
  });
  it("rate-limits one connection to 5 orders per 10 minutes", async () => {
    reqHeaders["x-forwarded-for"] = "7.7.7.7";
    const results = [];
    for (let n = 1; n <= 6; n++) results.push(await placeOrder(input(n)) as any);
    expect(results.slice(0, 5).every((r) => r.ok)).toBe(true);
    expect(results[5]).toMatchObject({ ok: false, error: expect.stringMatching(/Too many orders/) });
  });
});

describe("store settings save and load correctly", () => {
  it("round-trips, defaults to Asia/Beirut and USD, and rejects a bad WhatsApp number", async () => {
    h.user = { id: ID.owner, email: "owner@t.test" };
    const { saveStore } = await import("@/app/admin/(app)/settings/actions");
    const fd = new FormData();
    for (const [k, v] of Object.entries({ name: "MIEL+", email: "hi@miel.example", phone: "+961 70 000 000", whatsapp: "+961 70 123 456", instagram_handle: "@miel", instagram_url: "https://instagram.com/miel", cod_enabled: "on" })) fd.set(k, v);
    expect(await saveStore(null, fd)).toMatchObject({ ok: expect.any(String) });
    const { getCatalog } = await import("@/lib/catalog");
    const cat = await getCatalog();
    expect(cat.store).toMatchObject({ whatsapp: "96170123456", currency: "USD", timezone: "Asia/Beirut", cod_enabled: true, instagram_handle: "@miel" });
    const bad = new FormData();
    bad.set("whatsapp", "123");
    expect(await saveStore(null, bad)).toMatchObject({ error: expect.stringMatching(/digits only/) });
  });
  it("the security (require 2FA) setting saves and loads", async () => {
    h.user = { id: ID.owner, email: "owner@t.test" };
    const { saveSecurity } = await import("@/app/admin/(app)/settings/actions");
    const fd = new FormData();
    fd.set("require_2fa", "on");
    await saveSecurity(null, fd);
    expect((await db().from("settings").select("*").eq("key", "security").single()).data.value).toEqual({ require_2fa: true });
  });
});
