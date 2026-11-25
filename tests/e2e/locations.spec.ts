import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_PASSWORD, USERS } from "../support/e2e-env";
import { one, query } from "../support/e2e-db";
import { chooseLocation, pickPlace } from "../support/location";

/**
 * The Lebanon location selector on a 375px phone, against the production build: orders from six districts in six governorates
 * (Beirut, a Bekaa village, Akkar, the South, Baalbek and the North), each district shows only its own regions, the delivery stays
 * a flat $5, and the order reaches the admin with the right location. Then hide/show/add in the admin, and the optional map pin
 * (the Google script is stubbed, so no request leaves the machine).
 */
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 375, height: 812 } });

let ip = 220;
const ctxFor = (browser: Browser) => browser.newContext({ viewport: { width: 375, height: 812 }, extraHTTPHeaders: { "x-forwarded-for": `198.19.0.${ip++}` } });
const price = () => Number(one<{ p: number }>("SELECT price_cents p FROM products WHERE slug = 'red-burn'")!.p) / 100;
const placed: { id: string; token: string; gov: string; district: string; region: string }[] = [];

async function startCheckout(page: Page) {
  await page.goto("/products/red-burn");
  await page.getByRole("button", { name: /ADD TO CART/ }).first().click();
  await page.getByRole("link", { name: "CHECKOUT" }).click();
  await page.waitForURL(/\/checkout$/);
}
async function fillContact(page: Page, name: string, phone: string) {
  await page.locator("#name").fill(name);
  await page.locator("#phone").fill(phone);
  await page.locator("#street").fill("Main road, building 7, floor 1");
}
async function signIn(page: Page) {
  await page.goto("/admin/login");
  await page.locator("input[name=email]").fill(USERS.owner.email);
  await page.locator("input[name=password]").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin(\?.*)?$/);
}

const CASES: [string, string, string, string, number][] = [
  // governorate, district, a region to search for, phone, regions that district must list
  ["Beirut", "Beirut", "Achrafiye", "03 301 001", 71],
  ["Bekaa", "Zahle", "Zahle", "03 301 002", 83], // a Bekaa town
  ["Akkar", "Akkar", "", "03 301 003", 286],
  ["South", "Saida", "", "03 301 004", 108],
  ["Baalbek-El Hermel", "Baalbek", "", "03 301 005", 176],
  ["North", "Tripoli", "", "03 301 006", 27],
];

for (const [gov, district, regionQuery, phone, count] of CASES) {
  test(`order from ${district} (${gov}): only its ${count} regions are listed, delivery is a flat $5, the order carries the location`, async ({ browser }) => {
    const ctx = await ctxFor(browser);
    const page = await ctx.newPage();
    await startCheckout(page);
    await fillContact(page, `Loc ${district}`, phone);
    await pickPlace(page, "#governorate", gov);
    await pickPlace(page, "#district", district);
    await page.locator("#region").click();
    const options = page.locator('[role="listbox"] [role="option"]');
    await expect(options).toHaveCount(count); // ALL the regions of this district, and no others
    // every listed region really belongs to this district
    const names = await options.evaluateAll((els) => els.map((e) => (e.querySelector("span")?.textContent ?? "").trim()));
    const inDb = query<{ name_en: string }>("SELECT r.name_en FROM locations r JOIN locations d ON d.id = r.parent_id WHERE d.name_en = ? AND r.type = 'region' AND r.hidden = 0", district).map((r) => r.name_en);
    expect([...names].sort()).toEqual([...inDb].sort());
    if (regionQuery) {
      await page.locator("#region").fill(regionQuery);
      await options.filter({ hasText: regionQuery }).first().click();
    } else await options.nth(2).click();
    const regionShown = await page.locator("#region").inputValue();
    // the delivery fee is $5 here, same as everywhere
    const summary = page.locator("details", { hasText: "ORDER SUMMARY" });
    await summary.locator("summary").click();
    await expect(summary.locator("dd").filter({ hasText: /^\$5$/ })).toBeVisible();
    await expect(summary.locator("dd").filter({ hasText: new RegExp(`^\\$${price() + 5}$`) })).toBeVisible();
    await page.getByRole("button", { name: "PLACE ORDER" }).click();
    await page.waitForURL(/\/order\/[0-9a-f]{32}$/, { timeout: 20_000 });
    const token = page.url().split("/").pop()!;
    await expect(page.getByLabel("Delivery address")).toContainText(district);
    const o = one<Record<string, string | number>>("SELECT * FROM orders WHERE public_token = ?", token)!;
    expect(o).toMatchObject({ governorate: gov, district, shipping_fee_cents: 500, total_cents: Math.round((price() + 5) * 100) });
    // the saved ids form a valid chain and the stored names match them
    const chain = one<{ g: string; d: string; r: string }>(
      "SELECT g.name_en g, d.name_en d, r.name_en r FROM locations r JOIN locations d ON d.id = r.parent_id JOIN locations g ON g.id = d.parent_id WHERE r.id = ? AND d.id = ? AND g.id = ?",
      o.region_id,
      o.district_id,
      o.governorate_id,
    )!;
    expect(chain).toEqual({ g: gov, d: district, r: o.region_name });
    expect(regionShown).toContain(String(o.region_name));
    placed.push({ id: String(o.id), token, gov, district, region: String(o.region_name) });
    await ctx.close();
  });
}

