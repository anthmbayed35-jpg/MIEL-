import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { getEngine } from "../../lib/db/core";
import { placeOrder, quoteSync, setOrderStatus } from "@/lib/orders";
import {
  affiliateOrders, affiliatePayouts, affiliateStats, approveApplication, createAccountFromApplication, approveDueCommissions, codeTaken, createAffiliate, createApplication, generateCode,
  getAffiliateByToken, listAffiliates, monthlyRows, overview, recordPayout, rejectApplication, updateAffiliate, upgradeTier,
} from "@/lib/affiliates";
import { resetState } from "../support/state";
import { seedStore } from "../support/seed";

let S: Awaited<ReturnType<typeof seedStore>>;
const sql = () => getEngine().sqlite;
const person = (n: number) => ({ name: `Customer ${n}`, phone: `03 ${String(100000 + n)}`, address: "Hamra, Bldg 5" });
const buy = (n: number, qty: number, code?: string) =>
  placeOrder({ customer: person(n), items: [{ productId: S.red.id, qty }], region: "Beirut", source: "web", actor: "customer", code });
const order = (id: string) => sql().prepare("SELECT * FROM orders WHERE id = ?").get(id) as Record<string, any>;
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const rami = () => createAffiliate({ name: "Rami Khoury", code: "rami10", instagram_handle: "@rami.runs", phone: "03 999 888" });

beforeEach(async () => {
  resetState();
  S = await seedStore();
});

describe("checkout with an affiliate code", () => {
  it("is case-insensitive and discounts 10% of the PRODUCTS subtotal, not delivery", () => {
    rami();
    const q = quoteSync({ items: [{ productId: S.red.id, qty: 1 }], region: "Beirut", code: "rAmI10" });
    expect(q).toMatchObject({ ok: true, subtotal: 30, discount: 3, shipping: 5, total: 32, code: "RAMI10" });
    expect(q.codeMessage).toMatch(/Code applied/);
    const bekaa = quoteSync({ items: [{ productId: S.red.id, qty: 1 }], region: "Bekaa", code: "RAMI10" });
    expect(bekaa).toMatchObject({ discount: 3, shipping: 5, total: 32 }); // the delivery fee is the same flat $5 everywhere and is never discounted
  });

  it("stores the affiliate, code, discount and commission (15% of the discounted subtotal, no delivery), commission pending", () => {
    const a = rami();
    const { order: o } = buy(1, 2, "rami10"); // 60.00, -6.00, delivery 3.00
    const row = order(o.id);
    expect(row).toMatchObject({ affiliate_id: a.id, code_used: "RAMI10", discount_amount_cents: 600, commission_amount_cents: 810, commission_status: "pending", subtotal_cents: 6000, discount_total_cents: 600, total_cents: 5900 });
  });

  it("a plain order has no affiliate fields, and a normal discount code still works exactly as before", () => {
    const { order: o } = buy(1, 1);
    expect(order(o.id)).toMatchObject({ affiliate_id: null, code_used: null, discount_amount_cents: 0, commission_amount_cents: 0, commission_status: null });
    const w = buy(2, 1, "WELCOME10");
    expect(order(w.order.id)).toMatchObject({ affiliate_id: null, discount_total_cents: 300, commission_status: null });
    expect(sql().prepare("SELECT used_count FROM discounts WHERE code = 'WELCOME10'").get()).toEqual({ used_count: 1 });
  });

  it("an invalid, paused or ended code gives a clear error and no discount", () => {
    const a = rami();
    const items = [{ productId: S.red.id, qty: 1 }];
    expect(quoteSync({ items, region: "Beirut", code: "NOPE99" })).toMatchObject({ discount: 0, codeMessage: "That code isn't valid." });
    for (const status of ["paused", "ended"]) {
      sql().prepare("UPDATE affiliates SET status = ? WHERE id = ?").run(status, a.id);
      expect(quoteSync({ items, region: "Beirut", code: "RAMI10" }), status).toMatchObject({ discount: 0, codeMessage: "That code isn't valid." });
    }
    const o = buy(1, 1, "RAMI10"); // an order placed with a dead code is a normal order
    expect(order(o.order.id)).toMatchObject({ affiliate_id: null, commission_status: null, discount_total_cents: 0 });
  });

  it("one code per order: an affiliate code can't be combined with another (the field takes one value)", () => {
    rami();
    const q = quoteSync({ items: [{ productId: S.red.id, qty: 1 }], region: "Beirut", code: "RAMI10 WELCOME10" });
    expect(q.discount).toBe(0);
  });

  it("an affiliate can't use their own code (same phone)", () => {
    rami();
    expect(() => placeOrder({ customer: { name: "Rami K", phone: "03 999 888", address: "Hamra, Bldg 5" }, items: [{ productId: S.red.id, qty: 1 }], region: "Beirut", source: "web", actor: "c", code: "RAMI10" })).toThrow(/own affiliate code/);
    expect(sql().prepare("SELECT COUNT(*) n FROM orders").get()).toEqual({ n: 0 });
  });

  it("an idempotent retry does not create a second commission", () => {
    rami();
    const first = placeOrder({ customer: person(1), items: [{ productId: S.red.id, qty: 1 }], region: "Beirut", source: "web", actor: "c", code: "RAMI10", idempotencyKey: "k1" });
    const again = placeOrder({ customer: person(1), items: [{ productId: S.red.id, qty: 1 }], region: "Beirut", source: "web", actor: "c", code: "RAMI10", idempotencyKey: "k1" });
    expect(again.order.id).toBe(first.order.id);
    expect(sql().prepare("SELECT COUNT(*) n FROM orders WHERE affiliate_id IS NOT NULL").get()).toEqual({ n: 1 });
  });
});

