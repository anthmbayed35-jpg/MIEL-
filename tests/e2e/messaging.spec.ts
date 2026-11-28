import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { BASE_URL, COPY_OFF_URL, ROOT } from "../support/e2e-env";
import { layoutReport } from "../support/layout-health";

/**
 * FINAL MESSAGING PASS: the homepage and the three product pages at 360, 390 and 1440 px, in BOTH copy modes (default and
 * COPY_CLAIMS=off, a second server on the same build). Checks the agreed words are there, nothing scarce or offer-like shows,
 * and there is no horizontal overflow, clipped text, overlapping text or blank gap. Screenshots go to ./qa-screenshots (git-ignored).
 */
const SHOTS = path.join(ROOT, "qa-screenshots", "after");
fs.mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = [
  { w: 360, h: 740 },
  { w: 390, h: 844 },
  { w: 1440, h: 900 },
];
const MODES = [
  { name: "claims-on", base: BASE_URL, ip: "198.51.100.10" },
  { name: "claims-off", base: COPY_OFF_URL, ip: "198.51.100.11" },
];
const PAGES = [
  { path: "/", id: "home" },
  { path: "/products/gold", id: "gold" },
  { path: "/products/creatine", id: "creatine" },
  { path: "/products/red-burn", id: "red-burn" },
];

const WORDS: Record<string, { on: RegExp[]; off: RegExp[] }> = {
  home: {
    on: [/HONEY FOR PERFORMANCE/i, /FUEL THE\s+GRIND/i, /quick carbs, the exact dose, nothing to mix/i, /BEFORE THE WORK/i, /THE LONG PUSH/i, /EVERY DAY/i, /NO SCOOP/i, /12 sachets per pouch/i, /ON THE GO/i, /FIND YOUR MOMENT/i, /Fuel the\s+grind/i],
    off: [/HONEY FOR TRAINING/i, /FUEL THE\s+GRIND/i, /dose already set/i, /BEFORE THE WORK/i, /Stim-free pomegranate-and-beet honey\. No caffeine\. No mixing\./i, /5 g of creatine per sachet\. No scoop\./i, /FIND YOUR MOMENT/i, /Fuel the\s+grind/i],
  },
  gold: { on: [/HONEY FOR ENERGY AND FOCUS/i, /TAKE IT BEFORE THE WORK/i, /Your next session is the reason\./i, /Car park/i, /Measure, mix, wait/i], off: [/HONEY FOR THE WORK/i, /150 mg caffeine and L-theanine in vanilla honey\. Rip it open in the car park\./i, /Your next session is the reason\./i] },
  creatine: { on: [/HONEY FOR STRENGTH/i, /ONE SACHET\. EVERY DAY\./i, /Creatine builds up in your muscles/i, /Same time daily/i], off: [/CREATINE NO SCOOP/i, /5 g of creatine per sachet\. No scoop\. No shaker\. No clumps\./i] },
  "red-burn": { on: [/HONEY FOR ENDURANCE/i, /BUILT FOR THE LONG PUSH/i, /Try it on a training day, not on race day\./i, /Long run/i], off: [/HONEY FOR DISTANCE/i, /Stim-free pomegranate-and-beet honey\. No caffeine\. No mixing\./i] },
};

async function scrollThrough(page: Page) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 500) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(60);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}

for (const mode of MODES) {
  for (const vp of VIEWPORTS) {
    for (const pg of PAGES) {
      test(`${mode.name} ${vp.w}px ${pg.id}: words, no scarcity, no overflow, clipping, overlap or gaps`, async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, extraHTTPHeaders: { "x-forwarded-for": mode.ip } });
        const page = await ctx.newPage();
        const res = await page.goto(mode.base + pg.path);
        expect(res?.status()).toBe(200);
        await page.evaluate(() => document.fonts.ready);
        await scrollThrough(page);

        // the agreed words are there
        const text = await page.evaluate(() => document.body.innerText);
        for (const re of WORDS[pg.id][mode.name === "claims-on" ? "on" : "off"]) expect(text, String(re)).toMatch(re);
        // nothing scarce, no offer bar, no countdown
        expect(text).not.toMatch(/pouches? left|only \d+ left|limited|launch offer|countdown|hurry|selling fast|last chance/i);
        // no banned claim wording anywhere in what is rendered (RED BURN is the product name)
        expect(text.split("RED BURN").join("RED ")).not.toMatch(/\b(burn\w*|fat loss|lose weight|muscle gain|cure|treat\w*|prevent\w*|guarantee\w*|boost\w*|transform\w*)\b/i);

        // layout health
        const report = await layoutReport(page);
        expect(report, report.join("\n")).toEqual([]);

        // phones: the pouch and the headline share the first screen on the home page
        if (pg.id === "home" && vp.w < 700) {
          const box = await page.evaluate(() => {
            const h1 = document.querySelector("h1")!.getBoundingClientRect();
            const pouch = document.querySelector("#top .glass picture")?.getBoundingClientRect();
            return { h1Top: h1.top, h1Bottom: h1.bottom, pouchTop: pouch?.top ?? 0, vh: window.innerHeight };
          });
          expect(box.pouchTop).toBeLessThan(box.h1Top); // the pouch comes first
          expect(box.h1Top, "the headline starts on the first screen").toBeLessThan(box.vh);
        }

        await page.screenshot({ path: path.join(SHOTS, `${mode.name}_${vp.w}_${pg.id}.png`), fullPage: true });
        await ctx.close();
      });
    }
  }
}
