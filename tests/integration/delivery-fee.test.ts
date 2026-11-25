import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { getEngine } from "../../lib/db/core";
import { placeOrder, quoteAction } from "@/app/actions/checkout";
import { saveDeliveryFee, saveFreeOver } from "@/app/admin/(app)/settings/shipping/actions";
import { DEFAULT_DELIVERY_FEE, deliveryFee } from "@/lib/delivery";
import { getCatalog } from "@/lib/catalog";
import { h, ID, reqHeaders, resetState } from "../support/state";
import { seedStore } from "../support/seed";
import { checkoutInput, deliveryTo } from "../support/checkout";

let S: Awaited<ReturnType<typeof seedStore>>;
const sql = () => getEngine().sqlite;
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
const orders = () => sql().prepare("SELECT order_number, region, subtotal_cents, shipping_fee_cents, total_cents, cod_amount_due_cents FROM orders ORDER BY order_number").all() as Record<string, number | string>[];
let ip = 1;
beforeEach(async () => {
  resetState();
  S = await seedStore();
  h.user = null;
  reqHeaders["x-forwarded-for"] = `10.4.4.${ip++}`;
});

describe("one flat $5 delivery fee for every region and every order", () => {
  it("the default is exactly $5.00", () => {
    expect(DEFAULT_DELIVERY_FEE).toBe(5);
    expect(deliveryFee()).toBe(5);
  });

  it("an order from ANY district (all 26, in all 8 governorates) gets exactly $5 delivery (the same total formula everywhere)", async () => {
    const districts = sql().prepare("SELECT id FROM locations WHERE type = 'district' ORDER BY id").all() as { id: string }[];
    expect(districts).toHaveLength(26);
    let n = 0;
    for (const d of districts) {
      reqHeaders["x-forwarded-for"] = `10.50.${Math.floor(n / 200)}.${n % 200}`;
      const r = await placeOrder(checkoutInput(S.red.id, { phone: `03 ${String(100000 + n)}`, name: `Region ${n}`, delivery: deliveryTo(d.id) }));
      expect(r, d.id).toMatchObject({ ok: true });
      n++;
    }
    const rows = orders();
    expect(rows).toHaveLength(26);
    expect(new Set(sql().prepare("SELECT governorate_id FROM orders").all().map((o) => (o as { governorate_id: string }).governorate_id)).size).toBe(8);
    for (const o of rows) {
      expect(o.shipping_fee_cents, `${o.region}`).toBe(500);
      expect(o.total_cents).toBe(Number(o.subtotal_cents) + 500);
      expect(o.cod_amount_due_cents).toBe(o.total_cents); // the courier collects the products plus the $5
    }
  });

  it("every zone name, an unknown region and no region at all quote the same $5", async () => {
    for (const region of ["Beirut", "Bekaa", "Mount Lebanon", "North Lebanon", "South Lebanon", "Nabatieh", "Atlantis", ""]) {
      expect(await quoteAction([{ productId: S.red.id, qty: 1 }], region, ""), region).toMatchObject({ ok: true, subtotal: 30, shipping: 5, total: 35 });
    }
  });

  it("the fee never comes from the browser or from the old per-zone numbers in the database", async () => {
    sql().prepare("UPDATE shipping_zones SET fee_cents = 99900").run(); // an old per-zone fee must be ignored
    const tampered = { ...checkoutInput(S.red.id), shipping: 0, shippingFee: 0, deliveryFee: 0, total: 1, items: [{ productId: S.red.id, qty: 1, shipping: 0 }] } as never;
    expect(await placeOrder(tampered)).toMatchObject({ ok: true, total: 35 });
    expect(orders()[0]).toMatchObject({ shipping_fee_cents: 500, total_cents: 3500 });
  });

  it("the cart, checkout and the catalog all read the same single value", async () => {
    expect((await getCatalog()).deliveryFee).toBe(5);
  });
});