describe("commission lifecycle", () => {
  it("pending until delivered, approved 14 days after delivery (not 13)", async () => {
    const a = rami();
    const { order: o } = buy(1, 1, "RAMI10");
    expect(approveDueCommissions()).toBe(0);
    await setOrderStatus(o.id, "confirmed", "t");
    await setOrderStatus(o.id, "delivered", "t");
    expect(order(o.id).commission_status).toBe("pending");
    sql().prepare("UPDATE orders SET delivered_at = ? WHERE id = ?").run(daysAgo(13), o.id);
    expect(approveDueCommissions()).toBe(0);
    sql().prepare("UPDATE orders SET delivered_at = ? WHERE id = ?").run(daysAgo(14), o.id);
    expect(listAffiliates()[0]).toMatchObject({ id: a.id, approved_cents: 405, pending_cents: 0 }); // the admin list runs the check itself
    expect(order(o.id).commission_status).toBe("approved");
  });

  it("is void when the order is cancelled or returned, and stock still comes back exactly once", async () => {
    rami();
    const stock = () => (sql().prepare("SELECT on_hand FROM inventory_items WHERE product_id = ?").get(S.red.id) as { on_hand: number }).on_hand;
    const c = buy(1, 2, "RAMI10");
    expect(stock()).toBe(48);
    await setOrderStatus(c.order.id, "cancelled", "t", { reason: "customer changed mind" });
    expect(order(c.order.id).commission_status).toBe("void");
    const r = buy(2, 1, "RAMI10");
    for (const s of ["confirmed", "delivered", "returned"] as const) await setOrderStatus(r.order.id, s, "t");
    expect(order(r.order.id).commission_status).toBe("void");
    expect(stock()).toBe(50);
    expect(affiliateStats(order(r.order.id).affiliate_id)).toMatchObject({ orders: 0, sales_cents: 0, pending_cents: 0 }); // void orders earn and count nothing
  });

  it("a commission already paid and then voided stays visible as a correction owed back", async () => {
    const a = rami();
    const { order: o } = buy(1, 1, "RAMI10");
    for (const s of ["confirmed", "delivered"] as const) await setOrderStatus(o.id, s, "t");
    sql().prepare("UPDATE orders SET delivered_at = ? WHERE id = ?").run(daysAgo(20), o.id);
    approveDueCommissions();
    recordPayout(a.id, { method: "Whish", note: "March" });
    await setOrderStatus(o.id, "returned", "t");
    expect(order(o.id)).toMatchObject({ commission_status: "void", commission_payout_id: expect.any(String), commission_correction_payout_id: null }); // void, but still linked to the payout it was paid in
    expect(affiliateStats(a.id)).toMatchObject({ corrections_cents: 405, paid_cents: 0 });
  });
});

