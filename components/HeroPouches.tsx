"use client";

import { useState } from "react";
import type { ProductPhoto } from "@/config/products";
import { ProductImage } from "./ProductImage";

/** "rgba(r, g, b, a)" -> "rgb(r, g, b)": the opaque dot colour of a flavour glow. */
const solid = (rgba: string) => rgba.replace(/rgba\(([^)]+),\s*[\d.]+\)/, "rgb($1)");

export type HeroPouch = { slug: string; name: string; glow: string; alt: string; photo?: ProductPhoto };

/**
 * The hero pouch panel with all three flavours. The first flavour (the featured one) is rendered visible with the priority
 * image, exactly as before; the others are hidden and lazy, so they download only when someone picks that flavour. A glow in
 * the flavour's colour sits behind the same glass panel. Buttons are 48px+ tap targets.
 */
export function HeroPouches({ pouches, sizes }: { pouches: HeroPouch[]; sizes: string }) {
  const [active, setActive] = useState(0);
  const cur = pouches[active] ?? pouches[0];
  return (
    <div className="relative mx-auto w-full max-w-[520px] lg:mx-0 lg:justify-self-end">
      {/* flavour-coloured glow behind the glass */}
      <span aria-hidden className="pointer-events-none absolute -inset-10 -z-10 rounded-full opacity-90 transition-opacity duration-300" style={{ background: `radial-gradient(closest-side, ${cur.glow}, transparent)` }} />
      <div className="glass w-full p-2 sm:p-3">
        {pouches.map((p, i) => (
          <div key={p.slug} hidden={i !== active} aria-hidden={i !== active}>
            <ProductImage photo={p.photo} alt={p.alt} label="HERO POUCH IMAGE" sizes={sizes} priority={i === 0} className="aspect-[4/5] w-full rounded-[12px]" />
          </div>
        ))}
      </div>
      {pouches.length > 1 && (
        <div role="group" aria-label="Choose a flavour" className="mt-3 grid grid-cols-3 gap-2">
          {pouches.map((p, i) => (
            <button
              key={p.slug}
              type="button"
              onClick={() => setActive(i)}
              aria-pressed={i === active}
              className={`${i === active ? "glass-accent" : "glass-flat"} flex min-h-14 items-center justify-center gap-2 rounded-2xl px-2 py-2 text-center`}
            >
              <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: solid(p.glow) }} />
              <span className="display text-[13px] leading-tight sm:text-[14px]">{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
