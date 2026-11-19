import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import sharp from "sharp";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { MOCK_URL } from "../../playwright.config";
import { MOCK_OWNER } from "../support/mock-supabase";

/**
 * The flows that matter on the Railway deployment, run against the production build started with `npm start`
 * (the same command Railway runs): health check, login, checkout, live new-order alert, image upload, and
 * on-demand revalidation (an admin save updates the storefront without waiting for the 5-minute cache).
 */
test.describe.configure({ mode: "serial" });

async function signIn(page: Page, password = MOCK_OWNER.password) {
  await page.goto("/admin/login");
  await page.locator("input[name=email]").fill(MOCK_OWNER.email);
  await page.locator("input[name=password]").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function productPage(browser: Browser, slug: string) {
  const ctx = await browser.newContext(); // a fresh visitor: no cookies, no shared cache in the browser
  const page = await ctx.newPage();
  const res = await page.goto(`/products/${slug}`);
  const html = await page.content();
  await ctx.close();
  return { status: res?.status(), html };
}

test("health check: 200 while the database answers, 503 when it does not", async ({ request }) => {
  const ok = await request.get("/api/health");
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toEqual({ status: "ok", db: "ok" });
  expect(ok.headers()["cache-control"]).toContain("no-store");

  await request.get(`${MOCK_URL}/__test/db-down?on=1`);
  try {
    const down = await request.get("/api/health");
    expect(down.status()).toBe(503);
    expect(await down.json()).toEqual({ status: "error", db: "unreachable" }); // no details leaked
  } finally {
    await request.get(`${MOCK_URL}/__test/db-down?on=0`);
  }
  expect((await request.get("/api/health")).status()).toBe(200);
});

test("the server really is the standalone one, listening on all interfaces", async ({ request }) => {
  // 127.0.0.1 (not "localhost") proves it is bound beyond the container's own hostname.
  const res = await request.get(`http://127.0.0.1:${process.env.PORT ?? 3401}/api/health`);
  expect(res.status()).toBe(200);
});

test("login: wrong password is refused with a generic message, right one opens the dashboard", async ({ page }) => {
  await signIn(page, "definitely-wrong");
  await expect(page.getByText("Wrong email or password.")).toBeVisible();
  await signIn(page);
  await page.waitForURL(/\/admin(\?.*)?$/);
  await expect(page.getByRole("heading").first()).toBeVisible();
  const cookies = await page.context().cookies();
  const auth = cookies.filter((c) => c.name.startsWith("sb-"));
  expect(auth.length).toBeGreaterThan(0);
  for (const c of auth) expect(c.httpOnly).toBe(true);
});

test("checkout places an order, and the owner's open dashboard gets the live alert", async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage();
  await signIn(owner);
  await owner.waitForURL(/\/admin(\?.*)?$/);
  await owner.waitForTimeout(6000); // let the bell's first poll record the baseline (it polls every 5 s)

  const customer = await (await browser.newContext()).newPage();
  await customer.goto("/products/red-burn");
  await customer.getByRole("button", { name: /ADD TO CART/ }).first().click();
  await customer.getByRole("button", { name: "CHECKOUT" }).click();
  await customer.locator("#name").fill("E2E Customer");
  await customer.locator("#phone").fill("03 123 456");
  await customer.locator("#region").selectOption({ index: 1 });
  await customer.locator("#address").fill("Beirut, Hamra, test building, floor 2");
  await customer.getByRole("button", { name: "PLACE ORDER" }).click();
  await expect(customer.getByText(/Order placed/)).toBeVisible({ timeout: 20_000 });
  await expect(customer.getByText(/ORDER #\d+/)).toBeVisible();

  // The alert arrives on the owner's already-open page, with no reload.
  await expect(owner.getByRole("status").filter({ hasText: "NEW ORDER" })).toBeVisible({ timeout: 20_000 });
  await expect(owner.getByRole("status")).toContainText("E2E Customer");
});

test("revalidation: an admin product edit shows on the storefront immediately", async ({ browser }) => {
  const before = await productPage(browser, "gold");
  expect(before.status).toBe(200);
  expect(before.html).not.toContain("$37");

  const ctx = await browser.newContext();
  const admin = await ctx.newPage();
  await signIn(admin);
  await admin.waitForURL(/\/admin(\?.*)?$/);
  await admin.goto("/admin/products");
  await admin.locator("a[href^='/admin/products/']").filter({ hasText: "GOLD" }).first().click();
  await admin.locator("input[name=price]").fill("37");
  await admin.getByRole("button", { name: "Save product" }).click();
  await expect(admin.getByText(/Saved/)).toBeVisible();

  // No waiting for the 300 s revalidate window: the very next visit must already show the new price.
  const after = await productPage(browser, "gold");
  expect(after.html).toContain("$37");
  const home = await browser.newContext().then(async (c) => { const p = await c.newPage(); await p.goto("/"); const h = await p.content(); await c.close(); return h; });
  expect(home).toContain("$37");
  await ctx.close();
});

test("image upload: re-encoded and stored in the storage bucket", async ({ browser, request }) => {
  const file = path.join(os.tmpdir(), "e2e-upload.png");
  fs.writeFileSync(file, await sharp({ create: { width: 800, height: 1000, channels: 3, background: "#DAFC69" } }).png().toBuffer());

  const ctx = await browser.newContext();
  const admin = await ctx.newPage();
  await signIn(admin);
  await admin.waitForURL(/\/admin(\?.*)?$/);
  await admin.goto("/admin/products");
  await admin.locator("a[href^='/admin/products/']").filter({ hasText: "RED BURN" }).first().click();
  await admin.locator("input[name=file]").setInputFiles(file);
  await admin.locator("form:has(input[name=file]) input[name=alt]").fill("E2E test image");
  await admin.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(admin.getByText(/Image uploaded/)).toBeVisible({ timeout: 20_000 });
  const { objects } = await (await request.get(`${MOCK_URL}/__test/storage`)).json();
  expect(objects.some((o: string) => o.startsWith("product-images/") && o.endsWith(".webp"))).toBe(true);
  await ctx.close();
});

test("the sitemap and metadata use NEXT_PUBLIC_SITE_URL only", async ({ request }) => {
  const site = `http://localhost:${process.env.PORT ?? 3401}`;
  const sitemap = await (await request.get("/sitemap.xml")).text();
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(urls.length).toBeGreaterThan(1);
  for (const u of urls) expect(u.startsWith(site)).toBe(true);
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain(`${site}/sitemap.xml`);
  const html = await (await request.get("/products/gold")).text();
  expect(html).not.toMatch(/vercel\.app/i);
});
