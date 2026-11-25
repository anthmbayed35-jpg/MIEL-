import { SACHETS_PER_POUCH, SITE } from "@/config/site";
import { COPY } from "@/config/copy";
import Link from "next/link";
import type { FaqItem, Policies, StoreSettings, Testimonial } from "@/config/content";
import { money } from "@/lib/format";
import { Blobs } from "./Blobs";
import { Reveal } from "./Reveal";

const wrap = "mx-auto max-w-7xl px-5 md:px-8";

const steps = COPY.howTo.steps.map((s, i) => ({ n: String(i + 1).padStart(2, "0"), t: s.title, d: s.text }));

export function HowTo() {
  return (
    <section className="relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "-10%", y: "10%" }, { x: "60%", y: "55%", delay: -8 }]} />
      <div className={`${wrap} py-16 md:py-24`}>
      <Reveal>
        <p className="mono mb-3">{COPY.howTo.kicker}</p>
        <h2 className="display h-section mb-10 md:mb-14">{COPY.howTo.title}</h2>
        <p className="mono !text-body -mt-7 mb-10 !text-[14px] md:-mt-10 md:mb-14">{COPY.howTo.timingNote}</p>
      </Reveal>
      <ol className="grid gap-4 lg:grid-cols-3">
        {steps.map((s, i) => (
          <Reveal as="li" key={s.n} delay={i * 80} className="glass p-5 md:p-8">
            <span className="display accent block text-[96px] leading-none md:text-[128px]" aria-hidden>
              {s.n}
            </span>
            <h3 className="display mt-4 text-[26px]">
              <span className="sr-only">Step {i + 1}: </span>
              {s.t}
            </h3>
            <p className="body-lg mt-3">{s.d}</p>
          </Reveal>
        ))}
      </ol>
      </div>
    </section>
  );
}

const benefits = COPY.whyHoney.items.map((i) => ({ t: i.title, d: i.text }));

