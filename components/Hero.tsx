import { preload } from "react-dom";
import { findPhoto, type Product } from "@/config/products";
import type { HeroContent } from "@/config/content";
import { FEATURED_SLUG } from "@/config/site";
import { copy } from "@/config/copy";
import { Blobs } from "./Blobs";
import { photoPreload } from "./Photo";
import { HeroPouches, type HeroPouch } from "./HeroPouches";

const HERO_SIZES = "(min-width: 1024px) 520px, calc(100vw - 56px)";

export function Hero({ products, hero }: { products: Product[]; hero: HeroContent }) {
  const c = copy();
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
      <div className="mx-auto grid max-w-7xl gap-10 px-5 pb-14 pt-[calc(var(--header-h,72px)+32px)] md:px-8 md:pt-[calc(var(--header-h,88px)+40px)] lg:min-h-[100svh] lg:grid-cols-2 lg:items-center lg:gap-12 lg:pb-16">
        <div className="order-2 lg:order-1">
          {/* Logo width = min(56vw, 520px) on phones, min(80vw, 520px) from 640px up (so the pouch, the label and the headline share the
              first screen). Padding = half its height (height = 0.2169 × width) on all sides. */}
          <div
            className="logo-slide hero-logo hidden sm:block"
            style={{ width: "var(--lw)", padding: "calc(var(--lw) * 0.1085) 0" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/miel-full.png" alt="MIEL+" width={1051} height={228} className="block h-auto w-full" />
          </div>
          {/* JOB: say what this is in a line, right under the logo. */}
          <p className="mono mb-3 sm:-mt-2 sm:mb-4">{c.brandTagline}</p>
          <h1 className="display h-hero">
            {hero.headline1}
            <br />
            <span className="accent">{hero.headline2}</span>
          </h1>
          <p className="body-lg mt-5 max-w-xl">{hero.sub}</p>
          <div className="mt-6">
            <a href="#lineup" className="btn">
              {c.hero.cta}
            </a>
          </div>
          <ul className="mt-5 flex flex-wrap gap-2" aria-label="Key facts">
            {c.heroChips.map((chip) => (
              <li key={chip} className="glass-flat mono flex min-h-10 items-center px-4 !text-[13px]">{chip}</li>
            ))}
          </ul>
        </div>

        {/* Pouch photos in a glass-bordered rounded panel: right of the headline on desktop, full width below it on mobile.
            Its own grid cell, so the headline can never overlap the pouch. Panel and photos are all 4:5. */}
        {pouches.length ? (
          <div className="order-1 mx-auto w-full max-w-[clamp(180px,calc(100svh_-_425px),250px)] sm:max-w-[520px] lg:order-2 lg:mx-0 lg:max-w-none lg:justify-self-end">
            <HeroPouches pouches={pouches} sizes={HERO_SIZES} />
          </div>
        ) : (
          <div className="glass order-1 mx-auto w-full max-w-[clamp(180px,calc(100svh_-_425px),250px)] p-2 sm:max-w-[520px] sm:p-3 lg:order-2 lg:mx-0 lg:justify-self-end">
            <div role="img" aria-label="MIEL+ honey sachet pouch (image placeholder)" className="flex aspect-[4/5] w-full items-center justify-center rounded-[12px]">
              <span className="mono !text-body opacity-70">HERO POUCH IMAGE</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