describe("recording a payout", () => {
  async function delivered(n: number, qty: number, ageDays: number, code = "RAMI10") {
    const { order: o } = buy(n, qty, code);
    for (const s of ["confirmed", "delivered"] as const) await setOrderStatus(o.id, s, "t");
    sql().prepare("UPDATE orders SET delivered_at = ? WHERE id = ?").run(daysAgo(ageDays), o.id);
    return o.id as string;
  }

  it("pays every approved commission once: marks them paid, records the amount, history and totals add up", async () => {
    const a = rami();
    const o1 = await delivered(1, 1, 20); // 4.05
    const o2 = await delivered(2, 2, 15); // 8.10
    const o3 = await delivered(3, 1, 3); // too young: stays pending
    const o4 = buy(4, 1, "RAMI10").order.id; // undelivered
    approveDueCommissions();
    expect(affiliateStats(a.id)).toMatchObject({ approved_cents: 1215, pending_cents: 810 });
    const p = recordPayout(a.id, { method: "Whish money", note: "Week 1" });
    expect(p).toMatchObject({ amountCents: 1215, orders: 2 });
    expect([o1, o2].map((id) => order(id).commission_status)).toEqual(["paid", "paid"]);
    expect([o3, o4].map((id) => order(id).commission_status)).toEqual(["pending", "pending"]);
    expect(affiliatePayouts(a.id)).toEqual([expect.objectContaining({ amount_cents: 1215, method: "Whish money", note: "Week 1" })]);
    expect(affiliateStats(a.id)).toMatchObject({ approved_cents: 0, paid_cents: 1215, pending_cents: 810 });
    expect(order(o1).commission_payout_id).toBe(p.id);
    expect(() => recordPayout(a.id, {})).toThrow(/Nothing approved/); // paying twice pays nothing
    expect(affiliatePayouts(a.id)).toHaveLength(1);
  });

  it("refuses when nothing is approved, and for an unknown affiliate", () => {
    const a = rami();
    expect(() => recordPayout(a.id, {})).toThrow(/Nothing approved/);
    expect(() => recordPayout("nope", {})).toThrow(/no longer exists/);
  });

  it("only touches that affiliate's orders", async () => {
    const a = rami();
    const b = createAffiliate({ name: "Lina", code: "LINA10" });
    await delivered(1, 1, 20, "RAMI10");
    const ob = await delivered(2, 1, 20, "LINA10");
    approveDueCommissions();
    recordPayout(a.id, {});
    expect(order(ob).commission_status).toBe("approved");
    expect(affiliateStats(b.id)).toMatchObject({ approved_cents: 405, paid_cents: 0 });
  });
});

describe("affiliates and codes", () => {
  it("codes are unique, case-insensitive, 3-20 letters or numbers, and can't clash with a discount code", () => {
    rami();
    expect(() => createAffiliate({ name: "Other", code: "Rami10" })).toThrow(/already used/);
    expect(() => createAffiliate({ name: "Other", code: "welcome10" })).toThrow(/already used/); // an existing discount code
    for (const bad of ["ab", "RAMI 10", "x".repeat(21), "RAMI-10"]) expect(() => createAffiliate({ name: "Other", code: bad }), bad).toThrow(/3 to 20/);
    expect(() => createAffiliate({ name: "", code: "FINE10" })).toThrow(/name/);
    expect(() => createAffiliate({ name: "Fine", code: "FINE10", commission_percent: 101 })).toThrow(/between 0 and 100/);
    expect(() => createAffiliate({ name: "Fine", code: "FINE10", email: "nope" })).toThrow(/email/);
    expect(sql().prepare("SELECT COUNT(*) n FROM affiliates").get()).toEqual({ n: 1 });
  });

  it("stores the code uppercase with a private token, and the defaults 15% / 10%", () => {
    const a = rami();
    expect(a).toMatchObject({ code: "RAMI10", tier: "seed", status: "active", commission_rate_x100: 1500, customer_discount_percent_x100: 1000, instagram_handle: "rami.runs" });
    expect(a.private_token.length).toBeGreaterThanOrEqual(30);
    expect(getAffiliateByToken(a.private_token)?.id).toBe(a.id);
    expect(getAffiliateByToken("x".repeat(32))).toBeUndefined();
    expect(getAffiliateByToken("../../etc")).toBeUndefined();
  });

  it("generates a random free code from the name", () => {
    createAffiliate({ name: "Nour", code: "NOUR10" });
    for (let i = 0; i < 20; i++) {
      const c = generateCode("Nour Haddad");
      expect(c).toMatch(/^NOUR\d{2}$/);
      expect(codeTaken(c)).toBe(false);
    }
    expect(generateCode("Élodie")).toMatch(/^ELODIE\d{2}$/);
    expect(generateCode("123")).toMatch(/^MIEL\d{2}$/);
  });

  it("a stale edit form is refused, a good one saves; changing the code changes what checkout accepts", () => {
    const a = rami();
    const edit = { name: "Rami K", code: "RAMI20", commission_percent: 12.5, customer_discount_percent: 5 };
    expect(updateAffiliate(a.id, edit, a.version)).toMatchObject({ code: "RAMI20", commission_rate_x100: 1250, customer_discount_percent_x100: 500, version: a.version + 1 });
    expect(() => updateAffiliate(a.id, { ...edit, name: "Stale" }, a.version)).toThrow(/Someone else changed/);
    const items = [{ productId: S.red.id, qty: 1 }];
    expect(quoteSync({ items, code: "RAMI10" }).discount).toBe(0);
    expect(quoteSync({ items, code: "RAMI20" }).discount).toBe(1.5);
  });

  it("the tier suggestion appears at 10 / 30 delivered orders and upgrading changes the commission rate for future orders only", async () => {
    const a = rami();
    const old = buy(1, 1, "RAMI10").order.id;
    for (let i = 0; i < 10; i++) {
      const { order: o } = buy(10 + i, 1, "RAMI10");
      for (const s of ["confirmed", "delivered"] as const) await setOrderStatus(o.id, s, "t");
    }
    expect(affiliateStats(a.id)).toMatchObject({ delivered: 10 });
    expect(() => upgradeTier(a.id, "ambassador")).toThrow(/not reached/);
    expect(upgradeTier(a.id, "athlete")).toMatchObject({ tier: "athlete", commission_rate_x100: 2000 });
    const fresh = buy(99, 1, "RAMI10").order.id;
    expect(order(fresh).commission_amount_cents).toBe(540); // 20% of 27.00
    expect(order(old).commission_amount_cents).toBe(405); // an earlier order keeps its commission
  });

  it("overview totals, top affiliates and the monthly export", async () => {
    const a = rami();
    const b = createAffiliate({ name: "Lina", code: "LINA10" });
    buy(1, 2, "RAMI10"); // 54.00 net, 8.10
    buy(2, 1, "LINA10"); // 27.00 net, 4.05
    const cancelled = buy(3, 5, "LINA10").order.id;
    await setOrderStatus(cancelled, "cancelled", "t", { reason: "x" });
    const o = overview();
    expect(o).toMatchObject({ sales_cents: 8100, orders: 2, owed_cents: 1215, paid_cents: 0, active: 2 });
    expect(o.top.map((t) => t.code)).toEqual(["RAMI10", "LINA10"]);
    const month = new Date().toISOString().slice(0, 7);
    const rows = monthlyRows(month);
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.status === "cancelled")).toMatchObject({ commission_status: "void" });
    expect(monthlyRows("2001-01")).toEqual([]);
    expect(() => monthlyRows("2026-13")).toThrow();
    expect(affiliateOrders(a.id)).toHaveLength(1);
    expect(affiliateOrders(b.id)).toHaveLength(2);
  });

  it("a TEST order or a draft never counts as a sale", () => {
    rami();
    sql().prepare("UPDATE affiliates SET status = 'active'").run();
    const d = placeOrder({ customer: person(1), items: [{ productId: S.red.id, qty: 1 }], region: "Beirut", source: "manual", actor: "t", code: "RAMI10", draft: true });
    expect(order(d.order.id)).toMatchObject({ status: "draft", commission_status: "pending" });
    expect(overview()).toMatchObject({ sales_cents: 0, orders: 0 });
  });
});