export function WhyHoney() {
  return (
    <section className="relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "65%", y: "-10%" }, { x: "-15%", y: "60%", delay: -11 }]} />
      <div className={`${wrap} py-16 md:py-24`}>
        <Reveal>
          <p className="mono mb-3">{COPY.whyHoney.kicker}</p>
          <h2 className="display h-section mb-10 md:mb-14">
            {COPY.whyHoney.title1} <span className="accent">{COPY.whyHoney.title2}</span>
          </h2>
        </Reveal>
        <div className="grid gap-10 lg:grid-cols-3 lg:gap-8">
          {benefits.map((b, i) => (
            <Reveal key={b.t} delay={i * 80} className="border-t-2 border-acid pt-5">
              <h3 className="display text-[26px]">{b.t}</h3>
              <p className="body-lg mt-3">{b.d}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Value({ price }: { price: number }) {
  const POUCH_PRICE = price;
  const per = POUCH_PRICE / SACHETS_PER_POUCH;
  return (
    <section className="relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "30%", y: "-20%" }, { x: "75%", y: "40%", delay: -6 }, { x: "-10%", y: "50%", delay: -13 }]} />
      <div className={`${wrap} py-16 md:py-24`}>
      <Reveal className="glass p-5 md:p-12">
        <p className="mono mb-6">{COPY.value.kicker}</p>
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-end">
          <div>
            <p className="mono !text-body">{COPY.value.pouchLabel} · {SACHETS_PER_POUCH} SACHETS</p>
            <p className="display mt-1 text-[64px] leading-none md:text-[96px]">{money(POUCH_PRICE)}</p>
          </div>
          <div>
            <p className="display accent text-[48px] leading-none md:text-[80px]">{money(per, 2)}</p>
            <p className="display mt-2 text-[22px] md:text-[28px]">{COPY.value.perSachetUnit}</p>
          </div>
        </div>
        <p className="body-lg mt-8 max-w-xl">{COPY.value.line}</p>
        <div className="mt-8">
          <a href="#lineup" className="btn">
            {COPY.value.cta}
          </a>
        </div>
      </Reveal>
      </div>
    </section>
  );
}

export function Faq({ items: faqs }: { items: FaqItem[] }) {
  return (
    <section id="faq" className="relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "-12%", y: "20%" }, { x: "70%", y: "60%", delay: -9 }]} />
      <div className={`${wrap} pb-16 md:pb-24`}>
      <Reveal>
        <p className="mono mb-3">FAQ</p>
        <h2 className="display h-section mb-8 md:mb-12">Questions.</h2>
      </Reveal>
      <Reveal className="space-y-3">
        {faqs.map((f) => (
          <details key={f.q} className="glass group px-5">
            <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 [&::-webkit-details-marker]:hidden">
              <span className="display text-[18px] md:text-[22px]">{f.q}</span>
              <span aria-hidden className="display accent text-[32px] leading-none transition-transform duration-150 group-open:rotate-45 motion-reduce:transition-none">
                +
              </span>
            </summary>
            <p className="body-lg max-w-3xl pb-6">{f.a}</p>
          </details>
        ))}
      </Reveal>
      </div>
    </section>
  );
}

export function FinalCta({ action }: { action?: React.ReactNode }) {
  return (
    <section className="relative isolate overflow-x-clip bg-black">
      <Blobs spots={[{ x: "50%", y: "-30%" }, { x: "-10%", y: "30%", delay: -8 }]} />
      <div className={`${wrap} py-20 md:py-32`}>
        <Reveal>
          <h2 className="display h-hero">
            {COPY.finalCta.title1} <span className="accent">{COPY.finalCta.title2}</span>
          </h2>
          <p className="body-lg mt-5 max-w-xl">{COPY.finalCta.text}</p>
          <div className="mt-8">
            {action ?? (
              <a href="#lineup" className="btn">
                SHOP THE LINEUP
              </a>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function Footer({ store, policies }: { store: StoreSettings; policies?: Policies }) {
  const links = (["shipping", "returns", "privacy", "terms"] as const).filter((k) => policies?.[k]?.trim());
  return (
    <footer className="relative isolate overflow-x-clip border-t border-white/10">
      <Blobs spots={[{ x: "65%", y: "-40%" }]} />
      <div className={`${wrap} py-12 md:py-16`}>
        {/* 220px wide logo is ~48px tall, so 24px padding keeps the half-height clear zone. */}
        <div className="w-[220px] py-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/miel-full.png" alt="MIEL+" width={1051} height={228} loading="lazy" className="block h-auto w-full" />
        </div>
        <ul className="mt-6 flex flex-col md:flex-row md:gap-10">
          <li>
            <a href={store.instagram_url} target="_blank" rel="noopener noreferrer" className="link text-[18px]">
              Instagram {store.instagram_handle}
            </a>
          </li>
          <li>
            <Link href="/ambassadors" className="link text-[18px]">
              Ambassadors
            </Link>
          </li>
          <li>
            <a href={`https://wa.me/${store.whatsapp}`} target="_blank" rel="noopener noreferrer" className="link text-[18px]">
              WhatsApp us
            </a>
          </li>
        </ul>
        {links.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-x-6">
            {links.map((k) => (
              <li key={k}>
                <Link href={`/policies/${k}`} className="link text-[16px] capitalize">
                  {k === "returns" ? "Returns" : k}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-8 text-[16px] !text-body">
          © {new Date().getFullYear()} {SITE.name}. Made for Lebanon.
        </p>
        <p className="mt-2 text-[14px] !text-body">
          Map data © OpenStreetMap contributors, GeoNames.{" "}
          <Link href="/credits" className="link inline-flex min-h-12 items-center">
            Credits
          </Link>
        </p>
      </div>
    </footer>
  );
}

export function Testimonials({ items }: { items: Testimonial[] }) {
  if (!items.length) return null;
  return (
    <section className="relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "60%", y: "-10%" }]} />
      <div className={`${wrap} py-16 md:py-24`}>
        <Reveal>
          <p className="mono mb-3">PEOPLE WHO TRAIN</p>
          <h2 className="display h-section mb-10">What they <span className="accent">say.</span></h2>
        </Reveal>
        <ul className="grid gap-4 lg:grid-cols-3">
          {items.slice(0, 6).map((t, i) => (
            <Reveal as="li" key={t.id} delay={i * 80} className="glass p-5 md:p-8">
              <p aria-label={`${t.rating} out of 5 stars`} className="accent text-[18px] tracking-widest">{"★".repeat(t.rating)}</p>
              <p className="body-lg mt-3 !text-fg">&ldquo;{t.text}&rdquo;</p>
              <p className="mono mt-4 !text-body">{t.name}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
