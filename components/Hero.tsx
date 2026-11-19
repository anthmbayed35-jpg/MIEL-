import { preload } from "react-dom";
import { findPhoto, type Product } from "@/config/products";
import type { HeroContent } from "@/config/content";
import { FEATURED_SLUG, SACHETS_PER_POUCH } from "@/config/site";
import { Blobs } from "./Blobs";
import { photoPreload } from "./Photo";
import { HeroPouches, type HeroPouch } from "./HeroPouches";

const HERO_SIZES = "(min-width: 1024px) 520px, calc(100vw - 56px)";

export function Hero({ products, hero }: { products: Product[]; hero: HeroContent }) {
  const product = products.find((p) => p.slug === FEATURED_SLUG) ?? products[0];
  const photo = product && findPhoto(product, "pouch-hero");
  // All flavours, the featured one first (it is the visible, prioritised, preloaded image).
  const pouches: HeroPouch[] = [product, ...products.filter((p) => p !== product)]
    .filter((p): p is Product => !!p && !!findPhoto(p, "pouch-hero"))
    .map((p) => ({ slug: p.slug, name: p.name, glow: p.glow, alt: p.images.find((i) => i.kind === "pouch-hero")?.alt ?? p.imageAlt, photo: findPhoto(p, "pouch-hero") }));

  // The ONLY preload on the site: the hero (LCP) image.
  if (photo) {
    const pre = photoPreload(photo.src, HERO_SIZES);
    if (pre) preload(pre.href, { as: "image", type: "image/avif", imageSrcSet: pre.imageSrcSet, imageSizes: pre.imageSizes, fetchPriority: "high" });
  }

  return (
    <section id="top" className="relative isolate overflow-x-clip">
      <Blobs
        float
        spots={[
          { x: "-12%", y: "6%" },
          { x: "55%", y: "20%", delay: -9 },
          { x: "20%", y: "72%", delay: -14 },
        ]}
      />
      <div className="mx-auto grid max-w-7xl gap-10 px-5 pb-14 pt-[112px] md:px-8 md:pt-[136px] lg:min-h-[100svh] lg:grid-cols-2 lg:items-center lg:gap-12 lg:pb-16">
        <div>
          {/* Logo width = min(80vw, 520px). Padding = half its height (height = 0.2169 × width) on all sides. */}
          <div
            className="logo-slide"
            style={{ ["--lw" as string]: "min(80vw, 520px)", width: "var(--lw)", padding: "calc(var(--lw) * 0.1085) 0" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/miel-full.png" alt="MIEL+" width={1051} height={228} className="block h-auto w-full" />
          </div>
          <h1 className="display h-hero">
            {hero.headline1}
            <br />
            <span className="accent">{hero.headline2}</span>
          </h1>
          <p className="body-lg mt-5 max-w-xl">{hero.sub}</p>
          <div className="glass mt-6 inline-flex min-h-12 items-center px-5 py-2">
            <span className="mono !text-[14px]">{SACHETS_PER_POUCH} SACHETS · REAL HONEY</span>
          </div>
          <div className="mt-6">
            <a href="#lineup" className="btn">
              SHOP THE LINEUP
            </a>
          </div>
        </div>

        {/* Pouch photos in a glass-bordered rounded panel: right of the headline on desktop, full width below it on mobile.
            Its own grid cell, so the headline can never overlap the pouch. Panel and photos are all 4:5. */}
        {pouches.length ? (
          <HeroPouches pouches={pouches} sizes={HERO_SIZES} />
        ) : (
          <div className="glass mx-auto w-full max-w-[520px] p-2 sm:p-3 lg:mx-0 lg:justify-self-end">
            <div role="img" aria-label="MIEL+ honey sachet pouch (image placeholder)" className="flex aspect-[4/5] w-full items-center justify-center rounded-[12px]">
              <span className="mono !text-body opacity-70">HERO POUCH IMAGE</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
