import Link from "next/link";
import { copy } from "@/config/copy";
import { findPhoto, type Product } from "@/config/products";
import { money, perSachet } from "@/lib/format";
import { Blobs } from "../Blobs";
import { Photo } from "../Photo";
import { Reveal } from "../Reveal";

const wrap = "mx-auto max-w-7xl px-5 md:px-8";

/** Clean placeholder for values not filled in yet. */
export function Tbc() {
  return (
    <span className="inline-block border border-dashed border-white/30 px-2 text-[13px] leading-[1.6] text-body" title="To be confirmed">
      TBC
    </span>
  );
}

export function Breadcrumb({ product }: { product: Product }) {
  return (
    <nav aria-label="Breadcrumb" className="mono !text-body mb-6 flex flex-wrap items-center gap-x-2">
      <Link href="/#lineup" className="link !py-3 !text-body">SHOP</Link>
      <span aria-hidden>/</span>
      <span aria-current="page" className="!text-acid py-3">{product.name}</span>
    </nav>
  );
}

export function Chips({ product }: { product: Product }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {product.chips.map((c) => (
        <li key={c} className="glass-flat mono flex min-h-10 items-center px-4 !text-[13px]">
          {c}
        </li>
      ))}
    </ul>
  );
}

/** Caffeine / usage notice. Shown next to the buy box so it is seen as soon as the product loads. */
export function Notice({ product }: { product: Product }) {
  if (!product.warning) return null;
  return (
    <div role="note" className="glass-flat mt-5 border-l-4 !border-l-acid p-4">
      <p className="mono mb-1">CAFFEINE NOTICE</p>
      <p className="text-[16px] leading-[1.5] text-fg">{product.warning}</p>
    </div>
  );
}

export function PriceBlock({ product, deliveryFee }: { product: Product; deliveryFee: number }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
      <span className="display text-[40px] leading-none md:text-[48px]">{money(product.price)}</span>
      <span className="mono !text-[15px]">
        {money(perSachet(product.price), 2)} / SACHET
      </span>
      <span className="w-full text-[16px] text-body">{copy().deliveryNote(money(deliveryFee))}</span>
    </div>
  );
}

