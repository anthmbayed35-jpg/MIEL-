import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import sharp from "sharp";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { E2E_PASSWORD, USERS } from "../support/e2e-env";
import { exec, linkFor, mails, one, query, stockOf } from "../support/e2e-db";
import { newSecret, totpNow } from "../../lib/totp";

/**
 * The whole shop, end to end, on the production build started with `npm start` and a real SQLite file: checkout, live
 * alerts, order lifecycle, stock, discounts, manual orders, concurrent editing, exports, roles, invites, 2FA, uploads,
 * backups and the health check. Serial: later tests build on the data of earlier ones.
 */
test.describe.configure({ mode: "serial" });

type Who = keyof typeof USERS;
async function signIn(page: Page, who: Who = "owner", password = E2E_PASSWORD) {
  await page.goto("/admin/login");
  await page.locator("input[name=email]").fill(USERS[who].email);
  await page.locator("input[name=password]").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
async function adminPage(browser: Browser, who: Who = "owner"): Promise<{ page: Page; ctx: BrowserContext }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on("dialog", (d) => void d.accept()); // confirm("Cancel this order?") etc.
  await signIn(page, who);
  await page.waitForURL(/\/admin(\?.*)?$/);
  return { page, ctx };
}
async function visitorHtml(browser: Browser, url: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const res = await page.goto(url);
  const html = await page.content();
  await ctx.close();
  return { status: res?.status(), html };
}

/** A customer places an order through the real storefront UI. Returns the order number. */
let nextIp = 10;
async function placeOrder(browser: Browser, opts: { slug: string; qty?: number; code?: string; name?: string; phone?: string }): Promise<number> {
  // each customer comes from a different address (checkout allows 5 orders per 10 minutes per connection)
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100." + nextIp++ } });
  const page = await ctx.newPage();
  await page.goto(`/products/${opts.slug}`);
  for (let i = 1; i < (opts.qty ?? 1); i++) await page.getByRole("button", { name: "Increase quantity" }).click();
  await page.getByRole("button", { name: /ADD TO CART/ }).first().click();
  await page.getByRole("button", { name: "CHECKOUT" }).click();
  await page.locator("#name").fill(opts.name ?? "E2E Customer");
  await page.locator("#phone").fill(opts.phone ?? `03 ${Math.floor(100000 + Math.random() * 899999)}`);
  await page.locator("#region").selectOption({ index: 1 });
  await page.locator("#address").fill("Beirut, Hamra, test building, floor 2");
  if (opts.code) {
    await page.locator("#code").fill(opts.code);
    await expect(page.getByText("Code applied.")).toBeVisible({ timeout: 15_000 });
  }
  await page.getByRole("button", { name: "PLACE ORDER" }).click();
  await expect(page.getByText(/Order placed/)).toBeVisible({ timeout: 20_000 });
  const n = Number((await page.getByText(/ORDER #\d+/).first().innerText()).match(/\d+/)![0]);
  await ctx.close();
  return n;
}
const orderRow = (n: number) => one<Record<string, any>>("SELECT * FROM orders WHERE order_number = ?", n)!;
const orderId = (n: number) => orderRow(n).id as string;

test("health check: 200, database + writable volume, no secrets in the body", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ status: "ok", db: "ok", volume: "writable" });
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(JSON.stringify(body)).not.toMatch(/\/|\\|secret|key/i);
});

test("the standalone server listens on all interfaces (127.0.0.1, not only localhost)", async ({ request }) => {
  expect((await request.get("http://127.0.0.1:3401/api/health")).status()).toBe(200);
});

