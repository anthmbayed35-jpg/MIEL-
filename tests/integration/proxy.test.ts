import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/ssr", async () => {
  const { fakeAuthClient } = await import("../support/state");
  return { createServerClient: () => fakeAuthClient() };
});

import { h, ID, resetState } from "../support/state";
import { proxy } from "../../proxy";

const ENV = { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service" };
const req = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) => new NextRequest(`http://localhost:3000${path}`, init as any);
const passes = (r: Response) => r.headers.get("x-middleware-next") === "1";

beforeEach(() => {
  resetState();
  Object.assign(process.env, ENV);
});

describe("proxy: nobody signed in", () => {
  it("redirects every admin page to the login page", async () => {
    for (const p of ["/admin", "/admin/orders", "/admin/orders/abc", "/admin/products/new", "/admin/settings/team", "/admin/print?ids=1", "/admin/account", "/admin/mfa", "/admin/set-password"]) {
      const r = await proxy(req(p));
      expect(r.status, p).toBe(307);
      expect(r.headers.get("location"), p).toContain("/admin/login");
    }
  });
  it("answers 401 JSON (not a redirect) to APIs, exports and server actions", async () => {
    for (const [p, init] of [
      ["/admin/api/notifications", {}],
      ["/admin/api/search?q=a", {}],
      ["/admin/orders/export", {}],
      ["/admin/customers/export", {}],
      ["/admin/analytics/export?kind=sales", {}],
      ["/admin/orders", { method: "POST", headers: { "next-action": "abc123" } }],
      ["/admin/settings/team", { method: "POST", headers: { "next-action": "abc123" } }],
    ] as const) {
      const r = await proxy(req(p, init as any));
      expect(r.status, p).toBe(401);
      expect((await r.json()).error).toBeTruthy();
    }
  });
  it("lets the public sign-in pages through (and nothing else)", async () => {
    for (const p of ["/admin/login", "/admin/forgot", "/admin/auth/confirm?token_hash=x&type=invite"]) expect(passes(await proxy(req(p))), p).toBe(true);
  });
  it("adds noindex and no-store to everything under /admin", async () => {
    for (const p of ["/admin/login", "/admin/orders"]) {
      const r = await proxy(req(p));
      expect(r.headers.get("x-robots-tag")).toMatch(/noindex/);
    }
    expect((await proxy(req("/admin/login"))).headers.get("cache-control")).toMatch(/no-store/);
  });
  it("with no Supabase configured at all, the admin is closed", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect((await proxy(req("/admin/orders"))).status).toBe(307);
    expect((await proxy(req("/admin/api/notifications"))).status).toBe(401);
  });
});

describe("proxy: signed in", () => {
  beforeEach(() => {
    h.user = { id: ID.owner, email: "owner@t.test" };
  });
  it("passes through and records activity in an httpOnly cookie", async () => {
    const r = await proxy(req("/admin/orders"));
    expect(passes(r)).toBe(true);
    const c = r.cookies.get("miel_seen");
    expect(c?.value).toMatch(/^\d+$/);
    expect(r.headers.get("set-cookie")).toMatch(/HttpOnly/i);
  });
  it("ends the session after 12 hours without activity (page: redirect, API: 401)", async () => {
    const stale = String(Date.now() - 13 * 3600_000);
    const page = await proxy(req("/admin/orders", { headers: { cookie: `miel_seen=${stale}` } }));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toContain("/admin/login?expired=1");
    expect(h.calls.signOut).toHaveLength(1);
    h.user = { id: ID.owner, email: "owner@t.test" };
    const api = await proxy(req("/admin/api/notifications", { headers: { cookie: `miel_seen=${stale}` } }));
    expect(api.status).toBe(401);
  });
  it("keeps the session alive when activity is recent", async () => {
    const fresh = String(Date.now() - 11 * 3600_000);
    expect(passes(await proxy(req("/admin/orders", { headers: { cookie: `miel_seen=${fresh}` } })))).toBe(true);
    expect(h.calls.signOut).toHaveLength(0);
  });
});
