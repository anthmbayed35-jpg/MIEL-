"use client";

import Link from "next/link";
import { useState } from "react";
import { findPhoto, type Product } from "@/config/products";
import { copy } from "@/config/copy";
import { money, perSachet } from "@/lib/format";
import { Blobs } from "./Blobs";
import { useCart } from "./CartProvider";
import { ProductImage } from "./ProductImage";
import { Reveal } from "./Reveal";

/** One product card: the pouch image swaps to the open sachet on hover (desktop) or with the corner button (touch and keyboard). */
function Card({ p }: { p: Product }) {
  const { add } = useCart();
  const c = copy().lineup;
  const [hover, setHover] = useState(false); // desktop: the mouse is over the card
  const [pinned, setPinned] = useState(false); // touch and keyboard: the corner button
  const sachet = findPhoto(p, "sachet-open");
  const showSachet = !!sachet && (hover || pinned);
  return (
    <div className="glass glass-hover zoom-hover flex h-full flex-col overflow-hidden" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="relative border-b border-white/10">
        <Link href={`/products/${p.slug}`} aria-label={`${p.name} product page`} className="block">
          {/* both images stay mounted (the sachet is lazy), only their opacity changes: no layout shift */}
          <div className="relative aspect-[4/5] w-full">
            <div className={`absolute inset-0 transition-opacity duration-300 ${showSachet ? "opacity-0" : "opacity-100"}`}>
              <ProductImage photo={findPhoto(p, "pouch-hero")} alt={p.imageAlt} label={`${p.name} IMAGE`} sizes="(min-width: 1024px) 400px, calc(100vw - 42px)" className="h-full w-full" />
            </div>
            {sachet && (
              <div className={`absolute inset-0 transition-opacity duration-300 ${showSachet ? "opacity-100" : "opacity-0"}`} aria-hidden={!showSachet}>
                <ProductImage photo={sachet} alt={sachet.alt} label={`${p.name} SACHET`} sizes="(min-width: 1024px) 400px, calc(100vw - 42px)" className="h-full w-full" />
              </div>
            )}
          </div>
        </Link>
        {sachet && (
          <button type="button" aria-pressed={pinned} aria-label={c.swap} onClick={() => setPinned((v) => !v)} className="icon-btn !absolute right-3 top-3 bg-bg/60">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 8h13l-3-3M20 16H7l3 3" />
            </svg>
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5 md:p-6">
        <h3 className="display h-product">
          <Link href={`/products/${p.slug}`} className="link !py-0">
            {p.name}
          </Link>
        </h3>
        <p className="display mt-1 text-[17px] leading-tight text-fg">{p.pageCopy?.descriptor3 ?? p.descriptor}</p>
        <p className="mono mt-3">{p.spec}</p>
        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="flex items-baseline gap-2">
            <span className="display text-[30px] leading-none">{money(p.price)}</span>
            <span className="mono !text-body !text-[13px]">{c.perPouch}</span>
          </p>
          <p className="mono mt-1 !text-[13px]">
            {money(perSachet(p.price), 2)} {c.perSachet}
          </p>
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
  );
}

/**
 * JOB: compare the flavours and add one to the cart without leaving the page. Three equal cards (stacked on phones): the pouch image that
 * swaps to the open sachet, the name, the three-word descriptor, the key spec, the price per pouch with the per-sachet price under it, and
 * ADD TO CART. Prices come from the store settings through the catalog. Used on the home page (#shop) and on /products.
 */
export function Lineup({ products, total, title = true, heading, children, id = "shop" }: { products: Product[]; total?: number; title?: boolean; heading?: React.ReactNode; children?: React.ReactNode; id?: string }) {
  const c = copy().lineup;
  return (
    <section id={id} className="panel panel-edge relative isolate scroll-mt-14 overflow-x-clip">
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
          {products.map((p, i) => (
            <Reveal as="li" key={p.id} delay={i * 80} className="relative">
              {/* Flavour-coloured glow behind the card so the glass looks tinted */}
              <span aria-hidden className="pointer-events-none absolute -inset-6 -z-10 rounded-full" style={{ background: `radial-gradient(closest-side, ${p.glow}, transparent)` }} />
              <Card p={p} />
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