test("login: wrong password gets the generic message; the right one opens the dashboard with an httpOnly session cookie", async ({ page }) => {
  await signIn(page, "owner", "definitely-wrong-password-1");
  await expect(page.getByText("Wrong email or password.")).toBeVisible();
  await signIn(page);
  await page.waitForURL(/\/admin(\?.*)?$/);
  const c = (await page.context().cookies()).find((x) => x.name === "miel_session")!;
  expect(c).toBeTruthy();
  expect(c.httpOnly).toBe(true);
  expect(c.sameSite).toBe("Lax");
  expect(c.value).not.toBe(one<{ id: string }>("SELECT id FROM sessions ORDER BY created_at DESC LIMIT 1")!.id); // the database holds only a hash
  expect(await page.evaluate(() => document.cookie)).not.toContain("miel_session"); // JavaScript can't read it
});

test("storefront order -> the live alert reaches the admin that already has the dashboard open (no reload)", async ({ browser }) => {
  const { page: owner, ctx } = await adminPage(browser);
  await owner.waitForTimeout(2000); // let the event stream connect
  const before = stockOf("red-burn");
  const n = await placeOrder(browser, { slug: "red-burn", name: "Alert Customer" });
  await expect(owner.getByRole("status").filter({ hasText: "NEW ORDER" })).toBeVisible({ timeout: 20_000 });
  await expect(owner.getByRole("status")).toContainText("Alert Customer");
  expect(n).toBeGreaterThanOrEqual(1001);
  expect(stockOf("red-burn")).toBe(before - 1);
  await ctx.close();
});

test("alerts fall back to polling when the live stream is blocked", async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await browser.newContext();
  const owner = await ctx.newPage();
  await owner.route("**/admin/api/events", (r) => r.abort());
  await signIn(owner);
  await owner.waitForURL(/\/admin(\?.*)?$/);
  await owner.waitForTimeout(1500);
  await placeOrder(browser, { slug: "red-burn", name: "Polling Customer" });
  await expect(owner.getByRole("status").filter({ hasText: "NEW ORDER" })).toBeVisible({ timeout: 45_000 }); // 30 s poll
  await expect(owner.getByRole("status")).toContainText("Polling Customer");
  await ctx.close();
});

test("order lifecycle: new -> confirmed -> packed -> out for delivery -> delivered, COD collected, timeline recorded", async ({ browser }) => {
  const n = await placeOrder(browser, { slug: "gold", name: "Lifecycle Customer" });
  const { page, ctx } = await adminPage(browser);
  await page.goto(`/admin/orders/${orderId(n)}`);
  for (const to of ["confirmed", "packed", "out_for_delivery", "delivered"]) {
    await page.locator("select[aria-label='Set status']").selectOption(to);
    await page.getByRole("button", { name: "Set status" }).click();
    await expect.poll(() => orderRow(n).status, { timeout: 15_000 }).toBe(to);
    await expect(page.getByText("Status changed to " + to.split("_").join(" "))).toBeVisible(); // the form resets after the action: wait for it before the next step
  }
  await page.getByRole("button", { name: /COD as collected/ }).click();
  await expect.poll(() => orderRow(n).cod_collected, { timeout: 15_000 }).toBe(1);
  const o = orderRow(n);
  expect(o.delivered_at).toBeTruthy();
  const events = query<{ to_status: string }>("SELECT to_status FROM order_events WHERE order_id = ? AND type = 'status' ORDER BY created_at, rowid", o.id).map((e) => e.to_status);
  expect(events).toEqual(["confirmed", "packed", "out_for_delivery", "delivered"]);
  await ctx.close();
});

test("cancelling an order puts the stock back, exactly once", async ({ browser }) => {
  const before = stockOf("gold");
  const n = await placeOrder(browser, { slug: "gold", qty: 2, name: "Cancel Customer" });
  expect(stockOf("gold")).toBe(before - 2);
  const { page, ctx } = await adminPage(browser);
  await page.goto(`/admin/orders/${orderId(n)}`);
  await page.locator("input[name=reason]").fill("customer changed their mind");
  await page.getByRole("button", { name: "Cancel order" }).click();
  await expect.poll(() => orderRow(n).status, { timeout: 15_000 }).toBe("cancelled");
  expect(stockOf("gold")).toBe(before);
  expect(query("SELECT 1 FROM stock_movements WHERE order_id = ? AND reason = 'cancel_restore'", orderId(n))).toHaveLength(1);
  expect(orderRow(n).cancel_reason).toBe("customer changed their mind");
  await ctx.close();
});

