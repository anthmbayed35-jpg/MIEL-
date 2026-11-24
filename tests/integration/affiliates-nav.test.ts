import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { getEngine } from "../../lib/db/core";
import { affiliateOptions, createAffiliate, createApplication, listPayouts, newApplicationCount, recordPayout, topThisMonth } from "@/lib/affiliates";
import { listOrders } from "@/lib/queries";
import { placeOrder, setOrderStatus } from "@/lib/orders";
import { BottomTabs, TopNav } from "@/components/admin/AdminNav";
import { affiliateTabs } from "@/lib/admin-tabs";
import { h, ID, resetState } from "../support/state";
import { seedStore } from "../support/seed";

let S: Awaited<ReturnType<typeof seedStore>>;
const sql = () => getEngine().sqlite;
let n = 0;
const buy = (code?: string, qty = 1, createdAt?: string) =>
  placeOrder({ customer: { name: `Buyer ${n}`, phone: `03 ${String(300000 + n++)}`, address: "Hamra, Bldg 5" }, items: [{ productId: S.red.id, qty }], region: "Beirut", source: "web", actor: "c", code, createdAt });
const owner = () => (h.user = { id: ID.owner, email: "owner@t.test" });

beforeEach(async () => {
  resetState();
  S = await seedStore();
  sql().prepare("UPDATE inventory_items SET on_hand = 100000").run();
  n = 0;
  owner();
});

describe("the Affiliates menu item", () => {
  const links = (html: string) => [...html.matchAll(/<a [^>]*href="(\/admin[^"]*)"[^>]*>(.*?)<\/a>/g)].map((m) => ({ href: m[1], text: m[2].replace(/<[^>]+>/g, "").trim() }));

  it("sits right after Orders in the main navigation, for owner and manager, with the new-application badge", () => {
    for (const role of ["owner", "manager"] as const) {
      const items = links(renderToStaticMarkup(createElement(TopNav, { role, badges: { "/admin/affiliates": 3 } })));
      expect(items.slice(0, 3).map((i) => i.text.replace(/\d+$/, "")), role).toEqual(["Dashboard", "Orders", "Ambassadors"]);
      expect(items[2].href).toBe("/admin/affiliates");
      expect(items[2].text).toBe("Ambassadors3");
    }
  });

  it("staff do not get it, and still get four tabs on a phone", () => {
    const top = links(renderToStaticMarkup(createElement(TopNav, { role: "staff", badges: {} }))).map((i) => i.text);
    expect(top).not.toContain("Ambassadors");
    const tabs = renderToStaticMarkup(createElement(BottomTabs, { role: "staff", badges: {} }));
    expect(tabs).not.toContain("Ambassadors");
    expect(tabs).toContain("Dashboard");
    expect(tabs).toContain("Customers"); // the fourth tab is not lost because a section is hidden
  });

  it("appears in the phone tab bar (owner and manager), before Products, with its badge", () => {
    const html = renderToStaticMarkup(createElement(BottomTabs, { role: "manager", badges: { "/admin/affiliates": 2 } }));
    expect(html.indexOf("Orders")).toBeLessThan(html.indexOf("Ambassadors"));
    expect(html.indexOf("Ambassadors")).toBeLessThan(html.indexOf("Products"));
    expect(html).toContain('aria-label="2 new"');
  });

  it("the section has nine tabs, the badge is on Applications, and an affiliate's own page keeps the Affiliates tab lit", () => {
    const tabs = affiliateTabs(4);
    expect(tabs.map((t) => t.label)).toEqual(["Overview", "Ambassadors", "Applications", "Payouts", "Missions", "Kits", "Content", "Reports", "Settings"]);
    expect(tabs.map((t) => t.href)).toEqual(["/admin/affiliates", "/admin/affiliates/list", "/admin/affiliates/applications", "/admin/affiliates/payouts", "/admin/affiliates/missions", "/admin/affiliates/kits", "/admin/affiliates/content", "/admin/affiliates/reports", "/admin/affiliates/settings"]);
    expect(tabs.find((t) => t.label === "Applications")?.badge).toBe(4);
    expect(tabs.find((t) => t.label === "Overview")?.badge).toBeFalsy();
    const also = new RegExp(tabs[1].also!);
    expect(also.test("/admin/affiliates/3f2c1a9e-aaaa-4bbb-8ccc-0123456789ab")).toBe(true);
    for (const p of ["/admin/affiliates", "/admin/affiliates/list", "/admin/affiliates/payouts", "/admin/affiliates/payouts/export", "/admin/affiliates/applications", "/admin/affiliates/missions", "/admin/affiliates/reports/export"]) expect(also.test(p), p).toBe(false);
  });

  it("the count is the number of new applications only", () => {
    expect(newApplicationCount()).toBe(0);
    const a = createApplication({ name: "Hadi Saad", instagram_handle: "hadi.fit" });
    createApplication({ name: "Zed Zed", instagram_handle: "zed" });
    expect(newApplicationCount()).toBe(2);
    sql().prepare("UPDATE affiliate_applications SET status = 'rejected' WHERE id = ?").run(a);
    expect(newApplicationCount()).toBe(1);
  });
});

