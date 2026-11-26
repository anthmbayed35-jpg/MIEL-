"use client";

import Link from "next/link";
import { findPhoto, type Product } from "@/config/products";
import { SACHETS_PER_POUCH } from "@/config/site";
import { money } from "@/lib/format";
import { Blobs } from "./Blobs";
import { useCart } from "./CartProvider";
import { ProductImage } from "./ProductImage";
import { Reveal } from "./Reveal";

export function Lineup({ products, total, title = true, heading, children }: { products: Product[]; total?: number; title?: boolean; heading?: React.ReactNode; children?: React.ReactNode }) {
  const { add } = useCart();
  const c = { lineup: { kicker: "THE LINEUP", title1: "Pick your", title2: "flavour." } };
  return (
    <section id="lineup" className="relative isolate overflow-x-clip">
      <Blobs
        spots={[
          { x: "70%", y: "-4%" },
          { x: "-15%", y: "50%", delay: -10 },
        ]}
      />
      <div className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-24">
        {heading}
        {title && (
          <Reveal>
            <p className="mono mb-3">{c.lineup.kicker}</p>
            <h2 className="display h-section mb-10 md:mb-14">
              {c.lineup.title1} <span className="accent">{c.lineup.title2}</span>
            </h2>
          </Reveal>
        )}
        <ul className="grid gap-6 lg:grid-cols-3">
          {products.map((p, i) => (
            <Reveal as="li" key={p.id} delay={i * 80} className="relative">
              {/* Flavour-coloured glow behind the card so the glass looks tinted */}
              <span
                aria-hidden
                className="pointer-events-none absolute -inset-6 -z-10 rounded-full"
                style={{ background: `radial-gradient(closest-side, ${p.glow}, transparent)` }}
              />
              <div className="glass glass-hover flex h-full flex-col overflow-hidden">
                <Link href={`/products/${p.slug}`} aria-label={`${p.name} product page`} className="block border-b border-white/10">
                  <ProductImage
                    photo={findPhoto(p, "pouch-hero")}
                    alt={p.imageAlt}
                    label={`${p.name} IMAGE`}
                    sizes="(min-width: 1024px) 380px, calc(100vw - 42px)"
                    className="aspect-[4/5] w-full"
                  />
                </Link>
                <div className="flex flex-1 flex-col p-5 md:p-6">
                  <h3 className="display h-product">
                    <Link href={`/products/${p.slug}`} className="link !py-0">
                      {p.name}
                    </Link>
                  </h3>
                  <p className="mt-2 text-[18px] text-fg">{p.descriptor}</p>
                  <p className="text-[18px]">{p.flavor}</p>
                  <p className="mono mt-4">{p.spec}</p>
                  <div className="mt-6 flex items-baseline justify-between gap-3 border-t border-white/10 pt-5">
                    <span className="display text-[28px]">{money(p.price)}</span>
                    <span className="mono !text-body">{SACHETS_PER_POUCH} SACHETS</span>
                  </div>
                  {p.soldOut ? (
                    <button className="btn btn-block mt-5 opacity-50" disabled aria-disabled="true" aria-label={`${p.name} is sold out`}>SOLD OUT</button>
                  ) : (
                    <button className="btn btn-block mt-5" onClick={() => add(p.id)} aria-label={`Add ${p.name} to cart`}>
                      ADD TO CART
                    </button>
                  )}
                </div>
              </div>
            </Reveal>
          ))}
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
