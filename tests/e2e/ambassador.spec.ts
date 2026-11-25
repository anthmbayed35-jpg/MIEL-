import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_PASSWORD, USERS } from "../support/e2e-env";
import { exec, linkFor, one, query } from "../support/e2e-db";
import { chooseLocation } from "../support/location";

/**
 * The ambassador programme end to end on the production build, on a 375px phone:
 * apply, the team approves, the ambassador opens the invite link and sets a password, logs out and in, a shopper opens the personal
 * link and orders, the order is delivered, the ambassador sees the sale (first name only) and requests a payout, the team records it.
 */
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 375, height: 812 } });

let ip = 80;
const ctxFor = (browser: Browser) => browser.newContext({ viewport: { width: 375, height: 812 }, extraHTTPHeaders: { "x-forwarded-for": `203.0.113.${ip++}` } });
const PASSWORD = "e2e-ambassador-passphrase-77";
const EMAIL = "journey.runner@example.com";
const state: { code: string; id: string; orderNumber: number; orderId: string } = { code: "", id: "", orderNumber: 0, orderId: "" };
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

async function signInOwner(page: Page) {
  await page.goto("/admin/login");
  await page.locator("input[name=email]").fill(USERS.owner.email);
  await page.locator("input[name=password]").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin(\?.*)?$/);
}

test("apply on /ambassadors, the team approves, an invite link is made", async ({ browser }) => {
  const ctx = await ctxFor(browser);
  const page = await ctx.newPage();
  await page.goto("/ambassadors");
  await page.locator("#ap-name").fill("Journey Runner");
  await page.locator("#ap-ph").fill("+961 70 111 222");
  await page.locator("#ap-em").fill(EMAIL);
  await page.locator("#ap-ig").fill("@journey.runs");
  await page.locator("#ap-f").fill("5k");
  await page.locator("#ap-c").fill("Beirut");
  await page.locator("#ap-s").fill("Running");
  await page.getByRole("button", { name: "SEND APPLICATION" }).click();
  await expect(page.getByText("Thanks, we received your application.")).toBeVisible({ timeout: 15_000 }).catch(async () => {
    await page.waitForTimeout(3200); // sent too fast for the bot check: press again like a person
    await page.getByRole("button", { name: "SEND APPLICATION" }).click();
    await expect(page.getByText("Thanks, we received your application.")).toBeVisible({ timeout: 15_000 });
  });
  expect(one("SELECT email, status FROM affiliate_applications WHERE email = ?", EMAIL)).toMatchObject({ email: EMAIL, status: "new" });
  await ctx.close();

  const admin = await (await ctxFor(browser)).newPage();
  admin.on("dialog", (d) => void d.accept());
  await signInOwner(admin);
  await admin.goto("/admin/affiliates/applications");
  const card = admin.locator("li", { hasText: "Journey Runner" });
  await expect(card).toContainText(EMAIL);
  await card.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(admin.getByText(/No account was created/)).toBeVisible();
  await admin.reload();
  await admin.locator("li", { hasText: "Journey Runner" }).getByRole("button", { name: /Create account \/ send invite/ }).click();
  await expect(admin.getByText(/Account created. Code JOURNEY\d\d/)).toBeVisible();
  await expect(admin.getByRole("link", { name: /WhatsApp/i }).first()).toBeVisible(); // a ready-to-send WhatsApp message
  const row = one<{ id: string; code: string }>("SELECT id, code FROM affiliates WHERE email = ?", EMAIL)!;
  state.id = row.id;
  state.code = row.code;
  expect(one("SELECT kind, status FROM kit_requests WHERE affiliate_id = ?", state.id)).toMatchObject({ kind: "starter", status: "requested" });
});