export function FlavorSwitcher({ current, products }: { current: string; products: Product[] }) {
  return (
    <nav aria-label="Choose flavour">
      <p className="mono !text-body mb-3">FLAVOUR</p>
      <ul className="grid grid-cols-3 gap-2">
        {products.map((p) => {
          const on = p.slug === current;
          return (
            <li key={p.id}>
              <Link
                href={`/products/${p.slug}`}
                aria-current={on ? "page" : undefined}
                className={`glass-flat flex min-h-14 flex-col items-center justify-center px-1 py-2 text-center ${on ? "glass-accent" : "glass-hover"}`}
              >
                <span className="display text-[13px] sm:text-[15px]">{p.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function TrustRow() {
  const items = copy().product.trust;
  return (
    <ul className="mt-5 grid grid-cols-3 gap-2">
      {items.map((t) => (
        <li key={t} className="glass-flat mono flex min-h-14 items-center justify-center px-2 text-center !text-[11px] !text-fg sm:!text-[12px]">
          {t}
        </li>
      ))}
    </ul>
  );
}

export function Inside({ product }: { product: Product }) {
  const acc = [
    { t: "Ingredients", v: product.ingredients },
    { t: "Allergens", v: product.allergens },
    { t: "Warnings", v: product.warning },
  ];
  return (
    <section className="relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "-10%", y: "0%" }, { x: "65%", y: "40%", delay: -9 }]} />
      <div className={`${wrap} py-14 md:py-20`}>
        <Reveal>
          <p className="eyebrow mb-3">{copy().product.insideKicker}</p>
          <h2 className="display h-section mb-8">{copy().product.insideTitle}</h2>
        </Reveal>
        <Reveal className="glass p-5 md:p-8">
          <dl className="divide-y divide-white/10">
            {product.facts.map((f) => (
              <div key={f.label} className="flex min-h-12 items-center justify-between gap-4 py-3">
                <dt className="mono !text-body">{f.label}</dt>
                <dd className="mono text-right">{f.value ?? <Tbc />}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
            {acc.map((a) => (
              <details key={a.t} className="group glass-flat px-4">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
                  <span className="display text-[16px]">{a.t}</span>
                  <span aria-hidden className="display accent text-[28px] leading-none transition-transform group-open:rotate-45 motion-reduce:transition-none">+</span>
                </summary>
                <p className="body-lg pb-4">{a.v ?? <Tbc />}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/** JOB: make the value clear and soften the price: 12 sachets, the size and spec chips, the price per pouch and per sachet. The flat lay sits beside it when there is one. */
export function WhatYouGet({ product }: { product: Product }) {
  const photo = findPhoto(product, "flat-lay");
  const t = copy().product;
  const text = (
    <Reveal>
      <p className="eyebrow mb-3">{t.getKicker}</p>
      <h2 className="display h-section">{t.getTitle}</h2>
      <p className="body-lg mt-5 max-w-lg">{t.getLine}</p>
      <div className="mt-5">
        <Chips product={product} />
      </div>
      <p className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="display text-[32px] leading-none">{money(product.price)}</span>
        <span className="mono !text-[15px]">per pouch · {money(perSachet(product.price), 2)} / sachet</span>
      </p>
    </Reveal>
  );
  return (
    <section className="relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "55%", y: "10%", color: product.glow }, { x: "-10%", y: "50%", delay: -9 }]} />
      <div className={`${wrap} py-12 md:py-20`}>
        {photo ? (
          <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
            {text}
            <Reveal delay={80} className="glass mx-auto w-full max-w-[560px] p-2 sm:p-3">
              <Photo src={photo.src} alt={photo.alt} sizes="(min-width: 1024px) 540px, calc(100vw - 56px)" className="aspect-[4/5] w-full rounded-[12px]" />
            </Reveal>
          </div>
        ) : (
          <div className="glass max-w-2xl p-5 md:p-8">{text}</div>
        )}
      </div>
    </section>
  );
}

export function ProductHowTo({ product }: { product: Product }) {
  const photo = findPhoto(product, "sachet-open");
  const steps = product.howTo;
  return (
    <section className={`${wrap} py-14 md:py-20`}>
      <Reveal>
        <p className="eyebrow mb-3">{copy().howTo.kicker}</p>
        <h2 className="display h-section mb-8">{copy().howTo.title}</h2>
        <p className="mono !text-body -mt-5 mb-8 !text-[14px]">{copy().howTo.timingNote}</p>
      </Reveal>
      {photo ? (
        // Image beside the steps on desktop, stacked on mobile. Photo stays 4:5 so the sachet label is never cropped.
        <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr] lg:items-stretch lg:gap-10">
          <Reveal className="glass mx-auto w-full max-w-[420px] self-start p-2 lg:mx-0">
            <Photo
              src={photo.src}
              alt={photo.alt}
              sizes="(min-width: 1024px) 400px, calc(100vw - 56px)"
              className="aspect-[4/5] w-full rounded-[12px]"
            />
          </Reveal>
          <ol className="flex flex-col gap-4">
            {steps.map((st, n) => (
              <Reveal as="li" key={st.title} delay={n * 80} className="glass flex flex-1 items-center gap-5 p-5 md:gap-8 md:p-8">
                <span aria-hidden className="display accent w-[104px] shrink-0 text-[64px] leading-none md:w-[160px] md:text-[96px]">
                  {String(n + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="display text-[22px] md:text-[26px]">
                    <span className="sr-only">Step {n + 1}: </span>
                    {st.title}
                  </h3>
                  <p className="body-lg mt-2">{st.text}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      ) : (
        <ol className="grid gap-4 lg:grid-cols-3">
          {steps.map((st, n) => (
            <Reveal as="li" key={st.title} delay={n * 80} className="glass p-5 md:p-8">
              <span aria-hidden className="display accent block text-[88px] leading-none md:text-[120px]">
                {String(n + 1).padStart(2, "0")}
              </span>
              <h3 className="display mt-4 text-[24px]">
                <span className="sr-only">Step {n + 1}: </span>
                {st.title}
              </h3>
              <p className="body-lg mt-3">{st.text}</p>
            </Reveal>
          ))}
        </ol>
      )}
    </section>
  );
}

/** JOB: the headline block: the tagline, the headline and the one-paragraph body. */
export function HeadlineBlock({ product }: { product: Product }) {
  const c = product.pageCopy;
  return (
    <>
      {c && <p className="mono mt-3 !text-[14px] leading-snug sm:!text-[15px]" data-testid="tagline">{c.tagline}</p>}
      {product.headline && <p className="display mt-3 text-[clamp(1.5rem,1rem+2vw,2.25rem)] leading-tight">{product.headline}</p>}
      <p className="body-lg mt-4 max-w-xl">{c?.body ?? product.description}</p>
    </>
  );
}

/** JOB: a reason to act now, without pressure, next to the price and the button. */
export function WhyToday({ product }: { product: Product }) {
  if (!product.pageCopy?.whyToday) return null;
  return <p className="mt-4 text-[17px] leading-snug text-fg" data-testid="why-today">{product.pageCopy.whyToday}</p>;
}

/** JOB: make them picture the exact moment of use. Suggestions, not instructions. */
export function TakeWhen({ product }: { product: Product }) {
  const tags = product.pageCopy?.takeWhen;
  if (!tags?.length) return null;
  return (
    <section className={`${wrap} pt-2 pb-6 md:pb-10`} aria-label={copy().product.takeWhenLabel}>
      <p className="eyebrow mb-3">{copy().product.takeWhenLabel}</p>
      <ul className="flex flex-wrap gap-2">
        {tags.map((t) => (
          <li key={t} className="glass-flat flex min-h-12 items-center px-5 text-[17px] text-fg">{t}</li>
        ))}
      </ul>
    </section>
  );
}

/** JOB: three reasons to believe it. */
export function BenefitBlocks({ product }: { product: Product }) {
  const t = copy().product;
  return (
    <section className="relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "60%", y: "-10%", color: product.glow }]} />
      <div className={`${wrap} py-12 md:py-20`}>
        <Reveal>
          <p className="eyebrow mb-3">{t.benefitsKicker}</p>
          <h2 className="display h-section mb-8">{t.benefitsTitle}</h2>
        </Reveal>
        <ul className="grid gap-4 lg:grid-cols-3">
          {product.why.map((b, i) => (
            <Reveal as="li" key={b.title} delay={i * 80} className="glass p-5 md:p-8">
              <span aria-hidden className="display accent block text-[40px] leading-none">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="display mt-4 text-[20px] leading-tight md:text-[22px]">{b.title}</h3>
              <p className="body-lg mt-3">{b.text}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** JOB: a full-bleed moment of flavour before the facts: the ingredient image dimmed under the flavour glow, with what is in it (TBC until supplied). */
export function IngredientBanner({ product }: { product: Product }) {
  const bg = findPhoto(product, "ingredients");
  if (!bg) return null;
  const t = copy().product;
  const fade = "linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent)";
  return (
    <section aria-label={`What is in ${product.name}`} className="relative isolate overflow-x-clip">
      <div aria-hidden className="absolute inset-0 -z-20 opacity-60" style={{ maskImage: fade, WebkitMaskImage: fade }}>
        <Photo src={bg.src} alt="" sizes="100vw" position="50% 52%" className="h-full w-full" />
      </div>
      <div aria-hidden className="absolute inset-0 -z-10 bg-bg/50" />
      <Blobs spots={[{ x: "62%", y: "10%", color: product.glow }]} />
      <div className={`${wrap} py-20 md:py-32`}>
        <Reveal className="glass max-w-xl p-6 md:p-10">
          <p className="eyebrow mb-3">{t.bannerKicker}</p>
          <h2 className="display h-section">{product.flavor}</h2>
          <p className="body-lg mt-4 !text-fg">{product.ingredients ?? t.bannerTbc}</p>
        </Reveal>
      </div>
    </section>
  );
}

/** JOB: show what they gain by switching. Two columns, no brand names. */
export function OldVsSachet({ product }: { product: Product }) {
  const c = product.pageCopy?.compare;
  if (!c) return null;
  const t = copy().product;
  return (
    <section className={`${wrap} py-12 md:py-20`}>
      <Reveal>
        <p className="eyebrow mb-3">{t.compareKicker}</p>
        <h2 className="display h-section mb-8">{t.compareTitle}</h2>
      </Reveal>
      <div className="grid gap-4 md:grid-cols-2">
        <Reveal className="glass-flat p-5 md:p-8">
          <p className="mono !text-body">{t.compareOld}</p>
          <p className="display mt-3 text-[22px] leading-tight text-body md:text-[28px]">{c.old}</p>
        </Reveal>
        <Reveal delay={80} className="glass glass-accent p-5 md:p-8">
          <p className="mono">{t.compareNew}</p>
          <p className="display mt-3 text-[22px] leading-tight md:text-[28px]">{c.now}</p>
        </Reveal>
      </div>
    </section>
  );
}

export function ProductFaq({ product }: { product: Product }) {
  return (
    <section className="relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "-12%", y: "10%" }, { x: "70%", y: "60%", delay: -9 }]} />
      <div className={`${wrap} pb-14 pt-6 md:pb-20`}>
        <Reveal>
          <p className="eyebrow mb-3">{copy().product.faqKicker}</p>
          <h2 className="display h-section mb-8">{copy().product.faqTitle}</h2>
        </Reveal>
        <Reveal className="space-y-3">
          {product.faqs.map((f) => (
            <details key={f.q} className="glass group px-5">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 [&::-webkit-details-marker]:hidden">
                <span className="display text-[18px] md:text-[22px]">{f.q}</span>
                <span aria-hidden className="display accent text-[32px] leading-none transition-transform duration-150 group-open:rotate-45 motion-reduce:transition-none">+</span>
              </summary>
              <p className="body-lg max-w-3xl pb-6">{f.a}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
