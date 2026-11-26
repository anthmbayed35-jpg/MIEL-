import { SITE } from "@/config/site";
import { copy } from "@/config/copy";
import Link from "next/link";
import type { FaqItem, Policies, StoreSettings, Testimonial } from "@/config/content";
import { Blobs } from "./Blobs";
import { Reveal } from "./Reveal";

const wrap = "mx-auto max-w-7xl px-5 md:px-8";

/** JOB: attack the old routine (scoop, shaker, mixing) in four short lines. */
export function WhySachet() {
  const w = copy().whySachet;
  return (
    <section className="relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "65%", y: "-10%" }, { x: "-15%", y: "60%", delay: -11 }]} />
      <div className={`${wrap} py-14 md:py-24`}>
        <Reveal>
          <p className="mono mb-3">{w.kicker}</p>
          <h2 className="display h-section mb-8 md:mb-12">
            {w.title1} <span className="accent">{w.title2}</span>
          </h2>
        </Reveal>
        <ul className="grid gap-4 sm:grid-cols-2">
          {w.lines.map((line, i) => (
            <Reveal as="li" key={line} delay={i * 60} className="glass-flat flex min-h-20 items-center gap-4 p-5 md:p-6">
              <span aria-hidden className="display accent text-[28px] leading-none">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-[18px] leading-snug text-fg md:text-[20px]">{line}</span>
            </Reveal>
          ))}
        </ul>
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

/** JOB: one last clear action. */
export function FinalCta({ action }: { action?: React.ReactNode }) {
  const f = copy().finalCta;
  return (
    <section className="relative isolate overflow-x-clip bg-black">
      <Blobs spots={[{ x: "50%", y: "-30%" }, { x: "-10%", y: "30%", delay: -8 }]} />
      <div className={`${wrap} py-16 md:py-32`}>
        <Reveal>
          <h2 className="display h-section">
            {f.title1} <span className="accent">{f.title2}</span>
          </h2>
          <div className="mt-8">
            {action ?? (
              <a href="#lineup" className="btn">
                {f.cta}
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