test("admin: every order shows its governorate, district and region, with the filters and a Google Maps button", async ({ browser }) => {
  expect(placed).toHaveLength(6);
  const admin = await (await ctxFor(browser)).newPage();
  await signIn(admin);
  for (const o of placed) {
    await admin.goto(`/admin/orders/${o.id}`);
    await expect(admin.getByTestId("loc-governorate")).toHaveText(o.gov);
    await expect(admin.getByTestId("loc-district")).toHaveText(o.district);
    await expect(admin.getByTestId("loc-region")).toHaveText(o.region);
    const href = await admin.getByRole("link", { name: /Open in Google Maps/ }).getAttribute("href");
    expect(href).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
    expect(decodeURIComponent(href!)).toContain(o.region); // the full address text, no API key
    expect(decodeURIComponent(href!)).toContain(o.district);
  }
  // filters by governorate and by district
  const zahle = placed.find((p) => p.district === "Zahle")!;
  await admin.goto(`/admin/orders?district=LB25`);
  await expect(admin.getByText(`Loc Zahle`).locator("visible=true").first()).toBeVisible();
  await expect(admin.getByText(`Loc Saida`).locator("visible=true")).toHaveCount(0);
  await admin.goto(`/admin/orders?governorate=LB7`);
  await expect(admin.getByText(`Loc Akkar`).locator("visible=true").first()).toBeVisible();
  await expect(admin.getByText(`Loc Zahle`).locator("visible=true")).toHaveCount(0);
  await admin.goto("/admin/orders");
  await expect(admin.getByLabel("Governorate")).toBeVisible();
  await expect(admin.getByLabel("District")).toBeVisible();
  void zahle;
});

test("admin Locations: counts per district, search in Arabic and English, hide a region (gone from checkout), show it, add a missing region", async ({ browser }) => {
  const admin = await (await ctxFor(browser)).newPage();
  admin.on("dialog", (d) => void d.accept());
  await signIn(admin);
  await admin.goto("/admin/settings/locations");
  await expect(admin.getByText("8 governorates, 26 districts and 2708 regions")).toBeVisible();
  await expect(admin.getByRole("link", { name: /Jbeil.*215 regions/ })).toBeVisible();
  await admin.getByLabel("Search locations").fill("زحلة");
  await admin.getByRole("button", { name: "Search", exact: true }).click();
  await expect(admin.getByText(/result/).first()).toBeVisible();
  await admin.goto("/admin/settings/locations?district=LB61");
  await expect(admin.getByText("108 regions").first()).toBeVisible();
  // add a region to Saida
  await admin.getByLabel("Region name (English)").fill("E2E New Village");
  await admin.getByRole("button", { name: "Add region" }).click();
  await expect(admin.getByText("Added E2E New Village.")).toBeVisible();
  const added = one<{ id: string }>("SELECT id FROM locations WHERE name_en = 'E2E New Village'")!;
  // hide it: the checkout no longer lists it; show it again: it is back
  await admin.goto("/admin/settings/locations?district=LB61&rq=E2E+New");
  await admin.getByRole("button", { name: "Hide" }).last().click();
  await expect(admin.getByText(/Hidden: customers no longer see it/)).toBeVisible();
  expect(one<{ h: number }>("SELECT hidden h FROM locations WHERE id = ?", added.id)!.h).toBe(1);
  const shopper = await (await ctxFor(browser)).newPage();
  const list = async () => (await shopper.request.get("/api/locations/regions?district=LB61").then((r) => r.json())) as { regions: { en: string }[] };
  expect((await list()).regions.map((r) => r.en)).not.toContain("E2E New Village");
  await admin.goto("/admin/settings/locations?district=LB61&rq=E2E+New");
  await admin.getByRole("button", { name: "Show at checkout" }).click();
  await expect(admin.getByText(/Shown at checkout again/)).toBeVisible();
  expect((await list()).regions.map((r) => r.en)).toContain("E2E New Village");
  // a district that is hidden disappears from the district selector
  await admin.goto("/admin/settings/locations?district=LB63");
  await admin.getByRole("button", { name: "Hide" }).first().click();
  await expect(admin.getByText(/Hidden: customers no longer see it/)).toBeVisible();
  const cart = await (await ctxFor(browser)).newPage();
  await startCheckout(cart);
  await pickPlace(cart, "#governorate", "South");
  await cart.locator("#district").click();
  const opts = (await cart.locator('[role="listbox"] [role="option"]').allInnerTexts()).join(" | ");
  expect(opts).toContain("Saida");
  expect(opts).not.toContain("Sour"); // hidden
  await admin.goto("/admin/settings/locations?district=LB63");
  await admin.getByRole("button", { name: "Show at checkout" }).first().click();
  await expect(admin.getByText(/Shown at checkout again/)).toBeVisible();
});

