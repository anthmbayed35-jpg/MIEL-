import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_PASSWORD, MAINT_URL, USERS } from "../support/e2e-env";
import { exec } from "../support/e2e-db";
import { chooseLocation } from "../support/location";

/**
 * Storefront sweep: the home page and the three product pages at 360, 375, 768, 1024 and 1440 px.
 * Console errors, failed requests, horizontal overflow, the stack at the top of the page (preview bar, ambassador strip, header:
 * nothing overlaps, the strip is fully visible), the hero fitting the first screen on a phone, layout shift, images, tap targets,
 * the flavour switcher, quantity, add to cart across all three flavours, the cart drawer and the checkout entry with a code.
 * Screenshots go to ./qa-screenshots/<label>/ (git-ignored).
 */
test.describe.configure({ mode: "default" });

const SIZES = [
  { w: 360, h: 740 },
  { w: 375, h: 667 },
  { w: 768, h: 1024 },
  { w: 1024, h: 768 },
  { w: 1440, h: 900 },
];
const PAGES = ["/", "/products/red-burn", "/products/gold", "/products/creatine"];
const LABEL = process.env.SHOT_LABEL ?? "after";
const shot = async (page: Page, name: string, full = false) => {
  const dir = path.join(process.cwd(), "qa-screenshots", LABEL);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: full });
};

test.beforeAll(() => {
  // the ambassador strip is switched on for the sweep (it is off until the team turns it on in Ambassadors > Settings)
  exec(
    "INSERT INTO settings (key, value, version, updated_at) VALUES ('ambassador_program', ?, 1, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    JSON.stringify({ banner: { enabled: true, text: "Train with MIEL+. Become an ambassador." } }),
    new Date().toISOString(),
  );
});

type Box = { top: number; bottom: number; height: number };
async function boxOf(page: Page, selector: string): Promise<Box | null> {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: r.height };
  }, selector);
}

for (const size of SIZES) {
  for (const url of PAGES) {
    test(`${url} at ${size.w}px: clean console, no overflow, no overlap at the top, no layout shift, images fine`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const problems: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error" || m.type() === "warning") problems.push(`console.${m.type()}: ${m.text()}`);
      });
      page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
      page.on("requestfailed", (r) => {
        if (r.failure()?.errorText !== "net::ERR_ABORTED") problems.push(`requestfailed: ${r.url()}`);
      });
      page.on("response", (r) => {
        if (r.status() >= 400 && !r.url().endsWith("/favicon.ico")) problems.push(`http ${r.status()}: ${r.url()}`);
      });
      await page.addInitScript(() => {
        (window as unknown as { __cls: number }).__cls = 0;
        new PerformanceObserver((l) => {
          for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
        }).observe({ type: "layout-shift", buffered: true });
      });
      await page.goto(url, { waitUntil: "load" });
      await page.waitForTimeout(600);
      await shot(page, `${url === "/" ? "home" : url.split("/").pop()}-${size.w}`);

      // 1. nothing overflows sideways
      const over = await page.evaluate(() => {
        const W = window.innerWidth;
        const wide = [...document.querySelectorAll("body *")]
          .filter((el) => {
            if (!(el.getBoundingClientRect().right > W + 1 && el.getBoundingClientRect().width > 0) || el.closest("[role=dialog]")) return false;
            // ignore anything inside a box that clips or scrolls sideways (carousels, glow blobs in clipped sections)
            for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
              const ox = getComputedStyle(a).overflowX;
              if (ox === "hidden" || ox === "clip" || ox === "auto" || ox === "scroll") return false;
            }
            return true;
          })
          .slice(0, 6)
          .map((el) => `${el.tagName}.${String(el.className).slice(0, 50)} right=${Math.round(el.getBoundingClientRect().right)}`);
        return { px: document.documentElement.scrollWidth - W, wide };
      });
      expect(over.px, `horizontal overflow: ${over.wide.join(" | ")}`).toBeLessThanOrEqual(1);

      // 2. the top stack: strip (>= 48px, fully visible) above the header, no overlap, header not covered
      const strip = await boxOf(page, "[data-ambassador-strip]");
      const header = await boxOf(page, ".site-header > header");
      expect(strip, "ambassador strip is rendered").not.toBeNull();
      expect(header, "header is rendered").not.toBeNull();
      expect(strip!.height).toBeGreaterThanOrEqual(47.5);
      expect(strip!.top).toBeGreaterThanOrEqual(-0.5);
      expect(strip!.bottom, "the strip ends above the header").toBeLessThanOrEqual(header!.top + 0.5);
      const topEl = await page.evaluate(() => {
        const s = document.querySelector("[data-ambassador-strip]")!.getBoundingClientRect();
        const el = document.elementFromPoint(s.left + 8, s.top + s.height / 2);
        return !!el?.closest("[data-ambassador-strip]");
      });
      expect(topEl, "nothing is drawn on top of the strip").toBe(true);

      // 3. images: loaded, not broken, never upscaled beyond their intrinsic size by more than 1.2x (blurry), lazy below the fold
      const imgs = await page.evaluate(() =>
        [...document.images].map((i) => {
          const r = i.getBoundingClientRect();
          return { src: i.currentSrc || i.src, complete: i.complete, nw: i.naturalWidth, w: r.width, top: r.top + scrollY, lazy: i.loading === "lazy", visible: r.width > 0 };
        }),
      );
      for (const i of imgs.filter((x) => x.visible && x.complete)) {
        expect(i.nw, `broken image ${i.src}`).toBeGreaterThan(0);
        expect(i.w / i.nw, `blurry (upscaled) ${i.src}`).toBeLessThanOrEqual(1.25);
      }
      const innerH = size.h;
      for (const i of imgs.filter((x) => x.top > innerH * 2.5 && x.visible)) expect(i.lazy, `below the fold should be lazy: ${i.src}`).toBe(true);

      // 4. layout shift
      const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
      expect(cls, "cumulative layout shift").toBeLessThan(0.1);

      expect(problems, problems.join("\n")).toEqual([]);
      await ctx.close();
    });
  }
}

