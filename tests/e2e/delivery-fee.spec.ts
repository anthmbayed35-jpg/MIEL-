import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_PASSWORD, USERS } from "../support/e2e-env";
import { one, query } from "../support/e2e-db";
import { chooseLocation } from "../support/location";

/**
 * The flat $5 delivery fee, on a 375px phone: two orders from two different regions show exactly $5 delivery and the right totals
 * in the cart, at checkout, on the confirmation page and in the admin (order page and delivery slip).
 */
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 375, height: 812 } });

let ip = 180;
const ctxFor = (browser: Browser) => browser.newContext({ viewport: { width: 375, height: 812 }, extraHTTPHeaders: { "x-forwarded-for": `198.18.0.${ip++}` } });
const orders: { id: string; token: string; total: number }[] = [];

async function orderFrom(page: Page, governorate: string, district: string, phone: string) {
  const price = Number(one<{ p: number }>("SELECT price_cents p FROM products WHERE slug = 'red-burn'")!.p) / 100;
  const total = price + 5;
  await page.goto("/products/red-burn");
  await page.getByRole("button", { name: /ADD TO CART/ }).first().click();
  // the cart says delivery is $5 across Lebanon
  const drawer = page.getByRole("dialog", { name: "Your cart" });
  await expect(drawer.getByText(/Delivery \$5 across Lebanon/)).toBeVisible();
  await drawer.getByRole("link", { name: "CHECKOUT" }).click();
  await page.waitForURL(/\/checkout$/);
  // checkout: $5 is shown before an area is chosen, and does not change with the region
  const summary = page.locator("details", { hasText: "ORDER SUMMARY" });
  await summary.locator("summary").click();
  await expect(summary.locator("dd").filter({ hasText: /^\$5$/ })).toBeVisible();
  await page.locator("#name").fill(`Fee ${district}`);
  await page.locator("#phone").fill(phone);
  await chooseLocation(page, governorate, district);
  await page.locator("#street").fill("Main street, Bldg 3, floor 2");
  await expect(summary.locator("dd").filter({ hasText: /^\$5$/ })).toBeVisible(); // still $5 in this region
  await expect(summary.locator("dd").filter({ hasText: new RegExp(`^\\$${total}$`) })).toBeVisible(); // price + 5
  await page.getByRole("button", { name: "PLACE ORDER" }).click();
  await page.waitForURL(/\/order\/[0-9a-f]{32}$/, { timeout: 20_000 });
  const token = page.url().split("/").pop()!;
  // confirmation page
  const dl = page.locator("section", { hasText: "YOUR ORDER" }).first();
  await expect(dl.locator("dd").filter({ hasText: /^\$5$/ })).toBeVisible();
  await expect(dl.locator("dd").filter({ hasText: new RegExp(`^\\$${total}$`) })).toBeVisible();
  const row = one<{ id: string; shipping_fee_cents: number; total_cents: number }>("SELECT id, shipping_fee_cents, total_cents FROM orders WHERE public_token = ?", token)!;
  expect(row.shipping_fee_cents).toBe(500);
  expect(row.total_cents).toBe(Math.round(total * 100));
  orders.push({ id: row.id, token, total });
}

test("two orders from two different regions: exactly $5 delivery in the cart, checkout and confirmation", async ({ browser }) => {
  for (const [gov, district, phone] of [["Beirut", "Beirut", "03 191 001"], ["Bekaa", "Zahle", "03 191 002"]] as const) {
    const ctx = await ctxFor(browser);
    await orderFrom(await ctx.newPage(), gov, district, phone);
    await ctx.close();
  }
  expect(orders).toHaveLength(2);
  expect(query("SELECT DISTINCT shipping_fee_cents f FROM orders WHERE id IN (?, ?)", orders[0].id, orders[1].id)).toEqual([{ f: 500 }]);
});

test("admin: both orders show $5.00 delivery and the right total, and the delivery slip agrees", async ({ browser }) => {
  const admin = await (await ctxFor(browser)).newPage();
  await admin.goto("/admin/login");
  await admin.locator("input[name=email]").fill(USERS.owner.email);
  await admin.locator("input[name=password]").fill(E2E_PASSWORD);
  await admin.getByRole("button", { name: "Sign in" }).click();
  await admin.waitForURL(/\/admin(\?.*)?$/);
  for (const o of orders) {
    await admin.goto(`/admin/orders/${o.id}`);
    await expect(admin.getByText(/^Delivery/).first()).toBeVisible();
    const body = await admin.locator("body").innerText();
    expect(body).toMatch(/\$5\.00/);
    expect(body.replace(/\s+/g, "")).toContain(`$${Math.floor(o.total)}`);
    await admin.goto(`/admin/print?type=invoice&ids=${o.id}`);
    const slip = await admin.locator("body").innerText();
    expect(slip).toMatch(/Delivery\s*\$5\.00/);
  }
  // Settings: one Delivery fee field, no per-zone fee table
  await admin.goto("/admin/settings/shipping");
  await expect(admin.getByLabel("Delivery fee ($)")).toHaveValue("5");
  await expect(admin.getByText("Add a zone")).toHaveCount(0);
  await expect(admin.getByText("Delivery zones (Lebanon)")).toHaveCount(0);
  expect(await admin.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("the delivery fee shows consistently on the home page, a product page and the FAQ", async ({ browser }) => {
  const page = await (await ctxFor(browser)).newPage();
  await page.goto("/");
  await page.getByText("Do you deliver in Lebanon?").click();
  await expect(page.getByText(/flat \$5 delivery fee/)).toBeVisible();
  await page.goto("/products/gold");
  await expect(page.getByText("+ $5 delivery across Lebanon")).toBeVisible();
  // nothing on the public pages still shows an old zone price
  for (const url of ["/", "/products/red-burn", "/products/gold", "/products/creatine", "/checkout"]) {
    await page.goto(url);
    expect(await page.locator("body").innerText(), url).not.toMatch(/\$3 delivery|\$4 delivery|\$6 delivery|Delivery \(\$[346]\)/i);
  }
});
