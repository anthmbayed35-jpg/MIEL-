import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode }) => React.createElement("a", { href: p.href }, p.children) }));

import { getEngine } from "../../lib/db/core";
import { proxy } from "@/proxy";
import { createSession, SESSION_COOKIE } from "@/lib/session";
import { TEST_ORDER_CONFIRMATION } from "@/lib/site-mode";
import { previewAdmin } from "@/lib/preview";
import { isSale, loadData } from "@/lib/stats";
import { placeOrder as placeOrderLib } from "@/lib/orders";
import { h, ID, outbox, reqHeaders, resetState } from "../support/state";
import { seedStore } from "../support/seed";

let S: Awaited<ReturnType<typeof seedStore>>;
const sql = () => getEngine().sqlite;
const req = (path: string, init: { method?: string; headers?: Record<string, string>; cookie?: string } = {}) =>
  new NextRequest(`https://miel.example${path}`, { method: init.method ?? "GET", headers: { ...(init.cookie ? { cookie: `${SESSION_COOKIE}=${init.cookie}` } : {}), ...init.headers } });
const passes = (r: Response) => r.headers.get("x-middleware-next") === "1";
const maintenance = () => {
  process.env.SITE_MODE = "maintenance";
};
const input = (productId: string, extra: object = {}) => ({
  items: [{ productId, qty: 2 }],
  customer: { name: "Preview Tester", phone: "03 123 456", address: "Hamra, Bldg 5", notes: "ring twice" },
  region: "Beirut",
  code: "",
  ...extra,
});

beforeEach(async () => {
  resetState();
  S = await seedStore();
  reqHeaders["x-forwarded-for"] = "8.8.8.8";
  delete process.env.SITE_MODE;
});
afterEach(() => {
  delete process.env.SITE_MODE;
});

describe("proxy: a signed-in admin sees the real storefront while everyone else gets the 503 page", () => {
  it("any role passes every public path, uncached and not indexable", async () => {
    maintenance();
    for (const id of [ID.staff, ID.manager, ID.owner]) {
      const cookie = createSession(id).token;
      for (const [p, init] of [["/", {}], ["/products/red-burn", {}], ["/policies/shipping", {}], ["/api/track", { method: "POST" }], ["/", { method: "POST", headers: { "next-action": "abc" } }], ["/sitemap.xml", {}]] as const) {
        const r = await proxy(req(p, { ...init, cookie }));
        expect(passes(r), `${id} ${p}`).toBe(true);
        expect(r.headers.get("cache-control")).toBe("private, no-store");
        expect(r.headers.get("x-robots-tag")).toContain("noindex");
      }
    }
  });

  it("everyone else still gets the 503 page: no cookie, forged, expired, deactivated, or 2FA not completed", async () => {
    maintenance();
    const denied = async (cookie?: string) => (await proxy(req("/", { cookie }))).status;
    expect(await denied()).toBe(503);
    expect(await denied("x".repeat(43))).toBe(503);
    expect(await denied("' OR 1=1 --")).toBe(503);
    const gone = createSession(ID.staff).token;
    sql().prepare("UPDATE admin_users SET active = 0 WHERE id = ?").run(ID.staff);
    expect(await denied(gone)).toBe(503); // deactivated: no preview
    const idle = createSession(ID.manager).token;
    sql().prepare("UPDATE sessions SET last_seen_at = ? WHERE user_id = ?").run(new Date(Date.now() - 13 * 3600_000).toISOString(), ID.manager);
    expect(await denied(idle)).toBe(503); // idle > 12 h
    sql().prepare("UPDATE admin_users SET totp_enabled = 1 WHERE id = ?").run(ID.owner);
    const pending = createSession(ID.owner).token; // password done, 2FA code not yet entered
    expect(await denied(pending)).toBe(503);
    const verified = createSession(ID.owner, { mfaOk: true }).token;
    expect(await denied(verified)).toBe(200);
  });

  it("non-admin requests to order endpoints are still JSON 503 (the visitor next to the admin gets nothing)", async () => {
    maintenance();
    const r = await proxy(req("/", { method: "POST", headers: { "next-action": "abc" } }));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ ok: false });
  });

  it("live mode is unchanged for everyone", async () => {
    expect(passes(await proxy(req("/")))).toBe(true);
    expect(passes(await proxy(req("/", { cookie: createSession(ID.staff).token })))).toBe(true);
  });
});