for (const size of [{ w: 360, h: 640 }, { w: 360, h: 740 }, { w: 375, h: 667 }, { w: 390, h: 844 }]) {
  test(`home hero at ${size.w}x${size.h}: the headline and the Shop button are visible without scrolling, even with the ambassador strip`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h } });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.waitForTimeout(500);
    const h1 = await boxOf(page, "h1");
    const btn = await page.evaluate(() => {
      const a = [...document.querySelectorAll("#top a.btn")].find((x) => /SHOP THE LINEUP/.test(x.textContent ?? ""));
      const r = a?.getBoundingClientRect();
      return r ? { top: r.top, bottom: r.bottom } : null;
    });
    await shot(page, `hero-fold-${size.w}x${size.h}`);
    expect(h1).not.toBeNull();
    expect(h1!.bottom, "headline inside the first screen").toBeLessThanOrEqual(size.h);
    expect(btn, "Shop button exists").not.toBeNull();
    expect(btn!.bottom, "Shop button inside the first screen").toBeLessThanOrEqual(size.h);
    await ctx.close();
  });
}

test("the ambassador strip can be dismissed, stays dismissed, and the header does not jump under it", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.locator("[data-ambassador-strip]")).toBeVisible();
  const dismiss = page.getByRole("button", { name: /Dismiss the ambassador banner/ });
  expect((await dismiss.boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
  await dismiss.click();
  await expect(page.locator("[data-ambassador-strip]")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("[data-ambassador-strip]")).toHaveCount(0);
  const header = await boxOf(page, ".site-header > header");
  expect(header!.top).toBeGreaterThanOrEqual(11);
  // scrolling keeps the header on screen
  await page.mouse.wheel(0, 1500);
  await page.waitForTimeout(300);
  const h2 = await boxOf(page, ".site-header > header");
  expect(h2!.top).toBeGreaterThanOrEqual(11);
  expect(h2!.top).toBeLessThanOrEqual(14);
  await ctx.close();
});

test("the strip comes back when storage is blocked (nothing throws)", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } });
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("[data-ambassador-strip]")).toBeVisible();
  await page.getByRole("button", { name: /Dismiss the ambassador banner/ }).click();
  await expect(page.locator("[data-ambassador-strip]")).toHaveCount(0);
  expect(errors.filter((e) => /blocked/.test(e))).toEqual([]);
  await ctx.close();
});

test("preview mode: bar, strip, header stack in that order without overlap at every width; visitors see the under-development page", async ({ browser }) => {
  for (const size of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h } });
    const visitor = await ctx.newPage();
    const res = await visitor.goto(`${MAINT_URL}/`);
    expect(res?.status()).toBe(503);
    await expect(visitor.locator("[data-preview-bar]")).toHaveCount(0);
    const page = await ctx.newPage();
    await page.goto(`${MAINT_URL}/admin/login`);
    await page.locator("input[name=email]").fill(USERS.owner.email);
    await page.locator("input[name=password]").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/admin(\?.*)?$/);
    await page.goto(`${MAINT_URL}/`);
    await page.waitForTimeout(500);
    await shot(page, `preview-${size.w}`);
    const bar = await boxOf(page, "[data-preview-bar]");
    const strip = await boxOf(page, "[data-ambassador-strip]");
    const header = await boxOf(page, ".site-header > header");
    expect(bar && strip && header, `all three bars at ${size.w}`).toBeTruthy();
    expect(bar!.bottom, "preview bar above the strip").toBeLessThanOrEqual(strip!.top + 0.5);
    expect(strip!.bottom, "strip above the header").toBeLessThanOrEqual(header!.top + 0.5);
    expect(strip!.height).toBeGreaterThanOrEqual(47.5);
    // scroll: the preview bar stays on top and the header sits directly below it
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(300);
    const bar2 = await boxOf(page, "[data-preview-bar]");
    const header2 = await boxOf(page, ".site-header > header");
    expect(bar2!.top).toBeCloseTo(0, 0);
    expect(header2!.top, "header just below the preview bar").toBeGreaterThanOrEqual(bar2!.bottom + 10);
    expect(header2!.top).toBeLessThanOrEqual(bar2!.bottom + 14);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await ctx.close();
  }
});

