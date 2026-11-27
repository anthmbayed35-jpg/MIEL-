import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_PASSWORD, USERS } from "../support/e2e-env";
import { exec, one } from "../support/e2e-db";
import { chooseLocation } from "../support/location";

/**
 * The Ambassadors section of the admin: the menu item (after Orders, highlighted, with the new-application badge), its four pages
 * (Overview, Ambassadors, Payouts, Applications), the personal link (?ref=CODE) and the orders list, on a desktop and on a 375px phone.
 */
test.describe.configure({ mode: "serial" });

let ip = 200;
const ctxFor = (browser: Browser, width: number, height: number) =>
  browser.newContext({ viewport: { width, height }, hasTouch: width < 500, isMobile: width < 500, extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${ip++}` }, permissions: ["clipboard-read", "clipboard-write"] });

async function signIn(page: Page, email: string = USERS.owner.email) {
  await page.goto("/admin/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin(\?.*)?$/);
}

const CODE = "NAVTEST7";
let affiliateId = "";

test("setup: an affiliate with an order, and two new applications", async () => {
  exec("DELETE FROM affiliate_applications WHERE instagram_handle LIKE 'navtest.%'");
  if (!one("SELECT 1 FROM affiliates WHERE code = ?", CODE))
    exec("INSERT INTO affiliates (id, name, instagram_handle, code, tier, private_token) VALUES (lower(hex(randomblob(16))), 'Nav Tester', 'nav.tester', ?, 'seed', 'navtesttoken_' || lower(hex(randomblob(12))))", CODE);
  affiliateId = one<{ id: string }>("SELECT id FROM affiliates WHERE code = ?", CODE)!.id;
  for (const n of [1, 2]) exec("INSERT INTO affiliate_applications (id, name, instagram_handle, status) VALUES (lower(hex(randomblob(16))), ?, ?, 'new')", `Nav Applicant ${n}`, `navtest.${n}`);
  expect(one<{ n: number }>("SELECT COUNT(*) n FROM affiliate_applications WHERE status = 'new'")!.n).toBeGreaterThanOrEqual(2);
});

test("desktop: Ambassadors sits after Orders, is highlighted on every page of the section, and its four pages load", async ({ browser }) => {
  const ctx = await ctxFor(browser, 1440, 900);
  const page = await ctx.newPage();
  const bad: string[] = [];
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && bad.push(m.text().slice(0, 160)));
  page.on("pageerror", (e) => bad.push("pageerror " + e.message.slice(0, 160)));
  await signIn(page);
  const nav = page.getByRole("navigation", { name: "Admin", exact: true });
  const names = (await nav.getByRole("link").allInnerTexts()).map((t) => t.replace(/\d+$/, "").trim());
  expect(names.slice(0, 3)).toEqual(["Dashboard", "Orders", "Ambassadors"]);
  const badge = nav.getByRole("link", { name: /Ambassadors/ }).locator('[aria-label$="new"]');
  const waiting = one<{ n: number }>("SELECT COUNT(*) n FROM affiliate_applications WHERE status = 'new'")!.n;
  await expect(badge).toHaveText(String(waiting));

  await nav.getByRole("link", { name: /Ambassadors/ }).click();
  await expect(page).toHaveURL(/\/admin\/affiliates$/);
  await expect(nav.getByRole("link", { name: /Ambassadors/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1, name: "Ambassadors" })).toBeVisible();
  for (const card of ["Affiliate sales", "Commission pending", "Commission approved", "Commission paid"]) await expect(page.getByText(card, { exact: true })).toBeVisible();
  await expect(page.getByText(/Top 5 this month/)).toBeVisible();

  const section = page.getByRole("navigation", { name: "Section" });
  await expect(section.getByRole("link")).toHaveCount(9);
  expect((await section.getByRole("link").allInnerTexts()).map((t) => t.replace(/\d+$/, "").trim())).toEqual(["Overview", "Ambassadors", "Applications", "Payouts", "Missions", "Kits", "Content", "Reports", "Settings"]);
  await expect(section.getByRole("link", { name: /Applications/ }).locator('[aria-label$="new"]')).toHaveText(String(waiting));

  // Ambassadors: search, status filter, the Add affiliate button, a row opens the affiliate
  await section.getByRole("link", { name: "Ambassadors" }).click();
  await expect(page).toHaveURL(/\/admin\/affiliates\/list$/);
  await expect(nav.getByRole("link", { name: /Ambassadors/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Add ambassador" })).toBeVisible();
  await page.locator("input[name=q]").fill("NAVTEST");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator("table tbody tr")).toHaveCount(1);
  const cells = (await page.locator("table tbody tr").first().innerText()).split("\t").map((c) => c.trim());
  expect(cells[0]).toBe("Nav Tester");
  expect(cells[1]).toBe("@nav.tester");
  expect(cells[2]).toBe(CODE);
  await page.locator("select[name=status]").selectOption("paused");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("No affiliates match.")).toBeVisible();
  await page.goto("/admin/affiliates/list?q=NAVTEST");
  await page.getByRole("link", { name: "Nav Tester" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/admin/affiliates/${affiliateId}$`));
  await expect(section.getByRole("link", { name: "Ambassadors" })).toHaveAttribute("aria-current", "page"); // the tab stays lit on an affiliate's own page

  // the affiliate page: details, code and links with copy buttons, orders, commission, payouts, record payout
  await expect(page.getByRole("heading", { level: 1, name: "Nav Tester" })).toBeVisible();
  const base = new URL(page.url()).origin;
  await expect(page.getByRole("textbox", { name: "Personal link to share (adds the code at checkout)" })).toHaveValue(new RegExp(`/\\?ref=${CODE}$`));
  await page.getByRole("button", { name: "Copy code" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(CODE);
  await expect(page.getByRole("button", { name: "Copy link" }).first()).toBeVisible();
  for (const t of ["Record payout", "Orders", "Payout history", "Edit affiliate"]) await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
  void base;

  // Payouts and Applications
  await section.getByRole("link", { name: "Payouts" }).click();
  await expect(page).toHaveURL(/\/admin\/affiliates\/payouts$/);
  await expect(page.getByRole("heading", { level: 1, name: "Payouts" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download payouts CSV" })).toBeVisible();
  await section.getByRole("link", { name: /Applications/ }).click();
  await expect(page).toHaveURL(/\/admin\/affiliates\/applications$/);
  await expect(page.getByText("Nav Applicant 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve", exact: true }).first()).toBeVisible();
  expect(bad).toEqual([]);
  await ctx.close();
});

test("rejecting an application updates the badge", async ({ browser }) => {
  const ctx = await ctxFor(browser, 1440, 900);
  const page = await ctx.newPage();
  page.on("dialog", (d) => void d.accept());
  await signIn(page);
  await page.goto("/admin/affiliates/applications");
  const before = one<{ n: number }>("SELECT COUNT(*) n FROM affiliate_applications WHERE status = 'new'")!.n;
  await page.locator("li", { hasText: "Nav Applicant 2" }).getByRole("button", { name: "Reject" }).click();
  await expect.poll(() => one<{ n: number }>("SELECT COUNT(*) n FROM affiliate_applications WHERE status = 'new'")!.n, { timeout: 15_000 }).toBe(before - 1);
  await page.goto("/admin/affiliates");
  await expect(page.getByRole("navigation", { name: "Admin", exact: true }).getByRole("link", { name: /Ambassadors/ }).locator('[aria-label$="new"]')).toHaveText(String(before - 1));
  await ctx.close();
});

test("phone (375px): Ambassadors is in the tab bar after Orders, every page fits the screen and every control is at least 48px", async ({ browser }) => {
  const ctx = await ctxFor(browser, 375, 812);
  const page = await ctx.newPage();
  await signIn(page);
  const tabs = page.getByRole("navigation", { name: "Admin sections" });
  // on a phone the badge sits above the label ("1\nAmbassadors"), so drop a leading number as well as a trailing one
  const names = (await tabs.getByRole("link").allInnerTexts()).map((t) => t.replace(/^\d+\s+/, "").replace(/\d+$/, "").trim());
  expect(names.slice(0, 3)).toEqual(["Dashboard", "Orders", "Ambassadors"]);
  for (const link of await tabs.getByRole("link").all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
  await expect(tabs.getByRole("link", { name: /Ambassadors/ }).locator('[aria-label$="new"]')).toBeVisible();
  await tabs.getByRole("link", { name: /Ambassadors/ }).click();
  await expect(page).toHaveURL(/\/admin\/affiliates$/);
  await expect(tabs.getByRole("link", { name: /Ambassadors/ })).toHaveAttribute("aria-current", "page");

  const urls = ["/admin/affiliates", "/admin/affiliates/list", "/admin/affiliates/list?q=NAVTEST", "/admin/affiliates/new", `/admin/affiliates/${affiliateId}`, "/admin/affiliates/payouts", "/admin/affiliates/applications", "/admin/orders"];
  for (const u of urls) {
    await page.goto(u);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${u} overflows`).toBeLessThanOrEqual(1);
    const small = await page.evaluate(() => {
      const bad: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("a,button,input:not([type=hidden]),select,textarea,summary")) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (!r.width || !r.height || cs.visibility === "hidden" || cs.display === "none" || el.closest("[aria-hidden=true]")) continue;
        if (el.tagName === "A" && el.closest("p,td") && r.height < 40) continue;
        if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
          const lr = el.closest("label")?.getBoundingClientRect();
          if (lr && lr.height >= 47.5 && lr.width >= 47.5) continue;
        }
        if (r.height < 47.5 || r.width < 47.5) bad.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return bad.slice(0, 5);
    });
    expect(small, `${u} has controls under 48px`).toEqual([]);
  }
  await ctx.close();
});

test("staff do not see the Ambassadors item and cannot open its pages", async ({ browser }) => {
  const ctx = await ctxFor(browser, 1440, 900);
  const page = await ctx.newPage();
  await signIn(page, USERS.staff.email);
  const nav = page.getByRole("navigation", { name: "Admin", exact: true });
  await expect(nav.getByRole("link", { name: /Ambassadors/ })).toHaveCount(0);
  for (const u of ["/admin/affiliates", "/admin/affiliates/list", "/admin/affiliates/payouts", "/admin/affiliates/applications", "/admin/affiliates/new"]) expect((await page.goto(u))?.status(), u).toBe(403);
  expect((await page.request.get("/admin/affiliates/payouts/export?month=2026-01")).status()).toBe(403);
  await ctx.close();
});

test("the orders list shows the affiliate and filters by it", async ({ browser }) => {
  // a real order with the code, placed through the storefront
  const shop = await (await ctxFor(browser, 375, 812)).newPage();
  await shop.goto("/products/red-burn");
  await shop.getByRole("button", { name: /ADD TO CART/ }).first().click();
  await shop.getByRole("link", { name: "CHECKOUT" }).click();
  await shop.locator("#name").fill("Nav Orderer");
  await shop.locator("#phone").fill("03 818 181");
  await chooseLocation(shop, "Beirut", "Beirut");
  await shop.locator("#street").fill("Beirut, Hamra, test building, floor 2");
  await shop.locator("#code").fill(CODE);
  await expect(shop.getByText(/Code applied/)).toBeVisible({ timeout: 15_000 });
  await shop.getByRole("button", { name: "PLACE ORDER" }).click();
  await expect(shop.getByText(/Order placed/)).toBeVisible({ timeout: 20_000 });
  const num = Number((await shop.getByText(/ORDER MP-\d+/).first().innerText()).match(/\d+/)![0]);

  const page = await (await ctxFor(browser, 1440, 900)).newPage();
  await signIn(page);
  await page.goto("/admin/orders");
  await page.locator("select[name=affiliate]").selectOption(affiliateId);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.locator("table tbody tr")).toHaveCount(1);
  const row = (await page.locator("table tbody tr").first().innerText()).replace(/\s+/g, " ");
  expect(row).toContain(`#${num}`);
  expect(row).toContain("Nav Tester");
  expect(row).toMatch(new RegExp(`${CODE} · −\\$[\\d.]+ · commission \\$[\\d.]+ \\(pending\\)`));
  // the order page
  await page.locator("table tbody tr").first().getByRole("link").first().click();
  await expect(page.getByText(`Nav Tester · ${CODE}`)).toBeVisible();
  await expect(page.getByText(/Commission \$[\d.]+ · pending/)).toBeVisible();
  // an order without a code is filtered out
  await page.goto(`/admin/orders?affiliate=${affiliateId}&q=NoSuchPerson`);
  await expect(page.getByText("No orders match.")).toBeVisible();
});

test("the personal link: /?ref=CODE fills the discount field at checkout, and a bad ref changes nothing", async ({ browser }) => {
  const shop = await (await ctxFor(browser, 375, 812)).newPage();
  await shop.goto(`/?ref=${CODE.toLowerCase()}`);
  await shop.waitForFunction(() => !!localStorage.getItem("miel_ref")); // the page remembers it once it has hydrated (slower on a busy machine)
  await shop.goto("/products/red-burn"); // another page: the code was remembered
  await shop.getByRole("button", { name: /ADD TO CART/ }).first().click();
  await shop.getByRole("link", { name: "CHECKOUT" }).click();
  await expect(shop.locator("#code")).toHaveValue(CODE);
  await chooseLocation(shop, "Beirut", "Beirut");
  await expect(shop.getByText(/Code applied: 10% off/)).toBeVisible({ timeout: 15_000 });

  const other = await (await ctxFor(browser, 375, 812)).newPage();
  await other.goto("/?ref=%3Cscript%3E");
  await other.goto("/products/red-burn");
  await other.getByRole("button", { name: /ADD TO CART/ }).first().click();
  await other.getByRole("link", { name: "CHECKOUT" }).click();
  await expect(other.locator("#code")).toHaveValue("");
});
