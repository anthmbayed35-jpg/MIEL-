import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_PASSWORD, ROOT, USERS } from "../support/e2e-env";
import { one, query } from "../support/e2e-db";

/**
 * Click-through of the WHOLE site, storefront and every admin page, at phone width (390) and desktop width (1440).
 * For each page it records: console errors and warnings, uncaught exceptions, failed or 4xx/5xx requests, broken
 * images, horizontal overflow (a visual break on phones) and junk text (undefined / NaN / [object Object]).
 * A full-page screenshot of each is saved in test-results/pages/ for a visual review. The report is written to
 * test-results/pages-report.json.
 */
test.describe.configure({ mode: "default" }); // a failing page must not hide the others: the report test at the end lists everything
test.setTimeout(180_000);

const VIEWPORTS = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "desktop-1440", width: 1440, height: 900 },
] as const;

const STORE = ["/", "/products/red-burn", "/products/gold", "/products/creatine", "/policies/shipping"];

/** Admin pages found on disk, with dynamic segments filled with real ids from the database. */
function adminPages(): string[] {
  const out: string[] = [];
  const base = path.join(ROOT, "app/admin");
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "page.tsx") {
        const url = "/" + path.relative(path.join(ROOT, "app"), dir).split(path.sep).filter((s) => !/^\(.*\)$/.test(s)).join("/");
        out.push(url);
      }
    }
  };
  walk(base);
  const order = one<{ id: string }>("SELECT id FROM orders ORDER BY created_at DESC LIMIT 1")?.id ?? "none";
  const product = one<{ id: string }>("SELECT id FROM products LIMIT 1")?.id ?? "none";
  const customer = one<{ id: string }>("SELECT id FROM customers LIMIT 1")?.id ?? "none";
  const fill = (u: string) => (u === "/admin/orders/[id]" ? `/admin/orders/${order}` : u === "/admin/products/[id]" ? `/admin/products/${product}` : u === "/admin/customers/[id]" ? `/admin/customers/${customer}` : u);
  const skip = new Set(["/admin/login", "/admin/forgot", "/admin/set-password", "/admin/mfa", "/admin/print"]); // sign-in pages have their own tests; /admin/print needs ids (visited below)
  const urls = out.map(fill).filter((u) => !skip.has(u));
  urls.push(`/admin/print?type=packing&ids=${order}`, `/admin/print?type=invoice&ids=${order}`, "/admin/orders?status=delivered", "/admin/orders?q=E2E");
  return [...new Set(urls)].sort();
}

type Problem = { page: string; viewport: string; kind: string; detail: string };
const problems: Problem[] = [];
const visited: { viewport: string; url: string; status: number }[] = [];

async function inspect(page: Page, url: string, viewport: string, expected = 200) {
  const local: Problem[] = [];
  const add = (kind: string, detail: string) => local.push({ page: url, viewport, kind, detail: detail.slice(0, 300) });
  const onConsole = (m: import("@playwright/test").ConsoleMessage) => {
    if ((m.type() === "error" || m.type() === "warning") && !(expected === 404 && /status of 404/.test(m.text()))) add(`console.${m.type()}`, m.text());
  };
  const onError = (e: Error) => add("pageerror", e.message);
  const onResponse = (r: import("@playwright/test").Response) => {
    const u = new URL(r.url());
    if (u.origin === new URL(page.url() || "http://localhost:3401").origin && r.status() >= 400 && r.status() !== expected && !r.url().endsWith("/favicon.ico")) add("http", `${r.status()} ${u.pathname}`);
  };
  const onFail = (r: import("@playwright/test").Request) => {
    if (r.failure()?.errorText !== "net::ERR_ABORTED") add("requestfailed", `${r.url()} ${r.failure()?.errorText}`);
  };
  page.on("console", onConsole);
  page.on("pageerror", onError);
  page.on("response", onResponse);
  page.on("requestfailed", onFail);
  const res = await page.goto(url, { waitUntil: "domcontentloaded" });
  visited.push({ viewport, url, status: res?.status() ?? 0 });
  // scroll through the page so lazy images and reveal animations load
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(600);
  const facts = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc).map((i) => i.currentSrc),
    text: document.body.innerText,
    title: document.title,
  }));
  if (facts.overflow > 1) add("overflow", `page is ${facts.overflow}px wider than the screen`);
  for (const b of facts.broken) add("broken-image", b);
  const junk = facts.text.match(/\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b(?!\s*(?:\.|,))/i);
  if (junk) add("junk-text", `"${junk[0]}" appears on the page`);
  if (!facts.title.trim()) add("title", "empty <title>");
  const safe = (viewport + url).replace(/[^a-z0-9]+/gi, "_").slice(0, 90);
  fs.mkdirSync(path.join(ROOT, "test-results/pages"), { recursive: true });
  await page.screenshot({ path: path.join(ROOT, "test-results/pages", `${safe}.png`), fullPage: true });
  page.off("console", onConsole);
  page.off("pageerror", onError);
  page.off("response", onResponse);
  page.off("requestfailed", onFail);
  problems.push(...local);
  return res?.status() ?? 0;
}

