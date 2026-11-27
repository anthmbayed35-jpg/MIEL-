import { preload } from "react-dom";
import { findPhoto, type Product } from "@/config/products";
import type { HeroContent } from "@/config/content";
import { FEATURED_SLUG } from "@/config/site";
import { copy } from "@/config/copy";
import type { HeroMedia as HeroMediaData } from "@/lib/media";
import { Blobs } from "./Blobs";
import { photoPreload } from "./Photo";
import { HeroPouches, type HeroPouch } from "./HeroPouches";
import { HeroMedia } from "./media/HeroMedia";
import { Parallax } from "./Parallax";

const HERO_SIZES = "(min-width: 1024px) 520px, calc(100vw - 56px)";

/**
 * JOB: say what it is and who it is for in 3 seconds, then one button. Background: the hero loop video (or its poster, or a dimmed
 * product photo) under a dark gradient; in front: the pouch with its flavour switcher (the glow changes with the flavour), the mono
 * label, FUEL THE GRIND, the subline and the button. Phones: pouch first. Desktop: a 12-column split with a large pouch.
 */
export function Hero({ products, hero, media }: { products: Product[]; hero: HeroContent; media: HeroMediaData }) {
  const c = copy();
  const product = products.find((p) => p.slug === FEATURED_SLUG) ?? products[0];
  const photo = product && findPhoto(product, "pouch-hero");
  // All flavours, the featured one first (it is the visible, prioritised, preloaded image).
  const pouches: HeroPouch[] = [product, ...products.filter((p) => p !== product)]
    .filter((p): p is Product => !!p && !!findPhoto(p, "pouch-hero"))
    .map((p) => ({ slug: p.slug, name: p.name, glow: p.glow, alt: p.images.find((i) => i.kind === "pouch-hero")?.alt ?? p.imageAlt, photo: findPhoto(p, "pouch-hero") }));

  // The ONLY preload on the site: the hero (LCP) image. With a poster it is the LCP (it fills the hero), otherwise the featured pouch.
  if (media.poster) {
    preload(media.poster, { as: "image", type: "image/webp", imageSrcSet: media.posterSet ?? undefined, imageSizes: media.posterSet ? "100vw" : undefined, fetchPriority: "high" });
  } else if (photo) {
    const pre = photoPreload(photo.src, HERO_SIZES);
    if (pre) preload(pre.href, { as: "image", type: "image/avif", imageSrcSet: pre.imageSrcSet, imageSizes: pre.imageSizes, fetchPriority: "high" });
  }

  return (
    <section id="top" className="relative isolate overflow-x-clip">
      <HeroMedia mp4={media.mp4} webm={media.webm} poster={media.poster} posterSet={media.posterSet} fallback={media.fallback} />
      <Blobs
        float
        spots={[
          { x: "-12%", y: "6%" },
          { x: "55%", y: "20%", delay: -9 },
          { x: "20%", y: "72%", delay: -14 },
        ]}
      />
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-10 px-5 pb-14 pt-[calc(var(--header-h,72px)+32px)] md:px-8 md:pt-[calc(var(--header-h,88px)+40px)] lg:min-h-[100svh] lg:grid-cols-12 lg:items-center lg:gap-12 lg:pb-16">
        <div className="order-2 lg:order-1 lg:col-span-6">
          {/* Logo width = min(80vw, 520px) from 640px up (hidden on phones: the header already shows it). Padding = half its height (height = 0.2169 × width) on all sides. */}
          <div className="logo-slide hero-logo hidden sm:block" style={{ width: "var(--lw)", padding: "calc(var(--lw) * 0.1085) 0" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/miel-full.png" alt="MIEL+" width={1051} height={228} className="block h-auto w-full" />
          </div>
          {/* JOB: say what this is in a line, right under the logo. */}
          <p className="eyebrow mb-3 sm:-mt-2 sm:mb-4">{c.brandTagline}</p>
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

        {/* Pouch photos in a glass-bordered rounded panel: a large pouch right of the headline on desktop, full width above it on phones.
            Its own grid cell, so the headline can never overlap the pouch. Panel and photos are all 4:5. Slow parallax on desktop only. */}
        {pouches.length ? (
          <div className="order-1 mx-auto w-full max-w-[clamp(180px,calc(100svh_-_425px),250px)] sm:max-w-[520px] lg:order-2 lg:col-span-6 lg:mx-0 lg:max-w-[560px] lg:justify-self-end">
            <Parallax>
              <HeroPouches pouches={pouches} sizes={HERO_SIZES} />
            </Parallax>
          </div>
        ) : (
          <div className="glass order-1 mx-auto w-full max-w-[clamp(180px,calc(100svh_-_425px),250px)] p-2 sm:max-w-[520px] sm:p-3 lg:order-2 lg:col-span-6 lg:mx-0 lg:justify-self-end">
            <div role="img" aria-label="MIEL+ honey sachet pouch (image placeholder)" className="flex aspect-[4/5] w-full items-center justify-center rounded-[12px]">
              <span className="mono !text-body opacity-70">HERO POUCH IMAGE</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