/** A stand-in for the Google Maps JavaScript API: just enough surface for the pin step. */
const MAPS_STUB = `
(() => {
  const clicks = [];
  class MapStub { constructor() { this.z = 8; } addListener(n, fn) { if (n === "click") clicks.push(fn); } panTo() {} setZoom(z) { this.z = z; } getZoom() { return this.z; } }
  class MarkerStub { constructor(o) { this.p = o.position; } addListener() {} getPosition() { return { lat: () => this.p.lat, lng: () => this.p.lng }; } setPosition(p) { this.p = p; } setMap() {} }
  class AutoStub { constructor() { const el = document.createElement("div"); el.setAttribute("data-testid", "places-stub"); window.__autoEl = el; return el; } }
  window.google = { maps: { Marker: MarkerStub, importLibrary: async (n) => (n === "maps" ? { Map: MapStub } : { PlaceAutocompleteElement: AutoStub }) } };
  window.__stubMapClick = (lat, lng) => clicks.forEach((fn) => fn({ latLng: { lat: () => lat, lng: () => lng } }));
  window.__stubPlaceSelect = (lat, lng) => window.__autoEl.dispatchEvent(Object.assign(new Event("gmp-select"), { placePrediction: { toPlace: () => ({ fetchFields: async () => {}, location: { lat: () => lat, lng: () => lng } }) } }));
})();`;

test("map pin: with the key the optional step appears (never required); a pin inside Lebanon is saved and shown to the admin; outside Lebanon is refused", async ({ browser }) => {
  const ctx = await ctxFor(browser);
  const page = await ctx.newPage();
  const requests: string[] = [];
  await page.route("https://maps.googleapis.com/**", (route) => {
    requests.push(route.request().url());
    return route.fulfill({ contentType: "text/javascript", body: MAPS_STUB });
  });
  await startCheckout(page);
  await expect(page.getByRole("heading", { name: /Pin your location/ })).toBeVisible();
  expect(requests).toHaveLength(0); // nothing is loaded from Google until the customer opens the step
  await fillContact(page, "Pin Person", "03 301 099");
  await chooseLocation(page, "Beirut", "Beirut");
  await page.getByRole("button", { name: "PIN MY LOCATION" }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toContain("key=e2e-fake-maps-key");
  expect(requests[0]).toContain("region=LB");
  await expect(page.getByTestId("places-stub")).toBeAttached();
  // outside Lebanon: refused with a message, no pin
  await page.evaluate(() => (window as unknown as { __stubPlaceSelect: (a: number, b: number) => void }).__stubPlaceSelect(48.85, 2.35));
  await expect(page.getByText("Please choose a place in Lebanon.")).toBeVisible();
  await expect(page.getByTestId("pin-saved")).toHaveCount(0);
  // a search result in Beirut, then a tap on the map moves it
  await page.evaluate(() => (window as unknown as { __stubPlaceSelect: (a: number, b: number) => void }).__stubPlaceSelect(33.8938, 35.5018));
  await expect(page.getByTestId("pin-saved")).toContainText("33.89380, 35.50180");
  await page.evaluate(() => (window as unknown as { __stubMapClick: (a: number, b: number) => void }).__stubMapClick(33.8959, 35.4778));
  await expect(page.getByTestId("pin-saved")).toContainText("33.89590, 35.47780");
  await page.getByRole("button", { name: "PLACE ORDER" }).click();
  await page.waitForURL(/\/order\/[0-9a-f]{32}$/, { timeout: 20_000 });
  const o = one<Record<string, number | string>>("SELECT id, pin_lat, pin_lon, pin_link FROM orders WHERE public_token = ?", page.url().split("/").pop()!)!;
  expect(o).toMatchObject({ pin_lat: 33.8959, pin_lon: 35.4778, pin_link: "https://www.google.com/maps/search/?api=1&query=33.895900,35.477800" });
  await ctx.close();

  const admin = await (await ctxFor(browser)).newPage();
  await signIn(admin);
  await admin.goto(`/admin/orders/${o.id}`);
  await expect(admin.getByTestId("pin-coords")).toContainText("33.895900, 35.477800");
  expect(await admin.getByTestId("pin-link").getAttribute("href")).toBe(o.pin_link);
});

test("the pin is optional: an order without a pin is placed normally", async ({ browser }) => {
  const ctx = await ctxFor(browser);
  const page = await ctx.newPage();
  await page.route("https://maps.googleapis.com/**", (route) => route.fulfill({ contentType: "text/javascript", body: MAPS_STUB }));
  await startCheckout(page);
  await fillContact(page, "No Pin", "03 301 098");
  await chooseLocation(page, "Beirut", "Beirut");
  await page.getByRole("button", { name: "PLACE ORDER" }).click();
  await page.waitForURL(/\/order\/[0-9a-f]{32}$/, { timeout: 20_000 });
  const o = one<{ pin_lat: number | null; pin_link: string }>("SELECT pin_lat, pin_link FROM orders WHERE public_token = ?", page.url().split("/").pop()!)!;
  expect(o).toEqual({ pin_lat: null, pin_link: "" });
  await ctx.close();
});
