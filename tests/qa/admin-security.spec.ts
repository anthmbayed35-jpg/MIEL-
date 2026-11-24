import { expect, test } from "@playwright/test";
import { can, type Perm, type Role } from "../../lib/roles";
import { newContext, signIn, targets, VIEWPORTS, writeResults } from "./qa-lib";
import { USERS } from "../support/e2e-env";

/**
 * STEP 5 over real HTTP against the production build: logged-out access, and the owner / manager / staff permission matrix on every
 * admin page and API route, called DIRECTLY (no UI). Also: no stack trace and no secret in any response.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(600_000);

const PERM: [RegExp, Perm | null][] = [
  [/^\/admin\/products\/new/, "products.write"], [/^\/admin\/products/, "products.read"],
  [/^\/admin\/orders\/new/, "orders.write"], [/^\/admin\/orders/, "orders.read"], [/^\/admin\/print/, "orders.read"],
  [/^\/admin\/customers/, "customers.read"], [/^\/admin\/inventory/, "inventory.read"], [/^\/admin\/analytics/, "analytics.read"],
  [/^\/admin\/marketing\/discounts/, "discounts.manage"], [/^\/admin\/marketing\/content/, "content.manage"], [/^\/admin\/marketing/, "marketing.manage"],
  [/^\/admin\/affiliates\/new/, "affiliates.manage"], [/^\/admin\/affiliates/, "affiliates.read"],
  [/^\/admin\/settings\/team/, "team.manage"], [/^\/admin\/settings\/shipping/, "shipping.manage"], [/^\/admin\/settings\/activity/, "audit.read"], [/^\/admin\/settings/, "settings.read"],
  [/^\/admin(\/account)?$/, null],
];
const need = (url: string): Perm | null => PERM.find(([re]) => re.test(url))?.[1] ?? null;
const ROUTES: [string, Perm | null][] = [
  ["/admin/orders/export", "exports.run"], ["/admin/customers/export", "exports.run"], ["/admin/analytics/export?kind=sales", "analytics.read"],
  ["/admin/affiliates/export?month=2026-11", "exports.run"], ["/admin/affiliates/payouts/export?month=2026-11", "exports.run"], ["/admin/backup/download", "backup.download"],
  ["/admin/api/notifications", null], ["/admin/api/search?q=ab", null],
];
type Item = { who: string; what: string; ok: boolean; note: string };
const items: Item[] = [];
const rec = (who: string, what: string, ok: boolean, note = "") => items.push({ who, what, ok, note });

const STACK = /at \S+ \(.*\.(js|ts)[:\d]*\)|node_modules|TypeError:|ReferenceError:|SQLITE_|password_hash|totp_secret|recovery_codes|\$argon2|AUTH_SECRET|BACKUP_ENCRYPTION_KEY|BREVO_API_KEY/;

test("logged out: every admin page redirects to the sign-in page, every route and action answers 401", async ({ browser }) => {
  const ctx = await newContext(browser, VIEWPORTS[0]);
  const req = ctx.request;
  for (const t of targets().filter((x) => x.url.startsWith("/admin") && !["anon", "flow-change", "flow-mfa"].includes(x.kind))) {
    const r = await req.get(t.url, { maxRedirects: 0 });
    const ok = r.status() >= 300 && r.status() < 400 && (r.headers().location ?? "").includes("/admin/login");
    rec("logged out", `page ${t.url.split("?")[0]}`, ok, ok ? "" : `HTTP ${r.status()}`);
    expect(await r.text(), t.url).not.toMatch(STACK);
  }
  for (const [u] of ROUTES) {
    const r = await req.get(u, { maxRedirects: 0 });
    rec("logged out", `route ${u.split("?")[0]}`, r.status() === 401, `HTTP ${r.status()}`);
  }
  const post = await req.post("/admin/affiliates", { headers: { "next-action": "00".repeat(20), "content-type": "text/plain" }, data: "[]", maxRedirects: 0 });
  rec("logged out", "server action call", [401, 400, 404].includes(post.status()), `HTTP ${post.status()}`);
  expect(items.filter((i) => !i.ok)).toEqual([]);
});

for (const role of ["staff", "manager", "owner"] as const) {
  test(`${role}: every admin page and route, called directly, matches the permission matrix`, async ({ browser }) => {
    const ctx = await newContext(browser, VIEWPORTS[0]);
    const page = await ctx.newPage();
    await signIn(page, USERS[role].email);
    const req = page.request;
    for (const t of targets().filter((x) => x.kind === "admin" && x.url.startsWith("/admin"))) {
      const perm = need(t.url.split("?")[0]);
      const allowed = perm === null || can(role as Role, perm);
      const r = await req.get(t.url, { maxRedirects: 0 });
      const ok = allowed ? r.status() === 200 : r.status() === 403 || (r.status() >= 300 && r.status() < 400);
      rec(role, `page ${t.url.split("?")[0]}${t.label ? ` (${t.label})` : ""}`, ok, ok ? "" : `HTTP ${r.status()} but ${allowed ? "allowed" : "forbidden"} expected`);
      expect(await r.text(), `${role} ${t.url}`).not.toMatch(STACK);
    }
    for (const [u, perm] of ROUTES) {
      const allowed = perm === null || can(role as Role, perm);
      const r = await req.get(u, { maxRedirects: 0 });
      const ok = allowed ? r.status() === 200 : r.status() === 403;
      rec(role, `route ${u.split("?")[0]}`, ok, ok ? "" : `HTTP ${r.status()}`);
      if (r.headers()["content-type"]?.includes("json") || r.headers()["content-type"]?.includes("csv")) expect(await r.text(), `${role} ${u}`).not.toMatch(STACK);
    }
    expect(items.filter((i) => i.who === role && !i.ok)).toEqual([]);
    await ctx.close();
  });
}

test("recorded", () => {
  writeResults("security", items);
  expect(items.length).toBeGreaterThan(100);
});
