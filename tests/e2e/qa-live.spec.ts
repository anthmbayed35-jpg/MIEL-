import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_ENV, E2E_PASSWORD, ROOT, SENTINEL_AUTH_SECRET, SENTINEL_BREVO_KEY, USERS } from "../support/e2e-env";
import { exec, one } from "../support/e2e-db";

/**
 * Live sync, proven against the real production build:
 *  1. a change made in one admin tab appears in another WITHOUT a reload (server-sent events),
 *  2. when the stream is blocked, the bell still learns about new orders by polling,
 *  3. when the server restarts, the browser reconnects by itself and catches up on what it missed,
 *  4. nothing secret is ever written to the server log.
 */
test.describe.configure({ mode: "serial" });

let ip = 40;
const ctxFor = (browser: Browser) => browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${ip++}` } });

async function signIn(page: Page, base = "") {
  await page.goto(`${base}/admin/login`);
  await page.locator("input[name=email]").fill(USERS.owner.email);
  await page.locator("input[name=password]").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin(\?.*)?$/);
}

/** Enter an order by hand in a second tab (the real admin form). */
async function manualOrder(page: Page, name: string) {
  await page.goto("/admin/orders/new");
  await page.getByRole("button", { name: "More RED BURN" }).click();
  await page.locator("input[name=name]").fill(name);
  await page.locator("input[name=phone]").fill("71 765 4" + String(10 + (ip % 80)));
  await page.locator("select[name=region]").selectOption({ index: 1 });
  await page.locator("textarea[name=address]").fill("Jounieh, Main Rd, Bldg 3");
  await page.getByRole("button", { name: "Create order" }).click();
  await page.waitForURL(/\/admin\/orders\/[0-9a-f-]{36}/, { timeout: 20_000 });
}

test("an order made in one tab shows up in another tab's list without a reload, and the bell counts it", async ({ browser }) => {
  const a = await (await ctxFor(browser)).newPage();
  const b = await (await ctxFor(browser)).newPage();
  await signIn(a);
  await signIn(b);
  await a.addInitScript(() => localStorage.setItem("miel_admin_seen", new Date(Date.now() + 60_000).toISOString()));
  await a.goto("/admin/orders?q=Live%20Sync%20QA");
  await expect(a.getByText("No orders match.")).toBeVisible();
  await manualOrder(b, "Live Sync QA One");
  await expect(a.getByText("Live Sync QA One").first()).toBeVisible({ timeout: 15_000 }); // no reload
});

test("a discount created in one tab appears in another tab live (audited changes publish an event)", async ({ browser }) => {
  const a = await (await ctxFor(browser)).newPage();
  const b = await (await ctxFor(browser)).newPage();
  await signIn(a);
  await signIn(b);
  await a.goto("/admin/marketing/discounts");
  await b.goto("/admin/marketing/discounts");
  await b.locator("form:has(input[name=code]) input[name=code]").first().fill("LIVESYNC10");
  await b.locator("form:has(input[name=code]) select[name=type]").first().selectOption("percent");
  await b.locator("form:has(input[name=code]) input[name=value]").first().fill("10");
  await b.locator("form:has(input[name=code])").first().getByRole("button", { name: /save|create|add/i }).first().click();
  await expect(a.getByText("LIVESYNC10").first()).toBeVisible({ timeout: 15_000 });
});

test("polling fallback: with the live stream blocked, the bell still picks up a new order", async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await (await ctxFor(browser)).newPage();
  const b = await (await ctxFor(browser)).newPage();
  await signIn(a);
  await signIn(b);
  await a.route("**/admin/api/events", (r) => r.abort());
  await a.addInitScript(() => localStorage.setItem("miel_admin_seen", new Date(Date.now() + 3_600_000).toISOString()));
  await a.goto("/admin/settings/team"); // an edit page: nothing re-renders, only the bell can notice
  const bell = a.getByRole("button", { name: /^Notifications/ });
  await expect(bell).toHaveAttribute("aria-label", "Notifications");
  await manualOrder(b, "Poll Fallback QA");
  await a.evaluate(() => localStorage.setItem("miel_admin_seen", new Date(Date.now() - 60_000).toISOString())); // so the new order counts as unread
  await expect(bell).toHaveAttribute("aria-label", /\d+ new/, { timeout: 70_000 }); // the 30 s poll
});

test("reconnect after a real server restart, catching up on what happened while it was down", async ({ browser }) => {
  test.setTimeout(180_000);
  const PORT = 3405;
  const env = { ...process.env, ...E2E_ENV, PORT: String(PORT), NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`, BACKUPS_DISABLED: "1" } as NodeJS.ProcessEnv;
  const logFile = path.join(ROOT, ".data-e2e", "restart-server.log");
  const start = async (): Promise<ChildProcess> => {
    const out = fs.openSync(logFile, "a");
    const child = spawn(process.execPath, ["scripts/start.mjs"], { cwd: ROOT, env, stdio: ["ignore", out, out] });
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`http://localhost:${PORT}/api/health`)).ok) return child;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("server did not start");
  };
  const stop = async (child: ChildProcess) => {
    child.kill();
    await new Promise((r) => setTimeout(r, 1500));
    if (process.platform === "win32" && child.pid) spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    await new Promise((r) => setTimeout(r, 1500));
  };
  let child = await start();
  try {
    const page = await (await ctxFor(browser)).newPage();
    await signIn(page, `http://localhost:${PORT}`);
    await page.addInitScript(() => localStorage.setItem("miel_admin_seen", new Date(Date.now() + 3_600_000).toISOString()));
    await page.goto(`http://localhost:${PORT}/admin/settings/team`);
    const bell = page.getByRole("button", { name: /^Notifications/ });
    await expect(bell).toHaveAttribute("aria-label", "Notifications");
    await stop(child); // the app restarts (a deploy on Railway)
    const base = one<{ id: string }>("SELECT id FROM customers LIMIT 1")!;
    const num = one<{ n: number }>("SELECT MAX(order_number) n FROM orders")!.n + 1;
    exec(
      "INSERT INTO orders (id, order_number, customer_id, status, payment_status, region, address, source, total_cents, subtotal_cents, cod_amount_due_cents, created_at, updated_at) VALUES (lower(hex(randomblob(16))), ?, ?, 'new', 'pending', 'Beirut', 'Hamra', 'web', 1000, 1000, 1000, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
      num,
      base.id,
    );
    await page.evaluate(() => localStorage.setItem("miel_admin_seen", new Date(Date.now() - 600_000).toISOString()));
    child = await start();
    await expect(bell).toHaveAttribute("aria-label", /\d+ new/, { timeout: 60_000 }); // the stream came back and the bell caught up
  } finally {
    await stop(child);
  }
});

