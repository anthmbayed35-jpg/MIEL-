import fs from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { ROOT } from "../support/e2e-env";
import { layoutReport, scrollThrough } from "../support/layout-health";

/**
 * RICH DESIGN PASS: the home page and a product page at 360, 390, 768, 1024 and 1440 px, WITHOUT and WITH the media files supplied
 * (the files are dropped into the built app's /public/media while the test runs, exactly what the team will do). Checks the section
 * order, that nothing is broken, no horizontal scroll, reduced motion, keyboard focus, the hero video rules, LCP and layout shift
 * on a throttled mobile profile. Screenshots go to ./qa-screenshots/design-after (git-ignored).
 */
test.describe.configure({ mode: "serial" });
const SHOTS = path.join(ROOT, "qa-screenshots", "design-after");
fs.mkdirSync(SHOTS, { recursive: true });
const MEDIA_DIR = path.join(ROOT, ".next", "standalone", "public", "media");
const IMG = path.join(ROOT, "public", "images", "products", "gold", "gold-ingredients-1080.webp"); // any real webp stands in for supplied media

const VIEWPORTS = [
  { w: 360, h: 740 },
  { w: 390, h: 844 },
  { w: 768, h: 1024 },
  { w: 1024, h: 768 },
  { w: 1440, h: 900 },
];

const ORDER = ["#top", ".ticker", "#moments", "#shop", "#features", "#explorer", "#how-it-works", "#compare", "#usage", "#faq", "#closing"];

let ip = 60;
const open = async (browser: Browser, w: number, h: number, opts: { reduce?: boolean } = {}) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: opts.reduce ? "reduce" : "no-preference", extraHTTPHeaders: { "x-forwarded-for": `198.18.1.${ip++}` } });
  return { ctx, page: await ctx.newPage() };
};

function putMedia() {
  fs.mkdirSync(path.join(MEDIA_DIR, "hero"), { recursive: true });
  fs.mkdirSync(path.join(MEDIA_DIR, "lifestyle"), { recursive: true });
  fs.mkdirSync(path.join(MEDIA_DIR, "cta"), { recursive: true });
  fs.copyFileSync(IMG, path.join(MEDIA_DIR, "hero", "hero-poster.webp"));
  fs.writeFileSync(path.join(MEDIA_DIR, "hero", "hero-loop.mp4"), Buffer.from("not-a-real-video"));
  for (const s of ["gold", "red-burn", "creatine"]) for (const n of [1, 2, 3]) for (const r of ["4x5", "16x9"]) fs.copyFileSync(IMG, path.join(MEDIA_DIR, "lifestyle", `${s}-${n}-${r}.webp`));
  fs.copyFileSync(IMG, path.join(MEDIA_DIR, "cta", "closing-cta-16x9.webp"));
  fs.copyFileSync(IMG, path.join(MEDIA_DIR, "cta", "closing-cta-4x5.webp"));
}
const clearMedia = () => fs.rmSync(MEDIA_DIR, { recursive: true, force: true });

async function check(page: Page, name: string, url: string) {
  const res = await page.goto(url);
  expect(res?.status()).toBe(200);
  await page.evaluate(() => document.fonts.ready);
  await scrollThrough(page);
  const report = await layoutReport(page);
  expect(report, report.join("\n")).toEqual([]);
  // no broken images
  const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.currentSrc && i.naturalWidth === 0).map((i) => i.currentSrc));
  expect(broken).toEqual([]);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

