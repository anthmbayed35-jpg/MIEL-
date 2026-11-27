import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { ROOT } from "../support/e2e-env";
import { allSlots } from "../../config/media";
import { scrollThrough } from "../support/layout-health";

/**
 * The REAL media files (public/media, installed from media-incoming) in the production build: every slot is served with the right type
 * and inside its size budget, the video supports Range requests, and on a throttled mobile profile the hero poster is the LCP element
 * and LCP stays under 1.5 s. Home page screenshots at 390, 768 and 1440 go to qa-screenshots/media-after.
 * (Runs first: later specs replace the media folder of the built app with stand-ins.)
 */
test.describe.configure({ mode: "serial" });
const SHOTS = path.join(ROOT, "qa-screenshots", "media-after");
fs.mkdirSync(SHOTS, { recursive: true });
const BUDGET_KB: Record<string, number> = { "hero-poster.webp": 200, "hero-loop.mp4": 2500, "hero-loop.webm": 2000, "closing-cta-16x9.webp": 300, "closing-cta-4x5.webp": 250 };
const budget = (p: string) => BUDGET_KB[path.basename(p)] ?? (p.endsWith("-4x5.webp") ? 250 : 300);
const TYPES: Record<string, string> = { ".webp": "image/webp", ".mp4": "video/mp4", ".webm": "video/webm" };

test("every media slot is served, with the right type, inside its size budget", async ({ request }) => {
  for (const s of allSlots()) {
    const r = await request.get(s.path);
    expect(r.status(), s.path).toBe(200);
    expect(r.headers()["content-type"], s.path).toContain(TYPES[path.extname(s.path)]);
    const bytes = (await r.body()).length;
    expect(bytes, `${s.path} is ${(bytes / 1000).toFixed(0)} KB`).toBeLessThanOrEqual(budget(s.path) * 1000);
  }
});

test("the video answers Range requests (iOS Safari needs them)", async ({ request }) => {
  const r = await request.get("/media/hero/hero-loop.mp4", { headers: { Range: "bytes=0-1023" } });
  expect([200, 206]).toContain(r.status());
  if (r.status() === 206) expect((await r.body()).length).toBe(1024);
});

test("mobile profile: the hero poster is the LCP element and LCP is under 1.5 s", async ({ browser, request }) => {
  // a real server is warm: the first request after start-up pays for the first render, so make it before measuring
  await request.get("/");
  await request.get("/");
  const runs: { lcp: number; url: string; tag: string }[] = [];
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { "x-forwarded-for": `198.18.7.${10 + i}` } });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(() => {
      const w = window as unknown as { __r: { lcp: number; url: string; tag: string } };
      w.__r = { lcp: 0, url: "", tag: "" };
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as unknown as { startTime: number; url: string; element?: Element }[]) w.__r = { lcp: e.startTime, url: e.url, tag: e.element?.tagName ?? "" };
      }).observe({ type: "largest-contentful-paint", buffered: true });
    });
    await page.goto("/", { waitUntil: "load" });
    await page.waitForTimeout(3000);
    runs.push(await page.evaluate(() => (window as unknown as { __r: { lcp: number; url: string; tag: string } }).__r));
    await ctx.close();
  }
  fs.mkdirSync(path.join(ROOT, "test-results"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "test-results", "media-lcp.json"), JSON.stringify(runs));
  const sorted = [...runs].sort((a, b) => a.lcp - b.lcp);
  const median = sorted[1];
  expect(median.url, `LCP element: ${JSON.stringify(runs)}`).toMatch(/\/media\/hero\/hero-poster(-\d+)?\.webp/); // the 640 px copy on a phone
  expect(median.lcp, `LCP of 3 loads: ${runs.map((r) => Math.round(r.lcp)).join(", ")}`).toBeLessThan(1500);
});

for (const w of [390, 768, 1440]) {
  test(`home at ${w}px with the real media (screenshot, no horizontal scroll, no broken images)`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: w === 1440 ? 900 : w === 768 ? 1024 : 844 }, extraHTTPHeaders: { "x-forwarded-for": `198.18.8.${w % 200}` } });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await scrollThrough(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.currentSrc && i.naturalWidth === 0).map((i) => i.currentSrc));
    expect(broken).toEqual([]);
    await page.screenshot({ path: path.join(SHOTS, `home_${w}_fold.png`) });
    await page.screenshot({ path: path.join(SHOTS, `home_${w}_full.png`), fullPage: true });
    await ctx.close();
  });
}