test("setup: make sure an order and a customer exist, so the order and customer pages have something to show", async ({ browser }) => {
  if (one("SELECT 1 FROM orders LIMIT 1")) return;
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.77" } });
  const page = await ctx.newPage();
  await page.goto("/products/red-burn");
  await page.getByRole("button", { name: /ADD TO CART/ }).first().click();
  await page.getByRole("button", { name: "CHECKOUT" }).click();
  await page.locator("#name").fill("Pages Customer");
  await page.locator("#phone").fill("03 555 123");
  await page.locator("#region").selectOption({ index: 1 });
  await page.locator("#address").fill("Beirut, Hamra, test building, floor 2");
  await page.getByRole("button", { name: "PLACE ORDER" }).click();
  await expect(page.getByText(/Order placed/)).toBeVisible({ timeout: 20_000 });
  await ctx.close();
});

for (const vp of VIEWPORTS) {
  test(`storefront at ${vp.name}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, extraHTTPHeaders: { "x-forwarded-for": "203.0.113.50" } });
    const page = await ctx.newPage();
    for (const url of STORE) expect(await inspect(page, url, vp.name), url).toBe(200);
    // the 404 page and the cart drawer + checkout form
    expect(await inspect(page, "/this-page-does-not-exist", vp.name, 404)).toBe(404);
    for (const slug of ["returns", "privacy", "terms"]) expect((await page.request.get("/policies/" + slug)).status(), slug).toBe(404); // no text written yet: no page (nothing invented)
    await page.goto("/products/red-burn");
    await page.getByRole("button", { name: /ADD TO CART/ }).first().click();
    await page.screenshot({ path: path.join(ROOT, "test-results/pages", `${vp.name}_cart-drawer.png`) });
    await page.getByRole("button", { name: "CHECKOUT" }).click();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), "checkout overflow").toBeLessThanOrEqual(1);
    await page.screenshot({ path: path.join(ROOT, "test-results/pages", `${vp.name}_checkout.png`) });
    await ctx.close();
  });

  test(`admin (every page, as the owner) at ${vp.name}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    await page.goto("/admin/login");
    await page.locator("input[name=email]").fill(USERS.owner.email);
    await page.locator("input[name=password]").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/admin(\?.*)?$/);
    const urls = adminPages();
    expect(urls.length).toBeGreaterThan(20);
    for (const url of urls) expect(await inspect(page, url, vp.name), url).toBe(200);
    await ctx.close();
  });
}

test("report: no console errors or warnings, no failed requests, no broken images, no overflow, no junk text anywhere", async () => {
  fs.mkdirSync(path.join(ROOT, "test-results"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "test-results/pages-report.json"), JSON.stringify({ visited, problems, orders: query("SELECT COUNT(*) n FROM orders")[0] }, null, 2));
  expect(visited.length).toBeGreaterThan(50);
  expect(problems).toEqual([]);
});
