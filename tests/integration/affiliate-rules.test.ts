import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { closeEngine, getEngine } from "../../lib/db/core";
import {
  affiliateOrders, affiliateStats, approveDueCommissions, checkAffiliateBooks, createAffiliate, getAffiliateByToken, listAffiliates, monthlyRows, overview, recordPayout, upgradeTier,
} from "@/lib/affiliates";
import { placeOrder, quoteSync, setOrderStatus } from "@/lib/orders";
import { staysOpenInMaintenance } from "@/lib/site-mode";
import { h, ID, resetState } from "../support/state";
import { seedStore } from "../support/seed";

let S: Awaited<ReturnType<typeof seedStore>>;
const sql = () => getEngine().sqlite;
const person = (n: number) => ({ name: `Customer ${n}`, phone: `03 ${String(100000 + n)}`, address: "Hamra, Bldg 5" });
let seq = 1000;
const buy = (code: string | undefined, qty = 1, extra: Record<string, unknown> = {}) =>
  placeOrder({ customer: person(seq++), items: [{ productId: S.red.id, qty }], region: "Beirut", source: "web", actor: "customer", code, ...extra });
const row = (id: string) => sql().prepare("SELECT * FROM orders WHERE id = ?").get(id) as Record<string, any>;
const ago = (d: number, from = Date.now()) => new Date(from - d * 86_400_000).toISOString();
async function deliver(id: string, daysAgo: number) {
  for (const s of ["confirmed", "delivered"] as const) await setOrderStatus(id, s, "t");
  sql().prepare("UPDATE orders SET delivered_at = ? WHERE id = ?").run(ago(daysAgo), id);
}

beforeEach(async () => {
  resetState();
  S = await seedStore();
  sql().prepare("UPDATE inventory_items SET on_hand = 100000").run();
  seq = 1000;
});

