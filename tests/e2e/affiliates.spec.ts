import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_PASSWORD, USERS } from "../support/e2e-env";
import { exec, one, query } from "../support/e2e-db";

/**
 * The influencer affiliate programme, end to end on the production build at a 375px phone:
 * the team creates an affiliate, a shopper uses the code at checkout, the commission follows the order to approved and paid,
 * an applicant applies on /ambassadors and the team approves them, the affiliate opens their private page.
 */
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 375, height: 812 } });

let ip = 150;
const ctxFor = (browser: Browser) => browser.newContext({ viewport: { width: 375, height: 812 }, extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${ip++}` } });

async function signInOwner(page: Page) {
  await page.goto("/admin/login");
  await page.locator("input[name=email]").fill(USERS.owner.email);
  await page.locator("input[name=password]").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin(\?.*)?$/);
}

const state: { code: string; id: string; token: string; orderNumber: number } = { code: "", id: "", token: "", orderNumber: 0 };

test("the team creates an affiliate on a phone, with a generated code", async ({ browser }) => {
  const page = await (await ctxFor(browser)).newPage();
  await signInOwner(page);
  await page.goto("/admin/affiliates/new");
  await page.locator("input[name=name]").fill("Nour Haddad");
  await page.getByRole("button", { name: "Generate" }).click();
  await expect(page.locator("input[name=code]")).toHaveValue(/^NOUR\d{2}$/);
  state.code = await page.locator("input[name=code]").inputValue();
  await page.locator("input[name=instagram_handle]").fill("@nour.runs");
  await page.getByRole("button", { name: "Create affiliate" }).click();
  await page.waitForURL(/\/admin\/affiliates\/[0-9a-f-]{36}/);
  await expect(page.getByText("Affiliate created.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nour Haddad" })).toBeVisible();
  const row = one<{ id: string; private_token: string; code: string; commission_rate_x100: number; customer_discount_percent_x100: number }>("SELECT * FROM affiliates WHERE code = ?", state.code)!;
  expect(row).toMatchObject({ commission_rate_x100: 1500, customer_discount_percent_x100: 1000 });
  state.id = row.id;
  state.token = row.private_token;
  // a duplicate code is refused with a clear message
  await page.goto("/admin/affiliates/new");
  await page.locator("input[name=name]").fill("Someone Else");
  await page.locator("input[name=code]").fill(state.code.toLowerCase());
  await page.getByRole("button", { name: "Create affiliate" }).click();
  await expect(page.getByText("That code is already used. Pick another.")).toBeVisible();
  expect(query("SELECT 1 FROM affiliates WHERE code = ?", state.code)).toHaveLength(1);
});

test("checkout on a phone: lower-case code, clear error for a bad one, discount shown at once, order stores the commission", async ({ browser }) => {
  const ctx = await ctxFor(browser);
  const page = await ctx.newPage();
  await page.goto("/products/red-burn");
  await page.getByRole("button", { name: /ADD TO CART/ }).first().click();
  await page.getByRole("link", { name: "CHECKOUT" }).click();
  await page.locator("#governorate").selectOption("Beirut");
  await page.locator("#district").selectOption("Beirut");
  await page.locator("#code").fill("NOTACODE");
  await expect(page.getByText("That code isn't valid.")).toBeVisible({ timeout: 15_000 });
  await page.locator("#code").fill(state.code.toLowerCase());
  await expect(page.getByText(/Code applied: 10% off/)).toBeVisible({ timeout: 15_000 }); // shown immediately, before placing the order
  await page.locator("details", { hasText: "ORDER SUMMARY" }).locator("summary").click(); // the phone summary is collapsed
  await expect(page.getByText(/^−\$/).locator("visible=true").first()).toBeVisible();
  await page.locator("#name").fill("Affiliate Shopper");
  await page.locator("#phone").fill("03 424 242");
  await page.locator("#street").fill("Beirut, Hamra, test building, floor 2");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "PLACE ORDER" }).click();
  await expect(page.getByText(/Order placed/)).toBeVisible({ timeout: 20_000 });
  state.orderNumber = Number((await page.getByText(/ORDER MP-\d+/).first().innerText()).match(/\d+/)![0]);
  const o = one<Record<string, number | string | null>>("SELECT * FROM orders WHERE order_number = ?", state.orderNumber)!;
  const subtotal = Number(o.subtotal_cents);
  const discount = Math.round(subtotal * 0.1);
  expect(o).toMatchObject({ affiliate_id: state.id, code_used: state.code, discount_amount_cents: discount, commission_status: "pending" });
  expect(o.commission_amount_cents).toBe(Math.round((subtotal - discount) * 0.15)); // 15% of the discounted products, no delivery
  expect(Number(o.total_cents)).toBe(subtotal - discount + Number(o.shipping_fee_cents));
  await ctx.close();
});

test("delivered, approved after 14 days, paid with one tap: the totals on the affiliate page follow", async ({ browser }) => {
  const o = one<{ id: string; commission_amount_cents: number }>("SELECT id, commission_amount_cents FROM orders WHERE order_number = ?", state.orderNumber)!;
  const due = (o.commission_amount_cents / 100).toFixed(2);
  const page = await (await ctxFor(browser)).newPage();
  page.on("dialog", (d) => void d.accept());
  await signInOwner(page);
  // delivered, but only 3 days ago: still pending
  exec("UPDATE orders SET status = 'delivered', delivered_at = ? WHERE id = ?", new Date(Date.now() - 3 * 86_400_000).toISOString(), o.id);
  await page.goto(`/admin/affiliates/${state.id}`);
  await expect(page.getByText(/Nothing to pay yet/)).toBeVisible();
  // 15 days ago: approved on the next admin load, and the order page shows the affiliate
  exec("UPDATE orders SET delivered_at = ? WHERE id = ?", new Date(Date.now() - 15 * 86_400_000).toISOString(), o.id);
  await page.goto(`/admin/affiliates/${state.id}`);
  await expect(page.getByRole("button", { name: `Record payout of $${due}` })).toBeVisible();
  await page.goto(`/admin/orders/${o.id}`);
  await expect(page.getByText("Nour Haddad · " + state.code)).toBeVisible();
  await page.goto(`/admin/affiliates/${state.id}`);
  await page.locator("input[name=method]").fill("Whish money");
  await page.getByRole("button", { name: `Record payout of $${due}` }).click();
  await expect(page.getByText(/Payout of \$.* recorded for 1 order/)).toBeVisible();
  expect(one("SELECT commission_status s FROM orders WHERE id = ?", o.id)).toMatchObject({ s: "paid" });
  expect(query("SELECT amount_cents, method FROM affiliate_payouts WHERE affiliate_id = ?", state.id)).toEqual([{ amount_cents: o.commission_amount_cents, method: "Whish money" }]);
  await page.reload();
  await expect(page.getByText(/Nothing to pay yet/)).toBeVisible();
  // the monthly CSV
  const res = await page.request.get(`/admin/affiliates/export?month=${new Date().toISOString().slice(0, 7)}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(await res.text()).toContain(state.code);
});

