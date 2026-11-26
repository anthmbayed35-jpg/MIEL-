import Link from "next/link";
import type { Product } from "@/config/products";
import { copy } from "@/config/copy";
import { Blobs } from "./Blobs";
import { Reveal } from "./Reveal";

/**
 * JOB: let the visitor spot themselves ("before the work", "the long push", "every day") and route them to the right flavour.
 * Three cards, each a link to its product page. The anchor id stays "lineup": the hero button scrolls here.
 */
/** The moments read in the order of a day: before the work, the long push, every day. Other products follow. */
const ORDER = ["gold", "red-burn", "creatine"];
const rank = (slug: string) => { const i = ORDER.indexOf(slug); return i < 0 ? ORDER.length : i; };

export function Moments({ products, total }: { products: Product[]; total: number }) {
  const m = copy().moments;
  products = [...products].sort((a, b) => rank(a.slug) - rank(b.slug));
  return (
    <section id="lineup" className="relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "70%", y: "-4%" }, { x: "-15%", y: "50%", delay: -10 }]} />
      <div className="mx-auto max-w-7xl px-5 py-14 md:px-8 md:py-24">
        <Reveal>
          <p className="mono mb-3">{m.kicker}</p>
          <h2 className="display h-section mb-8 md:mb-12">
            {m.title1} <span className="accent">{m.title2}</span>
          </h2>
        </Reveal>
        <ul className="grid gap-5 lg:grid-cols-3">
          {products.map((p, i) => {
            const c = p.pageCopy;
            return (
              <Reveal as="li" key={p.id} delay={i * 80} className="relative">
                <span aria-hidden className="pointer-events-none absolute -inset-5 -z-10 rounded-full" style={{ background: `radial-gradient(closest-side, ${p.glow}, transparent)` }} />
                <Link href={`/products/${p.slug}`} aria-label={`${p.name}: ${c?.moment.label ?? p.descriptor}`} className="glass glass-hover flex h-full min-h-[240px] flex-col p-5 md:p-6">
                  <span className="mono">{c?.moment.label ?? p.descriptor}</span>
                  <span className="display h-product mt-3">{p.name}</span>
                  <span className="mt-1 text-[18px] text-fg">{p.flavor}</span>
                  <span className="mono mt-3 !text-body">{c?.moment.category ?? p.spec}</span>
                  <span className="body-lg mt-3 flex-1">{c?.moment.line ?? p.description}</span>
                  <span className="btn btn-block mt-5" aria-hidden>
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