describe("money: integer cents, checked against an independent calculation", () => {
  /** Independent implementation: exact rational arithmetic with BigInt (no floats, no shared code), half-up rounding. */
  const halfUp = (num: bigint, den: bigint) => (num * BigInt(2) + den) / (BigInt(2) * den);
  const expected = (prices: bigint[], qtys: bigint[], pctX100: bigint, rateX100: bigint, fee: bigint) => {
    const sub = prices.reduce((n, p, i) => n + p * qtys[i], BigInt(0));
    const disc = halfUp(sub * pctX100, BigInt(10000));
    const comm = halfUp((sub - disc) * rateX100, BigInt(10000));
    return { sub, disc, comm, total: sub - disc + fee };
  };

  it("100 random carts: subtotal, discount, commission and total match to the cent; delivery is never discounted or commissioned", () => {
    let seed = 42;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), seed % n);
    const prods = Array.from({ length: 6 }, (_, i) => {
      const cents = 100 + rnd(9000) + (i === 0 ? 1 : 0); // odd cent amounts on purpose
      const id = crypto.randomUUID();
      sql().prepare("INSERT INTO products (id, slug, kind, name, price_cents, status, sort) VALUES (?,?,'single',?,?, 'active', ?)").run(id, `rand-${i}`, `Rand ${i}`, cents, 10 + i);
      sql().prepare("INSERT INTO inventory_items (id, product_id, sku, on_hand) VALUES (?,?,?,100000)").run(crypto.randomUUID(), id, `R${i}`);
      return { id, cents: BigInt(cents) };
    });
    const zones = [{ name: "Beirut", fee: BigInt(300) }, { name: "Bekaa", fee: BigInt(600) }];
    for (let i = 0; i < 100; i++) {
      const pct = rnd(10001); // 0.00% .. 100.00%
      const rate = rnd(10001);
      const aff = createAffiliate({ name: "Rand Aff", code: `RND${i}X`, commission_percent: rate / 100, customer_discount_percent: pct / 100 });
      const lines = Array.from({ length: 1 + rnd(3) }, () => ({ p: prods[rnd(prods.length)], q: 1 + rnd(5) }));
      const merged = new Map<string, { p: (typeof prods)[number]; q: number }>();
      for (const l of lines) merged.set(l.p.id, { p: l.p, q: (merged.get(l.p.id)?.q ?? 0) + l.q });
      const items = [...merged.values()];
      const zone = zones[rnd(2)];
      const e = expected(items.map((x) => x.p.cents), items.map((x) => BigInt(x.q)), BigInt(aff.customer_discount_percent_x100), BigInt(aff.commission_rate_x100), zone.fee);
      const freeDelivery = false; // zone Beirut has free_over 60: handled below
      const q = quoteSync({ items: items.map((x) => ({ productId: x.p.id, qty: x.q })), region: zone.name, code: aff.code.toLowerCase() });
      const fee = zone.name === "Beirut" && e.sub - e.disc >= BigInt(6000) ? BigInt(0) : zone.fee; // the store's free-delivery rule, applied AFTER the discount
      void freeDelivery;
      const placed = placeOrder({ customer: person(seq++), items: items.map((x) => ({ productId: x.p.id, qty: x.q })), region: zone.name, source: "web", actor: "c", code: aff.code.toLowerCase() });
      const o = row(placed.order.id);
      expect(BigInt(o.subtotal_cents), `cart ${i} subtotal`).toBe(e.sub);
      expect(BigInt(o.discount_amount_cents), `cart ${i} discount`).toBe(e.disc);
      expect(BigInt(o.discount_total_cents), `cart ${i} discount_total`).toBe(e.disc);
      expect(BigInt(o.commission_amount_cents), `cart ${i} commission`).toBe(e.comm);
      expect(BigInt(o.shipping_fee_cents), `cart ${i} delivery is untouched`).toBe(fee);
      expect(BigInt(o.total_cents), `cart ${i} total`).toBe(e.sub - e.disc + fee);
      expect(Math.round(q.discount * 100), `cart ${i} quote discount`).toBe(Number(e.disc));
      expect(Math.round(q.total * 100), `cart ${i} quote total`).toBe(Number(e.sub - e.disc + fee));
      expect(o.commission_status).toBe("pending");
      expect(Number.isInteger(o.commission_amount_cents) && Number.isInteger(o.total_cents)).toBe(true);
    }
  });
});

describe("codes", () => {
  it("a paused or ended affiliate's code is rejected with a clear message at quote and at order time", () => {
    const a = createAffiliate({ name: "Rami", code: "RAMI10" });
    for (const status of ["paused", "ended"]) {
      sql().prepare("UPDATE affiliates SET status = ? WHERE id = ?").run(status, a.id);
      const q = quoteSync({ items: [{ productId: S.red.id, qty: 1 }], region: "Beirut", code: "rami10" });
      expect(q).toMatchObject({ discount: 0, codeMessage: "That code isn't valid." });
      expect(row(buy("RAMI10").order.id)).toMatchObject({ affiliate_id: null, commission_status: null, discount_total_cents: 0 });
    }
  });

  it("one code per order: two codes in the field are not two discounts", () => {
    createAffiliate({ name: "Rami", code: "RAMI10" });
    createAffiliate({ name: "Lina", code: "LINA10" });
    for (const both of ["RAMI10 LINA10", "RAMI10,LINA10", "RAMI10+LINA10", "RAMI10;LINA10"]) expect(quoteSync({ items: [{ productId: S.red.id, qty: 1 }], region: "Beirut", code: both }).discount, both).toBe(0);
    const o = row(buy("RAMI10").order.id);
    expect(o.affiliate_id).not.toBeNull();
    expect(o.code_used).toBe("RAMI10");
  });

  it("double click and retry: the same idempotency key is one order, one discount, one commission, one stock movement", () => {
    createAffiliate({ name: "Rami", code: "RAMI10" });
    const key = crypto.randomUUID();
    const first = buy("RAMI10", 2, { idempotencyKey: key });
    for (let i = 0; i < 5; i++) expect(buy("RAMI10", 2, { idempotencyKey: key, customer: first.customer && person(5000) }).order.id).toBe(first.order.id);
    expect(sql().prepare("SELECT COUNT(*) n FROM orders WHERE affiliate_id IS NOT NULL").get()).toEqual({ n: 1 });
    expect(sql().prepare("SELECT COUNT(*) n FROM stock_movements WHERE order_id = ?").get(first.order.id)).toEqual({ n: 1 });
    expect(overview()).toMatchObject({ orders: 1, owed_cents: row(first.order.id).commission_amount_cents });
  });
});