test("the ambassador opens the invite, sets a password and accepts the terms, logs out and back in", async ({ browser }) => {
  const link = linkFor(EMAIL);
  expect(link, "the invite is emailed when email is configured").toMatch(/\/ambassador\/set-password\?token=/);
  const ctx = await ctxFor(browser);
  const page = await ctx.newPage();
  await page.goto(link!);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome");
  await noOverflow(page);
  await page.locator("#pw").fill(PASSWORD);
  await page.locator("#cf").fill(PASSWORD);
  await page.getByRole("button", { name: "OPEN MY PORTAL" }).click(); // terms not ticked: the browser refuses
  await expect(page).toHaveURL(/set-password/);
  await page.getByLabel(/I agree to the/).check();
  await page.getByRole("button", { name: "OPEN MY PORTAL" }).click();
  await page.waitForURL(/\/ambassador$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hey Journey");
  await expect(page.getByText(state.code, { exact: true }).first()).toBeVisible();
  await noOverflow(page);
  // the link works once
  await page.goto(link!);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Link used");
  // log out and in
  await page.goto("/ambassador");
  await page.getByRole("button", { name: "LOG OUT" }).click();
  await page.waitForURL(/\/ambassador\/login$/);
  await page.locator("#em").fill(EMAIL);
  await page.locator("#pw").fill("wrong-password-12345");
  await page.getByRole("button", { name: "LOG IN" }).click();
  await expect(page.getByText("That email and password do not match.")).toBeVisible();
  await page.locator("#pw").fill(PASSWORD);
  await page.getByRole("button", { name: "LOG IN" }).click();
  await page.waitForURL(/\/ambassador$/);
  // the portal is private and not indexable
  expect(await page.locator('meta[name="robots"]').getAttribute("content")).toMatch(/noindex/);
  const res = await page.request.get("/ambassador");
  expect(res.headers()["cache-control"]).toContain("no-store");
  // an anonymous visitor is sent to the login
  const anon = await (await ctxFor(browser)).newPage();
  for (const p of ["/ambassador", "/ambassador/sales", "/ambassador/payouts", "/ambassador/profile"]) {
    await anon.goto(p);
    await expect(anon).toHaveURL(/\/ambassador\/login$/);
  }
  await ctx.close();
});

test("a shopper opens the personal link: the code is applied, the visit is counted, the order is attributed to the link", async ({ browser }) => {
  const ctx = await ctxFor(browser);
  const page = await ctx.newPage();
  await page.goto(`/?ref=${state.code}`);
  await expect.poll(() => one<{ c: number }>("SELECT COALESCE(SUM(count), 0) c FROM ref_clicks WHERE affiliate_id = ?", state.id)?.c, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  await page.goto("/products/red-burn");
  await page.getByRole("button", { name: /ADD TO CART/ }).first().click();
  await page.getByRole("link", { name: "CHECKOUT" }).click();
  await expect(page.locator("#code")).toHaveValue(state.code); // applied from the link, nothing typed
  await expect(page.getByText(/Code applied: 10% off/)).toBeVisible({ timeout: 15_000 });
  await chooseLocation(page, "Beirut", "Beirut");
  await page.locator("#name").fill("Jade Customer");
  await page.locator("#phone").fill("03 616 161");
  await page.locator("#street").fill("Beirut, Hamra, test building, floor 3");
  await page.locator("#heard_from").selectOption("Instagram");
  await page.getByRole("button", { name: "PLACE ORDER" }).click();
  await expect(page.getByText(/Order placed/)).toBeVisible({ timeout: 20_000 });
  state.orderNumber = Number((await page.getByText(/ORDER MP-\d+/).first().innerText()).match(/\d+/)![0]);
  const o = one<Record<string, string | number | null>>("SELECT * FROM orders WHERE order_number = ?", state.orderNumber)!;
  state.orderId = String(o.id);
  expect(o).toMatchObject({ affiliate_id: state.id, attribution: "link", heard_from: "Instagram", commission_status: "pending" });
  await ctx.close();
});

test("delivered: the sale shows in the portal (first name only) and in the admin; payout request, then the team records the payout", async ({ browser }) => {
  exec("UPDATE orders SET status = 'delivered', delivered_at = ? WHERE id = ?", new Date(Date.now() - 20 * 86_400_000).toISOString(), state.orderId);
  // a minimum payout of $1 for this test, saved the way the settings form saves it
  exec("INSERT INTO settings (key, value, version, updated_at) VALUES ('ambassador_program', ?, 1, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify({ minPayoutCents: 100 }), new Date().toISOString());

  const ctx = await ctxFor(browser);
  const page = await ctx.newPage();
  await page.goto("/ambassador/login");
  await page.locator("#em").fill(EMAIL);
  await page.locator("#pw").fill(PASSWORD);
  await page.getByRole("button", { name: "LOG IN" }).click();
  await page.waitForURL(/\/ambassador$/);
  await page.goto("/ambassador/sales");
  await expect(page.getByText(`#${state.orderNumber}`).first()).toBeVisible();
  const body = await page.locator("body").innerText();
  expect(body).toContain("Jade");
  for (const secret of ["Customer", "616 161", "Hamra"]) expect(body).not.toContain(secret);
  expect(body).toContain("your link");
  await noOverflow(page);

  await page.goto("/ambassador/link");
  await expect(page.locator("svg[viewBox]").first()).toBeVisible(); // the QR code
  await noOverflow(page);

  // payout details, then the request
  await page.goto("/ambassador/profile");
  await page.locator("#pm").fill("Whish money");
  await page.locator("#pd").fill("70 111 222");
  await page.getByRole("button", { name: "SAVE", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.goto("/ambassador/payouts");
  await noOverflow(page);
  const amount = one<{ c: number }>("SELECT commission_amount_cents c FROM orders WHERE id = ?", state.orderId)!.c;
  const money = `$${(amount / 100).toFixed(2)}`;
  await page.getByRole("button", { name: `REQUEST ${money}` }).click();
  await expect(page.getByText(/requested/i).first()).toBeVisible();
  expect(query("SELECT status FROM payout_requests WHERE affiliate_id = ?", state.id)).toEqual([{ status: "requested" }]);

  // the other pages open without errors on a phone
  for (const p of ["/ambassador", "/ambassador/missions", "/ambassador/kit", "/ambassador/resources", "/ambassador/leaderboard", "/ambassador/news"]) {
    const r = await page.goto(p);
    expect(r?.status(), p).toBe(200);
    await noOverflow(page);
  }
  await ctx.close();

  // the team: the order shows the ambassador and source; the request is in the queue; recording the payout closes it
  const admin = await (await ctxFor(browser)).newPage();
  admin.on("dialog", (d) => void d.accept());
  await signInOwner(admin);
  await admin.goto(`/admin/orders/${state.orderId}`);
  await expect(admin.getByText(/via personal link/)).toBeVisible();
  await expect(admin.getByText("Instagram", { exact: true }).first()).toBeVisible();
  await admin.goto("/admin/affiliates");
  await expect(admin.getByText(/1 payout request/)).toBeVisible();
  await admin.goto("/admin/affiliates/payouts");
  await expect(admin.getByText(/Asked for/)).toBeVisible();
  await admin.goto(`/admin/affiliates/${state.id}`);
  await admin.locator("input[name=method]").fill("Whish money");
  await admin.getByRole("button", { name: `Record payout of ${money}` }).click();
  await expect(admin.getByText(/Payout of \$.* recorded/)).toBeVisible();
  expect(query("SELECT status FROM payout_requests WHERE affiliate_id = ?", state.id)).toEqual([{ status: "paid" }]);
  expect(one("SELECT commission_status s FROM orders WHERE id = ?", state.orderId)).toMatchObject({ s: "paid" });
  await admin.goto("/admin/affiliates/reports");
  await expect(admin.getByText("Journey Runner").locator("visible=true").first()).toBeVisible();
  for (const p of ["/admin/affiliates/settings", "/admin/affiliates/missions", "/admin/affiliates/kits", "/admin/affiliates/content"]) expect((await admin.goto(p))?.status(), p).toBe(200);

  const again = await (await ctxFor(browser)).newPage();
  await again.goto("/ambassador/login");
  await again.locator("#em").fill(EMAIL);
  await again.locator("#pw").fill(PASSWORD);
  await again.getByRole("button", { name: "LOG IN" }).click();
  await again.waitForURL(/\/ambassador$/);
  await again.goto("/ambassador/payouts");
  await expect(again.getByText(/PAID ·/).first()).toBeVisible();
});

test("an ambassador session never opens the admin, and an admin session is not a portal session", async ({ browser }) => {
  const ctx = await ctxFor(browser);
  const page = await ctx.newPage();
  await page.goto("/ambassador/login");
  await page.locator("#em").fill(EMAIL);
  await page.locator("#pw").fill(PASSWORD);
  await page.getByRole("button", { name: "LOG IN" }).click();
  await page.waitForURL(/\/ambassador$/);
  await page.goto("/admin/affiliates");
  await expect(page).toHaveURL(/\/admin\/login/);
  expect((await page.request.get("/admin/affiliates/export?month=2026-01", { maxRedirects: 0 })).status()).toBeGreaterThanOrEqual(300);
  await ctx.close();

  const admin = await (await ctxFor(browser)).newPage();
  await signInOwner(admin);
  await admin.goto("/ambassador");
  await expect(admin).toHaveURL(/\/ambassador\/login$/);
});

test("the public Ambassadors page leaks no program details: not in the HTML, the scripts it loads, the meta tags, the sitemap or any public API", async ({ browser, request }) => {
  const SECRET = /commission|percent|tier|levels?\b|perk|payout|earn(?:ings?)?\b|threshold|starter kit|free pouch|hold period|follower discount|ambassador login|ambassador terms|#ad\b|health claim/i;
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  const scripts: string[] = [];
  page.on("response", async (r) => {
    if (r.url().endsWith(".js") || r.url().includes(".js?")) scripts.push(await r.text().catch(() => ""));
  });
  await page.goto("/ambassadors");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Become a");
  await page.waitForLoadState("networkidle");
  const html = await page.content();
  const visible = await page.locator("body").innerText();
  const metas = await page.evaluate(() => [...document.querySelectorAll("meta")].map((m) => m.getAttribute("content") ?? "").join("\n") + document.title);
  expect(visible).not.toMatch(SECRET);
  expect(html.replace(/<script[\s\S]*?<\/script>/g, "")).not.toMatch(SECRET);
  expect(metas).not.toMatch(SECRET);
  // the form is the only thing: no link to the portal, the terms or the login
  for (const href of await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""))) expect(href).not.toMatch(/\/ambassador(\/|$)|ambassadors\/terms/);
  // framework chunks contain generic words (percent, tier...): scripts are checked for the program-specific phrases
  const PROGRAM_JS = /commission|payout|starter kit|free pouch|hold period|follower discount|ambassador login|ambassador terms|become an ambassador|athlete tier|seed tier/i;
  for (const [i, js] of scripts.entries()) expect(js, `script ${i}`).not.toMatch(PROGRAM_JS);
  const sitemap = await request.get("/sitemap.xml");
  expect(await sitemap.text()).not.toMatch(SECRET);
  for (const url of ["/api/health", "/ambassadors/terms", "/robots.txt"]) {
    const r = await request.get(url, { maxRedirects: 0 });
    expect(await r.text()).not.toMatch(SECRET);
  }
  await ctx.close();
});