describe("previewAdmin() (decided on the server from the session)", () => {
  it("is the admin only in maintenance mode and only when fully signed in", async () => {
    h.user = { id: ID.staff, email: "staff@t.test" };
    expect(await previewAdmin()).toBeNull(); // live mode: no preview concept
    maintenance();
    expect((await previewAdmin())?.role).toBe("staff");
    h.user = null;
    expect(await previewAdmin()).toBeNull();
    h.user = { id: ID.owner, email: "owner@t.test" };
    h.aal = { currentLevel: "aal1", nextLevel: "aal2" }; // 2FA enrolled, not verified
    expect(await previewAdmin()).toBeNull();
    h.aal = { currentLevel: "aal2", nextLevel: "aal2" };
    expect((await previewAdmin())?.role).toBe("owner");
  });
});

describe("the preview bar", () => {
  it("says who can see the page and links back to the admin", async () => {
    const { PreviewBar } = await import("@/components/PreviewBar");
    const html = renderToStaticMarkup(React.createElement(PreviewBar));
    expect(html).toContain("Preview mode: only you can see this.");
    expect(html).toContain('href="/admin"');
    expect(html).toContain("data-preview-bar");
  });
});

describe("orders while the storefront is hidden", () => {
  it("the public (and anyone not signed in) can place nothing", async () => {
    maintenance();
    const { placeOrder } = await import("@/app/actions/checkout");
    h.user = null;
    expect(await placeOrder({ ...input(S.gold.id), confirmation: TEST_ORDER_CONFIRMATION })).toMatchObject({ ok: false, error: expect.stringMatching(/isn't taking orders yet/) }); // even claiming a confirmation
    expect(sql().prepare("SELECT COUNT(*) n FROM orders").get()).toEqual({ n: 0 });
  });

  it("an admin (any role) cannot create a REAL order: without the explicit confirmation nothing is written", async () => {
    maintenance();
    const { placeOrder } = await import("@/app/actions/checkout");
    for (const who of [ID.staff, ID.manager, ID.owner]) {
      h.user = { id: who, email: "x@t.test" };
      for (const confirmation of [undefined, "", "yes", "I confirm", TEST_ORDER_CONFIRMATION.toUpperCase(), "true"]) {
        const r = await placeOrder({ ...input(S.gold.id), ...(confirmation === undefined ? {} : { confirmation }) });
        expect(r, `${who} ${confirmation}`).toMatchObject({ ok: false, error: expect.stringMatching(/no real order can be placed/) });
      }
    }
    expect(sql().prepare("SELECT COUNT(*) n FROM orders").get()).toEqual({ n: 0 });
    expect(sql().prepare("SELECT COUNT(*) n FROM customers").get()).toEqual({ n: 0 });
    expect(sql().prepare("SELECT on_hand FROM inventory_items WHERE product_id = ?").get(S.gold.id)).toEqual({ on_hand: 5 });
  });

  it("an admin who explicitly confirms gets a clearly marked TEST order, kept out of sales, with no WhatsApp and no email", async () => {
    maintenance();
    sql().prepare("INSERT INTO settings (key, value) VALUES ('notifications', ?)").run(JSON.stringify({ email_on_new_order: true, email: "boss@t.test" }));
    h.user = { id: ID.staff, email: "staff@t.test" }; // any role may preview
    const { placeOrder } = await import("@/app/actions/checkout");
    const r = await placeOrder({ ...input(S.gold.id), confirmation: TEST_ORDER_CONFIRMATION, idempotencyKey: "k1" });
    expect(r).toMatchObject({ ok: true, test: true, whatsappUrl: "" });
    const o = sql().prepare("SELECT id, is_test, customer_notes, status, stock_deducted, source FROM orders").get() as Record<string, any>;
    expect(o).toMatchObject({ is_test: 1, status: "new", stock_deducted: 1, source: "web" });
    expect(o.customer_notes).toBe("[TEST ORDER] ring twice");
    expect(sql().prepare("SELECT message FROM order_events WHERE order_id = ?").get(o.id)).toEqual({ message: expect.stringMatching(/^TEST order placed by staff@t.test while previewing/) });
    expect(sql().prepare("SELECT on_hand FROM inventory_items WHERE product_id = ?").get(S.gold.id)).toEqual({ on_hand: 3 }); // real stock is used
    expect(outbox()).toEqual([]); // no alert email
    // statistics ignore it
    const data = await loadData(3);
    expect(data.orders.filter(isSale)).toHaveLength(0);
    expect(data.orders).toHaveLength(0);
    // and cancelling it gives the stock back like any order
    const { setOrderStatus } = await import("@/lib/orders");
    await setOrderStatus(o.id, "cancelled", "staff@t.test", { reason: "test finished" });
    expect(sql().prepare("SELECT on_hand FROM inventory_items WHERE product_id = ?").get(S.gold.id)).toEqual({ on_hand: 5 });
  });

  it("a confirmed test order still needs a real session: not signed in, 2FA pending or deactivated are all refused", async () => {
    maintenance();
    const { placeOrder } = await import("@/app/actions/checkout");
    const body = { ...input(S.gold.id), confirmation: TEST_ORDER_CONFIRMATION };
    h.user = { id: ID.owner, email: "owner@t.test" };
    h.aal = { currentLevel: "aal1", nextLevel: "aal2" };
    expect(await placeOrder(body)).toMatchObject({ ok: false, error: expect.stringMatching(/isn't taking orders yet/) });
    sql().prepare("UPDATE admin_users SET active = 0 WHERE id = ?").run(ID.manager);
    h.user = { id: ID.manager, email: "manager@t.test" };
    expect(await placeOrder(body)).toMatchObject({ ok: false });
    expect(sql().prepare("SELECT COUNT(*) n FROM orders").get()).toEqual({ n: 0 });
  });

  it("the test flag can never be set through the live storefront or by the browser", async () => {
    // live mode: the action ignores a confirmation and the order transaction ignores a test marker
    const { placeOrder } = await import("@/app/actions/checkout");
    h.user = { id: ID.owner, email: "owner@t.test" };
    expect(await placeOrder({ ...input(S.gold.id), confirmation: TEST_ORDER_CONFIRMATION, test: true, isTest: true } as never)).toMatchObject({ ok: true });
    expect(sql().prepare("SELECT is_test FROM orders").get()).toEqual({ is_test: 0 });
    const lib = placeOrderLib({ customer: { name: "Live Customer", phone: "03 999 888", address: "Hamra, Bldg 5" }, items: [{ productId: S.gold.id, qty: 1 }], region: "Beirut", source: "web", actor: "customer", test: { by: "attacker" } });
    expect(sql().prepare("SELECT is_test FROM orders WHERE id = ?").get(lib.order.id)).toEqual({ is_test: 0 });
  });

  it("an admin preview still cannot use the tracking or abandoned-checkout endpoints (no analytics pollution)", async () => {
    maintenance();
    h.user = { id: ID.owner, email: "owner@t.test" };
    const { POST } = await import("@/app/api/track/route");
    expect((await POST(new Request("https://miel.example/api/track", { method: "POST", body: "{}" }))).status).toBe(503);
    const { captureCheckout } = await import("@/app/actions/checkout");
    await captureCheckout({ name: "A B", phone: "03 123 456", items: [{ productId: S.gold.id, qty: 1 }] });
    expect(sql().prepare("SELECT COUNT(*) n FROM abandoned_checkouts").get()).toEqual({ n: 0 });
  });

  it("an admin can see prices (quote) while previewing; the public cannot", async () => {
    maintenance();
    const { quoteAction } = await import("@/app/actions/checkout");
    h.user = null;
    expect(await quoteAction([{ productId: S.gold.id, qty: 2 }], "Beirut", "")).toMatchObject({ ok: false, total: 0 });
    h.user = { id: ID.staff, email: "staff@t.test" };
    expect(await quoteAction([{ productId: S.gold.id, qty: 2 }], "Beirut", "")).toMatchObject({ ok: true, subtotal: 60, shipping: 0, freeDelivery: true }); // Beirut ships free from $60
  });
});

describe("the admin marks test orders", () => {
  it("the orders list and the order page show a TEST badge", async () => {
    maintenance();
    h.user = { id: ID.owner, email: "owner@t.test" };
    const { placeOrder } = await import("@/app/actions/checkout");
    await placeOrder({ ...input(S.gold.id), confirmation: TEST_ORDER_CONFIRMATION });
    const { OrdersTable } = await import("@/components/admin/OrdersTable");
    const row = sql().prepare("SELECT id, order_number FROM orders").get() as { id: string; order_number: number };
    const html = renderToStaticMarkup(React.createElement(OrdersTable, { rows: [{ id: row.id, number: row.order_number, date: new Date().toISOString(), customer: "Preview Tester", phone: "+9613123456", region: "Beirut", total: 63, status: "new", collected: false, source: "web", test: true }] }));
    expect(html).toContain("TEST");
  });
});
