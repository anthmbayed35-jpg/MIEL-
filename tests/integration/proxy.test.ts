import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getEngine } from "../../lib/db/core";
import { proxy } from "@/proxy";
import { createSession, IDLE_MS, SESSION_COOKIE } from "@/lib/session";
import { ID, resetState } from "../support/state";
import { seedStore } from "../support/seed";

const req = (path: string, init: { cookie?: string; headers?: Record<string, string>; method?: string } = {}) =>
  new NextRequest(`https://miel.example${path}`, { method: init.method ?? "GET", headers: { ...(init.cookie ? { cookie: `${SESSION_COOKIE}=${init.cookie}` } : {}), ...init.headers } });
const passes = (r: Response) => r.status === 200 && r.headers.get("x-middleware-next") === "1";

beforeEach(async () => {
  resetState();
  await seedStore();
});

describe("proxy: the front door of /admin", () => {
  it("no cookie: pages redirect to the login page, APIs and server actions get 401", async () => {
    const page = await proxy(req("/admin/orders"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("https://miel.example/admin/login");
    for (const r of [await proxy(req("/admin/api/notifications")), await proxy(req("/admin/api/events")), await proxy(req("/admin/orders/export")), await proxy(req("/admin/backup/download")), await proxy(req("/admin/orders", { method: "POST", headers: { "next-action": "abc" } }))]) {
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ error: "Authentication required" });
    }
  });

  it("every response is noindex and uncached", async () => {
    for (const r of [await proxy(req("/admin/login")), await proxy(req("/admin/orders")), await proxy(req("/admin/api/search"))]) {
      expect(r.headers.get("x-robots-tag")).toContain("noindex");
      expect(r.headers.get("cache-control")).toBe("private, no-store");
    }
  });

  it("the sign-in, reset and set-password pages are public", async () => {
    for (const p of ["/admin/login", "/admin/forgot", "/admin/set-password", "/admin/set-password?type=invite&token=abc"]) expect(passes(await proxy(req(p))), p).toBe(true);
  });

  it("a valid session passes", async () => {
    const { token } = createSession(ID.staff);
    for (const p of ["/admin", "/admin/orders", "/admin/api/notifications"]) expect(passes(await proxy(req(p, { cookie: token }))), p).toBe(true);
  });

  it("garbage, forged and stale cookies are refused (the database is the only judge)", async () => {
    for (const c of ["garbage", "x".repeat(43), "' OR 1=1 --", "../../etc/passwd", createSession(ID.staff).token.slice(0, -2) + "zz"]) {
      expect((await proxy(req("/admin/orders", { cookie: encodeURIComponent(c) }))).status, c).toBe(307);
      expect((await proxy(req("/admin/api/search", { cookie: encodeURIComponent(c) }))).status, c).toBe(401);
    }
  });

  it("idle for more than 12 hours: ended, the cookie is cleared, pages go to the login page with ?expired=1", async () => {
    const { token } = createSession(ID.staff);
    getEngine().sqlite.prepare("UPDATE sessions SET last_seen_at = ?").run(new Date(Date.now() - IDLE_MS - 60_000).toISOString());
    const page = await proxy(req("/admin/orders", { cookie: token }));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toContain("/admin/login?expired=1");
    expect(page.headers.get("set-cookie")).toContain(`${SESSION_COOKIE}=;`);
    const again = await proxy(req("/admin/api/notifications", { cookie: token }));
    expect(again.status).toBe(401); // and the session row is gone for good
    expect(getEngine().sqlite.prepare("SELECT COUNT(*) n FROM sessions").get()).toEqual({ n: 0 });
  });

  it("a deactivated person is locked out on the very next request", async () => {
    const { token } = createSession(ID.staff);
    expect(passes(await proxy(req("/admin", { cookie: token })))).toBe(true);
    getEngine().sqlite.prepare("UPDATE admin_users SET active = 0 WHERE id = ?").run(ID.staff);
    expect((await proxy(req("/admin", { cookie: token }))).status).toBe(307);
  });

  it("a broken database never opens the door", async () => {
    getEngine().sqlite.exec("ALTER TABLE sessions RENAME TO sessions_gone");
    const { token } = { token: "a".repeat(43) };
    expect((await proxy(req("/admin/orders", { cookie: token }))).status).toBe(307);
    expect((await proxy(req("/admin/api/search", { cookie: token }))).status).toBe(401);
  });
});
