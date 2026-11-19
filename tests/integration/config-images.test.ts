import { beforeEach, describe, expect, it } from "vitest";
import { getEngine } from "../../lib/db/core";
import { products as configProducts } from "@/config/products";
import { syncConfigImages } from "@/lib/seed";
import { resetState } from "../support/state";

const sql = () => getEngine().sqlite;
const images = (slug: string) => sql().prepare("SELECT kind, src, label, sort FROM product_images WHERE product_id = (SELECT id FROM products WHERE slug = ?) ORDER BY sort").all(slug) as { kind: string; src: string; label: string; sort: number }[];
const cfg = (slug: string) => configProducts.find((p) => p.slug === slug)!;

/** A database created before the GOLD/CREATINE photos existed: products with no images and the old glow colours. */
function legacyDb() {
  const e = getEngine().sqlite;
  const ins = e.prepare("INSERT INTO products (id, slug, name, status, glow) VALUES (?, ?, ?, 'active', ?)");
  ins.run("p-red", "red-burn", "RED BURN", "rgba(190, 30, 60, 0.45)");
  ins.run("p-gold", "gold", "GOLD", "rgba(236, 178, 60, 0.4)");
  ins.run("p-cre", "creatine", "CREATINE", "rgba(205, 212, 224, 0.32)");
  e.prepare("INSERT INTO product_images (id, product_id, kind, src, alt, label, sort) VALUES ('i1', 'p-red', 'pouch-hero', '/images/products/red-burn/red-burn-pouch-hero', 'kept as is', 'POUCH', 0)").run();
}

beforeEach(() => resetState());

describe("an existing database picks up the new photos and colours once", () => {
  it("adds the configured photos to products that have none, and replaces an untouched old glow", async () => {
    legacyDb();
    const added = await syncConfigImages();
    expect(added).toBe(8);
    expect(images("gold").map((i) => i.kind)).toEqual(["pouch-hero", "flat-lay", "sachet-open", "ingredients"]);
    expect(images("creatine").map((i) => i.src)).toEqual(cfg("creatine").images.map((i) => i.src));
    const gold = images("gold");
    expect(gold[1].src).toBe(gold[0].src); // the pouch hero in the GOLD flat-lay slot
    expect(gold[1].label).toBe("POUCH");
    expect(gold.some((i) => i.src.includes("gold-flat-lay"))).toBe(false);
    const glow = (slug: string) => (sql().prepare("SELECT glow FROM products WHERE slug = ?").get(slug) as { glow: string }).glow;
    expect(glow("gold")).toBe(cfg("gold").glow);
    expect(glow("creatine")).toBe(cfg("creatine").glow);
    expect(glow("red-burn")).toBe(cfg("red-burn").glow);
  });

  it("RED BURN keeps the photos it already has", async () => {
    legacyDb();
    await syncConfigImages();
    expect(images("red-burn")).toEqual([{ kind: "pouch-hero", src: "/images/products/red-burn/red-burn-pouch-hero", label: "POUCH", sort: 0 }]);
  });

  it("is idempotent, and a photo an admin deleted never comes back", async () => {
    legacyDb();
    await syncConfigImages();
    expect(await syncConfigImages()).toBe(0);
    sql().prepare("DELETE FROM product_images WHERE product_id = 'p-gold' AND kind = 'ingredients'").run();
    sql().prepare("DELETE FROM product_images WHERE product_id = 'p-cre'").run(); // even all of them
    await syncConfigImages();
    expect(images("gold").map((i) => i.kind)).toEqual(["pouch-hero", "flat-lay", "sachet-open"]);
    expect(images("creatine")).toEqual([]);
    expect(sql().prepare("SELECT value FROM settings WHERE key = 'config_sync'").get()).toEqual({ value: expect.stringContaining("creatine") });
  });

  it("a glow the owner already customised is left alone", async () => {
    legacyDb();
    sql().prepare("UPDATE products SET glow = 'rgba(1, 2, 3, 0.5)' WHERE slug = 'gold'").run();
    await syncConfigImages();
    expect((sql().prepare("SELECT glow FROM products WHERE slug = 'gold'").get() as { glow: string }).glow).toBe("rgba(1, 2, 3, 0.5)");
    expect(images("gold")).toHaveLength(4); // photos still arrive
  });

  it("a brand-new database seeded from the config gets everything at once", async () => {
    const { seedBase } = await import("@/lib/seed");
    await seedBase();
    expect(images("gold")).toHaveLength(4);
    expect(images("creatine")).toHaveLength(4);
    expect(images("red-burn")).toHaveLength(4);
  });
});