test("cancelling an order voids its commission and an affiliate list shows the totals", async ({ browser }) => {
  const ctx = await ctxFor(browser);
  const shop = await ctx.newPage();
  await shop.goto("/products/red-burn");
  await shop.getByRole("button", { name: /ADD TO CART/ }).first().click();
  await shop.getByRole("link", { name: "CHECKOUT" }).click();
  await shop.locator("#name").fill("Cancelling Shopper");
  await shop.locator("#phone").fill("03 535 353");
  await shop.locator("#governorate").selectOption("Beirut");
  await shop.locator("#district").selectOption("Beirut");
  await shop.locator("#street").fill("Beirut, Hamra, test building, floor 2");
  await shop.locator("#code").fill(state.code);
  await expect(shop.getByText(/Code applied/)).toBeVisible({ timeout: 15_000 });
  await shop.getByRole("button", { name: "PLACE ORDER" }).click();
  await expect(shop.getByText(/Order placed/)).toBeVisible({ timeout: 20_000 });
  const n = Number((await shop.getByText(/ORDER MP-\d+/).first().innerText()).match(/\d+/)![0]);
  await ctx.close();
  const id = one<{ id: string }>("SELECT id FROM orders WHERE order_number = ?", n)!.id;

  const page = await (await ctxFor(browser)).newPage();
  await signInOwner(page);
  await page.goto(`/admin/orders/${id}`);
  await page.getByPlaceholder("Reason for cancelling").fill("test cancel");
  page.on("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Cancel order" }).click();
  await expect.poll(() => one<{ s: string }>("SELECT commission_status s FROM orders WHERE id = ?", id)?.s, { timeout: 15_000 }).toBe("void");
  expect(one("SELECT commission_status s FROM orders WHERE id = ?", id)).toMatchObject({ s: "void" });
  await page.goto("/admin/affiliates");
  await expect(page.getByText(/Top 5 this month/)).toBeVisible();
  await page.goto("/admin/affiliates/list");
  await expect(page.getByText(state.code).locator("visible=true").first()).toBeVisible(); // the table is hidden on a phone: the cards show it
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("/ambassadors on a phone: the application is saved with spam protection, the team approves it", async ({ browser }) => {
  const ctx = await ctxFor(browser);
  const page = await ctx.newPage();
  await page.goto("/ambassadors");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Become a");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.locator("#ap-name").fill("Karim Daher");
  await page.locator("#ap-ph").fill("+961 70 765 432");
  await page.locator("#ap-em").fill("karim@example.com");
  await page.locator("#ap-ig").fill("@karim.lifts");
  await page.locator("#ap-f").fill("8k");
  await page.locator("#ap-c").fill("Saida");
  await page.locator("#ap-s").fill("CrossFit");
  await page.getByRole("button", { name: "SEND APPLICATION" }).click();
  await expect(page.getByText("Thanks, we received your application.")).toBeVisible({ timeout: 15_000 }).catch(async () => {
    // sent too fast for the bot check (under 3 s): a person would simply press the button again
    await expect(page.getByText("That was quick.")).toBeVisible();
    await expect(page.locator("#ap-name")).toHaveValue("Karim Daher"); // nothing typed is lost
    await page.waitForTimeout(3200);
    await page.getByRole("button", { name: "SEND APPLICATION" }).click();
    await expect(page.getByText("Thanks, we received your application.")).toBeVisible({ timeout: 15_000 });
  });
  expect(query("SELECT name, instagram_handle, status FROM affiliate_applications WHERE instagram_handle = 'karim.lifts'")).toEqual([{ name: "Karim Daher", instagram_handle: "karim.lifts", status: "new" }]);
  await ctx.close();

  const admin = await (await ctxFor(browser)).newPage();
  admin.on("dialog", (d) => void d.accept());
  await signInOwner(admin);
  await admin.goto("/admin/affiliates/applications");
  const card = admin.locator("li", { hasText: "Karim Daher" });
  await expect(card).toContainText("@karim.lifts");
  await expect(card.getByRole("link", { name: "Open WhatsApp" })).toBeVisible();
  await card.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(admin.getByText(/No account was created/)).toBeVisible();
  expect(query("SELECT 1 FROM affiliates WHERE name = 'Karim Daher'")).toHaveLength(0); // approving changed the status only
  await admin.reload();
  await admin.locator("li", { hasText: "Karim Daher" }).getByRole("button", { name: /Create account \/ send invite/ }).click();
  await expect(admin.getByText(/Account created. Code KARIM\d\d/)).toBeVisible();
  expect(one("SELECT code FROM affiliates WHERE name = 'Karim Daher'")).toMatchObject({ code: expect.stringMatching(/^KARIM\d\d$/) });
});

test("the old private stats link only redirects to the ambassador login, and shows nothing", async ({ browser }) => {
  const page = await (await ctxFor(browser)).newPage();
  for (const t of [state.token, "a".repeat(32), "not-a-token"]) {
    await page.goto(`/partner/${t}`);
    await expect(page).toHaveURL(/\/ambassador\/login$/);
    expect(await page.locator("body").innerText()).not.toContain("Nour Haddad");
  }
  const robots = await page.request.get("/robots.txt");
  expect(await robots.text()).toContain("Disallow: /ambassador/");
});

test("admin affiliate pages need a sign-in and a role", async ({ browser, request }) => {
  for (const url of ["/admin/affiliates", `/admin/affiliates/${state.id}`, "/admin/affiliates/applications", "/admin/affiliates/export?month=2026-01"])
    expect((await request.get(url, { maxRedirects: 0 })).status(), url).toBeGreaterThanOrEqual(300);
  const ctx = await ctxFor(browser);
  const page = await ctx.newPage();
  await page.goto("/admin/login");
  await page.locator("input[name=email]").fill(USERS.staff.email);
  await page.locator("input[name=password]").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin(\?.*)?$/);
  expect((await page.goto("/admin/affiliates"))?.status()).toBe(403);
  expect((await page.request.get("/admin/affiliates/export?month=2026-01")).status()).toBe(403);
});
