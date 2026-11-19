import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { products } from "@/config/products";
import { photoMeta } from "@/config/photos.generated";

const ROOT = path.resolve(__dirname, "../..");
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));
const bySlug = (s: string) => products.find((p) => p.slug === s)!;
const WIDTHS = [480, 768, 1080, 1600];

describe("product photos", () => {
  it("every product has the same four-slot gallery in the same order as RED BURN", () => {
    for (const slug of ["red-burn", "gold", "creatine"]) expect(bySlug(slug).images.map((i) => i.kind), slug).toEqual(["pouch-hero", "flat-lay", "sachet-open", "ingredients"]);
  });

  it("every photo is processed: AVIF + WebP at 480/768/1080/1600 on disk, with explicit width/height and a blur placeholder", () => {
    for (const p of products) {
      for (const im of p.images) {
        const m = photoMeta[im.src];
        expect(m, im.src).toBeTruthy();
        expect(m.widths, im.src).toEqual(WIDTHS);
        expect(m.width / m.height).toBeCloseTo(0.8, 1); // 4:5
        expect(m.blur.startsWith("data:image/webp;base64,"), im.src).toBe(true);
        for (const w of m.widths) for (const ext of ["avif", "webp"]) expect(exists(`public${im.src}-${w}.${ext}`), `${im.src}-${w}.${ext}`).toBe(true);
      }
    }
  });

  it("naming follows RED BURN: /images/products/<slug>/<slug>-<kind>", () => {
    for (const slug of ["gold", "creatine"])
      for (const im of bySlug(slug).images) expect(im.src, `${slug} ${im.kind}`).toMatch(new RegExp(`^/images/products/${slug}/${slug}-(pouch-hero|flat-lay|sachet-open|ingredients)$`));
    expect(bySlug("creatine").images.map((i) => i.src.split("/").pop())).toEqual(["creatine-pouch-hero", "creatine-flat-lay", "creatine-sachet-open", "creatine-ingredients"]);
  });

  it("the sources are the same kind of file as RED BURN's and the big originals are not in the repo", () => {
    for (const f of ["gold/gold-pouch-hero", "gold/gold-sachet-open", "gold/gold-ingredients", "creatine/creatine-pouch-hero", "creatine/creatine-flat-lay", "creatine/creatine-sachet-open", "creatine/creatine-ingredients", "red-burn/red-burn-pouch-hero"]) {
      expect(exists(`assets-src/${f}.webp`), f).toBe(true);
      expect(fs.statSync(path.join(ROOT, `assets-src/${f}.webp`)).size, f).toBeLessThan(1024 * 1024); // 100-600 KB, not 25 MB PNGs
    }
    expect(fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8")).toMatch(/^\/?incoming-images\/?$/m);
    expect(exists("incoming-images")).toBe(false);
  });

  it("the GOLD flat lay (typo on the pouch) is NOT published: no file, no config entry, a TODO is left", () => {
    expect(fs.readdirSync(path.join(ROOT, "public/images/products/gold")).filter((f) => f.includes("flat-lay"))).toEqual([]);
    expect(exists("assets-src/gold/gold-flat-lay.webp")).toBe(false);
    expect(Object.keys(photoMeta).filter((k) => k.includes("gold-flat-lay"))).toEqual([]);
    const gold = bySlug("gold").images;
    const flat = gold.find((i) => i.kind === "flat-lay")!;
    expect(flat.src).toBe(gold.find((i) => i.kind === "pouch-hero")!.src); // the pouch hero fills the slot
    expect(flat.label).toBe("POUCH");
    expect(fs.readFileSync(path.join(ROOT, "config/products.ts"), "utf8")).toMatch(/TODO\(gold-flat-lay\)/);
    expect(fs.readFileSync(path.join(ROOT, "docs/OPERATIONS.md"), "utf8")).toMatch(/TODO\(gold-flat-lay\)/);
  });

  it("RED BURN's photos and the ingredient and nutrition placeholders are untouched", () => {
    expect(bySlug("red-burn").images.map((i) => i.src)).toEqual(["pouch-hero", "flat-lay", "sachet-open", "ingredients"].map((k) => `/images/products/red-burn/red-burn-${k}`));
    for (const slug of ["red-burn", "gold", "creatine"]) {
      const p = bySlug(slug);
      expect(p.ingredients, slug).toBeNull();
      expect(p.allergens, slug).toBeNull();
      expect(p.facts.some((f) => f.value === null), slug).toBe(true); // TBC placeholders stay
    }
  });

  it("alt text describes only what is visible: specific, short, no health or performance claims", () => {
    const claims = /health|healthy|cure|treat|prevent|boost|energi[sz]|immune|detox|muscle|strength|performance|endurance|recover|fat burn|weight|doctor|clinical|proven|focus|stamina/i;
    for (const slug of ["gold", "creatine"])
      for (const im of bySlug(slug).images) {
        expect(im.alt.length, im.alt).toBeGreaterThan(25);
        expect(im.alt.length, im.alt).toBeLessThan(170);
        expect(im.alt, im.alt).not.toMatch(claims);
      }
    expect(bySlug("gold").images.map((i) => i.alt).join(" ")).toMatch(/vanilla/i);
    expect(bySlug("creatine").images.map((i) => i.alt).join(" ")).toMatch(/powder/i);
  });

  it("flavour glow colours: RED BURN #B8143E, GOLD #F5B400, CREATINE #4DA3FF", () => {
    const hex = (rgba: string) => "#" + rgba.match(/\d+/g)!.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("").toUpperCase();
    expect(hex(bySlug("red-burn").glow)).toBe("#B8143E");
    expect(hex(bySlug("gold").glow)).toBe("#F5B400");
    expect(hex(bySlug("creatine").glow)).toBe("#4DA3FF");
  });
});