test("a discount code at checkout is applied on the server and counted", async ({ browser }) => {
  const n = await placeOrder(browser, { slug: "red-burn", code: "E2E10", name: "Discount Customer" });
  const o = orderRow(n);
  expect(o.discount_code).toBe("E2E10");
  expect(o.discount_total_cents).toBe(Math.round(o.subtotal_cents * 0.1));
  expect(o.total_cents).toBe(o.subtotal_cents - o.discount_total_cents + o.shipping_fee_cents);
  expect(one<{ used_count: number }>("SELECT used_count FROM discounts WHERE code = 'E2E10'")!.used_count).toBe(1);
});

test("an admin creates a manual (WhatsApp) order: priced by the server, stock deducted, no email needed", async ({ browser }) => {
  const before = stockOf("gold");
  const { page, ctx } = await adminPage(browser);
  await page.goto("/admin/orders/new");
  await page.getByRole("button", { name: "More GOLD" }).click();
  await page.getByRole("button", { name: "More GOLD" }).click();
  await page.locator("input[name=name]").fill("Manual Customer");
  await page.locator("input[name=phone]").fill("70 123 456");
  await page.locator("select[name=region]").selectOption({ index: 1 });
  await page.locator("textarea[name=address]").fill("Jounieh, Main Rd, Bldg 3");
  await page.getByRole("button", { name: "Create order" }).click();
  await page.waitForURL(/\/admin\/orders\/[0-9a-f-]{36}/, { timeout: 20_000 });
  const o = one<Record<string, any>>("SELECT * FROM orders WHERE customer_id = (SELECT id FROM customers WHERE name = 'Manual Customer') ")!;
  expect(o.source).toBe("whatsapp");
  expect(o.status).toBe("new");
  expect(o.stock_deducted).toBe(1);
  expect(stockOf("gold")).toBe(before - 2);
  await ctx.close();
});

test("two admins editing the same product: the second save is refused, nothing is silently overwritten", async ({ browser }) => {
  const a = await adminPage(browser, "owner");
  const b = await adminPage(browser, "manager");
  const id = one<{ id: string }>("SELECT id FROM products WHERE slug = 'creatine'")!.id;
  await a.page.goto(`/admin/products/${id}`);
  await b.page.goto(`/admin/products/${id}`); // both now hold the same version
  await a.page.locator("input[name=price]").fill("33");
  await a.page.getByRole("button", { name: "Save product" }).click();
  await expect(a.page.getByText(/Saved/)).toBeVisible();
  await b.page.locator("input[name=price]").fill("44");
  await b.page.getByRole("button", { name: "Save product" }).click();
  await expect(b.page.getByText(/Someone else changed/)).toBeVisible();
  expect(one<{ price_cents: number }>("SELECT price_cents FROM products WHERE id = ?", id)!.price_cents).toBe(3300); // the first save stands
  await b.page.reload(); // reloading picks up the new version; now the second admin can save
  await b.page.locator("input[name=price]").fill("44");
  await b.page.getByRole("button", { name: "Save product" }).click();
  await expect(b.page.getByText(/Saved/)).toBeVisible();
  expect(one<{ price_cents: number }>("SELECT price_cents FROM products WHERE id = ?", id)!.price_cents).toBe(4400);
  await a.ctx.close();
  await b.ctx.close();
});

test("a price edit in the admin shows on the storefront immediately", async ({ browser }) => {
  const before = await visitorHtml(browser, "/products/red-burn");
  expect(before.html).not.toContain("$41");
  const { page, ctx } = await adminPage(browser);
  const id = one<{ id: string }>("SELECT id FROM products WHERE slug = 'red-burn'")!.id;
  await page.goto(`/admin/products/${id}`);
  await page.locator("input[name=price]").fill("41");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText(/Saved/)).toBeVisible();
  expect((await visitorHtml(browser, "/products/red-burn")).html).toContain("$41");
  expect((await visitorHtml(browser, "/")).html).toContain("$41");
  await ctx.close();
});

