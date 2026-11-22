import { expect, test } from "@playwright/test";
import { newContext, signIn, targets, VIEWPORTS, writeResults } from "./qa-lib";

/**
 * STEP 6: how fast is every admin list and the dashboard on a phone, with the large data set? A "mobile profile" is emulated through
 * the browser's own throttling: 4x slower CPU, 1.6 Mbit/s down, 150 ms round trip, cache off. Per page we record the load event, first
 * and largest paint, the long tasks (total blocking time), the bytes transferred and an interactive estimate:
 *     interactive ~= max(load event, first contentful paint) + total blocking time
 * It is an estimate from the browser's own metrics (not a lab Lighthouse run) and is labelled that way in the report.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(600_000);

const phone = VIEWPORTS[1];
const BUDGET_MS = 2000;
type Row = { url: string; inv: string; loadMs: number; fcpMs: number; lcpMs: number; tbtMs: number; interactiveMs: number; kb: number; pass: boolean };
const rows: Row[] = [];

test("every admin page on the mobile profile", async ({ browser }) => {
  const ctx = await newContext(browser, phone);
  const page = await ctx.newPage();
  await signIn(page);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  await page.addInitScript(() => {
    (window as any).__qa = { lt: [] as { s: number; d: number }[], fcp: 0, lcp: 0 };
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => (window as any).__qa.lt.push({ s: e.startTime, d: e.duration }))).observe({ type: "longtask", buffered: true });
      new PerformanceObserver((l) => l.getEntries().forEach((e) => e.name === "first-contentful-paint" && ((window as any).__qa.fcp = e.startTime))).observe({ type: "paint", buffered: true });
      new PerformanceObserver((l) => l.getEntries().forEach((e) => ((window as any).__qa.lcp = e.startTime))).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {}
  });

  const list = targets().filter((t) => t.kind === "admin" && !["/admin/print"].includes(t.inv));
  for (const t of list) {
    await page.goto(t.url, { waitUntil: "load" });
    await page.waitForTimeout(1500); // let hydration and the long tasks it causes finish
    const m = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      const q = (window as any).__qa as { lt: { s: number; d: number }[]; fcp: number; lcp: number };
      const bytes = performance.getEntriesByType("resource").reduce((n, r) => n + ((r as PerformanceResourceTiming).transferSize || 0), 0) + (nav.transferSize || 0);
      const tbt = q.lt.filter((x) => x.s >= q.fcp).reduce((n, x) => n + Math.max(0, x.d - 50), 0);
      return { load: nav.loadEventEnd - nav.startTime, fcp: q.fcp, lcp: q.lcp, tbt, kb: Math.round(bytes / 1024) };
    });
    const interactive = Math.max(m.load, m.fcp) + m.tbt;
    rows.push({ url: t.url, inv: t.inv, loadMs: Math.round(m.load), fcpMs: Math.round(m.fcp), lcpMs: Math.round(m.lcp), tbtMs: Math.round(m.tbt), interactiveMs: Math.round(interactive), kb: m.kb, pass: interactive < BUDGET_MS });
    console.log(`${interactive < BUDGET_MS ? "PASS" : "FAIL"} ${t.url} interactive~${Math.round(interactive)}ms load=${Math.round(m.load)} fcp=${Math.round(m.fcp)} tbt=${Math.round(m.tbt)} ${m.kb}KB`);
  }
  writeResults("perf", rows);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  expect(rows.filter((r) => !r.pass).map((r) => `${r.url} ${r.interactiveMs}ms`)).toEqual([]);
});
