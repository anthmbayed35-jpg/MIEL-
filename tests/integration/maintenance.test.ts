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
import { inMaintenance, siteMode, staysOpenInMaintenance } from "@/lib/site-mode";
import { placeOrder as placeOrderLib } from "@/lib/orders";
import { h, ID, jar, reqHeaders, resetState } from "../support/state";
import { seedStore } from "../support/seed";

let S: Awaited<ReturnType<typeof seedStore>>;
const sql = () => getEngine().sqlite;
const req = (path: string, init: { method?: string; headers?: Record<string, string>; cookie?: string } = {}) =>
  new NextRequest(`https://miel.example${path}`, { method: init.method ?? "GET", headers: { ...(init.cookie ? { cookie: `${SESSION_COOKIE}=${init.cookie}` } : {}), ...init.headers } });
const passes = (r: Response) => r.headers.get("x-middleware-next") === "1";
const maintenance = () => {
  process.env.SITE_MODE = "maintenance";
};

beforeEach(async () => {
  resetState();
  S = await seedStore();
  reqHeaders["x-forwarded-for"] = "8.8.8.8";
  delete process.env.SITE_MODE;
});
afterEach(() => {
  delete process.env.SITE_MODE;
});

describe("SITE_MODE parsing", () => {
  it("defaults to live; only exactly 'maintenance' (any case) hides the site", () => {
    expect(siteMode({})).toBe("live");
    expect(siteMode({ SITE_MODE: "live" })).toBe("live");
    expect(siteMode({ SITE_MODE: "" })).toBe("live");
    expect(siteMode({ SITE_MODE: "Maintenance" })).toBe("maintenance");
    expect(siteMode({ SITE_MODE: " maintenance " })).toBe("maintenance");
  });
  it("is read at request time, not build time", () => {
    expect(inMaintenance()).toBe(false);
    maintenance();
    expect(inMaintenance()).toBe(true);
  });
  it("what stays open: admin, health, uploads, static files, robots. What closes: pages, API, sitemap", () => {
    for (const p of ["/admin", "/admin/login", "/admin/api/events", "/admin/set-password", "/api/health", "/uploads/x-480.webp", "/_next/static/a.js", "/brand/miel-m-plus.png", "/images/red-burn/x-480.webp", "/robots.txt", "/favicon.ico", "/icon.png", "/apple-icon.png", "/opengraph-image.png"])
      expect(staysOpenInMaintenance(p), p).toBe(true);
    for (const p of ["/", "/products/red-burn", "/policies/shipping", "/checkout", "/cart", "/api/track", "/sitemap.xml", "/anything/else", "/maintenance-not"]) expect(staysOpenInMaintenance(p), p).toBe(false);
  });
});

describe("proxy in maintenance mode", () => {
  it("every public page is rewritten to the branded page with 503, Retry-After and noindex", async () => {
    maintenance();
    for (const p of ["/", "/products/red-burn", "/products/gold", "/policies/shipping", "/cart", "/checkout", "/some/unknown/page", "/sitemap.xml"]) {
      const r = await proxy(req(p));
      expect(r.status, p).toBe(503);
      expect(r.headers.get("x-middleware-rewrite"), p).toContain("/maintenance");
      expect(r.headers.get("retry-after"), p).toBe("3600");
      expect(r.headers.get("x-robots-tag"), p).toContain("noindex");
      expect(r.headers.get("cache-control"), p).toBe("no-store");
    }
  });

  it("cart, checkout and order calls (server actions, API routes, any non-GET) get a JSON 503", async () => {
    maintenance();
    const cases: [string, Parameters<typeof req>[1]][] = [
      ["/", { method: "POST", headers: { "next-action": "abc123" } }],
      ["/products/red-burn", { method: "POST", headers: { "next-action": "abc123" } }],
      ["/products/red-burn", { method: "POST" }],
      ["/api/track", { method: "POST" }],
      ["/api/track", { method: "GET" }],
      ["/api/orders", { method: "POST" }],
      ["/", { method: "GET", headers: { "next-action": "abc123" } }],
    ];
    for (const [p, init] of cases) {
      const r = await proxy(req(p, init));
      expect(r.status, `${init?.method} ${p}`).toBe(503);
      expect(r.headers.get("retry-after")).toBe("3600");
      expect(r.headers.get("x-robots-tag")).toContain("noindex");
      expect(await r.json()).toMatchObject({ ok: false });
    }
  });

  it("admin, login, health, uploads and static files pass straight through", async () => {
    maintenance();
    for (const p of ["/admin/login", "/admin/forgot", "/admin/set-password?type=invite&token=x", "/api/health", "/uploads/a-480.webp", "/brand/miel-m-plus.png", "/images/a.webp", "/robots.txt", "/favicon.ico"])
      expect(passes(await proxy(req(p))), p).toBe(true);
    // the admin keeps ITS OWN gate: signed out -> login, signed in -> through
    expect((await proxy(req("/admin/orders"))).status).toBe(307);
    expect((await proxy(req("/admin/api/notifications"))).status).toBe(401);
    expect(passes(await proxy(req("/admin/orders", { cookie: createSession(ID.staff).token })))).toBe(true);
    expect(passes(await proxy(req("/admin/api/events", { cookie: createSession(ID.owner).token })))).toBe(true);
  });

  it("live mode: the proxy lets the public site through untouched", async () => {
    for (const p of ["/", "/products/red-burn", "/api/track"]) expect(passes(await proxy(req(p))), p).toBe(true);
    expect(passes(await proxy(req("/", { method: "POST", headers: { "next-action": "abc" } })))).toBe(true);
  });
});

