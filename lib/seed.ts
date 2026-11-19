import { products as configProducts } from "@/config/products";
import {
  DEFAULT_ANNOUNCEMENT, DEFAULT_FAQ, DEFAULT_HERO, DEFAULT_NOTIFICATIONS, DEFAULT_POLICIES, DEFAULT_STORE, DEFAULT_TRACKING, DEFAULT_ZONES,
} from "@/config/content";
import { SACHETS_PER_POUCH } from "@/config/site";
import { getEngine } from "./db/core";

// No "server-only" here on purpose: instrumentation.ts runs this at first boot (it only reads the config files).
const getDb = () => getEngine() as unknown as { from(t: string): any };
const must = (r: { data: any; error: { message: string } | null }): any => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

/**
 * Seed the store from the config files. Idempotent: existing products (by slug) are left alone.
 * config/products.ts stays the seed source; after seeding, edit products in the admin.
 */
export async function seedBase() {
  const db = getDb();
  let created = 0;
  const existing = (must(await db.from("products").select("slug")) as { slug: string }[]).map((p) => p.slug);

  for (const [i, p] of configProducts.entries()) {
    if (existing.includes(p.slug)) continue;
    const weight = Number(p.chips.find((c) => /G EACH/.test(c))?.match(/[\d.]+/)?.[0]) || null;
    const prod = must(
      await db.from("products").insert({
        slug: p.slug, kind: "single", name: p.name, descriptor: p.descriptor, flavor: p.flavor, description: p.description,
        spec: p.spec, price: p.price, compare_at_price: null, sachet_count: SACHETS_PER_POUCH, sachet_weight_g: weight,
        glow: p.glow, chips: p.chips, compare_spec: p.compareSpec, facts: p.facts, ingredients: p.ingredients,
        allergens: p.allergens, warning: p.warning, how_to: p.howTo, why: p.why, faqs: p.faqs,
        seo_title: null, seo_description: null, og_image: p.ogImage ?? null, status: "active", sort: i,
        updated_at: new Date().toISOString(),
      }).select().single(),
    );
    if (p.images.length)
      must(await db.from("product_images").insert(p.images.map((im, n) => ({ product_id: prod.id, kind: im.kind, src: im.src, alt: im.alt, label: im.label, sort: n }))));
    must(await db.from("inventory_items").insert({ product_id: prod.id, sku: `MIEL-${p.slug.toUpperCase()}-${SACHETS_PER_POUCH}`, on_hand: 0, low_stock_threshold: 10 }));
    created++;
  }

  const zones = must(await db.from("shipping_zones").select("id").limit(1));
  if (!zones.length) must(await db.from("shipping_zones").insert(DEFAULT_ZONES.map((z) => ({ ...z, active: true }))));

  const put = async (table: "pages_content" | "settings", key: string, value: unknown) => {
    const have = must(await db.from(table).select("key").eq("key", key));
    if (!have.length) must(await db.from(table).insert({ key, value, updated_at: new Date().toISOString() }));
  };
  await put("pages_content", "faq", DEFAULT_FAQ);
  await put("pages_content", "announcement", DEFAULT_ANNOUNCEMENT);
  await put("pages_content", "hero", DEFAULT_HERO);
  await put("pages_content", "testimonials", []);
  await put("settings", "store", DEFAULT_STORE);
  await put("settings", "tracking", DEFAULT_TRACKING);
  await put("settings", "notifications", DEFAULT_NOTIFICATIONS);
  await put("settings", "policies", DEFAULT_POLICIES);
  return { created };
}
