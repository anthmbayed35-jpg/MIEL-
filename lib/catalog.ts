import "server-only";
import { products as configProducts, type Product, type ProductPhoto } from "@/config/products";
import {
  DEFAULT_ANNOUNCEMENT, DEFAULT_FAQ, DEFAULT_HERO, DEFAULT_STORE, DEFAULT_TRACKING, DEFAULT_ZONES,
  type Announcement, type FaqItem, type HeroContent, type StoreSettings, type Testimonial, type TrackingSettings,
} from "@/config/content";
import { dbMode, getDb, type Row } from "./db";

export type Zone = { id: string; name: string; fee: number; free_over: number | null; eta: string; active: boolean; sort: number };

export type Catalog = {
  products: Product[];
  zones: Zone[];
  faq: FaqItem[];
  announcement: Announcement;
  hero: HeroContent;
  testimonials: Testimonial[];
  store: StoreSettings;
  tracking: TrackingSettings;
  /** true when data comes from the database (false = config fallback, checkout is WhatsApp-only) */
  live: boolean;
};

/** Database row (+ images) -> the storefront Product shape. */
export function rowToProduct(r: Row, imgs: Row[]): Product {
  const photos: ProductPhoto[] = imgs
    .filter((i) => i.product_id === r.id)
    .sort((a, b) => a.sort - b.sort)
    .map((i) => ({ kind: i.kind, src: i.src, alt: i.alt || `${r.name} photo`, label: i.label || String(i.kind).toUpperCase() }));
  return {
    id: r.id, slug: r.slug, name: r.name, descriptor: r.descriptor, flavor: r.flavor, spec: r.spec,
    price: Number(r.price), glow: r.glow, imageAlt: `${r.name} ${r.descriptor} pouch`, images: photos,
    ogImage: r.og_image ?? undefined, description: r.description, chips: r.chips ?? [], compareSpec: r.compare_spec || r.spec,
    facts: r.facts ?? [], ingredients: r.ingredients ?? null, allergens: r.allergens ?? null, warning: r.warning ?? null,
    howTo: r.how_to ?? [], why: r.why ?? [], faqs: r.faqs ?? [],
    kind: r.kind, compareAtPrice: r.compare_at_price != null ? Number(r.compare_at_price) : null,
    sachetCount: r.sachet_count, seoTitle: r.seo_title, seoDescription: r.seo_description,
  };
}

const configCatalog = (): Catalog => ({
  products: configProducts,
  zones: DEFAULT_ZONES.map((z, i) => ({ id: `z${i}`, active: true, ...z })),
  faq: DEFAULT_FAQ, announcement: DEFAULT_ANNOUNCEMENT, hero: DEFAULT_HERO, testimonials: [],
  store: DEFAULT_STORE, tracking: DEFAULT_TRACKING, live: false,
});

/** Everything the storefront needs. Falls back to the config files when the database is unavailable or empty. */
export async function getCatalog(): Promise<Catalog> {
  if (dbMode() === "none") return configCatalog();
  try {
    const db = getDb();
    const [{ data: prods }, { data: imgs }, { data: zones }, { data: content }, { data: settings }] = await Promise.all([
      db.from("products").select("*").eq("status", "active").order("sort", { ascending: true }),
      db.from("product_images").select("*"),
      db.from("shipping_zones").select("*").eq("active", true).order("sort", { ascending: true }),
      db.from("pages_content").select("*"),
      db.from("settings").select("*"),
    ]);
    if (!prods?.length) return configCatalog();
    const c = (k: string) => (content ?? []).find((x: Row) => x.key === k)?.value;
    const s = (k: string) => (settings ?? []).find((x: Row) => x.key === k)?.value;
    return {
      products: (prods as Row[]).map((p) => rowToProduct(p, imgs ?? [])),
      zones: (zones ?? []).map((z: Row) => ({ ...z, fee: Number(z.fee), free_over: z.free_over != null ? Number(z.free_over) : null })),
      faq: c("faq") ?? DEFAULT_FAQ,
      announcement: { ...DEFAULT_ANNOUNCEMENT, ...(c("announcement") ?? {}) },
      hero: { ...DEFAULT_HERO, ...(c("hero") ?? {}) },
      testimonials: (c("testimonials") ?? []).filter((t: Testimonial) => t.approved),
      store: { ...DEFAULT_STORE, ...(s("store") ?? {}) },
      tracking: { ...DEFAULT_TRACKING, ...(s("tracking") ?? {}) },
      live: true,
    };
  } catch {
    return configCatalog();
  }
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  return (await getCatalog()).products.find((p) => p.slug === slug);
}