describe("the maintenance page", () => {
  it("is branded, has no form, no email capture and no health claims", async () => {
    maintenance();
    const { default: Page } = await import("@/app/maintenance/page");
    const html = renderToStaticMarkup(React.createElement(Page));
    expect(html).toContain("MIEL+ is under development");
    expect(html).toContain("Something new is coming. Stay tuned.");
    expect(html).toContain("/brand/miel-full.png");
    expect(html).toContain('class="display');
    expect(html).not.toMatch(/<form|<input|<textarea|<select|type="email"|newsletter|subscribe|sign ?up|notify me|waitlist/i);
    expect(html).not.toMatch(/health|cure|treat|prevent|medical|clinically|doctor|immune|detox/i);
  });
  it("tells search engines not to index it", async () => {
    const { metadata } = await import("@/app/maintenance/page");
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });
  it("does not exist while the site is live", async () => {
    const { default: Page } = await import("@/app/maintenance/page");
    expect(() => Page()).toThrow("HTTP_404");
  });
  it("robots.txt disallows everything and drops the sitemap", async () => {
    const { default: robots } = await import("@/app/robots");
    maintenance();
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    delete process.env.SITE_MODE;
    expect(robots()).toMatchObject({ rules: { allow: "/", disallow: ["/admin", "/api", "/partner", "/ambassador/"] }, sitemap: expect.stringContaining("/sitemap.xml") });
  });
});

