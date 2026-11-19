import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createLocalClient } from "../support/local-db";
import { h, ID, resetState } from "../support/state";

const sp = (o: Record<string, string> = {}) => Promise.resolve(o);
const html = async (loader: () => Promise<any>, props: any = {}) => {
  const mod = await loader();
  return renderToStaticMarkup(await mod.default(props));
};

beforeEach(async () => {
  resetState();
  // A brand-new store: only the owner exists. No products, orders, customers, zones, settings.
  await (createLocalClient() as any).from("admin_users").insert({ id: ID.owner, email: "owner@t.test", name: "Owner", role: "owner", active: true });
  h.user = { id: ID.owner, email: "owner@t.test" };
});

describe("a brand-new store: every admin page renders correctly with no data", () => {
  const pages: [string, () => Promise<any>, any][] = [
    ["dashboard", () => import("@/app/admin/(app)/page"), { searchParams: sp() }],
    ["orders", () => import("@/app/admin/(app)/orders/page"), { searchParams: sp() }],
    ["new order", () => import("@/app/admin/(app)/orders/new/page"), {}],
    ["products", () => import("@/app/admin/(app)/products/page"), {}],
    ["inventory", () => import("@/app/admin/(app)/inventory/page"), { searchParams: sp() }],
    ["customers", () => import("@/app/admin/(app)/customers/page"), { searchParams: sp() }],
    ["analytics", () => import("@/app/admin/(app)/analytics/page"), {}],
    ["marketing", () => import("@/app/admin/(app)/marketing/page"), {}],
    ["discounts", () => import("@/app/admin/(app)/marketing/discounts/page"), {}],
    ["content", () => import("@/app/admin/(app)/marketing/content/page"), {}],
    ["settings", () => import("@/app/admin/(app)/settings/page"), {}],
    ["shipping", () => import("@/app/admin/(app)/settings/shipping/page"), {}],
    ["team", () => import("@/app/admin/(app)/settings/team/page"), {}],
    ["activity", () => import("@/app/admin/(app)/settings/activity/page"), { searchParams: sp() }],
  ];

  for (const [name, loader, props] of pages)
    it(`${name} renders without errors and without NaN / undefined / [object Object]`, async () => {
      const out = await html(loader, props);
      expect(out.length).toBeGreaterThan(200);
      expect(out).not.toMatch(/NaN|Infinity|undefined|\[object Object\]|Invalid Date/);
    });

  it("the dashboard shows zeros and a friendly empty state", async () => {
    const out = await html(pages[0][1], pages[0][2]);
    expect(out).toContain("No orders yet.");
    expect(out).toMatch(/\$0<span[^>]*>\.00/); // split-tone zero money
    expect(out).toContain("Low-stock alerts");
  });
  it("lists say so in plain words", async () => {
    expect(await html(pages[1][1], pages[1][2])).toContain("No orders match.");
    expect(await html(pages[5][1], pages[5][2])).toContain("No customers match.");
    expect(await html(pages[3][1], pages[3][2])).toContain("No products yet.");
    expect(await html(pages[7][1], pages[7][2])).toContain("No abandoned checkouts.");
  });
});

describe("aggregations are safe on an empty store", () => {
  it("dashboard() returns zeros, finite deltas, and full-length empty series", async () => {
    const { dashboard } = await import("@/lib/stats");
    const d = await dashboard();
    expect(d.empty).toBe(true);
    expect(d.today).toMatchObject({ revenue: 0, orders: 0 });
    for (const k of ["revenue", "orders", "aov"] as const) {
      expect(d.kpi[k].value).toBe(0);
      expect(d.kpi[k].delta === null || Number.isFinite(d.kpi[k].delta as number)).toBe(true);
    }
    expect(d.series.day).toHaveLength(24);
    expect(d.series.week).toHaveLength(7);
    expect(d.series.month).toHaveLength(30);
    expect(d.series.year).toHaveLength(12);
    for (const s of Object.values(d.series)) for (const p of s) expect(p.value).toBe(0);
  });
  it("analytics() is empty but valid", async () => {
    const { analytics } = await import("@/lib/analytics");
    const a = await analytics();
    expect(a.products).toEqual([]);
    expect(a.regions).toEqual([]);
    expect(a.funnel.map((f) => f.count)).toEqual([0, 0, 0, 0]);
  });
});
