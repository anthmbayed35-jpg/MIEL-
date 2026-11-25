import "server-only";
import { applyCopy } from "@/config/apply-copy";
import { LEGACY_FAQ_FIRST_Q, LEGACY_HERO_SUB } from "@/config/copy";
import { products as configProducts, type Product, type ProductPhoto } from "@/config/products";
import {
  DEFAULT_ANNOUNCEMENT, DEFAULT_FAQ, DEFAULT_HERO, DEFAULT_POLICIES, DEFAULT_STORE, DEFAULT_TRACKING, DEFAULT_ZONES,
  type Policies, type Announcement, type FaqItem, type HeroContent, type StoreSettings, type Testimonial, type TrackingSettings,
} from "@/config/content";
import { DEFAULT_DELIVERY_FEE, deliveryFee } from "./delivery";
import { money } from "./format";
import { getDb, usesDb, type Row } from "./db";

export type Zone = { id: string; name: string; fee: number; free_over: number | null; eta: string; active: boolean; sort: number };

export type Catalog = {
  products: Product[];
  /** Zones only carry the free-delivery line now (the fee is flat). */
  zones: Zone[];
  /** The one flat delivery fee (USD), the same for every region. */
  deliveryFee: number;
  faq: FaqItem[];
  announcement: Announcement;
  hero: HeroContent;
  testimonials: Testimonial[];
  store: StoreSettings;
  tracking: TrackingSettings;
  policies: Policies;
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

/** The default FAQ mentions the flat delivery fee as {fee}: fill in the live value. */
const withFee = (items: FaqItem[], fee: number): FaqItem[] => items.map((i) => ({ ...i, a: i.a.split("{fee}").join(money(fee)) }));

const configCatalog = (): Catalog => ({
  products: configProducts,
  zones: DEFAULT_ZONES.map((z, i) => ({ id: `z${i}`, active: true, ...z })),
  deliveryFee: DEFAULT_DELIVERY_FEE,
  faq: withFee(DEFAULT_FAQ, DEFAULT_DELIVERY_FEE), announcement: DEFAULT_ANNOUNCEMENT, hero: DEFAULT_HERO, testimonials: [],
  store: DEFAULT_STORE, tracking: DEFAULT_TRACKING, policies: DEFAULT_POLICIES, live: false,
});

/** Nothing left to sell: a tracked product at 0, or a bundle whose components cannot fill one bundle. Untracked products are never sold out. */
export function isSoldOut(p: Row, stock: Map<string, number>): boolean {
  if (p.kind === "bundle" && p.bundle_items?.length) return (p.bundle_items as { product_id: string; qty: number }[]).some((b) => stock.has(b.product_id) && (stock.get(b.product_id) ?? 0) < b.qty);
  return stock.has(p.id) && (stock.get(p.id) ?? 0) <= 0;
}

/** Everything the storefront needs. Falls back to the config files when the database is unavailable or empty. */
export async function getCatalog(): Promise<Catalog> {
  if (!usesDb()) return configCatalog();
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
    const { data: inv } = await db.from("inventory_items").select("product_id, on_hand");
    const stock = new Map<string, number>(((inv ?? []) as Row[]).map((i) => [i.product_id as string, Number(i.on_hand)]));
    const c = (k: string) => (content ?? []).find((x: Row) => x.key === k)?.value;
    const s = (k: string) => (settings ?? []).find((x: Row) => x.key === k)?.value;
    return {
      products: (prods as Row[]).map((p) => applyCopy({ ...rowToProduct(p, imgs ?? []), soldOut: isSoldOut(p, stock) })),
      deliveryFee: deliveryFee(),
      zones: (zones ?? []).map((z: Row) => ({ ...z, fee: Number(z.fee), free_over: z.free_over != null ? Number(z.free_over) : null })),
      // databases seeded with the old placeholder wording get the reviewed copy; anything the team edited since stays
      faq: withFee((c("faq") as FaqItem[] | undefined)?.[0]?.q === LEGACY_FAQ_FIRST_Q ? DEFAULT_FAQ : (c("faq") ?? DEFAULT_FAQ), deliveryFee()),
      announcement: { ...DEFAULT_ANNOUNCEMENT, ...(c("announcement") ?? {}) },
      hero: { ...DEFAULT_HERO, ...(c("hero")?.sub === LEGACY_HERO_SUB ? {} : (c("hero") ?? {})) },
      testimonials: (c("testimonials") ?? []).filter((t: Testimonial) => t.approved),
      store: { ...DEFAULT_STORE, ...(s("store") ?? {}) },
      tracking: { ...DEFAULT_TRACKING, ...(s("tracking") ?? {}) },
      policies: { ...DEFAULT_POLICIES, ...(s("policies") ?? {}) },
      live: true,
    };
  } catch {
    return configCatalog();
  }
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  return (await getCatalog()).products.find((p) => p.slug === slug);
}
