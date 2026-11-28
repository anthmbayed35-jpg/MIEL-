import Link from "next/link";
import type { Product } from "@/config/products";
import { copy } from "@/config/copy";
import { lifestyleFor } from "@/lib/media";
import { Blobs } from "./Blobs";
import { PicView } from "./media/PicView";
import { Reveal } from "./Reveal";

/** The moments read in the order of a day: before the work, the long push, every day. Other products follow. */
const ORDER = ["gold", "red-burn", "creatine"];
const rank = (slug: string) => {
  const i = ORDER.indexOf(slug);
  return i < 0 ? ORDER.length : i;
};
/** "rgba(r, g, b, a)" with a different alpha / as an opaque colour. */
const alpha = (rgba: string, a: number) => rgba.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${a})`);
const solid = (rgba: string) => alpha(rgba, 1);

/**
 * JOB: let the visitor spot themselves ("before the work", "the long push", "every day") and route them to the right flavour.
 * Three tall photo cards (4:5 on every width, three columns on desktop) from the lifestyle media slots (or the flavour's own photo until
 * one is supplied): the moment label, the product, its three-word descriptor, the why-today line and a "SHOP GOLD" link. Hover and
 * tap lift the card and tint its border with the flavour colour. Anchor: #moments.
 */
export function Moments({ products, total }: { products: Product[]; total: number }) {
  const m = copy().moments;
  products = [...products].sort((a, b) => rank(a.slug) - rank(b.slug));
  return (
    <section id="moments" className="relative isolate scroll-mt-14 overflow-x-clip">
      <Blobs spots={[{ x: "70%", y: "-4%" }, { x: "-15%", y: "50%", delay: -10 }]} />
      <div className="mx-auto max-w-[1280px] px-5 py-14 md:px-8 md:py-24">
        <Reveal>
          <p className="eyebrow mb-3">{m.kicker}</p>
          <h2 className="display h-section mb-8 md:mb-12">
            {m.title1} <span className="accent">{m.title2}</span>
          </h2>
        </Reveal>
        <ul className="grid gap-5 lg:grid-cols-3">
          {products.map((p, i) => {
            const c = p.pageCopy;
            const shot = lifestyleFor(p)[0];
            return (
              <Reveal as="li" key={p.id} delay={i * 80}>
                <Link
                  href={`/products/${p.slug}`}
                  aria-label={`${p.name}: ${c?.moment.label ?? p.descriptor}`}
                  className="tint-card zoom-hover relative isolate flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-[22px] border border-white/15 p-5 shadow-[0_16px_50px_rgba(0,0,0,0.45)] lg:p-6"
                  style={{ ["--glow" as string]: alpha(p.glow, 0.55), ["--tint" as string]: solid(p.glow) }}
                >
                  {shot && <PicView pic={shot.tall} sizes="(min-width: 1024px) 410px, calc(100vw - 40px)" className="absolute inset-0 -z-20 h-full w-full" position="50% 40%" />}
                  <span aria-hidden className="mesh absolute inset-0 -z-10 opacity-80 mix-blend-screen" />
                  <span aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgba(20,18,15,0.96)_10%,rgba(20,18,15,0.6)_50%,rgba(20,18,15,0.1)_100%)]" />
                  <span className="mono">{c?.moment.label ?? p.descriptor}</span>
                  <span className="display mt-2 text-[28px] leading-none">{p.name}</span>
                  <span className="display mt-2 text-[17px] leading-tight text-fg/90">{c?.descriptor3 ?? p.flavor}</span>
                  <span className="body-lg mt-3 !text-fg/90">{c?.whyToday ?? p.description}</span>
                  <span className="mono mt-4 inline-flex min-h-12 items-center !text-[14px] !tracking-[0.14em]">
                    {m.cta} {p.name} <span aria-hidden className="ml-2">→</span>
                  </span>
                </Link>
              </Reveal>
            );
          })}
        </ul>
        {total > products.length && (
          <div className="mt-8 text-center">
            <Link href="/products" className="btn btn-ghost">SEE ALL {total} PRODUCTS</Link>
          </div>
        )}
      </div>
    </section>
  );
}
