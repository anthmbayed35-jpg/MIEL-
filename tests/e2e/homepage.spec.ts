import fs from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { COPY_OFF_URL, ROOT } from "../support/e2e-env";
import { exec, query, stockOf } from "../support/e2e-db";
import { layoutReport, scrollThrough } from "../support/layout-health";

/**
 * THE HOMEPAGE STRUCTURE: the section order (config/homepage.ts), the sections that hide themselves when they have nothing real to show
 * (story film, reviews, gallery, unconfirmed FAQ answers), the header and its shop-by-moment panel, the announcement strip, the hero,
 * ticker, moment cards, lineup, feature panels, flavour explorer tabs, why honey, comparison matrix, usage steps, FAQ with WhatsApp, closing
 * and ambassador bands, footer, and the phone mini cart bar. Also: nothing scarce, and COPY_CLAIMS=off renders a clean page.
 * Screenshots (full page at 390, 768 and 1440) go to ./qa-screenshots/homepage-after.
 */
test.describe.configure({ mode: "default" });
const SHOTS = path.join(ROOT, "qa-screenshots", "homepage-after");
fs.mkdirSync(SHOTS, { recursive: true });
const MEDIA_DIR = path.join(ROOT, ".next", "standalone", "public", "media");

let ip = 40;
const open = async (browser: Browser, w: number, h: number) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, extraHTTPHeaders: { "x-forwarded-for": `198.18.3.${ip++}` } });
  return { ctx, page: await ctx.newPage() };
};
const sections = (page: Page) => page.locator("main > [data-section]").evaluateAll((els) => els.map((e) => e.getAttribute("data-section")));
const WAIT_CACHE = 21_000; // lib/media.ts remembers whether a file exists for 20 s

let stock0 = 0;
test.beforeAll(() => {
  stock0 = stockOf("red-burn");
});
test.afterAll(() => {
  exec("UPDATE inventory_items SET on_hand = ? WHERE product_id = (SELECT id FROM products WHERE slug = 'red-burn')", stock0);
  exec("DELETE FROM pages_content WHERE key IN ('gallery')");
  fs.rmSync(path.join(MEDIA_DIR, "story"), { recursive: true, force: true });
});

test("sections render in the agreed order; story, reviews and gallery are NOT on the page; unconfirmed FAQ answers are hidden", async ({ browser }) => {
  const { ctx, page } = await open(browser, 1440, 900);
  await page.goto("/");
  expect(await sections(page)).toEqual(["hero", "ticker", "moments", "lineup", "features", "explorer", "why-honey", "compare", "usage", "faq", "closing", "ambassador"]);
  for (const id of ["#top", ".ticker", "#moments", "#shop", "#features", "#explorer", "#how-it-works", "#compare", "#usage", "#faq", "#closing", "#ambassadors"]) await expect(page.locator(id), id).toHaveCount(1);
  // hidden means hidden: no section, no wrapper, no heading, no anchor
  for (const id of ["#story", "#community"]) await expect(page.locator(id), id).toHaveCount(0);
  await expect(page.locator("[data-section='story'], [data-section='community']")).toHaveCount(0);
  await expect(page.getByText(/PEOPLE WHO TRAIN|FUELED BY YOU|OUR STORY/)).toHaveCount(0);
  // FAQ: 8 confirmed answers, nothing TBC, ASK US on the store's WhatsApp number
  await expect(page.locator("#faq details")).toHaveCount(8);
  expect(await page.locator("#faq").innerText()).not.toMatch(/TBC/);
  await expect(page.locator("#faq").getByRole("link", { name: "ASK US" })).toHaveAttribute("href", /^https:\/\/wa\.me\/\d+/);
  await ctx.close();
});

test("the story film section appears only when a story video exists", async ({ browser }) => {
  const { ctx, page } = await open(browser, 390, 844);
  fs.mkdirSync(path.join(MEDIA_DIR, "story"), { recursive: true });
  fs.writeFileSync(path.join(MEDIA_DIR, "story", "story.mp4"), Buffer.from("not-a-real-video"));
  await page.waitForTimeout(WAIT_CACHE);
  await page.goto("/");
  await expect(page.locator("#story")).toHaveCount(1);
  expect((await sections(page)).indexOf("story")).toBeGreaterThan((await sections(page)).indexOf("usage"));
  await expect(page.locator("#story video")).toHaveCount(0); // nothing is requested until play is pressed
  await expect(page.locator("#story").getByRole("button", { name: "PLAY THE FILM" })).toBeVisible();
  fs.rmSync(path.join(MEDIA_DIR, "story"), { recursive: true, force: true });
  await page.waitForTimeout(WAIT_CACHE);
  await page.goto("/");
  await expect(page.locator("#story")).toHaveCount(0);
  await ctx.close();
});

