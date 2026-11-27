"use client";

import Link from "next/link";
import { useState } from "react";
import { findPhoto, type Product } from "@/config/products";
import { copy } from "@/config/copy";
import { Blobs } from "./Blobs";
import { ProductImage } from "./ProductImage";

const solid = (rgba: string) => rgba.replace(/rgba\(([^)]+),\s*[\d.]+\)/, "rgb($1)");
const alpha = (rgba: string, a: number) => rgba.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${a})`);

const Tbc = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-block border border-dashed border-white/30 px-2 text-[14px] leading-[1.6] text-body" title="To be confirmed">{children}</span>
);

/**
 * JOB: see what is in each flavour. Tap a flavour and the glow, the ingredient image and the details change together. Ingredient and
 * nutrition details are TBC until the team supplies them (nothing is invented).
 */
export function FlavorExplorer({ products }: { products: Product[] }) {
  const t = copy().explorer;
  const list = products.filter((p) => p.kind !== "bundle").slice(0, 6);
  const [active, setActive] = useState(0);
  const cur = list[active] ?? list[0];
  if (!cur) return null;
  const nutrition = cur.facts.filter((f) => !["Flavor", "Sachets per pouch"].includes(f.label));
  return (
    <section className="relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "-12%", y: "10%" }]} />
      {/* the flavour glow: one mesh that changes colour with the tapped flavour */}
      <span aria-hidden className="mesh pointer-events-none absolute inset-0 -z-10 opacity-60 transition-opacity duration-300" style={{ ["--glow" as string]: alpha(cur.glow, 0.45) }} />
      <div className="mx-auto max-w-[1280px] px-5 py-14 md:px-8 md:py-24">
        <p className="eyebrow mb-3">{t.kicker}</p>
        <h2 className="display h-section mb-8 md:mb-12">
          {t.title1} <span className="accent">{t.title2}</span>
        </h2>
        <div role="group" aria-label="Choose a flavour" className="grid grid-cols-3 gap-2 md:max-w-xl">
          {list.map((p, i) => (
            <button
              key={p.slug}
              type="button"
              aria-pressed={i === active}
              onClick={() => setActive(i)}
              className={`${i === active ? "glass-accent" : "glass-flat"} flex min-h-14 items-center justify-center gap-2 rounded-2xl px-2 py-2 text-center`}
            >
              <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: solid(p.glow) }} />
              <span className="display text-[13px] leading-tight sm:text-[14px]">{p.name}</span>
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-12 lg:items-start lg:gap-10">
          <div className="glass mx-auto w-full max-w-[460px] p-2 sm:p-3 lg:col-span-5 lg:mx-0">
            {list.map((p, i) => (
              <div key={p.slug} hidden={i !== active} aria-hidden={i !== active}>
                <ProductImage photo={findPhoto(p, "ingredients") ?? findPhoto(p, "pouch-hero")} alt={findPhoto(p, "ingredients")?.alt ?? p.imageAlt} label={`${p.name} INGREDIENTS`} sizes="(min-width: 1024px) 460px, calc(100vw - 56px)" className="aspect-[4/5] w-full rounded-[12px]" />
              </div>
            ))}
          </div>
          <div className="glass p-5 md:p-8 lg:col-span-7" aria-live="polite">
            <p className="mono">{cur.flavor}</p>
            <h3 className="display mt-2 text-[clamp(1.75rem,1.2rem+2vw,2.75rem)]">{cur.name}</h3>
            <p className="mono mt-4 !text-body">{t.ingredients}</p>
            <p className="body-lg mt-2">{cur.ingredients ?? <Tbc>{t.tbc}</Tbc>}</p>
            <p className="mono mt-6 !text-body">{t.nutrition}</p>
            <dl className="mt-2 divide-y divide-white/10">
              {nutrition.map((f) => (
                <div key={f.label} className="flex min-h-12 items-center justify-between gap-4 py-2">
                  <dt className="mono !text-body">{f.label}</dt>
                  <dd className="mono text-right">{f.value ?? <Tbc>TBC</Tbc>}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6">
              <Link href={`/products/${cur.slug}`} className="btn">
                {t.cta} {cur.name}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
