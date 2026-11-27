"use client";

import Link from "next/link";
import { findPhoto, type Product } from "@/config/products";
import { copy } from "@/config/copy";
import { money, perSachet } from "@/lib/format";
import { Blobs } from "./Blobs";
import { useCart } from "./CartProvider";
import { ProductImage } from "./ProductImage";
import { Reveal } from "./Reveal";

/**
 * JOB: compare the three flavours side by side and add one to the cart without leaving the page. Each card shows the pouch and an open
 * sachet side by side (4:5 each, so no packaging is cropped), the flavour tag, the spec chips, "when to use" pills, the price per pouch
 * and per sachet, and a quick add button. Used on the home page and on /products.
 */
export function Lineup({ products, total, title = true, heading, children, id = "lineup" }: { products: Product[]; total?: number; title?: boolean; heading?: React.ReactNode; children?: React.ReactNode; id?: string }) {
  const { add } = useCart();
  const c = copy().lineup;
  return (
    <section id={id} className="panel panel-edge relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "70%", y: "-4%" }, { x: "-15%", y: "50%", delay: -10 }]} />
      <div className="mx-auto max-w-[1280px] px-5 py-14 md:px-8 md:py-24">
        {heading}
        {title && (
          <Reveal>
            <p className="eyebrow mb-3">{c.kicker}</p>
            <h2 className="display h-section mb-8 md:mb-12">
              {c.title1} <span className="accent">{c.title2}</span>
            </h2>
          </Reveal>
        )}
        <ul className="grid gap-6 lg:grid-cols-3">
          {products.map((p, i) => {
            const sachet = findPhoto(p, "sachet-open");
            const second = sachet ?? findPhoto(p, "ingredients");
            return (
              <Reveal as="li" key={p.id} delay={i * 80} className="relative">
                {/* Flavour-coloured glow behind the card so the glass looks tinted */}
                <span aria-hidden className="pointer-events-none absolute -inset-6 -z-10 rounded-full" style={{ background: `radial-gradient(closest-side, ${p.glow}, transparent)` }} />
                <div className="glass glass-hover zoom-hover flex h-full flex-col overflow-hidden">
                  <Link href={`/products/${p.slug}`} aria-label={`${p.name} product page`} className="grid grid-cols-2 gap-px border-b border-white/10 bg-white/10">
                    <ProductImage photo={findPhoto(p, "pouch-hero")} alt={p.imageAlt} label={`${p.name} IMAGE`} sizes="(min-width: 1024px) 190px, calc(50vw - 24px)" className="aspect-[4/5] w-full" />
                    <ProductImage photo={second} alt={p.name} label={`${p.name} SACHET`} sizes="(min-width: 1024px) 190px, calc(50vw - 24px)" className="aspect-[4/5] w-full" />
                  </Link>
                  <div className="flex flex-1 flex-col p-5 md:p-6">
                    <p className="mono">{p.flavor}</p>
                    <h3 className="display h-product mt-2">
                      <Link href={`/products/${p.slug}`} className="link !py-0">
                        {p.name}
                      </Link>
                    </h3>
                    <p className="mt-1 text-[17px] text-fg">{p.descriptor}</p>
                    <ul className="mt-4 flex flex-wrap gap-2" aria-label="Spec">
                      {p.chips.map((chip) => (
                        <li key={chip} className="glass-flat mono flex min-h-9 items-center px-3 !text-[13px]">{chip}</li>
                      ))}
                    </ul>
                    {p.pageCopy?.takeWhen?.length ? (
                      <div className="mt-4">
                        <p className="mono !text-body !text-[13px]">{c.whenLabel}</p>
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {p.pageCopy.takeWhen.map((t) => (
                            <li key={t} className="rounded-full border border-white/20 px-3 py-1 text-[15px] text-fg">{t}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <div className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-white/10 pt-4">
                      <span className="display text-[28px] leading-none">{money(p.price)}</span>
                      <span className="mono !text-body !text-[13px]">{c.perPouch}</span>
                      <span className="mono ml-auto !text-[13px]">{money(perSachet(p.price), 2)} {c.perSachet}</span>
                    </div>
                    <div className="mt-auto pt-5">
                      {p.soldOut ? (
                        <button className="btn btn-block opacity-50" disabled aria-disabled="true" aria-label={`${p.name} is sold out`}>SOLD OUT</button>
                      ) : (
                        <button className="btn btn-block" onClick={() => add(p.id)} aria-label={`Add ${p.name} to cart`}>
                          {c.add}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </ul>
        {total !== undefined && total > products.length && (
          <div className="mt-10 text-center">
            <Link href="/products" className="btn">
              SEE ALL {total} PRODUCTS
            </Link>
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