test("reviews and the gallery appear only with real approved entries (never placeholders)", async ({ browser }) => {
  const { ctx, page } = await open(browser, 390, 844);
  const before = query<{ value: string }>("SELECT value FROM pages_content WHERE key = 'testimonials'")[0]?.value;
  exec("INSERT OR REPLACE INTO pages_content (key, value, version) VALUES ('testimonials', ?, 1)", JSON.stringify([
    { id: "t1", name: "A real customer", text: "Approved words from a real customer.", rating: 0, approved: true },
    { id: "t2", name: "Not approved", text: "This one is waiting for approval.", rating: 0, approved: false },
  ]));
  exec("INSERT OR REPLACE INTO pages_content (key, value, version) VALUES ('gallery', ?, 1)", JSON.stringify([
    { id: "g1", src: "/media/lifestyle/gold-1-4x5.webp", alt: "A customer's training photo", credit: "@someone", approved: true },
    { id: "g2", src: "/media/lifestyle/gold-2-4x5.webp", alt: "Not approved", approved: false },
  ]));
  await page.goto("/");
  await expect(page.locator("#community")).toHaveCount(1);
  await expect(page.locator("#community")).toContainText("Approved words from a real customer.");
  await expect(page.locator("#community")).not.toContainText("waiting for approval");
  await expect(page.locator("#community ul.grid > li")).toHaveCount(1); // only the approved photo
  expect((await sections(page)).indexOf("community")).toBeGreaterThan((await sections(page)).indexOf("usage"));
  // back to nothing: gone again
  if (before) exec("UPDATE pages_content SET value = ? WHERE key = 'testimonials'", before);
  else exec("DELETE FROM pages_content WHERE key = 'testimonials'");
  exec("DELETE FROM pages_content WHERE key = 'gallery'");
  await page.goto("/");
  await expect(page.locator("#community")).toHaveCount(0);
  await ctx.close();
});