describe("the setting, and old orders keep the fee they were created with", () => {
  it("the owner can change the fee; new orders use it; orders already placed are NOT changed", async () => {
    const first = await placeOrder(checkoutInput(S.red.id));
    expect(first).toMatchObject({ ok: true, total: 35 });
    h.user = { id: ID.owner, email: "owner@t.test" };
    expect(await saveDeliveryFee(null, form({ fee: "7.5", version: "0" }))).toMatchObject({ ok: expect.stringMatching(/\$7\.50/) });
    expect(deliveryFee()).toBe(7.5);
    expect((await getCatalog()).deliveryFee).toBe(7.5);
    expect(await quoteAction([{ productId: S.red.id, qty: 1 }], "Bekaa", "")).toMatchObject({ shipping: 7.5, total: 37.5 });
    h.user = null;
    reqHeaders["x-forwarded-for"] = "10.4.9.9";
    expect(await placeOrder(checkoutInput(S.red.id, { phone: "03 777 111" }))).toMatchObject({ ok: true, total: 37.5 });
    const rows = orders();
    expect(rows.map((o) => o.shipping_fee_cents)).toEqual([500, 750]); // the first order still says $5
    expect(rows[0].total_cents).toBe(3500);
    expect(sql().prepare("SELECT 1 FROM audit_log WHERE action = 'delivery_fee_update'").all()).toHaveLength(1);
  });

  it("bad values and stale forms are refused, and the fee stays as it was", async () => {
    h.user = { id: ID.owner, email: "owner@t.test" };
    for (const fee of ["", "abc", "-1", "1001"]) expect(await saveDeliveryFee(null, form({ fee })), fee).toMatchObject({ error: expect.any(String) });
    expect(deliveryFee()).toBe(5);
    expect(await saveDeliveryFee(null, form({ fee: "6", version: "0" }))).toMatchObject({ ok: expect.any(String) });
    expect(await saveDeliveryFee(null, form({ fee: "9", version: "0" }))).toMatchObject({ error: expect.stringMatching(/changed elsewhere/) });
    expect(deliveryFee()).toBe(6);
    expect(await saveDeliveryFee(null, form({ fee: "0", version: "1" }))).toMatchObject({ ok: expect.any(String) });
    expect(deliveryFee()).toBe(0); // a free-delivery promotion is a legitimate value
  });

  it("only people who can manage shipping can change it", async () => {
    h.user = { id: ID.staff, email: "staff@t.test" };
    await expect(saveDeliveryFee(null, form({ fee: "1" }))).rejects.toThrow("HTTP_403");
    h.user = null;
    await expect(saveDeliveryFee(null, form({ fee: "1" }))).rejects.toThrow("HTTP_401");
    expect(deliveryFee()).toBe(5);
  });
});

describe("the free-delivery lines are left exactly as they were", () => {
  it("their values are untouched (the flat fee migration only rewrote the old per-zone fee)", async () => {
    expect(sql().prepare("SELECT name, free_over_cents FROM shipping_zones ORDER BY sort").all()).toEqual([
      { name: "Beirut", free_over_cents: 6000 },
      { name: "Bekaa", free_over_cents: null },
    ]);
  });

  it("they still work: above the line delivery is free, below it the flat $5 applies", async () => {
    expect(await quoteAction([{ productId: S.red.id, qty: 2 }], "Beirut", "")).toMatchObject({ subtotal: 60, shipping: 0, freeDelivery: true, total: 60 });
    expect(await quoteAction([{ productId: S.red.id, qty: 1 }], "Beirut", "")).toMatchObject({ shipping: 5, total: 35 });
    expect(await quoteAction([{ productId: S.red.id, qty: 5 }], "Bekaa", "")).toMatchObject({ shipping: 5 }); // Bekaa has no line in this seed
    h.user = { id: ID.owner, email: "owner@t.test" };
    const z = sql().prepare("SELECT id, version FROM shipping_zones WHERE name = 'Beirut'").get() as { id: string; version: number };
    expect(await saveFreeOver(null, form({ id: z.id, version: String(z.version), free_over: "100" }))).toMatchObject({ ok: "Saved." });
    expect(await quoteAction([{ productId: S.red.id, qty: 2 }], "Beirut", "")).toMatchObject({ shipping: 5, total: 65 });
  });
});

describe("the admin Settings page: one Delivery fee field, no per-zone rate table", () => {
  it("shows a single editable Delivery fee and no zone fee, name or add-a-zone fields", async () => {
    h.user = { id: ID.owner, email: "owner@t.test" };
    const { default: Page } = await import("@/app/admin/(app)/settings/shipping/page");
    const out = renderToStaticMarkup(createElement("div", null, await Page()));
    expect(out.match(/Delivery fee \(\$\)/g)).toHaveLength(1);
    expect(out).toContain('value="5"'); // the current fee
    expect(out).not.toMatch(/Add a zone|Estimated time|name="fee"[^>]*placeholder|Delivery zones \(Lebanon\)/);
    expect(out.match(/name="fee"/g)).toHaveLength(1); // the only fee input on the page
    expect(out).toContain("Free-delivery lines (unchanged)");
  });
});
