import fs from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_PASSWORD, MAINT_URL, USERS } from "../support/e2e-env";
import { exec, one, query, stockOf } from "../support/e2e-db";

/**
 * Checkout end to end on the production build, on a 375px phone: add each flavour, change quantities, /checkout with a Lebanese
 * address, place the order, the confirmation page, the order in the admin, its status, and the stock following. Plus the edge cases:
 * empty cart, out of stock, invalid phone, a double click on "Place order", a tampered cart.
 */
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 375, height: 812 } });

let ip = 120;
const ctxFor = (browser: Browser) => browser.newContext({ viewport: { width: 375, height: 812 }, extraHTTPHeaders: { "x-forwarded-for": `192.0.2.${ip++}` } });
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
const shot = async (page: Page, name: string) => {
  fs.mkdirSync("qa-screenshots/checkout", { recursive: true });
  await page.screenshot({ path: `qa-screenshots/checkout/${name}.png`, fullPage: true });
};
const PHONE = "+961 70 555 123";
const state: { number: number; id: string; token: string; before: Record<string, number> } = { number: 0, id: "", token: "", before: {} };

async function signInOwner(page: Page) {
  await page.goto("/admin/login");
  await page.locator("input[name=email]").fill(USERS.owner.email);
  await page.locator("input[name=password]").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin(\?.*)?$/);
}