describe("commission lifecycle with a controllable clock", () => {
  it("approved at EXACTLY 14 days after delivery, not a millisecond before", async () => {
    const a = createAffiliate({ name: "Rami", code: "RAMI10" });
    const o = buy("RAMI10").order.id;
    for (const s of ["confirmed", "delivered"] as const) await setOrderStatus(o, s, "t");
    const deliveredAt = new Date("2026-03-01T09:00:00.000Z");
    sql().prepare("UPDATE orders SET delivered_at = ? WHERE id = ?").run(deliveredAt.toISOString(), o);
    const at = (ms: number) => new Date(deliveredAt.getTime() + 14 * 86_400_000 + ms);
    expect(approveDueCommissions(at(-1))).toBe(0);
    expect(row(o).commission_status).toBe("pending");
    expect(approveDueCommissions(at(0))).toBe(1);
    expect(row(o).commission_status).toBe("approved");
    expect(approveDueCommissions(at(86_400_000))).toBe(0); // idempotent
    expect(affiliateStats(a.id)).toMatchObject({ approved_cents: row(o).commission_amount_cents });
  });

  it("time travel across a server restart: nothing is lost or approved twice", async () => {
    const a = createAffiliate({ name: "Rami", code: "RAMI10" });
    const ids = [buy("RAMI10").order.id, buy("RAMI10").order.id, buy("RAMI10").order.id];
    const base = new Date("2026-05-01T12:00:00.000Z");
    for (const [i, id] of ids.entries()) {
      for (const s of ["confirmed", "delivered"] as const) await setOrderStatus(id, s, "t");
      sql().prepare("UPDATE orders SET delivered_at = ? WHERE id = ?").run(new Date(base.getTime() + i * 86_400_000).toISOString(), id);
    }
    const day = (d: number) => new Date(base.getTime() + d * 86_400_000);
    expect(approveDueCommissions(day(13.5))).toBe(0);
    closeEngine(); // restart 1
    getEngine();
    expect(approveDueCommissions(day(14))).toBe(1); // only the first, delivered on day 0
    closeEngine(); // restart 2
    getEngine();
    expect(approveDueCommissions(day(14))).toBe(0);
    expect(approveDueCommissions(day(16))).toBe(2);
    closeEngine(); // restart 3
    getEngine();
    expect(approveDueCommissions(day(99))).toBe(0);
    expect(ids.map((id) => row(id).commission_status)).toEqual(["approved", "approved", "approved"]);
    expect(affiliateStats(a.id)).toMatchObject({ approved_cents: 3 * 405, pending_cents: 0 });
  });

  it("void on cancelled and on returned orders, before and after approval", async () => {
    createAffiliate({ name: "Rami", code: "RAMI10" });
    const c = buy("RAMI10").order.id;
    await setOrderStatus(c, "cancelled", "t", { reason: "no" });
    const r = buy("RAMI10").order.id;
    await deliver(r, 20);
    approveDueCommissions();
    expect(row(r).commission_status).toBe("approved");
    await setOrderStatus(r, "returned", "t");
    expect([row(c).commission_status, row(r).commission_status]).toEqual(["void", "void"]);
    expect(overview()).toMatchObject({ owed_cents: 0, corrections_cents: 0 }); // never paid, so nothing to correct
  });
});