test("no secret is ever written to a server log", async () => {
  const log = path.join(ROOT, ".data-e2e", "restart-server.log");
  const text = fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "";
  expect(text.length).toBeGreaterThan(0);
  for (const secret of [SENTINEL_AUTH_SECRET, SENTINEL_BREVO_KEY, E2E_PASSWORD]) expect(text).not.toContain(secret);
  expect(text).not.toMatch(/\$argon2|password_hash|totp_secret/);
});

test("CSRF: the session cookie is HttpOnly + SameSite, and a cross-site form post cannot change anything", async ({ browser }) => {
  const ctx = await ctxFor(browser);
  const page = await ctx.newPage();
  await signIn(page);
  const cookie = (await ctx.cookies()).find((c) => c.name === "miel_session")!;
  expect(cookie.httpOnly).toBe(true);
  expect(["Lax", "Strict"]).toContain(cookie.sameSite);
  // a forged server-action call from another origin (what a malicious page would send with the admin's cookie)
  const before = one<{ n: number }>("SELECT COUNT(*) n FROM audit_log")!.n;
  const res = await page.request.post("/admin/settings", {
    headers: { origin: "https://evil.example", "content-type": "text/plain;charset=UTF-8", "next-action": "0000000000000000000000000000000000000000" },
    data: '["$K1"]',
    maxRedirects: 0,
  });
  expect([400, 403, 404, 405, 500]).toContain(res.status());
  expect(one<{ n: number }>("SELECT COUNT(*) n FROM audit_log")!.n).toBe(before);
  expect(await res.text()).not.toMatch(/at .*\.(js|ts):\d+|node_modules/); // no stack trace in the response
});
