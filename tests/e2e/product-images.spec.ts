import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { products } from "../../config/products";
import { ROOT } from "../support/e2e-env";

/**
 * The photos of all three flavours on the home page and on the GOLD / CREATINE product pages: hero lineup with a flavour
 * switcher, one ingredients band per flavour, the four-slot gallery, swipe on a phone, tap targets, explicit width/height,
 * lazy vs prioritised loading, glow colours, and that the unpublished GOLD flat lay is never requested.
 * Also records what an image costs on a phone (test-results/image-weight.json).
 */
test.describe.configure({ mode: "default" });

const FLAVOURS = ["red-burn", "gold", "creatine"] as const;
const NAME: Record<string, string> = { "red-burn": "RED BURN", gold: "GOLD", creatine: "CREATINE" };
const loaded = (page: Page, sel: string) => page.locator(sel).first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);

function spyRequests(page: Page) {
  const urls: string[] = [];
  page.on("request", (r) => urls.push(r.url()));
  return urls;
}
/** Preloaded PRODUCT photos (the brand logos are preloaded by the layout as before). */
const productPreloads = (page: Page) =>
  page.locator("link[rel=preload][as=image]").evaluateAll((els) => els.map((l) => (l.getAttribute("href") ?? "") + (l.getAttribute("imagesrcset") ?? "")).filter((v) => v.includes("/images/products/")));

async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
  });
  await page.waitForTimeout(500);
}

test.describe("home page", () => {
  test("the hero shows RED BURN first and switches between all three flavours, with each flavour's glow", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator("section#top");
    const imgs = hero.locator("img[src*='/images/products/']");
    expect(await imgs.count()).toBe(3); // one per flavour, only one visible
    await expect(hero.locator("img[src*='red-burn-pouch-hero']")).toBeVisible();
    await expect(hero.locator("img[src*='gold-pouch-hero']")).toBeHidden();
    const group = page.getByRole("group", { name: "Choose a flavour" });
    for (const [slug, rgb] of [["gold", "245, 180, 0"], ["creatine", "77, 163, 255"], ["red-burn", "184, 20, 62"]] as const) {
      const btn = group.getByRole("button", { name: NAME[slug] });
      await btn.click();
      await expect(btn).toHaveAttribute("aria-pressed", "true");
      const img = hero.locator(`img[src*='${slug}-pouch-hero']`);
      await expect(img).toBeVisible();
      await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), { timeout: 10_000 }).toBe(true);
      expect(await img.getAttribute("alt")).toBe(products.find((p) => p.slug === slug)!.images[0].alt);
      const glow = await hero.locator("span[aria-hidden][style*='radial-gradient']").first().evaluate((el) => (el as HTMLElement).style.background);
      expect(glow, slug).toContain(rgb);
    }
  });

  test("hero chips are large tap targets and the glass styling is the same", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto("/");
    const buttons = page.getByRole("group", { name: "Choose a flavour" }).getByRole("button");
    expect(await buttons.count()).toBe(3);
    for (let i = 0; i < 3; i++) {
      const box = (await buttons.nth(i).boundingBox())!;
      expect(box.height, `chip ${i}`).toBeGreaterThanOrEqual(48);
      expect(box.width, `chip ${i}`).toBeGreaterThanOrEqual(48);
    }
    await expect(page.locator("section#top .glass").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await ctx.close();
  });

  test("the hero switcher has every flavour's pouch and the all-products lineup shows each pouch", async ({ page }) => {
    await page.goto("/");
    for (const slug of FLAVOURS) await expect(page.locator(`#top img[src*='${slug}-pouch-hero']`), slug).toHaveCount(1);
    expect(await loaded(page, "#top img[src*='red-burn-pouch-hero']")).toBe(true);
    await page.goto("/products");
    await scrollThrough(page);
    for (const slug of FLAVOURS) expect(await loaded(page, `#lineup img[src*='${slug}-pouch-hero']`), `lineup ${slug}`).toBe(true);
  });

  test("only the featured hero is preloaded, every photo has explicit width/height, and photos below the fold are lazy", async ({ page }) => {
    await page.goto("/");
    const pre = await productPreloads(page);
    expect(pre).toHaveLength(1);
    expect(pre[0]).toContain("red-burn-pouch-hero");
    const imgs = await page.locator("img[src*='/images/products/']").evaluateAll((els) =>
      (els as HTMLImageElement[]).map((i) => ({ src: i.getAttribute("src")!, w: i.getAttribute("width"), h: i.getAttribute("height"), loading: i.getAttribute("loading"), fetchpriority: i.getAttribute("fetchpriority") })),
    );
    expect(imgs.length).toBeGreaterThanOrEqual(3); // the 3 hero pouches (the home page has no lineup photos or ingredients bands any more)
    for (const i of imgs.filter((x) => !x.src.includes("ingredients"))) {
      expect(i.w, i.src).toBe("1611");
      expect(i.h, i.src).toBe("2000");
    }
    const first = imgs.find((i) => i.src.includes("red-burn-pouch-hero"))!;
    expect(first.loading).toBe("eager");
    expect(first.fetchpriority).toBe("high");
    for (const i of imgs.filter((x) => x !== first && !x.src.includes("red-burn-pouch-hero"))) expect(i.loading, i.src).toBe("lazy");
  });

  test("the unpublished GOLD flat lay is never requested", async ({ page }) => {
    const urls = spyRequests(page);
    await page.goto("/");
    await scrollThrough(page);
    await page.goto("/products/gold");
    await scrollThrough(page);
    expect(urls.filter((u) => u.includes("gold-flat-lay"))).toEqual([]);
    expect((await page.request.get("/images/products/gold/gold-flat-lay-1080.webp")).status()).toBe(404);
  });
});