describe("overview: top five this month", () => {
  it("counts this calendar month in Beirut only, valid orders only, best first, five at most", async () => {
    const affs = Array.from({ length: 7 }, (_, i) => createAffiliate({ name: `Aff ${i}`, code: `TOP${i}X` }));
    affs.forEach((a, i) => buy(a.code, i + 1)); // aff 6 sells the most
    buy(affs[0].code, 50, new Date(Date.now() - 70 * 86_400_000).toISOString()); // two months ago: not counted
    const cancelled = buy(affs[1].code, 40);
    await setOrderStatus(cancelled.order.id, "cancelled", "t", { reason: "x" });
    const top = topThisMonth(5);
    expect(top.map((t) => t.code)).toEqual(["TOP6X", "TOP5X", "TOP4X", "TOP3X", "TOP2X"]);
    expect(top[0]).toMatchObject({ orders: 1, sales_cents: 7 * 2700 });
    expect(topThisMonth(5, new Date(Date.now() + 40 * 86_400_000))).toEqual([]); // next month: nothing yet
  });

  it("the month changes at Beirut midnight, not UTC midnight", () => {
    const a = createAffiliate({ name: "Rami", code: "RAMI10" });
    buy(a.code, 1, "2026-12-31T21:30:00.000Z"); // 23:30 on 31 December in Beirut
    buy(a.code, 2, "2026-12-31T22:30:00.000Z"); // 00:30 on 1 January in Beirut
    expect(topThisMonth(5, new Date("2026-12-31T21:45:00.000Z"))[0]).toMatchObject({ orders: 1, sales_cents: 2700 });
    expect(topThisMonth(5, new Date("2027-01-01T05:00:00.000Z"))[0]).toMatchObject({ orders: 1, sales_cents: 5400 });
  });
});