describe("applications", () => {
  it("validate, save, approve into an affiliate (once) or reject", () => {
    expect(() => createApplication({ name: "", instagram_handle: "x" })).toThrow(/name/);
    expect(() => createApplication({ name: "Hadi" })).toThrow(/Instagram or TikTok/);
    expect(() => createApplication({ name: "Hadi", instagram_handle: "bad handle!" })).toThrow(/letters, numbers/);
    expect(() => createApplication({ name: "Hadi", instagram_handle: "hadi", followers: "lots" })).toThrow(/Followers/);
    const id = createApplication({ name: "Hadi Saad", instagram_handle: "@hadi.fit", tiktok_handle: "https://tiktok.com/@hadi", followers: "12k", city: "Jounieh", sport: "Running", message: "Love it" });
    expect(sql().prepare("SELECT status, instagram_handle, tiktok_handle FROM affiliate_applications WHERE id = ?").get(id)).toEqual({ status: "new", instagram_handle: "hadi.fit", tiktok_handle: "hadi" });
    expect(() => createAccountFromApplication(id)).toThrow(/Approve the application first/); // approving comes first
    approveApplication(id);
    expect(sql().prepare("SELECT COUNT(*) n FROM affiliates").get()).toEqual({ n: 0 }); // approving only changes the status
    const aff = createAccountFromApplication(id);
    expect(aff).toMatchObject({ name: "Hadi Saad", tier: "seed", status: "active", instagram_handle: "hadi.fit" });
    expect(aff.code).toMatch(/^HADI\d{2}$/);
    expect(aff.notes).toContain("12k followers");
    expect(() => approveApplication(id)).toThrow(/already handled/);
    expect(() => createAccountFromApplication(id)).toThrow(/already created/);
    const id2 = createApplication({ name: "Zed", instagram_handle: "zed" });
    rejectApplication(id2);
    expect(() => rejectApplication(id2)).toThrow(/already handled/);
    expect(() => approveApplication(id2)).toThrow(/already handled/);
    expect(sql().prepare("SELECT COUNT(*) n FROM affiliates").get()).toEqual({ n: 1 });
  });
});