describe("a voided commission that was already paid is a visible correction, never silent", () => {
  it("shows on the balance, is deducted from the next payout, and the books balance throughout", async () => {
    const a = createAffiliate({ name: "Rami", code: "RAMI10" });
    const o1 = buy("RAMI10", 2).order.id; // 8.10
    await deliver(o1, 30);
    approveDueCommissions();
    const p1 = recordPayout(a.id, { method: "Whish" });
    expect(p1).toMatchObject({ amountCents: 810, grossCents: 810, correctionsCents: 0 });
    expect(checkAffiliateBooks()).toEqual([]);

    await setOrderStatus(o1, "returned", "t"); // returned AFTER being paid
    expect(row(o1)).toMatchObject({ commission_status: "void", commission_payout_id: p1.id, commission_correction_payout_id: null });
    expect(sql().prepare("SELECT message FROM order_events WHERE order_id = ? AND type = 'commission'").get(o1)).toEqual({ message: expect.stringContaining("already paid out") });
    expect(affiliateStats(a.id)).toMatchObject({ corrections_cents: 810, paid_cents: 0, approved_cents: 0 }); // visible
    expect(overview().corrections_cents).toBe(810);
    expect(affiliateOrders(a.id)[0]).toMatchObject({ commission_status: "void", commission_payout_id: p1.id });
    expect(checkAffiliateBooks()).toEqual([]); // nothing deducted yet: payouts 8.10 = paid-ever 8.10

    const o2 = buy("RAMI10", 4).order.id; // 16.20
    await deliver(o2, 20);
    approveDueCommissions();
    const p2 = recordPayout(a.id, { method: "Whish" });
    expect(p2).toMatchObject({ grossCents: 1620, correctionsCents: 810, amountCents: 810 }); // 16.20 minus 8.10 owed back
    expect(row(o1).commission_correction_payout_id).toBe(p2.id);
    expect(affiliateStats(a.id)).toMatchObject({ corrections_cents: 0, paid_cents: 1620 });
    expect(checkAffiliateBooks()).toEqual([]); // paid out 8.10 + 8.10 = ever paid 8.10 + 16.20 − corrections 8.10
  });

  it("a correction bigger than what is approved pays nothing and carries forward", async () => {
    const a = createAffiliate({ name: "Rami", code: "RAMI10" });
    const big = buy("RAMI10", 10).order.id; // 40.50
    await deliver(big, 30);
    approveDueCommissions();
    recordPayout(a.id, {});
    await setOrderStatus(big, "returned", "t");
    const small = buy("RAMI10", 1).order.id; // 4.05
    await deliver(small, 20);
    approveDueCommissions();
    expect(() => recordPayout(a.id, {})).toThrow(/Nothing to pay: corrections of \$40\.50/);
    expect(affiliateStats(a.id)).toMatchObject({ corrections_cents: 4050, approved_cents: 405 });
    expect(row(small).commission_status).toBe("approved"); // untouched
    expect(checkAffiliateBooks()).toEqual([]);
  });
});

describe("payouts cannot be paid twice", () => {
  it("double click, retry and two tabs at once: exactly one payout", async () => {
    const a = createAffiliate({ name: "Rami", code: "RAMI10" });
    for (let i = 0; i < 3; i++) await deliver(buy("RAMI10").order.id, 30);
    approveDueCommissions();
    const attempts = await Promise.allSettled(Array.from({ length: 6 }, async () => recordPayout(a.id, { method: "Whish" })));
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((r) => r.status === "rejected").every((r) => /Nothing approved/.test((r as PromiseRejectedResult).reason.message))).toBe(true);
    expect(sql().prepare("SELECT COUNT(*) n, SUM(amount_cents) s FROM affiliate_payouts").get()).toEqual({ n: 1, s: 1215 });
    expect(checkAffiliateBooks()).toEqual([]);
  });

  it("the same commission can never sit in two payouts", async () => {
    const a = createAffiliate({ name: "Rami", code: "RAMI10" });
    for (let i = 0; i < 4; i++) {
      await deliver(buy("RAMI10").order.id, 30);
      approveDueCommissions();
      recordPayout(a.id, {});
    }
    const dup = sql().prepare("SELECT commission_payout_id, COUNT(*) n FROM orders WHERE commission_payout_id IS NOT NULL GROUP BY commission_payout_id HAVING n > 1").all();
    expect(dup).toEqual([]);
    expect(sql().prepare("SELECT COUNT(*) n FROM affiliate_payouts").get()).toEqual({ n: 4 });
  });
});

