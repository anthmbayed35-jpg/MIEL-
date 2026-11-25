import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_PASSWORD, USERS } from "../support/e2e-env";
import { exec, one, query, stockOf } from "../support/e2e-db";

/**
 * Type-to-search on a 375px phone, against the production build: 26 places typed partially, misspelled, in English and in Arabic;
 * each must be suggested and auto-fill governorate, district and region. Then orders placed through the search (several districts),
 * one with an area that is NOT in the list, the admin "Unlisted areas" queue (approve and merge), the index being downloaded once,
 * and a slow connection.
 */
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 375, height: 812 } });

// the orders placed here take stock: give it back so the specs that run later see the shop as they expect
let stock0 = 0;
test.beforeAll(() => { stock0 = stockOf("red-burn"); });
test.afterAll(() => { exec("UPDATE inventory_items SET on_hand = ? WHERE product_id = (SELECT id FROM products WHERE slug = 'red-burn')", stock0); });

let ip = 120;
const ctxFor = (browser: Browser) => browser.newContext({ viewport: { width: 375, height: 812 }, extraHTTPHeaders: { "x-forwarded-for": `198.20.0.${ip++}` } });

async function startCheckout(page: Page) {
  await page.goto("/products/red-burn");
  await page.getByRole("button", { name: /ADD TO CART/ }).first().click();
  await page.getByRole("link", { name: "CHECKOUT" }).click();
  await page.waitForURL(/\/checkout$/);
}
async function signIn(page: Page) {
  await page.goto("/admin/login");
  await page.locator("input[name=email]").fill(USERS.owner.email);
  await page.locator("input[name=password]").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin(\?.*)?$/);
}
const options = (page: Page) => page.locator('#area-search ~ [role="listbox"] [role="option"]');

// what the customer types, what the first suggestion must show, and the district it fills in
const TYPED: [string, RegExp, string][] = [
  ["hamr", /Hamra/i, "Beirut"],
  ["achrafyeh", /Achrafi/i, "Beirut"],
  ["gemayze", /Gem+ayz|Gm?ayz/i, "Beirut"],
  ["antilias", /Antel?ias|Antilias/i, "El Meten"],
  ["jal ed dib", /Jal/i, "El Meten"],
  ["dbay", /Dba/i, "El Meten"],
  ["bikfay", /Bikf/i, "El Meten"],
  ["jouniyeh", /Jou?n/i, "Kesrwane"],
  ["kaslik", /Kasl/i, "Kesrwane"],
  ["faraya", /Far/i, "Kesrwane"],
  ["baabd", /Baab/i, "Baabda"],
  ["aley", /Aley/i, "Aley"],
  ["bhamdon", /Bham/i, "Aley"],
  ["batrun", /Batr/i, "Batroun"],
  ["tripolli", /Tripol/i, "Tripoli"],
  ["bcharre", /Bch|Bsh|Bch/i, "Bcharre"],
  ["zahleh", /Zahle/i, "Zahle"],
  ["baalbk", /Baalb/i, "Baalbek"],
  ["sidon", /Saida|Sidon/i, "Saida"],
  ["tyre", /Sour|Tyre/i, "Sour"],
  ["nabatye", /Nabat/i, "El Nabatieh"],
  ["jezin", /Jezz?in/i, "Jezzine"],
  ["الحمرا", /Hamra/i, "Beirut"],
  ["زحلة", /Zahle/i, "Zahle"],
  ["صيدا", /Saida|Sidon/i, "Saida"],
  ["طرابلس", /Tripoli/i, "Tripoli"],
];

test("26 partial, misspelled and Arabic searches each suggest the place and auto-fill governorate, district and region", async ({ browser }) => {
  const ctx = await ctxFor(browser);
  const page = await ctx.newPage();
  await startCheckout(page);
  const search = page.locator("#area-search");
  await expect(search).toHaveAttribute("placeholder", /Type your area/);
  for (const [typed, expected, district] of TYPED) {
    await search.fill("");
    await search.fill(typed);
    await expect(options(page).first(), typed).toContainText(expected);
    await expect(options(page).first()).toContainText(district); // every suggestion shows "Region, District, Governorate"
    await options(page).first().click();
    await expect(page.locator("#district"), typed).toHaveValue(new RegExp(district));
    await expect(page.locator("#region"), typed).not.toHaveValue("");
    await expect(page.locator("#governorate")).not.toHaveValue("");
  }
  await ctx.close();
});

test("keyboard: arrows and Enter pick a suggestion; the x clears; the dropdowns underneath stay in sync", async ({ browser }) => {
  const ctx = await ctxFor(browser);
  const page = await ctx.newPage();
  await startCheckout(page);
  const search = page.locator("#area-search");
  await search.fill("zah");
  await expect(options(page).first()).toBeVisible();
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(page.locator("#district")).not.toHaveValue("");
  const region = await page.locator("#region").inputValue();
  expect(region).not.toBe("");
  await search.fill("something");
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(search).toHaveValue("");
  // the dropdown underneath still lists ALL regions of the picked district
  await page.locator("#region").click();
  expect(await page.locator('[role="listbox"] [role="option"]').count()).toBeGreaterThan(20);
  await ctx.close();
});