describe("payouts screen and CSV", () => {
  async function paid(code: string, qty: number) {
    const o = buy(code, qty).order.id;
    for (const s of ["confirmed", "delivered"] as const) await setOrderStatus(o, s, "t");
    sql().prepare("UPDATE orders SET delivered_at = ? WHERE id = ?").run(new Date(Date.now() - 30 * 86_400_000).toISOString(), o);
  }

  it("lists every payout with the affiliate, newest first, and filters by Beirut month", async () => {
    const a = createAffiliate({ name: "Rami", code: "RAMI10", instagram_handle: "rami.runs" });
    const b = createAffiliate({ name: "Lina", code: "LINA10" });
    await paid(a.code, 2);
    const p1 = recordPayout(a.id, { method: "Whish", note: "first" });
    await paid(b.code, 1);
    const p2 = recordPayout(b.id, { method: "Cash", note: "second" });
    sql().prepare("UPDATE affiliate_payouts SET paid_at = ? WHERE id = ?").run("2026-12-31T21:30:00.000Z", p1.id); // 23:30 in Beirut: December
    sql().prepare("UPDATE affiliate_payouts SET paid_at = ? WHERE id = ?").run("2026-12-31T22:30:00.000Z", p2.id); // 00:30 in Beirut: January
    const all = listPayouts();
    expect(all.map((r) => r.code)).toEqual(["LINA10", "RAMI10"]); // newest first
    expect(all[1]).toMatchObject({ name: "Rami", instagram_handle: "rami.runs", amount_cents: 810, method: "Whish", note: "first" });
    expect(listPayouts({ month: "2026-12" }).map((r) => r.code)).toEqual(["RAMI10"]);
    expect(listPayouts({ month: "2027-01" }).map((r) => r.code)).toEqual(["LINA10"]);
    expect(listPayouts({ month: "2026-11" })).toEqual([]);
    expect(() => listPayouts({ month: "banana" })).toThrow();
    expect(listPayouts({ limit: 1 })).toHaveLength(1);
  });

  it("the CSV route: 401 signed out, 403 for staff, a safe file for the owner, 400 for a bad month", async () => {
    const { GET } = await import("@/app/admin/(app)/affiliates/payouts/export/route");
    const evil = createAffiliate({ name: '=HYPERLINK("http://evil.example","x")', code: "EVIL10" });
    await paid(evil.code, 2);
    const p = recordPayout(evil.id, { method: "Whish", note: "+cmd" });
    sql().prepare("UPDATE affiliate_payouts SET paid_at = ? WHERE id = ?").run("2026-11-15T10:00:00.000Z", p.id);
    h.user = null;
    expect((await GET(new Request("http://x/e?month=2026-11"))).status).toBe(401);
    h.user = { id: ID.staff, email: "staff@t.test" };
    expect((await GET(new Request("http://x/e?month=2026-11"))).status).toBe(403);
    owner();
    const res = await GET(new Request("http://x/e?month=2026-11"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("affiliate-payouts-2026-11.csv");
    const text = (await res.text()).replace(/^﻿/, "");
    const [head, row] = text.trim().split("\n");
    expect(head).toBe("date_asia_beirut,date_utc,affiliate,code,instagram,commissions,corrections_deducted,paid,method,note");
    expect(row).toContain('"2026-11-15 12:00"'); // Beirut time (UTC+2 in winter)
    expect(row).toContain(`"'=HYPERLINK(""http://evil.example"",""x"")"`); // a formula in a name is defused
    expect(row).toContain(`"'+cmd"`);
    expect(row).toContain('"8.10","0.00","8.10"');
    expect((await (await GET(new Request("http://x/e?month=2026-10"))).text()).trim().split("\n")).toHaveLength(1);
    expect((await GET(new Request("http://x/e?month=banana"))).status).toBe(400);
  });
});

describe("orders: affiliate on the list, the filter and the export", () => {
  it("each order carries its affiliate, and the filter shows only that affiliate's orders", async () => {
    const a = createAffiliate({ name: "Rami", code: "RAMI10" });
    const b = createAffiliate({ name: "Lina", code: "LINA10" });
    const oa = buy(a.code, 2).order.id;
    buy(b.code, 1);
    buy(undefined, 1);
    const all = await listOrders({});
    expect(all.total).toBe(3);
    expect(all.orders.find((o) => o.id === oa)?.affiliate).toMatchObject({ name: "Rami", code: "RAMI10" });
    expect(all.orders.filter((o) => o.affiliate).length).toBe(2);
    const onlyA = await listOrders({ affiliate: a.id });
    expect(onlyA.orders.map((o) => o.id)).toEqual([oa]);
    expect(onlyA.total).toBe(1);
    expect((await listOrders({ affiliate: "not-an-id" })).total).toBe(0);
    expect((await listOrders({ affiliate: "' OR 1=1 --" })).total).toBe(0);
    expect(affiliateOptions().map((x) => x.code)).toEqual(["LINA10", "RAMI10"]);
  });

  it("the orders page shows the Affiliate column with discount, commission and status, and the filter menu", async () => {
    const a = createAffiliate({ name: "Rami Khoury", code: "RAMI10" });
    buy(a.code, 2);
    const mod = await import("@/app/admin/(app)/orders/page");
    const html = renderToStaticMarkup((await mod.default({ searchParams: Promise.resolve({}) })) as never);
    expect(html).toContain("Rami Khoury");
    expect(html).toContain("RAMI10 · −$6.00 · commission $8.10 (pending)");
    expect(html).toContain('aria-label="Ambassador"');
    expect(html).toContain("Rami Khoury (RAMI10)");
    const filtered = renderToStaticMarkup((await mod.default({ searchParams: Promise.resolve({ affiliate: "nope" }) })) as never);
    expect(filtered).toContain("No orders match.");
  });

  it("the order page and the CSV show the affiliate, the discount, the commission and its status", async () => {
    const a = createAffiliate({ name: "Rami Khoury", code: "RAMI10" });
    const o = buy(a.code, 2).order.id;
    const page = await import("@/app/admin/(app)/orders/[id]/page");
    const html = renderToStaticMarkup((await page.default({ params: Promise.resolve({ id: o }) })) as never);
    expect(html).toContain("Rami Khoury · RAMI10");
    expect(html).toContain("Commission $8.10 · pending");
    expect(html).toContain("−$6.00");
    const { GET } = await import("@/app/admin/(app)/orders/export/route");
    const csv = await (await GET(new Request("http://x/e"))).text();
    expect(csv).toContain("affiliate,affiliate_code,affiliate_discount,commission,commission_status");
    expect(csv).toContain('"Rami Khoury","RAMI10","6","8.1","pending"');
  });
});