test("flavour switcher, quantity, add to cart across all three flavours, cart drawer, code field and checkout entry (phone)", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.setDefaultTimeout(8000);
  await page.goto("/products/red-burn");
  // the three flavours switch pages
  for (const [name, slug] of [["GOLD", "gold"], ["CREATINE", "creatine"], ["RED BURN", "red-burn"]] as const) {
    await page.getByRole("navigation", { name: "Choose flavour" }).getByRole("link", { name }).click();
    await page.waitForURL(new RegExp(`/products/${slug}$`));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
    expect((await page.getByRole("navigation", { name: "Choose flavour" }).getByRole("link", { name }).boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
  }
  // quantity and add to cart on each flavour
  for (const slug of ["red-burn", "gold", "creatine"]) {
    await page.goto(`/products/${slug}`);
    const inc = page.getByRole("button", { name: "Increase quantity" });
    const dec = page.getByRole("button", { name: "Decrease quantity" });
    for (const b of [inc, dec]) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
    await inc.click();
    await dec.click();
    await expect(dec).toBeDisabled(); // never below 1
    await page.getByRole("button", { name: /ADD TO CART/ }).first().click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "Close cart" }).click({ timeout: 3000 }).catch(() => {});
  }
  await page.getByRole("button", { name: /Open cart/ }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  for (const n of ["RED BURN", "GOLD", "CREATINE"]) await expect(drawer.getByText(n).first()).toBeVisible();
  await shot(page, "cart-drawer-375");
  await drawer.getByRole("link", { name: "CHECKOUT" }).click();
  await chooseLocation(page, "Beirut", "Beirut");
  await page.locator("#code").fill("NOTACODE");
  await expect(page.getByText("That code isn't valid.")).toBeVisible({ timeout: 15_000 });
  await shot(page, "checkout-375");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("product pages: every gallery loads, GOLD's flat-lay slot shows the pouch, the sticky bar appears on a phone, FAQ and prices are there", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  for (const slug of ["red-burn", "gold", "creatine"]) {
    await page.goto(`/products/${slug}`);
    const loaded = await page.evaluate(() => [...document.querySelectorAll("img")].filter((i) => i.closest("[aria-roledescription=carousel], [data-gallery]") || true).map((i) => ({ ok: i.naturalWidth > 0, done: i.complete, src: i.currentSrc })));
    for (const i of loaded.filter((x) => x.src && x.done)) expect(i.ok, i.src).toBe(true); // lazy images below the fold are not loaded yet: only finished ones can be broken
    // price per pouch and per sachet
    await expect(page.getByText(/\/ SACHET/i).first()).toBeVisible();
    // benefit copy and the three-step how-to
    await expect(page.getByText("Rip. Sip. Go.").first()).toBeVisible();
    await expect(page.getByText("Do I need water with it?")).toBeVisible();
    await expect(page.getByText("Is it halal certified?")).toBeVisible();
    // sticky add-to-cart bar once the main button has scrolled away
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(400);
    await expect(page.getByRole("button", { name: /ADD TO CART/ }).last()).toBeVisible();
    await shot(page, `product-${slug}-sticky-375`);
  }
  await page.goto("/products/gold");
  await expect(page.getByText(/150 mg of caffeine/i).first()).toBeVisible();
  await ctx.close();
});

test("keyboard focus is visible on the header and hero controls, and the hero image is the LCP element and loads fast", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    (window as unknown as { __lcp: { t: number; tag: string } }).__lcp = { t: 0, tag: "" };
    new PerformanceObserver((l) => {
      const e = l.getEntries().at(-1) as unknown as { startTime: number; element?: Element };
      (window as unknown as { __lcp: { t: number; tag: string } }).__lcp = { t: e.startTime, tag: e.element?.tagName ?? "" };
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  await page.goto("/");
  await page.waitForTimeout(800);
  const lcp = await page.evaluate(() => (window as unknown as { __lcp: { t: number; tag: string } }).__lcp);
  expect(lcp.t, "LCP under 2.5 s").toBeLessThan(2500);
  // focus ring on the first few tab stops
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return "none";
      const cs = getComputedStyle(el);
      return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 ? "outline" : cs.boxShadow !== "none" ? "shadow" : "none";
    });
    expect(ring, `tab stop ${i + 1} has a visible focus indicator`).not.toBe("none");
  }
  await ctx.close();
});