test("stock at 0 disables purchase on the product page and the lineup, and checkout refuses a stale cart", async ({ browser }) => {
  // a customer fills a cart while CREATINE is still in stock ...
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100." + nextIp++ } });
  const shopper = await ctx.newPage();
  await shopper.goto("/products/creatine");
  await shopper.getByRole("button", { name: /ADD TO CART/ }).first().click();
  await shopper.getByRole("button", { name: "CHECKOUT" }).click();
  // ... then it sells out
  exec("UPDATE inventory_items SET on_hand = 0 WHERE product_id = (SELECT id FROM products WHERE slug = 'creatine')");
  await shopper.locator("#name").fill("Late Customer");
  await shopper.locator("#phone").fill("03 765 432");
  await shopper.locator("#region").selectOption({ index: 1 });
  await shopper.locator("#address").fill("Beirut, Hamra, test building");
  await shopper.getByRole("button", { name: "PLACE ORDER" }).click();
  await expect(shopper.getByText(/is out of stock/i)).toBeVisible();
  expect(query("SELECT 1 FROM orders WHERE customer_id IN (SELECT id FROM customers WHERE name = 'Late Customer')")).toHaveLength(0);
  await ctx.close();

  const product = await visitorHtml(browser, "/products/creatine");
  expect(product.html).toContain("SOLD OUT");
  expect(product.html).toContain("OutOfStock");
  const fresh = await browser.newContext();
  const p2 = await fresh.newPage();
  await p2.goto("/products/creatine");
  await expect(p2.getByRole("button", { name: "SOLD OUT" }).first()).toBeDisabled();
  await expect(p2.getByRole("button", { name: /ADD TO CART/ })).toHaveCount(0);
  await p2.goto("/");
  await expect(p2.getByRole("button", { name: "CREATINE is sold out" })).toBeDisabled();
  await fresh.close();
  exec("UPDATE inventory_items SET on_hand = 25 WHERE product_id = (SELECT id FROM products WHERE slug = 'creatine')");
  expect((await visitorHtml(browser, "/products/creatine")).html).not.toContain("SOLD OUT"); // back in stock: purchasable again
});

