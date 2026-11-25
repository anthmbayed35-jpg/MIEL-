import Link from "next/link";
import { COPY } from "@/config/copy";
import { findPhoto, type Product } from "@/config/products";
import { SACHETS_PER_POUCH } from "@/config/site";
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
      <span className="w-full text-[16px] text-body">{COPY.deliveryNote(money(deliveryFee))}</span>
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
  const items = COPY.product.trust;
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
          <p className="mono mb-3">WHAT&apos;S INSIDE</p>
          <h2 className="display h-section mb-8">The facts.</h2>
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

/** "12 sachets per pouch": the flat lay in a large glass frame. Rendered only when the product has a flat-lay photo. */
export function PouchBlock({ product }: { product: Product }) {
  const photo = findPhoto(product, "flat-lay");
  if (!photo) return null;
  const size = product.facts.find((f) => f.label === "Sachet size")?.value;
  return (
    <section className="relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "55%", y: "10%", color: product.glow }, { x: "-10%", y: "50%", delay: -9 }]} />
      <div className={`${wrap} py-14 md:py-20`}>
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
          <Reveal>
            <p className="mono mb-3">{COPY.product.pouch.kicker}</p>
            <h2 className="display h-section">
              {SACHETS_PER_POUCH} sachets <span className="accent">per pouch.</span>
            </h2>
            <p className="body-lg mt-5 max-w-lg">
              {COPY.product.pouch.text}{size ? ` ${size.toLowerCase()} in every sachet.` : ""}
            </p>
            <p className="mono mt-5 !text-[15px]">
              {money(product.price)} · {money(perSachet(product.price), 2)} / SACHET
            </p>
          </Reveal>
          <Reveal delay={80} className="glass mx-auto w-full max-w-[560px] p-2 sm:p-3">
            <Photo
              src={photo.src}
              alt={photo.alt}
              sizes="(min-width: 1024px) 540px, calc(100vw - 56px)"
              className="aspect-[4/5] w-full rounded-[12px]"
            />
          </Reveal>
        </div>
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
        <p className="mono mb-3">HOW TO USE</p>
        <h2 className="display h-section mb-8">{COPY.howTo.title}</h2>
        <p className="mono !text-body -mt-5 mb-8 !text-[14px]">{COPY.howTo.timingNote}</p>
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

/** Three short benefit bullets under the headline, in the product's info column. */
export function Benefits({ product }: { product: Product }) {
  return (
    <ul className="mt-5 space-y-3">
      {product.why.map((b) => (
        <li key={b.title} className="flex gap-3 text-[18px] leading-snug text-fg">
          <span aria-hidden className="accent mt-0.5 shrink-0">+</span>
          <span><strong className="font-semibold">{b.title}.</strong> <span className="text-body">{b.text}</span></span>
        </li>
      ))}
    </ul>
  );
}

export function Compare({ current, products }: { current: string; products: Product[] }) {
  return (
    <section className={`${wrap} py-14 md:py-20`}>
      <Reveal>
        <p className="mono mb-3">COMPARE</p>
        <h2 className="display h-section mb-8">The lineup.</h2>
      </Reveal>
      <ul className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 md:mx-0 md:px-0 lg:grid lg:grid-cols-3 lg:overflow-visible">
        {products.filter((p) => p.kind !== "bundle").map((p) => {
          const on = p.slug === current;
          return (
            <li key={p.id} className="w-[78%] shrink-0 snap-center md:w-[44%] lg:w-auto">
              <div className={`glass flex h-full flex-col p-5 ${on ? "glass-accent" : "glass-hover"}`}>
                <h3 className="display h-product">{p.name}</h3>
                <p className="mt-1 text-[18px] text-fg">{p.descriptor}</p>
                <p className="mono mt-3">{p.compareSpec}</p>
                <p className="mono !text-body mt-1">{SACHETS_PER_POUCH} SACHETS</p>
                <div className="mt-5 flex flex-wrap items-baseline gap-x-3 border-t border-white/10 pt-4">
                  <span className="display text-[32px]">{money(p.price)}</span>
                  <span className="mono !text-[13px]">{money(perSachet(p.price), 2)} / SACHET</span>
                </div>
                <Link
                  href={`/products/${p.slug}`}
                  aria-current={on ? "page" : undefined}
                  className={`btn btn-block mt-5 ${on ? "btn-ghost" : ""}`}
                >
                  {on ? "VIEWING" : "VIEW"}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ProductFaq({ product }: { product: Product }) {
  return (
    <section className="relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "-12%", y: "10%" }, { x: "70%", y: "60%", delay: -9 }]} />
      <div className={`${wrap} pb-14 pt-6 md:pb-20`}>
        <Reveal>
          <p className="mono mb-3">{COPY.product.faqKicker}</p>
          <h2 className="display h-section mb-8">{COPY.product.faqTitle}</h2>
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