test("announcement strip, header and the shop-by-moment panel (desktop)", async ({ browser }) => {
  const { ctx, page } = await open(browser, 1440, 900);
  await page.goto("/");
  await expect(page.locator("[data-announcement-strip]")).toHaveText("FUEL THE GRIND · DELIVERY ACROSS LEBANON · HALAL CERTIFIED");
  const nav = page.getByRole("navigation", { name: "Primary" });
  for (const n of ["SHOP", "MOMENTS", "HOW IT WORKS", "FAQ"]) await expect(nav.getByText(n, { exact: true })).toBeVisible();
  await nav.getByRole("button", { name: "SHOP" }).click();
  const panel = page.locator("#shop-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("SHOP BY MOMENT")).toBeVisible();
  for (const [name, cue] of [["GOLD", "BEFORE THE WORK"], ["RED BURN", "THE LONG PUSH"], ["CREATINE", "EVERY DAY"]]) {
    const card = panel.getByRole("link", { name: new RegExp(`${name}.*${cue}`, "i") });
    await expect(card, name).toBeVisible();
    await expect(card).toHaveAttribute("href", /\/products\//);
  }
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  // cart drawer: line items, subtotal, delivery note, checkout
  await page.locator("#shop").getByRole("button", { name: /Add RED BURN to cart/ }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("RED BURN");
  await expect(drawer).toContainText(/Delivery \$5 across Lebanon/);
  await expect(drawer.getByRole("link", { name: "CHECKOUT" })).toBeVisible();
  await ctx.close();
});

test("phone: menu with the same links and cards; hero facts, buttons and anchors", async ({ browser }) => {
  const { ctx, page } = await open(browser, 390, 844);
  await page.goto("/");
  await page.getByRole("button", { name: "MENU" }).click();
  const menu = page.locator("#mobile-menu");
  await expect(menu).toBeVisible();
  for (const n of ["MOMENTS", "HOW IT WORKS", "FAQ"]) await expect(menu.getByRole("link", { name: n })).toBeVisible();
  await expect(menu.getByRole("link", { name: /GOLD.*BEFORE THE WORK/i })).toBeVisible();
  for (const l of await menu.getByRole("link").all()) expect((await l.boundingBox())!.height, "tap target").toBeGreaterThanOrEqual(47.5);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  // hero
  const h1 = await page.locator("h1").evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(h1).toBeGreaterThanOrEqual(28);
  expect(h1).toBeLessThanOrEqual(38);
  const facts = page.locator("#top").getByRole("list", { name: "Key facts" });
  for (const f of ["HALAL CERTIFIED", "12 SACHETS PER POUCH", "NO SCOOP", "NO MIXING"]) await expect(facts).toContainText(f);
  expect(await page.locator("#top").innerText()).not.toMatch(/athletes?\b|\d+\s*(sold|customers|reviews)|rated|stars?\b/i);
  await page.locator("#top").getByRole("link", { name: "FIND YOUR MOMENT" }).click();
  await expect(page).toHaveURL(/#moments$/);
  await expect(page.locator("#moments")).toBeInViewport();
  await ctx.close();
});

test("ticker: acid band, confirmed facts only, pauses on hover and touch", async ({ browser }) => {
  const { ctx, page } = await open(browser, 1440, 900);
  await page.goto("/");
  const t = page.locator(".ticker");
  await expect(t).toHaveCSS("background-color", "rgb(218, 252, 105)");
  for (const f of ["HALAL CERTIFIED", "STIM-FREE (RED BURN)", "RAW HONEY", "NO MIXING", "NO SCOOP", "12 SACHETS PER POUCH"]) await expect(t.getByText(f).first()).toBeAttached();
  await t.hover();
  await expect(page.locator(".ticker-track")).toHaveCSS("animation-play-state", "paused");
  await ctx.close();
});

test("moment cards: three 4:5 photo cards with descriptor, why-today and SHOP link; hover tints the border with the flavour colour", async ({ browser }) => {
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const { ctx, page } = await open(browser, w, h);
    await page.goto("/");
    const cards = page.locator("#moments ul > li a");
    await expect(cards).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const b = (await cards.nth(i).boundingBox())!;
      expect(b.width / b.height, `card ${i} at ${w}px is 4:5`).toBeGreaterThan(0.78);
      expect(b.width / b.height).toBeLessThan(0.82);
    }
    const gold = cards.nth(0);
    await expect(gold).toContainText("BEFORE THE WORK");
    await expect(gold).toContainText("Energy and focus");
    await expect(gold).toContainText("Your next session is the reason.");
    await expect(gold).toContainText("SHOP GOLD");
    if (w === 1440) {
      await gold.hover();
      await expect(gold).toHaveCSS("border-top-color", "rgb(245, 180, 0)");
    }
    await ctx.close();
  }
});

test("lineup: three cards, the image swaps to the sachet, price per pouch and per sachet, add to cart", async ({ browser }) => {
  const { ctx, page } = await open(browser, 390, 844);
  await page.goto("/");
  const cards = page.locator("#shop ul.gap-6 > li");
  await expect(cards).toHaveCount(3);
  const red = cards.filter({ hasText: "RED BURN" });
  const txt = await red.innerText();
  const pouch = Number(txt.match(/\$(\d+(?:\.\d+)?)\s*per pouch/i)![1]); // from the store settings, whatever they are now
  const sachet = Number(txt.match(/\$(\d+\.\d\d)\s*per sachet/i)![1]);
  expect(sachet).toBeCloseTo(Math.round((pouch / 12) * 100) / 100, 2);
  await expect(red).toContainText("22G");
  const swap = red.getByRole("button", { name: "Show the open sachet" });
  expect((await swap.boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
  await swap.click();
  await expect(swap).toHaveAttribute("aria-pressed", "true");
  await expect(red.locator("img[src*='sachet-open']").first()).toBeAttached();
  await red.getByRole("button", { name: /Add RED BURN to cart/ }).click();
  await expect(page.getByRole("button", { name: /Open cart, 1 items/ })).toBeAttached();
  await ctx.close();
});

test("feature panels carry only confirmed numbers; no TBC anywhere in them", async ({ browser }) => {
  const { ctx, page } = await open(browser, 1440, 900);
  await page.goto("/");
  const f = page.locator("#features");
  await expect(f.locator("section")).toHaveCount(3);
  await expect(f.locator("section").nth(0)).toContainText(/150\s*mg/);
  await expect(f.locator("section").nth(0)).toContainText("caffeine + L-theanine");
  await expect(f.locator("section").nth(1)).toContainText(/22\s*g/);
  await expect(f.locator("section").nth(2)).toContainText(/5\s*g/);
  expect(await f.innerText()).not.toMatch(/TBC/);
  await ctx.close();
});

test("flavour explorer is a tablist: arrow keys switch, the panel swaps, nothing TBC is shown", async ({ browser }) => {
  const { ctx, page } = await open(browser, 390, 844);
  await page.goto("/");
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(3);
  await expect(page.getByRole("tablist")).toBeVisible();
  const first = tabs.nth(0);
  await first.focus();
  await expect(first).toHaveAttribute("aria-selected", "true");
  const before = await page.getByRole("tabpanel").innerText();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(1)).toBeFocused();
  expect(await page.getByRole("tabpanel").innerText()).not.toBe(before);
  await page.keyboard.press("End");
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  for (let i = 0; i < 3; i++) {
    await tabs.nth(i).click();
    const panel = page.getByRole("tabpanel");
    expect(await panel.innerText(), `tab ${i}`).not.toMatch(/TBC/);
    await expect(panel).toHaveAttribute("aria-labelledby", /^tab-/);
  }
  for (let i = 0; i < 3; i++) expect((await tabs.nth(i).boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
  await ctx.close();
});

test("why honey: four numbered cards with line illustrations; usage: four numbered steps", async ({ browser }) => {
  const { ctx, page } = await open(browser, 390, 844);
  await page.goto("/");
  const cards = page.locator("#how-it-works ol > li");
  await expect(cards).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    await expect(cards.nth(i)).toContainText(`0${i + 1}/04`);
    await expect(cards.nth(i).locator("svg")).toHaveCount(1);
  }
  await expect(page.locator("#how-it-works")).toContainText("No mixing. No scoop.");
  await expect(page.locator("#usage ol > li")).toHaveCount(4);
  for (const l of ["BEFORE", "DURING", "EVERY DAY", "ON THE GO"]) await expect(page.locator("#usage")).toContainText(l);
  await ctx.close();
});

test("comparison matrix: factual rows, no brand names, scrolls sideways on a phone with a sticky first column", async ({ browser }) => {
  const { ctx, page } = await open(browser, 390, 844);
  await page.goto("/");
  const region = page.locator("#compare [role='region']");
  await expect(region).toBeVisible();
  for (const c of ["MIEL+", "ENERGY GELS", "ENERGY DRINKS", "PRE-WORKOUT", "COFFEE"]) await expect(page.locator("#compare th", { hasText: c })).toBeVisible();
  for (const r of ["Fits in a pocket", "No scoop or mixing", "Halal certified", "Stim-free option", "Flavours"]) await expect(page.locator("#compare")).toContainText(r);
  expect(await page.locator("#compare").innerText()).not.toMatch(/\b(better|best|worse|worst|cheap|dangerous|unhealthy)\b/i);
  const scroll = await region.evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
  expect(scroll.sw).toBeGreaterThan(scroll.cw); // sideways scroll
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1); // but the page itself does not
  const pos = await page.locator("#compare tbody th").first().evaluate((e) => getComputedStyle(e).position);
  expect(pos).toBe("sticky");
  await region.evaluate((e) => (e.scrollLeft = 200));
  const left = await page.locator("#compare tbody th").first().evaluate((e) => e.getBoundingClientRect().left);
  const cont = await region.evaluate((e) => e.getBoundingClientRect().left);
  expect(Math.abs(left - cont)).toBeLessThan(2); // the first column stays put
  await ctx.close();
});

test("closing band, ambassador band and footer", async ({ browser }) => {
  const { ctx, page } = await open(browser, 1440, 900);
  await page.goto("/");
  await expect(page.locator("#closing")).toContainText(/Fuel the\s*grind/i);
  await expect(page.locator("#closing").getByRole("link", { name: "SHOP NOW" })).toHaveAttribute("href", "/#shop");
  await expect(page.locator("#ambassadors")).toContainText("Run with");
  await expect(page.locator("#ambassadors").getByRole("link", { name: "APPLY" })).toHaveAttribute("href", "/ambassadors");
  expect(await page.locator("#ambassadors").innerText()).not.toMatch(/\$|%|commission|earn|level|perk|reward/i);
  const foot = page.locator("footer");
  for (const col of ["Shop", "Help", "Company", "Contact"]) await expect(foot.getByRole("navigation", { name: col }).or(foot.getByText(col, { exact: true })).first()).toBeVisible();
  await expect(foot).toContainText("HALAL CERTIFIED");
  await expect(foot).toContainText("cash on delivery");
  await expect(foot.getByRole("link", { name: /Instagram/ })).toBeVisible();
  await expect(foot.locator("input")).toHaveCount(0); // no newsletter field (mail is optional): a WhatsApp link instead
  await expect(foot.getByRole("link", { name: "Join on WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\//);
  await expect(foot).toContainText(/check with your doctor first/);
  await ctx.close();
});

test("phone: the mini add-to-cart bar appears after the lineup scrolls past, is under 56px, and adds to the cart; none on desktop", async ({ browser }) => {
  const { ctx, page } = await open(browser, 390, 844);
  await page.goto("/");
  const bar = page.locator("div.fixed:has(select[aria-label='Choose a flavour'])");
  await expect(bar).toHaveAttribute("aria-hidden", "true"); // at the top it is out of the way
  await page.evaluate(() => window.scrollTo(0, document.getElementById("features")!.getBoundingClientRect().top + window.scrollY));
  await expect(bar).toHaveAttribute("aria-hidden", "false");
  const box = (await bar.boundingBox())!;
  expect(box.height).toBeLessThan(56);
  await bar.getByRole("button", { name: "ADD TO CART" }).click();
  await expect(page.getByRole("button", { name: /Open cart, 1 items/ })).toBeAttached();
  await ctx.close();
  const d = await open(browser, 1440, 900);
  await d.page.goto("/");
  await expect(d.page.getByRole("combobox", { name: "Choose a flavour" })).toBeHidden();
  await d.ctx.close();
});

test("COPY_CLAIMS=off renders a clean homepage with the same structure and no blank gaps", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { "x-forwarded-for": "198.18.3.250" } });
  const page = await ctx.newPage();
  await page.goto(COPY_OFF_URL + "/");
  expect(await sections(page)).toEqual(["hero", "ticker", "moments", "lineup", "features", "explorer", "why-honey", "compare", "usage", "faq", "closing", "ambassador"]);
  await scrollThrough(page);
  const report = await layoutReport(page);
  expect(report, report.join("\n")).toEqual([]);
  const text = await page.evaluate(() => document.body.innerText);
  expect(text).toMatch(/HONEY FOR TRAINING/i);
  expect(text).toMatch(/Honey for work|Honey for distance|Creatine, no scoop/i);
  expect(text).not.toMatch(/alert and focused|quick carbs|builds up in your muscles|fast-digesting/i); // the claims wording is gone
  await ctx.close();
});

test("no scarcity, offer, countdown or forbidden wording on the rendered home page", async ({ browser }) => {
  const { ctx, page } = await open(browser, 1440, 900);
  await page.goto("/");
  const text = (await page.evaluate(() => document.body.innerText)).split("RED BURN").join("RED ");
  expect(text).not.toMatch(/\b(pouches? left|only \d+ left|limited|hurry|last chance|selling fast|countdown|% off|discount|sale|offer)\b/i);
  expect(text).not.toMatch(/\b(burn\w*|fat loss|lose weight|muscle gain|cure[sd]?|treat\w*|prevent\w*|guarantee\w*|boost\w*|transform\w*)\b/i);
  await ctx.close();
});

for (const w of [390, 768, 1440]) {
  test(`full-page screenshot, no overflow, clipping, overlap or blank gaps at ${w}px`, async ({ browser }) => {
    const { ctx, page } = await open(browser, w, w === 1440 ? 900 : w === 768 ? 1024 : 844);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await scrollThrough(page);
    const report = await layoutReport(page);
    expect(report, report.join("\n")).toEqual([]);
    const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.currentSrc && i.naturalWidth === 0).map((i) => i.currentSrc));
    expect(broken).toEqual([]);
    await page.screenshot({ path: path.join(SHOTS, `home_${w}_full.png`), fullPage: true });
    await ctx.close();
  });
}