test("an empty cart on /checkout says so and points back to the shop", async ({ browser }) => {
  const ctx = await ctxFor(browser);
  const page = await ctx.newPage();
  await page.goto("/checkout");
  await expect(page.getByText("Your cart is empty.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "SHOP THE LINEUP" })).toBeVisible();
  await expect(page.getByRole("button", { name: /PLACE ORDER/ })).toHaveCount(0);
  await noOverflow(page);
  // a tampered cart in the browser (unknown product, negative and huge quantities) never becomes an order
  await page.evaluate(() => localStorage.setItem("miel_cart_v1", JSON.stringify({ "not-a-product": 3, "x": -4 })));
  await page.reload();
  await expect(page.getByText("Your cart is empty.", { exact: true })).toBeVisible();
  await ctx.close();
});

test("add each flavour, change quantities, remove one, see line totals and the subtotal, then check out", async ({ browser }) => {
  state.before = { "red-burn": stockOf("red-burn"), gold: stockOf("gold"), creatine: stockOf("creatine") };
  const ctx = await ctxFor(browser);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  for (const slug of ["red-burn", "gold", "creatine"]) {
    await page.goto(`/products/${slug}`);
    await page.getByRole("button", { name: /ADD TO CART/ }).first().click();
    await expect(page.getByRole("dialog", { name: "Your cart" })).toBeVisible();
    await page.getByRole("button", { name: "Close cart" }).click();
  }
  await page.getByRole("button", { name: /Open cart/ }).click();
  const drawer = page.getByRole("dialog", { name: "Your cart" });
  for (const n of ["RED BURN", "GOLD", "CREATINE"]) await expect(drawer.getByText(n).first()).toBeVisible();
  await expect(drawer.getByText("Cart (3)")).toBeVisible();
  await drawer.getByRole("button", { name: "Add one RED BURN" }).click(); // RED BURN x2
  await expect(drawer.getByText("Cart (4)")).toBeVisible();
  await drawer.getByRole("button", { name: "Remove one RED BURN" }).click();
  await drawer.getByRole("button", { name: "Remove GOLD from cart" }).click(); // remove an item
  await expect(drawer.getByText("Cart (2)")).toBeVisible();
  await expect(drawer.getByText("GOLD")).toHaveCount(0);
  await expect(drawer.getByText("SUBTOTAL")).toBeVisible();
  // the cart survives a reload (localStorage)
  await page.reload();
  await page.getByRole("button", { name: /Open cart/ }).click();
  await expect(page.getByRole("dialog", { name: "Your cart" }).getByText("Cart (2)")).toBeVisible();
  await page.getByRole("dialog", { name: "Your cart" }).getByRole("button", { name: "Add one CREATINE" }).click(); // CREATINE x2
  await page.getByRole("dialog", { name: "Your cart" }).getByRole("link", { name: "CHECKOUT" }).click();
  await page.waitForURL(/\/checkout$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Almost there");
  expect(errors).toEqual([]);
  await ctx.close();
});

test("/checkout validates in plain language, the district list depends on the governorate, the total follows the area", async ({ browser }) => {
  const ctx = await ctxFor(browser);
  const page = await ctx.newPage();
  await page.goto("/products/red-burn");
  await page.getByRole("button", { name: /ADD TO CART/ }).first().click();
  await page.getByRole("link", { name: "CHECKOUT" }).click();
  await page.waitForURL(/\/checkout$/);
  await noOverflow(page);
  // the mobile summary is collapsed, shows the total, and opens
  const summary = page.locator("details", { hasText: "ORDER SUMMARY" });
  await expect(summary).toBeVisible();
  await summary.locator("summary").click();
  await expect(summary.getByText("Delivery")).toBeVisible();
  await summary.locator("summary").click();

  await page.getByRole("button", { name: "PLACE ORDER" }).click();
  await expect(page.getByText("Enter your full name.")).toBeVisible();
  await expect(page.getByText(/Enter your phone number/)).toBeVisible();
  await expect(page.getByText("Choose your governorate.")).toBeVisible();
  await expect(page.getByText(/Enter your street, building and floor/)).toBeVisible();
  await page.locator("#name").fill("Checkout Tester");
  await page.locator("#phone").fill("12345"); // invalid
  await page.locator("#street").fill("Hamra Street, Bldg 5, floor 3");
  await page.locator("#governorate").selectOption("Beirut");
  await page.locator("#district").selectOption("Beirut");
  await page.getByRole("button", { name: "PLACE ORDER" }).click();
  await expect(page.getByText(/Enter your phone number/)).toBeVisible();
  expect(query("SELECT 1 FROM customers WHERE name = 'Checkout Tester'")).toHaveLength(0); // nothing was created

  // dependent dropdown: the district list changes with the governorate and starts empty
  await page.locator("#governorate").selectOption("Mount Lebanon");
  await expect(page.locator("#district")).toHaveValue("");
  const districts = await page.locator("#district option").allInnerTexts();
  expect(districts).toEqual(expect.arrayContaining(["Matn", "Keserwan", "Chouf"]));
  expect(districts).not.toContain("Sidon");
  await shot(page, "checkout-375-errors");
  await page.locator("#district").selectOption("Matn");
  // the delivery fee and total are live, from the server
  await expect(page.locator("details summary").getByText(/^\$\d/)).toBeVisible(); // the total in the phone summary
  await summary.locator("summary").click();
  await expect(summary.locator("dd").filter({ hasText: /^(\$\d|Free)/ }).first()).toBeVisible(); // the delivery fee for Matn
  expect(await page.getByRole("radio", { name: /Cash on delivery/ }).isChecked()).toBe(true);
  await noOverflow(page);
  await ctx.close();
});

test("place the order: a double click makes ONE order, the confirmation page shows it, stock goes down", async ({ browser }) => {
  const redBefore = stockOf("red-burn");
  const ctx = await ctxFor(browser);
  const page = await ctx.newPage();
  await page.goto("/products/red-burn");
  await page.getByRole("button", { name: "Increase quantity" }).click(); // 2 pouches
  await page.getByRole("button", { name: /ADD TO CART/ }).first().click();
  await page.getByRole("link", { name: "CHECKOUT" }).click();
  await page.waitForURL(/\/checkout$/);
  await page.locator("#name").fill("Mira Khoury");
  await page.locator("#phone").fill(PHONE);
  await page.locator("#email").fill("mira@example.com");
  await page.locator("#governorate").selectOption("Mount Lebanon");
  await page.locator("#district").selectOption("Matn");
  await page.locator("#street").fill("Main street, Bldg 12, floor 4");
  await page.locator("#landmark").fill("the pharmacy");
  await page.locator("#notes").fill("Call before arriving");
  await page.locator("#heard_from").selectOption("A friend");
  const place = page.getByRole("button", { name: "PLACE ORDER" });
  await place.dblclick(); // two clicks, one order
  await page.waitForURL(/\/order\/[0-9a-f]{32}$/, { timeout: 20_000 });
  state.token = page.url().split("/").pop()!;
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Order placed");
  const ref = (await page.getByText(/^ORDER MP-\d+/).first().innerText()).replace("ORDER ", "");
  expect(ref).toMatch(/^MP-\d{4,}$/);
  state.number = Number(ref.replace("MP-", ""));
  await expect(page.getByText("2 × RED BURN")).toBeVisible();
  await expect(page.getByText("Pay cash on delivery")).toBeVisible();
  await expect(page.getByText(/Main street, Bldg 12, floor 4/)).toBeVisible();
  await expect(page.getByText(/Matn, Mount Lebanon/)).toBeVisible();
  const wa = await page.getByRole("link", { name: /WHATSAPP/ }).getAttribute("href");
  expect(wa).toContain("wa.me/");
  expect(decodeURIComponent(wa!)).toContain(ref);
  expect(await page.locator('meta[name="robots"]').getAttribute("content")).toMatch(/noindex/);
  await noOverflow(page);
  await shot(page, "order-confirmation-375");

  const orders = query("SELECT * FROM orders WHERE customer_id IN (SELECT id FROM customers WHERE phone = '+96170555123')");
  expect(orders).toHaveLength(1);
  const o = orders[0];
  state.id = String(o.id);
  expect(o).toMatchObject({ order_number: state.number, status: "new", payment_method: "cod", governorate: "Mount Lebanon", district: "Matn", landmark: "the pharmacy", heard_from: "A friend", public_token: state.token });
  expect(String(o.customer_notes)).toBe("Call before arriving");
  expect(Number(o.subtotal_cents)).toBe(Number(one("SELECT price_cents p FROM products WHERE slug = 'red-burn'")!.p) * 2);
  expect(stockOf("red-burn")).toBe(redBefore - 2); // taken once, not twice
  // the cart was emptied
  await page.goto("/checkout");
  await expect(page.getByText("Your cart is empty.", { exact: true })).toBeVisible();

  // the private link shows this order only, to anyone who has the link; a wrong link finds nothing
  const other = await (await ctxFor(browser)).newPage();
  const mine = await other.goto(`/order/${state.token}`);
  expect(mine?.status()).toBe(200);
  const body = await other.locator("body").innerText();
  expect(body).not.toContain("555 123"); // no phone number on the page
  for (const t of ["f".repeat(32), "short", state.token.replace(/.$/, "0").replace(/^./, "0")]) expect((await other.goto(`/order/${t}`))?.status(), t).toBe(404);
  await ctx.close();
});

test("admin: the order is in the list (search by number, name, phone), change its status, cancel it and the stock comes back", async ({ browser }) => {
  const admin = await (await ctxFor(browser)).newPage();
  admin.on("dialog", (d) => void d.accept());
  await signInOwner(admin);
  await admin.goto("/admin/orders");
  // counts per status and a badge on the menu for new orders
  await expect(admin.getByRole("navigation", { name: "Orders by status" })).toBeVisible();
  await expect(admin.getByRole("navigation", { name: "Orders by status" }).getByRole("link", { name: /^New \d+/ })).toBeVisible();
  for (const q of [`MP-${state.number}`, "Mira", "70555123", PHONE]) {
    await admin.goto(`/admin/orders?q=${encodeURIComponent(q)}`);
    await expect(admin.getByText(`#${state.number}`).locator("visible=true").first(), q).toBeVisible();
  }
  await admin.goto(`/admin/orders/${state.id}`);
  await expect(admin.getByText(/Matn, Mount Lebanon/).first()).toBeVisible();
  await expect(admin.getByText("A friend")).toBeVisible();
  await expect(admin.getByRole("link", { name: /WhatsApp/i }).first()).toBeVisible();
  await expect(admin.getByRole("link", { name: /Packing slip|Invoice/ }).first()).toBeVisible();
  await admin.getByRole("button", { name: /Mark as confirmed/i }).click();
  await expect.poll(() => one<{ s: string }>("SELECT status s FROM orders WHERE id = ?", state.id)?.s, { timeout: 15_000 }).toBe("confirmed");
  await admin.reload();
  await admin.getByRole("button", { name: /Mark as packed/i }).click();
  await expect.poll(() => one<{ s: string }>("SELECT status s FROM orders WHERE id = ?", state.id)?.s, { timeout: 15_000 }).toBe("packed");
  expect(query("SELECT to_status FROM order_events WHERE order_id = ? AND type = 'status' ORDER BY created_at, rowid", state.id).map((r) => r.to_status)).toEqual(["confirmed", "packed"]);
  // refused at the door puts the pouches back (the status exists)
  const redNow = stockOf("red-burn");
  exec("UPDATE orders SET status = 'out_for_delivery' WHERE id = ?", state.id);
  await admin.reload();
  await admin.getByPlaceholder("Reason for cancelling").fill("customer asked");
  await admin.getByRole("button", { name: "Cancel order" }).click();
  await expect.poll(() => one<{ s: string }>("SELECT status s FROM orders WHERE id = ?", state.id)?.s, { timeout: 15_000 }).toBe("cancelled");
  expect(stockOf("red-burn")).toBe(redNow + 2);
  // the confirmation page now says cancelled
  const page = await (await ctxFor(browser)).newPage();
  await page.goto(`/order/${state.token}`);
  await expect(page.getByText("Cancelled")).toBeVisible();
});

test("out of stock: the product is SOLD OUT, and an order for the last pouch that someone else takes is refused with a clear message", async ({ browser }) => {
  const ctx = await ctxFor(browser);
  const page = await ctx.newPage();
  await page.goto("/products/gold");
  await page.getByRole("button", { name: /ADD TO CART/ }).first().click();
  await page.getByRole("link", { name: "CHECKOUT" }).click();
  await page.waitForURL(/\/checkout$/);
  const goldNow = stockOf("gold");
  exec("UPDATE inventory_items SET on_hand = 0 WHERE product_id = (SELECT id FROM products WHERE slug = 'gold')"); // sold out while the customer fills the form
  await page.locator("#name").fill("Too Late");
  await page.locator("#phone").fill("03 818 282");
  await page.locator("#governorate").selectOption("Beirut");
  await page.locator("#district").selectOption("Beirut");
  await page.locator("#street").fill("Hamra Street, Bldg 5, floor 3");
  await page.getByRole("button", { name: "PLACE ORDER" }).click();
  await expect(page.getByText(/GOLD is out of stock/)).toBeVisible();
  expect(query("SELECT 1 FROM orders WHERE customer_id IN (SELECT id FROM customers WHERE name = 'Too Late')")).toHaveLength(0);
  await page.goto("/products/gold");
  await expect(page.getByText("SOLD OUT").first()).toBeVisible();
  exec("UPDATE inventory_items SET on_hand = ? WHERE product_id = (SELECT id FROM products WHERE slug = 'gold')", goldNow);
  await ctx.close();
});

test("while the storefront is hidden, /checkout and an order page are the under-development page for visitors", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: MAINT_URL });
  const page = await ctx.newPage();
  for (const url of ["/checkout", `/order/${state.token}`]) {
    const res = await page.goto(url);
    expect(res?.status(), url).toBe(503);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("under development");
    await expect(page.locator("input, textarea, select")).toHaveCount(0);
  }
  await ctx.close();
});