test("CSV export: every order, totals add up to the database (and only roles with export rights get it)", async ({ browser }) => {
  const { page, ctx } = await adminPage(browser);
  const res = await page.request.get("/admin/orders/export");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  const text = (await res.text()).replace(/^﻿/, "");
  const rows = text.split("\n").filter(Boolean);
  const head = rows[0].split(",");
  const totalIdx = head.indexOf("total");
  const csvTotal = rows.slice(1).reduce((n, r) => n + Number(r.split(",").reverse()[head.length - 1 - totalIdx].replace(/"/g, "")), 0);
  const db = one<{ n: number; s: number }>("SELECT COUNT(*) n, COALESCE(SUM(total_cents),0) s FROM orders WHERE status <> 'draft'")!;
  expect(rows.length - 1).toBe(db.n);
  expect(Math.round(csvTotal * 100)).toBe(db.s);
  await ctx.close();
  const staff = await adminPage(browser, "staff");
  expect((await staff.page.request.get("/admin/orders/export")).status()).toBe(403);
  await staff.ctx.close();
  const mgr = await adminPage(browser, "manager");
  expect((await mgr.page.request.get("/admin/orders/export")).status()).toBe(200);
  await mgr.ctx.close();
});

test("roles: staff, manager and owner each reach exactly what they should", async ({ browser }) => {
  const cases: [Who, string, number][] = [
    ["staff", "/admin/orders", 200], ["staff", "/admin/inventory", 200], ["staff", "/admin/products", 200],
    ["staff", "/admin/products/new", 403], ["staff", "/admin/marketing/discounts", 403], ["staff", "/admin/settings", 403], ["staff", "/admin/settings/team", 403], ["staff", "/admin/analytics", 403],
    ["manager", "/admin/products/new", 200], ["manager", "/admin/marketing/discounts", 200], ["manager", "/admin/analytics", 200], ["manager", "/admin/settings", 200],
    ["manager", "/admin/settings/team", 403],
    ["owner", "/admin/settings/team", 200], ["owner", "/admin/settings", 200], ["owner", "/admin/settings/activity", 200],
  ];
  for (const who of ["staff", "manager", "owner"] as Who[]) {
    const { page, ctx } = await adminPage(browser, who);
    for (const [w, url, status] of cases.filter((c) => c[0] === who)) expect((await page.goto(url))?.status(), `${w} ${url}`).toBe(status);
    if (who === "staff") expect((await page.request.get("/admin/backup/download")).status()).toBe(403);
    await ctx.close();
  }
});

test("invite -> choose a password -> sign in; then 2FA with recovery codes; the link works once", async ({ browser }) => {
  test.setTimeout(120_000);
  const { page: owner, ctx: octx } = await adminPage(browser);
  await owner.goto("/admin/settings/team");
  await owner.locator("form:has(input[name=email]) input[name=email]").last().fill("new.person@e2e.test");
  await owner.locator("form:has(input[name=email]) select[name=role]").last().selectOption("manager");
  await owner.getByRole("button", { name: "Send invite" }).click();
  await expect(owner.getByText(/Invite sent to new.person@e2e.test/)).toBeVisible();
  await expect(owner.getByText("new.person@e2e.test").first()).toBeVisible();
  const link = linkFor("new.person@e2e.test")!;
  expect(link.startsWith("http://localhost:3401/admin/set-password?type=invite&token=")).toBe(true);
  expect(JSON.stringify(query("SELECT * FROM invites"))).not.toContain(new URL(link).searchParams.get("token")!); // only a hash is stored
  await octx.close();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(link);
  await page.locator("input[name=password]").fill("my own long passphrase 42");
  await page.locator("input[name=confirm]").fill("my own long passphrase 42");
  await page.getByRole("button", { name: "Save and sign in" }).click();
  await page.waitForURL(/\/admin(\?.*)?$/);
  expect(one<{ role: string }>("SELECT role FROM admin_users WHERE email = 'new.person@e2e.test'")!.role).toBe("manager");
  // the same link again
  const again = await browser.newContext();
  const p2 = await again.newPage();
  await p2.goto(link);
  await expect(p2.getByText(/invalid, was already used, or has expired/i)).toBeVisible();
  await again.close();

  // 2FA enrolment
  await page.goto("/admin/account");
  await page.getByRole("button", { name: "Set up two-factor authentication" }).click();
  const secret = (await page.getByText(/Secret: /).innerText()).split(":").pop()!.trim(); // innerText is upper-cased by CSS; the base32 secret is upper-case anyway
  await page.locator("input[name=code]").fill(totpNow(secret));
  await page.getByRole("button", { name: "Verify and turn on" }).click();
  await page.getByRole("list", { name: "Recovery codes" }).waitFor();
  const codes = await page.getByRole("list", { name: "Recovery codes" }).locator("li").allInnerTexts();
  expect(codes).toHaveLength(10);
  await page.getByRole("button", { name: "I saved them, continue" }).click();
  await page.waitForURL(/\/admin(\?.*)?$/);
  expect(one<{ totp_enabled: number }>("SELECT totp_enabled FROM admin_users WHERE email = 'new.person@e2e.test'")!.totp_enabled).toBe(1);

  // sign in again: password, then the code (next time step: the enrolment code is already used up)
  await ctx.clearCookies();
  await signInAs(page, "new.person@e2e.test", "my own long passphrase 42");
  await page.waitForURL(/\/admin\/mfa/);
  await page.locator("input[name=code]").fill(totpNow(secret, Date.now() + 30_000));
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL(/\/admin(\?.*)?$/);
  expect((await page.goto("/admin/orders"))?.status()).toBe(200);

  // and with a recovery code instead of the phone (works once)
  await ctx.clearCookies();
  await signInAs(page, "new.person@e2e.test", "my own long passphrase 42");
  await page.waitForURL(/\/admin\/mfa/);
  await page.locator("input[name=code]").fill(codes[0]);
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL(/\/admin(\?.*)?$/);
  await ctx.clearCookies();
  await signInAs(page, "new.person@e2e.test", "my own long passphrase 42");
  await page.waitForURL(/\/admin\/mfa/);
  await page.locator("input[name=code]").fill(codes[0]);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText(/didn't match/)).toBeVisible();
  // not verified: still no access to anything
  expect((await page.request.get("/admin/api/notifications")).status()).toBe(401);
  await ctx.close();
  void newSecret;
});
async function signInAs(page: Page, email: string, password: string) {
  await page.goto("/admin/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("forgot password: the emailed link sets a new password once, and the old password stops working", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/admin/forgot");
  await page.locator("input[name=email]").fill(USERS.staff.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/reset link is on its way/)).toBeVisible();
  const before = mails().length;
  await page.goto("/admin/forgot");
  await page.locator("input[name=email]").fill("ghost@e2e.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/reset link is on its way/)).toBeVisible(); // same answer for an unknown address
  expect(mails().length).toBe(before); // and no email for it
  const link = linkFor(USERS.staff.email)!;
  await page.goto(link);
  await page.locator("input[name=password]").fill("a fresh long passphrase 55");
  await page.locator("input[name=confirm]").fill("a fresh long passphrase 55");
  await page.getByRole("button", { name: "Save and sign in" }).click();
  await page.waitForURL(/\/admin(\?.*)?$/);
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await signInAs(p2, USERS.staff.email, E2E_PASSWORD);
  await expect(p2.getByText("Wrong email or password.")).toBeVisible();
  await signInAs(p2, USERS.staff.email, "a fresh long passphrase 55");
  await p2.waitForURL(/\/admin(\?.*)?$/);
  await other.close();
  await ctx.close();
});

test("sign out everywhere ends the other browser's session at once; the sessions list shows both", async ({ browser }) => {
  const a = await adminPage(browser, "manager");
  const b = await adminPage(browser, "manager");
  await a.page.goto("/admin/account");
  await expect(a.page.getByRole("list", { name: "Active sessions" }).locator("li").first()).toBeVisible();
  expect(await a.page.getByRole("list", { name: "Active sessions" }).locator("li").count()).toBeGreaterThanOrEqual(2);
  await a.page.getByRole("button", { name: "Sign out everywhere" }).click();
  await a.page.waitForURL(/\/admin\/login/);
  const r = await b.page.goto("/admin/orders");
  expect(b.page.url()).toContain("/admin/login");
  expect(r?.status()).toBe(200);
  await a.ctx.close();
  await b.ctx.close();
});

test("image upload: re-encoded to AVIF/WebP on the volume, served with long cache headers and shown on the storefront", async ({ browser, request }) => {
  const file = path.join(os.tmpdir(), "e2e-upload.png");
  fs.writeFileSync(file, await sharp({ create: { width: 1200, height: 1500, channels: 3, background: "#DAFC69" } }).png().toBuffer());
  const { page, ctx } = await adminPage(browser, "manager");
  const id = one<{ id: string }>("SELECT id FROM products WHERE slug = 'creatine'")!.id;
  await page.goto(`/admin/products/${id}`);
  await page.locator("input[name=file]").setInputFiles(file);
  await page.locator("form:has(input[name=file]) input[name=alt]").fill("E2E uploaded photo");
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByText(/Image uploaded/)).toBeVisible({ timeout: 20_000 });
  const row = one<{ src: string }>("SELECT src FROM product_images WHERE alt = 'E2E uploaded photo'")!;
  const m = row.src.match(/^\/uploads\/([0-9a-f-]{36})@480-768-1080@1200x1500$/)!;
  expect(m).toBeTruthy();
  for (const [file2, type] of [[`${m[1]}-768.webp`, "image/webp"], [`${m[1]}-480.avif`, "image/avif"]]) {
    const r = await request.get(`/uploads/${file2}`);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toBe(type);
    expect(r.headers()["cache-control"]).toContain("immutable");
  }
  expect((await request.get(`/uploads/${m[1]}-1600.webp`)).status()).toBe(404);
  expect((await request.get("/uploads/..%2f..%2fmiel.db")).status()).toBe(404);
  // the gallery shows four photos and CREATINE already has four, so put the new one first (as an admin would with the up arrow)
  exec("UPDATE product_images SET sort = -1 WHERE alt = 'E2E uploaded photo'");
  const html = (await visitorHtml(browser, "/products/creatine")).html;
  expect(html).toContain(`/uploads/${m[1]}-1080.webp`);
  exec("DELETE FROM product_images WHERE alt = 'E2E uploaded photo'"); // leave the gallery as configured for the later specs
  await ctx.close();
});

test("the product photos that were already on the site still load (storefront and product pages)", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const bad: string[] = [];
  page.on("response", (r) => {
    if (/\/images\//.test(r.url()) && r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
  });
  for (const url of ["/", "/products/creatine", "/products/gold", "/products/creatine"]) {
    await page.goto(url);
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
    });
    await page.waitForTimeout(500);
    const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc).map((i) => i.currentSrc));
    expect(broken, url).toEqual([]);
  }
  expect(bad).toEqual([]);
  const imgs = query<{ src: string }>("SELECT src FROM product_images WHERE src LIKE '/images/%'");
  expect(imgs.length).toBeGreaterThan(0); // the built-in photos are in the database too
  await ctx.close();
});

