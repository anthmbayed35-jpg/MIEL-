import "server-only";
import fs from "node:fs";
import path from "node:path";
import { LIFESTYLE_COUNT, MEDIA, OPTIONAL_MEDIA, POSTER_WIDTHS, posterSizePath, type MediaSlot } from "@/config/media";
import { findPhoto, type Product, type ProductPhoto } from "@/config/products";

/**
 * Resolves the media slots (config/media.ts) against /public at request time: a file that exists is used, otherwise the slot falls back
 * to the existing product photos. Existence is cached for 20 s, so dropping a file in is live almost at once without a rebuild.
 */
const seen = new Map<string, { at: number; ok: boolean }>();
function exists(p: string): boolean {
  const full = path.join(process.cwd(), "public", p);
  const hit = seen.get(full);
  const now = Date.now();
  if (hit && now - hit.at < 20_000) return hit.ok;
  let ok = false;
  try {
    ok = fs.statSync(full).isFile();
  } catch {
    ok = false;
  }
  seen.set(full, { at: now, ok });
  return ok;
}
const have = (s: MediaSlot) => (exists(s.path) ? s : null);

/** One picture: a supplied media file, or one of the product photos (the pipeline photos have AVIF/WebP and blur placeholders). */
export type Pic = { kind: "file"; slot: MediaSlot } | { kind: "photo"; photo: ProductPhoto };

export type HeroMedia = { mp4: string | null; webm: string | null; poster: string | null; /** srcset of the poster (640, 1024 and the full size) when the smaller copies exist */ posterSet: string | null; /** a still to use behind the hero when there is no poster */ fallback: ProductPhoto | null };
export function heroMedia(products: Product[]): HeroMedia {
  const poster = have(MEDIA.heroVideo.poster);
  const mp4 = have(MEDIA.heroVideo.mp4);
  const webm = have(MEDIA.heroVideo.webm);
  // no video, no poster: the dimmed ingredients photo of the first flavour that has one
  const fb = products.map((p) => findPhoto(p, "ingredients")).find(Boolean) ?? null;
  const small = POSTER_WIDTHS.filter((w) => exists(posterSizePath(w)));
  const posterSet = poster && small.length ? [...small.map((w) => `${posterSizePath(w)} ${w}w`), `${poster.path} ${poster.width}w`].join(", ") : null;
  return { mp4: mp4?.path ?? null, webm: webm?.path ?? null, poster: poster?.path ?? null, posterSet, fallback: poster || mp4 ? null : fb };
}

/** The lifestyle pictures of a flavour: n supplied files (4:5 and 16:9) or, for the missing ones, the flat lay, sachet and ingredient photos. */
export function lifestyleFor(p: Product): { tall: Pic; wide: Pic }[] {
  const fallbacks = (["ingredients", "sachet-open", "flat-lay"] as const).map((k) => findPhoto(p, k)).filter((x): x is ProductPhoto => !!x);
  const out: { tall: Pic; wide: Pic }[] = [];
  for (let n = 1; n <= LIFESTYLE_COUNT; n++) {
    const tall = have(MEDIA.lifestyle(p.slug, n, "4x5"));
    const wide = have(MEDIA.lifestyle(p.slug, n, "16x9"));
    const fb = fallbacks[(n - 1) % Math.max(1, fallbacks.length)] ?? findPhoto(p, "pouch-hero");
    // a missing ratio reuses the other one when only one was supplied (the image is covered, never stretched)
    const t: Pic | null = tall ? { kind: "file", slot: tall } : wide ? { kind: "file", slot: wide } : fb ? { kind: "photo", photo: fb } : null;
    const w: Pic | null = wide ? { kind: "file", slot: wide } : tall ? { kind: "file", slot: tall } : fb ? { kind: "photo", photo: fb } : null;
    if (t && w) out.push({ tall: t, wide: w });
  }
  return out;
}

/** The closing call to action background, or null (the section then shows its glow background only). */
export function closingMedia(products: Product[]): { wide: Pic; tall: Pic } | null {
  const wide = have(MEDIA.closing.wide);
  const tall = have(MEDIA.closing.tall);
  if (wide || tall) return { wide: wide ? { kind: "file", slot: wide } : { kind: "file", slot: tall! }, tall: tall ? { kind: "file", slot: tall } : { kind: "file", slot: wide! } };
  const fb = products.map((p) => findPhoto(p, "ingredients")).find(Boolean);
  return fb ? { wide: { kind: "photo", photo: fb }, tall: { kind: "photo", photo: fb } } : null;
}

/** The brand film, or null: the story section is hidden until the mp4 exists. */
export function storyMedia(): { mp4: string; poster: string | null } | null {
  const mp4 = have(OPTIONAL_MEDIA.story.mp4);
  if (!mp4) return null;
  return { mp4: mp4.path, poster: have(OPTIONAL_MEDIA.story.poster)?.path ?? null };
}