for (const slug of ["gold", "creatine"] as const) {
  test.describe(`${NAME[slug]} product page`, () => {
    const cfg = products.find((p) => p.slug === slug)!;

    test("the gallery has the four photos with their alt text, width/height, and the first one prioritised", async ({ page }) => {
      await page.goto(`/products/${slug}`);
      const imgs = await page.locator(`img[src*='/images/products/${slug}/']`).evaluateAll((els) =>
        (els as HTMLImageElement[]).map((i) => ({ src: i.getAttribute("src")!, alt: i.alt, w: i.getAttribute("width"), h: i.getAttribute("height"), loading: i.getAttribute("loading") })),
      );
      for (const im of cfg.images) expect(imgs.some((i) => i.src.startsWith(im.src) && i.alt === im.alt), im.src).toBe(true);
      for (const i of imgs) {
        expect(i.w, i.src).toBe("1611");
        expect(i.h, i.src).toBe("2000");
      }
      expect(imgs[0].loading).toBe("eager"); // the gallery's first photo
      expect(imgs.some((i) => i.src.includes("gold-flat-lay"))).toBe(false);
      expect(await productPreloads(page)).toEqual([]); // the only product-photo preload is the home hero
      await scrollThrough(page);
      for (const im of cfg.images) {
        const sel = `img[src^='${im.src}-']`;
        await page.locator(sel).first().scrollIntoViewIfNeeded();
        await expect.poll(() => loaded(page, sel), { message: im.src, timeout: 10_000 }).toBe(true);
      }
    });

    test("on a phone the gallery swipes (scroll-snap) and its controls are large tap targets", async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      await page.goto(`/products/${slug}`);
      const track = page.locator("[class*='snap-x']").first();
      await expect(track).toBeVisible();
      expect(await track.evaluate((el) => getComputedStyle(el).scrollSnapType)).toMatch(/x/);
      const before = await track.evaluate((el) => el.scrollLeft);
      await track.evaluate((el) => el.scrollBy({ left: el.clientWidth, behavior: "instant" as ScrollBehavior }));
      await page.waitForTimeout(400);
      expect(await track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before + 100); // moved to the next photo
      // every button in the gallery area (zoom, dots, thumbnails) is at least 44 x 44
      const small = await page.locator("main button:visible").evaluateAll((els) =>
        (els as HTMLElement[]).filter((b) => b.closest("[class*='snap-x']")?.parentElement || b.getAttribute("aria-label")?.match(/zoom|photo|slide|image/i)).map((b) => ({ label: b.getAttribute("aria-label") ?? b.innerText, w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height })).filter((b) => b.w < 44 || b.h < 44),
      );
      expect(small).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
      await ctx.close();
    });

    test("nutrition, ingredients and allergens stay as TBC placeholders", async ({ page }) => {
      await page.goto(`/products/${slug}`);
      const text = await page.locator("body").innerText();
      expect(text).toMatch(/TBC/);
      expect(text).not.toMatch(/ingredients?:\s*(honey|vanilla|creatine)/i);
    });
  });
}

test.describe("what the photos cost on a phone", () => {
  for (const url of ["/", "/products/gold"]) {
    test(`${url}: image bytes on a 390px screen, 2x pixel density`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      await page.goto(url);
      await scrollThrough(page);
      const rows = await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .filter((e) => /\/images\/products\//.test(e.name))
          .map((e) => ({ file: e.name.split("/").pop()!, kb: Math.round(((e as PerformanceResourceTiming).transferSize || (e as PerformanceResourceTiming).encodedBodySize) / 1024) })),
      );
      const total = rows.reduce((n, r) => n + r.kb, 0);
      fs.mkdirSync(path.join(ROOT, "test-results"), { recursive: true });
      const file = path.join(ROOT, "test-results/image-weight.json");
      const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
      prev[url] = { totalKB: total, images: rows };
      fs.writeFileSync(file, JSON.stringify(prev, null, 2));
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.file.endsWith(".avif") || r.file.endsWith(".webp"))).toBe(true); // modern formats only
      expect(rows.every((r) => !/-1600\./.test(r.file))).toBe(true); // a phone never downloads the 1600 px size
      expect(total, `${url} images`).toBeLessThan(url === "/" ? 1500 : 1200); // KB
      await ctx.close();
    });
  }
});