test("backups: 'Back up now' makes a verified snapshot, the health check reports its age, only the owner can download the zip", async ({ browser, request }) => {
  const { page, ctx } = await adminPage(browser, "owner");
  await page.goto("/admin/settings");
  await page.getByRole("button", { name: "Back up now" }).click();
  await expect(page.getByText(/Backup saved: miel-\d{8}-\d{6}\.db/)).toBeVisible({ timeout: 20_000 });
  const health = await (await request.get("/api/health")).json();
  expect(health.backupAgeHours).not.toBeNull();
  expect(health.backupAgeHours).toBeLessThan(1);
  const zip = await page.request.get("/admin/backup/download");
  expect(zip.status()).toBe(200);
  expect(zip.headers()["content-type"]).toBe("application/zip");
  expect((await zip.body()).subarray(0, 2).toString()).toBe("PK");
  expect(query("SELECT 1 FROM audit_log WHERE action = 'backup_download'").length).toBeGreaterThanOrEqual(1);
  expect(query("SELECT 1 FROM audit_log WHERE action = 'backup_created'").length).toBeGreaterThanOrEqual(1);
  await ctx.close();
  const mgr = await adminPage(browser, "manager");
  expect((await mgr.page.request.get("/admin/backup/download")).status()).toBe(403);
  await mgr.ctx.close();
});

test("rate limits survive in the database: repeated wrong passwords lock the account out", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  for (let i = 0; i < 6; i++) {
    await signInAs(page, "lockme@e2e.test", `wrong-password-${i}-x`);
    await page.getByText(/Wrong email or password|Too many attempts/).waitFor();
  }
  await expect(page.getByText(/Too many attempts/)).toBeVisible();
  expect(query("SELECT 1 FROM rate_limits WHERE key LIKE 'login_failed:%'").length).toBeGreaterThan(0);
  await ctx.close();
});

test("the sitemap, robots and metadata use NEXT_PUBLIC_SITE_URL only", async ({ request }) => {
  const site = "http://localhost:3401";
  const urls = [...(await (await request.get("/sitemap.xml")).text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(urls.length).toBeGreaterThan(1);
  for (const u of urls) expect(u.startsWith(site)).toBe(true);
  expect(await (await request.get("/robots.txt")).text()).toContain(`${site}/sitemap.xml`);
});
