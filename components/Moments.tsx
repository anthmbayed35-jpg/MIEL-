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
/** "rgba(r, g, b, a)" with a different alpha. */
const alpha = (rgba: string, a: number) => rgba.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${a})`);

/**
 * JOB: let the visitor spot themselves ("before the work", "the long push", "every day") and route them to the right flavour.
 * Three large full-bleed cards, each a link to its product page: a lifestyle image (or the flavour's own photo until one is supplied),
 * the flavour glow, the moment label, the descriptor, one line and a Shop button. The text sits on a dark gradient at the bottom, away
 * from any packaging. The anchor id stays "lineup": the hero button scrolls here.
 */
export function Moments({ products, total }: { products: Product[]; total: number }) {
  const m = copy().moments;
  products = [...products].sort((a, b) => rank(a.slug) - rank(b.slug));
  return (
    <section id="lineup" className="relative isolate overflow-x-clip">
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
                  className="zoom-hover group relative isolate flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-[22px] border border-white/15 p-5 shadow-[0_16px_50px_rgba(0,0,0,0.45)] transition-transform duration-200 hover:-translate-y-1 focus-visible:-translate-y-1 motion-reduce:transition-none md:aspect-[16/9] md:p-8 lg:aspect-[4/5] lg:p-6"
                  style={{ ["--glow" as string]: alpha(p.glow, 0.55) }}
                >
                  {shot && (
                    <>
                      <PicView pic={shot.tall} sizes="(min-width: 1024px) 410px, calc(100vw - 40px)" className="absolute inset-0 -z-20 h-full w-full md:hidden lg:block" position="50% 40%" />
                      <PicView pic={shot.wide} sizes="(min-width: 768px) 700px, 0px" className="absolute inset-0 -z-20 hidden h-full w-full md:block lg:hidden" position="50% 40%" />
                    </>
                  )}
                  <span aria-hidden className="mesh absolute inset-0 -z-10 opacity-80 mix-blend-screen" />
                  <span aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgba(20,18,15,0.96)_8%,rgba(20,18,15,0.55)_48%,rgba(20,18,15,0.1)_100%)]" />
                  <span className="mono">{c?.moment.label ?? p.descriptor}</span>
                  <span className="display h-product mt-2">{p.name}</span>
                  <span className="mt-1 text-[17px] text-fg md:text-[18px]">{p.flavor}</span>
                  <span className="body-lg mt-2 !text-fg/90">{c?.moment.line ?? p.description}</span>
                  <span aria-hidden className="btn btn-block mt-4">
                    {m.cta} {p.name}
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