test("the index is downloaded once, then served from the cache; search works on a slow connection", async ({ browser }) => {
  const ctx = await ctxFor(browser);
  const page = await ctx.newPage();
  const hits: string[] = [];
  page.on("request", (r) => r.url().includes("/api/locations/index") && hits.push(r.url()));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 }); // slow 3G
  await startCheckout(page);
  await page.locator("#area-search").fill("hamra");
  await expect(options(page).first()).toContainText(/Hamra/i, { timeout: 20_000 });
  const t = Date.now();
  await page.locator("#area-search").fill("jbeil");
  await expect(options(page).first()).toContainText(/Jbeil/i);
  expect(Date.now() - t).toBeLessThan(1500); // typing never waits for the network
  expect(hits).toHaveLength(1);
  const size = await page.evaluate(() => (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).filter((e) => e.name.includes("/api/locations/index")).map((e) => e.encodedBodySize));
  expect(size[0]).toBeLessThan(260_000); // compressed index
  // a reload does not download it again
  await page.reload();
  await page.locator("#area-search").fill("hamra");
  await expect(options(page).first()).toContainText(/Hamra/i);
  expect(hits).toHaveLength(1);
  await ctx.close();
});

async function fillAndPlace(page: Page, name: string, phone: string) {
  await page.locator("#name").fill(name);
  await page.locator("#phone").fill(phone);
  await page.locator("#street").fill("Main road, building 7, floor 1");
  await page.getByRole("button", { name: "PLACE ORDER" }).click();
  await page.waitForURL(/\/order\/[0-9a-f]{32}$/, { timeout: 20_000 });
}

for (const [i, [typed, district]] of [["hamra", "Beirut"], ["zahleh", "Zahle"], ["tripoli", "Tripoli"], ["sidon", "Saida"]].entries()) {
  test(`order placed by searching "${typed}" lands in ${district}`, async ({ browser }) => {
    const ctx = await ctxFor(browser);
    const page = await ctx.newPage();
    await startCheckout(page);
    await page.locator("#area-search").fill(typed);
    await options(page).first().click();
    await fillAndPlace(page, `Search ${district}`, `03 50${i} 00${i}`);
    const o = one<{ district: string; region_id: string; shipping_fee_cents: number; unlisted_area_id: string }>("SELECT o.district, o.region_id, o.shipping_fee_cents, o.unlisted_area_id FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.name = ? ORDER BY o.created_at DESC LIMIT 1", `Search ${district}`)!;
    expect(o.district).toBe(district);
    expect(o.region_id).not.toBe("");
    expect(o.unlisted_area_id).toBe("");
    expect(o.shipping_fee_cents).toBe(500);
    await ctx.close();
  });
}

async function placeUnlisted(browser: Browser, typed: string, district: string, phone: string) {
  const ctx = await ctxFor(browser);
  const page = await ctx.newPage();
  await startCheckout(page);
  await page.locator("#area-search").fill(typed);
  await page.getByRole("button", { name: /CAN.T FIND YOUR AREA/ }).click();
  await page.locator("#unlisted-district").click();
  await page.locator("#unlisted-district").fill(district);
  await page.locator('[role="listbox"] [role="option"]').filter({ hasText: district }).first().click();
  await page.getByRole("button", { name: "USE THIS AREA" }).click();
  await fillAndPlace(page, `Unlisted ${typed}`, phone);
  await expect(page.getByLabel("Delivery address")).toContainText(typed);
  await ctx.close();
}

test("an area that is not in the list never blocks the order; the admin queue shows what was typed", async ({ browser }) => {
  await placeUnlisted(browser, "Hayy Zzyzx Test", "Zahle", "03 520 001");
  await placeUnlisted(browser, "Zahlawi Corner Block", "Zahle", "03 520 002");
  const rows = query<{ text: string; district_id: string; status: string }>("SELECT text, district_id, status FROM unlisted_areas ORDER BY text");
  expect(rows.map((r) => r.text)).toEqual(["Hayy Zzyzx Test", "Zahlawi Corner Block"]);
  const admin = await (await ctxFor(browser)).newPage();
  admin.on("dialog", (d) => void d.accept());
  await signIn(admin);
  await admin.goto("/admin/settings/locations/unlisted");
  await expect(admin.getByTestId("unlisted-text").filter({ hasText: "Hayy Zzyzx Test" })).toBeVisible();
  await expect(admin.getByText("1 order").first()).toBeVisible();
  // approve the first one as a new region
  const first = admin.locator("div.admin-card", { has: admin.getByTestId("unlisted-text").filter({ hasText: "Hayy Zzyzx Test" }) });
  await first.getByRole("button", { name: "Approve as new region" }).click();
  await expect.poll(() => one<{ status: string }>("SELECT status FROM unlisted_areas WHERE text = ?", "Hayy Zzyzx Test")!.status).toBe("approved"); // the card then leaves the queue
  // merge the second into an existing Zahle region
  await admin.goto("/admin/settings/locations/unlisted");
  const second = admin.locator("div.admin-card", { has: admin.getByTestId("unlisted-text").filter({ hasText: "Zahlawi Corner Block" }) });
  await second.locator("select[name=region]").selectOption({ label: "Zahle" });
  await second.getByRole("button", { name: "Merge as an alias" }).click();
  await expect.poll(() => one<{ status: string }>("SELECT status FROM unlisted_areas WHERE text = ?", "Zahlawi Corner Block")!.status).toBe("merged");
  // orders were linked; customers now find both spellings at once
  expect(one<{ n: number }>("SELECT COUNT(*) n FROM orders WHERE unlisted_area_id <> '' AND region_id = ''")!.n).toBe(0);
  const ctx = await ctxFor(browser);
  const page = await ctx.newPage();
  await startCheckout(page);
  await page.locator("#area-search").fill("Hayy Zzyzx");
  await expect(options(page).first()).toContainText("Hayy Zzyzx Test");
  await page.locator("#area-search").fill("Zahlawi Corner");
  await expect(options(page).first()).toContainText(/Zahle/);
  await ctx.close();
});