describe("no real order can be placed in maintenance mode (server-side, whatever the proxy does)", () => {
  const input = (productId: string) => ({
    items: [{ productId, qty: 1 }],
    customer: { name: "Late Customer", phone: "03 123 456", address: "Hamra, Bldg 5", notes: "" },
    region: "Beirut",
    code: "",
  });

  it("the checkout server actions refuse by themselves", async () => {
    maintenance();
    const { placeOrder, quoteAction, captureCheckout } = await import("@/app/actions/checkout");
    expect(await placeOrder(input(S.gold.id))).toEqual({ ok: false, error: expect.stringMatching(/isn't taking orders yet/) });
    expect(await quoteAction([{ productId: S.gold.id, qty: 1 }], "Beirut", "WELCOME10")).toMatchObject({ ok: false, total: 0 });
    expect(await captureCheckout({ name: "X Y", phone: "03 123 456", items: [{ productId: S.gold.id, qty: 1 }] })).toBeUndefined();
    expect(sql().prepare("SELECT COUNT(*) n FROM orders").get()).toEqual({ n: 0 });
    expect(sql().prepare("SELECT COUNT(*) n FROM customers").get()).toEqual({ n: 0 });
    expect(sql().prepare("SELECT COUNT(*) n FROM abandoned_checkouts").get()).toEqual({ n: 0 });
    expect(sql().prepare("SELECT on_hand FROM inventory_items WHERE product_id = ?").get(S.gold.id)).toEqual({ on_hand: 5 }); // stock untouched
  });

  it("the funnel tracking route refuses", async () => {
    maintenance();
    const { POST } = await import("@/app/api/track/route");
    const r = await POST(new Request("https://miel.example/api/track", { method: "POST", body: JSON.stringify({ type: "visit", path: "/" }), headers: { "content-type": "application/json" } }));
    expect(r.status).toBe(503);
    expect(r.headers.get("retry-after")).toBe("3600");
    expect(sql().prepare("SELECT COUNT(*) n FROM events").get()).toEqual({ n: 0 });
  });

  it("the order transaction itself refuses customer (web) orders", () => {
    maintenance();
    expect(() => placeOrderLib({ customer: { name: "Late Customer", phone: "03 123 456", address: "Hamra, Bldg 5" }, items: [{ productId: S.gold.id, qty: 1 }], region: "Beirut", source: "web", actor: "customer" })).toThrow(/isn't taking orders yet/);
    expect(sql().prepare("SELECT COUNT(*) n FROM orders").get()).toEqual({ n: 0 });
  });

  it("live mode: the same calls work (so the tests above prove the guard, not a broken setup)", async () => {
    const { placeOrder } = await import("@/app/actions/checkout");
    expect(await placeOrder(input(S.gold.id))).toMatchObject({ ok: true });
    expect(sql().prepare("SELECT COUNT(*) n FROM orders").get()).toEqual({ n: 1 });
  });

  it("the team can still enter orders by hand from the admin (that is not the public storefront)", async () => {
    maintenance();
    h.user = { id: ID.manager, email: "manager@t.test" };
    const { createManualOrder } = await import("@/app/admin/(app)/orders/actions");
    const fd = new FormData();
    fd.set(`qty_${S.gold.id}`, "1");
    fd.set("name", "Phone Customer");
    fd.set("phone", "70 123 456");
    fd.set("region", "Beirut");
    fd.set("address", "Jounieh, Main Rd, Bldg 3");
    fd.set("source", "whatsapp");
    fd.set("intent", "create");
    await expect(createManualOrder(null, fd)).rejects.toThrow(/NEXT_REDIRECT:\/admin\/orders\//);
    expect(sql().prepare("SELECT source FROM orders").get()).toEqual({ source: "whatsapp" });
  });
});

describe("the admin and the health check stay fully usable in maintenance mode", () => {
  it("/api/health is 200 and reports mail", async () => {
    maintenance();
    const { GET } = await import("@/app/api/health/route");
    const r = await GET();
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ status: "ok", db: "ok", volume: "writable" });
  });

  it("admin API routes answer for a signed-in admin and 401 for everyone else", async () => {
    maintenance();
    const { GET: notifications } = await import("@/app/admin/api/notifications/route");
    const { GET: search } = await import("@/app/admin/api/search/route");
    h.user = null;
    expect((await notifications()).status).toBe(401);
    h.user = { id: ID.staff, email: "staff@t.test" };
    expect((await notifications()).status).toBe(200);
    expect((await search(new Request("https://miel.example/admin/api/search?q=gold"))).status).toBe(200);
  });

  it("sign-in still works", async () => {
    maintenance();
    const { hashPassword } = await import("@/lib/passwords");
    sql().prepare("UPDATE admin_users SET password_hash = ? WHERE id = ?").run(await hashPassword("test-only-passphrase-2025"), ID.owner);
    const { login } = await import("@/app/admin/login/actions");
    const fd = new FormData();
    fd.set("email", "owner@t.test");
    fd.set("password", "test-only-passphrase-2025");
    await expect(login(null, fd)).rejects.toThrow("NEXT_REDIRECT:/admin");
    expect(jar.has(SESSION_COOKIE)).toBe(true);
  });

  it("the admin shows the maintenance banner (and the mail banner when mail is off), nothing when all is well", async () => {
    const { StatusBanners } = await import("@/components/admin/StatusBanners");
    const html = (mail: boolean) => {
      if (mail) process.env.MAIL_PROVIDER = "file";
      else delete process.env.MAIL_PROVIDER;
      return renderToStaticMarkup(React.createElement(StatusBanners));
    };
    process.env.MAIL_OUTBOX = "/tmp/x.jsonl";
    maintenance();
    const hidden = html(true);
    expect(hidden).toContain("Storefront is hidden from the public.");
    expect(hidden).toContain("Set SITE_MODE=live to launch.");
    expect(hidden).not.toContain("Email is not configured yet");
    const both = html(false);
    expect(both).toContain("Storefront is hidden from the public.");
    expect(both).toContain("Email is not configured yet");
    delete process.env.SITE_MODE;
    const mailOnly = html(false);
    expect(mailOnly).toContain("Email is not configured yet");
    expect(mailOnly).not.toContain("Storefront is hidden");
    expect(html(true)).toBe(""); // live + mail configured: no banner
  });
});