describe("totals reconcile to the cent between the detail, the list, the overview and the CSV", () => {
  it("on a mixed data set", async () => {
    const affs = ["RAMI10", "LINA10", "NOUR10"].map((c, i) => createAffiliate({ name: `Aff ${i}`, code: c, commission_percent: [15, 12.5, 20][i], customer_discount_percent: [10, 7.5, 15][i] }));
    for (let i = 0; i < 24; i++) {
      const code = affs[i % 3].code;
      const o = buy(code, 1 + (i % 4)).order.id;
      if (i % 4 === 0) await setOrderStatus(o, "cancelled", "t", { reason: "x" });
      else if (i % 4 === 1) await deliver(o, 40);
      else if (i % 4 === 2) await deliver(o, 3);
    }
    approveDueCommissions();
    for (const a of affs.slice(0, 2)) recordPayout(a.id, { method: "cash" });
    const ret = sql().prepare("SELECT id FROM orders WHERE commission_status = 'paid' LIMIT 1").get() as { id: string };
    await setOrderStatus(ret.id, "returned", "t");

    const list = listAffiliates();
    const ov = overview();
    // detail vs list, per affiliate
    for (const a of list) expect(affiliateStats(a.id)).toMatchObject({ sales_cents: a.sales_cents, pending_cents: a.pending_cents, approved_cents: a.approved_cents, paid_cents: a.paid_cents, corrections_cents: a.corrections_cents });
    // overview vs the sum of the list
    const sum = (k: "sales_cents" | "pending_cents" | "approved_cents" | "paid_cents" | "corrections_cents") => list.reduce((n, a) => n + a[k], 0);
    expect(ov.sales_cents).toBe(sum("sales_cents"));
    expect(ov.owed_cents).toBe(sum("pending_cents") + sum("approved_cents"));
    expect(ov.paid_cents).toBe(sum("paid_cents"));
    expect(ov.corrections_cents).toBe(sum("corrections_cents"));
    // everything vs plain SQL
    const q = (s: string) => (sql().prepare(s).get() as { v: number }).v ?? 0;
    expect(sum("sales_cents")).toBe(q("SELECT SUM(subtotal_cents - discount_amount_cents) v FROM orders WHERE affiliate_id IS NOT NULL AND status NOT IN ('cancelled','returned','draft')"));
    expect(sum("pending_cents")).toBe(q("SELECT SUM(commission_amount_cents) v FROM orders WHERE commission_status = 'pending'"));
    expect(sum("approved_cents")).toBe(q("SELECT SUM(commission_amount_cents) v FROM orders WHERE commission_status = 'approved'"));
    expect(sum("paid_cents")).toBe(q("SELECT SUM(commission_amount_cents) v FROM orders WHERE commission_status = 'paid'"));
    // the CSV for the current (Beirut) month covers the same orders, and its commission column adds up to the same totals
    const month = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" }).slice(0, 7);
    h.user = { id: ID.owner, email: "owner@t.test" };
    const { GET } = await import("@/app/admin/(app)/affiliates/export/route");
    const text = await (await GET(new Request(`http://x/e?month=${month}`))).text();
    const lines = text.replace(/^﻿/, "").trim().split("\n").slice(1);
    expect(lines).toHaveLength(24);
    const col = (l: string, i: number) => l.split('","')[i].replace(/"/g, "");
    const cents = (v: string) => Math.round(Number(v) * 100);
    const csvSum = (status: string) => lines.filter((l) => col(l, 10) === status).reduce((n, l) => n + cents(col(l, 9)), 0);
    expect(csvSum("pending")).toBe(sum("pending_cents"));
    expect(csvSum("approved")).toBe(sum("approved_cents"));
    expect(csvSum("paid")).toBe(sum("paid_cents"));
    expect(lines.filter((l) => col(l, 11) === "yes").reduce((n, l) => n + cents(col(l, 9)), 0)).toBe(sum("corrections_cents") + (checkSettled()));
    expect(checkAffiliateBooks()).toEqual([]);
  });
});
function checkSettled() {
  return (sql().prepare("SELECT COALESCE(SUM(commission_amount_cents),0) v FROM orders WHERE commission_correction_payout_id IS NOT NULL").get() as { v: number }).v;
}

describe("tier suggestions and upgrades", () => {
  it("the suggestion appears at exactly 10 and exactly 30 delivered orders; an upgrade changes future orders only", async () => {
    const a = createAffiliate({ name: "Rami", code: "RAMI10" });
    const placed: string[] = [];
    const delivered = async (n: number) => {
      while (placed.length < n) {
        const id = buy("RAMI10").order.id;
        await deliver(id, 1);
        placed.push(id);
      }
    };
    const { suggestedTier } = await import("@/lib/affiliates");
    await delivered(9);
    expect(suggestedTier(affiliateStats(a.id)!.delivered, "seed")).toBeNull();
    await delivered(10);
    expect(affiliateStats(a.id)!.delivered).toBe(10);
    expect(suggestedTier(10, "seed")).toBe("athlete");
    const before = placed.map((id) => row(id).commission_amount_cents);
    expect(upgradeTier(a.id, "athlete")).toMatchObject({ tier: "athlete", commission_rate_x100: 2000 });
    expect(placed.map((id) => row(id).commission_amount_cents)).toEqual(before); // past orders untouched
    const next = buy("RAMI10").order.id;
    expect(row(next).commission_amount_cents).toBe(540); // 20% of 27.00
    await delivered(29);
    expect(suggestedTier(affiliateStats(a.id)!.delivered, "athlete")).toBeNull();
    await delivered(30);
    expect(suggestedTier(affiliateStats(a.id)!.delivered, "athlete")).toBe("ambassador");
    expect(upgradeTier(a.id, "ambassador")).toMatchObject({ tier: "ambassador", commission_rate_x100: 2500 });
    expect(() => upgradeTier(a.id, "athlete")).toThrow(/not reached/); // no downgrades through the upgrade button
  });

  it("returned orders stop counting towards the tier", async () => {
    const a = createAffiliate({ name: "Rami", code: "RAMI10" });
    for (let i = 0; i < 10; i++) await deliver(buy("RAMI10").order.id, 1);
    const one = sql().prepare("SELECT id FROM orders WHERE affiliate_id = ? LIMIT 1").get(a.id) as { id: string };
    await setOrderStatus(one.id, "returned", "t");
    expect(affiliateStats(a.id)!.delivered).toBe(9);
  });
});

describe("CSV month filtering in Asia/Beirut, and injection safety", () => {
  const at = (iso: string) => buy("RAMI10", 1, { createdAt: iso }).order.id;
  it("an order at 23:30 Beirut on the 31st belongs to that month, one at 00:30 on the 1st to the next (winter and summer time)", () => {
    createAffiliate({ name: "Rami", code: "RAMI10" });
    const dec = at("2026-12-31T21:30:00.000Z"); // 23:30 in Beirut
    const jan = at("2026-12-31T22:30:00.000Z"); // 00:30 on 1 January in Beirut
    const mar = at("2026-03-31T20:30:00.000Z"); // 23:30 (summer time, +3)
    const apr = at("2026-03-31T21:30:00.000Z"); // 00:30 on 1 April
    const nums = (m: string) => monthlyRows(m).map((r) => r.order_number);
    const n = (id: string) => row(id).order_number;
    expect(nums("2026-12")).toEqual([n(dec)]);
    expect(nums("2027-01")).toEqual([n(jan)]);
    expect(nums("2026-03")).toEqual([n(mar)]);
    expect(nums("2026-04")).toEqual([n(apr)]);
    expect(nums("2026-02")).toEqual([]);
  });

  it("names and codes that look like formulas are defused in the exported file", async () => {
    const evil = createAffiliate({ name: '=HYPERLINK("http://evil.example","x")', code: "EVIL10" });
    createAffiliate({ name: "+cmd|' /C calc'!A0", code: "EVIL11" });
    createAffiliate({ name: "@SUM(1+1)", code: "EVIL12" });
    for (const code of ["EVIL10", "EVIL11", "EVIL12"]) buy(code, 1);
    void evil;
    const month = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" }).slice(0, 7);
    h.user = { id: ID.owner, email: "owner@t.test" };
    const { GET } = await import("@/app/admin/(app)/affiliates/export/route");
    const text = await (await GET(new Request(`http://x/e?month=${month}`))).text();
    for (const line of text.split("\n").slice(1)) for (const cell of line.split('","')) expect(cell.replace(/^"/, ""), cell).not.toMatch(/^[=+\-@]/);
    expect(text).toContain(`"'=HYPERLINK(""http://evil.example"",""x"")"`);
  });
});

describe("the private partner link", () => {
  it("tokens are long, random and unique; a short or wrong one finds nothing", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 200; i++) tokens.add(createAffiliate({ name: `Aff ${i}`, code: `TK${i}X` }).private_token);
    expect(tokens.size).toBe(200);
    for (const t of tokens) {
      expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/); // 24 random bytes = 192 bits
    }
    expect(getAffiliateByToken([...tokens][0].slice(0, 31))).toBeUndefined();
    expect(getAffiliateByToken("a".repeat(32))).toBeUndefined();
    expect(getAffiliateByToken("' OR 1=1 --")).toBeUndefined();
  });

  it("the old private stats page now only redirects to the portal login (the token is never read, nothing is shown)", async () => {
    const a = createAffiliate({ name: "Rami", code: "RAMI10" });
    const mod = await import("@/app/(store)/partner/[token]/page");
    for (const _t of [a.private_token, "wrong"]) {
      void _t;
      let err: unknown;
      try {
        mod.default();
      } catch (e) {
        err = e;
      }
      expect(String((err as Error)?.message)).toBe("NEXT_REDIRECT:/ambassador/login");
    }
  });
});

describe("maintenance mode (SITE_MODE=maintenance)", () => {
  it("the public /ambassadors and /partner pages are closed with the rest of the storefront; the checkout discount field is part of the closed checkout", () => {
    for (const p of ["/ambassadors", "/partner/abc", "/products", "/"]) expect(staysOpenInMaintenance(p), p).toBe(false);
    expect(staysOpenInMaintenance("/admin/affiliates")).toBe(true); // the back office stays open
  });

  it("a preview TEST order that uses an affiliate code gets the discount (so the price is real) but earns no commission and counts as no sale", () => {
    createAffiliate({ name: "Rami", code: "RAMI10" });
    process.env.SITE_MODE = "maintenance";
    try {
      const o = row(buy("RAMI10", 2, { test: { by: "owner@t.test" } }).order.id);
      expect(o).toMatchObject({ is_test: 1, discount_total_cents: 600, affiliate_id: null, commission_status: null, commission_amount_cents: 0 });
      expect(overview()).toMatchObject({ orders: 0, sales_cents: 0, owed_cents: 0 });
      expect(() => buy("RAMI10", 1)).toThrow(/isn't taking orders yet/); // a real order is still refused
    } finally {
      delete process.env.SITE_MODE;
    }
  });
});