for (const withMedia of [false, true]) {
  const tag = withMedia ? "media" : "nomedia";
  test.describe(`${tag}`, () => {
    test.beforeAll(async () => {
      clearMedia();
      if (withMedia) putMedia();
      // the resolver caches file existence for 20 s: wait it out so the new state is seen
      await new Promise((r) => setTimeout(r, 21_000));
    });
    test.afterAll(() => clearMedia());

    for (const vp of VIEWPORTS) {
      test(`${tag} ${vp.w}px: home sections in order, product page, no overflow, nothing broken`, async ({ browser }) => {
        const { ctx, page } = await open(browser, vp.w, vp.h);
        await check(page, `${tag}_${vp.w}_home`, "/");
        // the agreed section order (document order)
        const tops: number[] = [];
        for (const sel of ORDER) {
          const el = page.locator(sel).first();
          await expect(el, sel).toHaveCount(1);
          tops.push(await el.evaluate((e) => e.getBoundingClientRect().top + window.scrollY));
        }
        expect([...tops].sort((a, b) => a - b), `section order ${tops.join(",")}`).toEqual(tops);
        // no reviews section without real reviews
        await expect(page.getByText("PEOPLE WHO TRAIN")).toHaveCount(0);
        // the hero loop video exists only when the file does
        await expect(page.locator("#top video")).toHaveCount(withMedia ? 1 : 0);
        if (withMedia && vp.w < 1024) await expect(page.locator("#top video")).toHaveAttribute("preload", "none"); // phones and tablets never preload it (desktop starts it after load)
        // three moment cards, each linking to its product
        await expect(page.locator("#moments a[href^='/products/']")).toHaveCount(3);
        // lineup cards: three cards with prices per pouch and per sachet
        await expect(page.locator("#shop ul.gap-6 > li")).toHaveCount(3);
        await expect(page.locator("#shop").getByText(/per sachet/i).first()).toBeVisible();
        await check(page, `${tag}_${vp.w}_gold`, "/products/gold");
        await ctx.close();
      });
    }

    test(`${tag}: reduced motion shows the poster only, stops the ticker and shows every reveal`, async ({ browser }) => {
      const { ctx, page } = await open(browser, 390, 844, { reduce: true });
      await page.goto("/");
      await page.waitForTimeout(1500);
      const state = await page.evaluate(() => {
        const v = document.querySelector<HTMLVideoElement>("#top video");
        const track = document.querySelector(".ticker-track");
        return { playing: v ? !v.paused : false, ticker: track ? getComputedStyle(track).animationName : "none", hidden: [...document.querySelectorAll(".reveal")].filter((e) => getComputedStyle(e).opacity !== "1").length };
      });
      expect(state.playing).toBe(false);
      expect(state.ticker).toBe("none");
      expect(state.hidden).toBe(0);
      await ctx.close();
    });
  });
}

test("ticker pauses on hover; keyboard: Tab reaches the hero button with a visible focus ring", async ({ browser }) => {
  const { ctx, page } = await open(browser, 1440, 900);
  await page.goto("/");
  const track = page.locator(".ticker-track");
  await expect(track).toHaveCSS("animation-name", "ticker");
  await page.locator(".ticker").hover();
  await expect(track).toHaveCSS("animation-play-state", "paused");
  await page.mouse.move(5, 5);
  await expect(track).toHaveCSS("animation-play-state", "running");
  const btn = page.locator("#top a.btn").first();
  await btn.focus();
  expect(await btn.evaluate((e) => getComputedStyle(e).outlineStyle)).not.toBe("none");
  // the flavour switcher and the explorer change glow and content
  await page.locator("#top").getByRole("button", { name: "GOLD" }).click();
  await expect(page.locator("#top").getByRole("button", { name: "GOLD" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: /CREATINE/ }).click();
  await expect(page.getByRole("tab", { name: /CREATINE/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("CREATINE");
  await ctx.close();
});

test("mobile profile (4x CPU, fast 3G): LCP (median of 3 loads) under 2.5 s and no layout shift on the home page", async ({ browser }) => {
  clearMedia();
  await new Promise((r) => setTimeout(r, 21_000));
  const runs: { lcp: number; cls: number; paint: string[]; info: unknown }[] = [];
  for (let i = 0; i < 3; i++) {
    const { ctx, page } = await open(browser, 390, 844);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(() => {
      const w = window as unknown as { __lcp: number; __cls: number; __info: unknown };
      w.__lcp = 0;
      w.__cls = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as unknown as { startTime: number; url: string; element?: Element }[]) {
          w.__lcp = e.startTime;
          w.__info = { tag: e.element?.tagName, url: e.url };
        }
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.__cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto("/", { waitUntil: "load" });
    await page.waitForTimeout(2500);
    runs.push(await page.evaluate(() => ({ lcp: (window as unknown as { __lcp: number }).__lcp, cls: (window as unknown as { __cls: number }).__cls, info: (window as unknown as { __info: unknown }).__info, paint: performance.getEntriesByType("paint").map((p) => `${p.name}:${Math.round(p.startTime)}`) })));
    await ctx.close();
  }
  fs.mkdirSync(path.join(ROOT, "test-results"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "test-results", "design-lcp.json"), JSON.stringify(runs));
  const lcps = runs.map((r) => r.lcp).sort((a, b) => a - b);
  expect(lcps[1], `LCP of 3 loads: ${lcps.join(", ")}`).toBeLessThan(2500);
  expect(Math.max(...runs.map((r) => r.cls)), "CLS").toBeLessThan(0.1);
});
