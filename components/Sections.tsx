import { SITE } from "@/config/site";
import { copy } from "@/config/copy";
import Link from "next/link";
import type { FaqItem, Policies, StoreSettings } from "@/config/content";
import type { Product } from "@/config/products";
import { Blobs } from "./Blobs";
import { Reveal } from "./Reveal";

const wrap = "mx-auto max-w-[1280px] px-5 md:px-8";

/**
 * JOB (FAQ): remove the last doubts. An accordion of short factual answers. An answer that is still TBC is hidden (never shown as a gap),
 * and ASK US opens WhatsApp on the store's number for anything else.
 */
export function Faq({ items, whatsapp }: { items: FaqItem[]; whatsapp?: string }) {
  const faqs = items.filter((f) => !/\bTBC\b/.test(f.a));
  if (!faqs.length) return null;
  return (
    <section id="faq" className="relative isolate scroll-mt-14 overflow-x-clip">
      <Blobs spots={[{ x: "-12%", y: "20%" }, { x: "70%", y: "60%", delay: -9 }]} />
      <div className={`${wrap} py-14 md:py-24`}>
        <Reveal>
          <p className="eyebrow mb-3">FAQ</p>
          <h2 className="display h-section mb-8 md:mb-12">Questions.</h2>
        </Reveal>
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-14">
          <Reveal className="space-y-3 lg:col-span-8">
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
          {whatsapp && (
            <Reveal delay={80} className="lg:col-span-4">
              <div className="glass p-5 md:p-6 lg:sticky lg:top-24">
                <p className="display text-[22px] leading-tight">Still have a question?</p>
                <p className="body-lg mt-2">Message us and we answer on WhatsApp.</p>
                <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className="btn mt-5 w-full">ASK US</a>
              </div>
            </Reveal>
          )}
        </div>
      </div>
    </section>
  );
}

const Insta = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.2" cy="6.8" r=".6" fill="currentColor" />
  </svg>
);
const WhatsApp = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 20l1.3-4.2A8 8 0 1 1 8.4 18.8L4 20Z" />
    <path d="M9 9.5c.3 2.5 2.5 4.6 5 5l1.2-1.2-1.7-1-.8.6a3.5 3.5 0 0 1-1.6-1.6l.6-.8-1-1.7L9 9.5Z" />
  </svg>
);

/**
 * JOB (footer): the slogan, four columns (Shop, Help, Company, Contact), the policies that are written, the halal badge, how we get paid,
 * where to follow and the doctor line. Mail is optional, so there is no newsletter field: a WhatsApp link replaces it.
 */
export function Footer({ store, policies, products }: { store: StoreSettings; policies?: Policies; products?: Product[] }) {
  const f = copy().footer;
  const links = (["shipping", "returns", "privacy", "terms"] as const).filter((k) => policies?.[k]?.trim());
  const col = "text-[14px] font-bold uppercase tracking-[0.14em] text-acid font-[family-name:var(--font-space-mono)]";
  const item = "link text-[17px]";
  return (
    <footer className="panel relative isolate overflow-x-clip border-t border-white/10">
      <Blobs spots={[{ x: "65%", y: "-40%" }]} />
      <div className={`${wrap} py-12 md:py-16`}>
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-4">
            {/* 220px wide logo is ~48px tall, so 24px padding keeps the half-height clear zone. */}
            <div className="w-[220px] py-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/miel-full.png" alt="MIEL+" width={1051} height={228} loading="lazy" className="block h-auto w-full" />
            </div>
            <p className="display text-[26px] leading-tight">{f.slogan}</p>
            <p className="mono mt-4 inline-flex min-h-10 items-center rounded-full border border-acid/60 px-4 !text-[13px] !tracking-[0.14em]">{f.halal}</p>
            <p className="mt-4 text-[16px] text-body">{f.payments}</p>
          </div>
          <nav aria-label="Shop" className="md:col-span-2">
            <p className={col}>{f.shop}</p>
            <ul className="mt-2">
              <li><Link href="/#shop" className={item}>The lineup</Link></li>
              <li><Link href="/#moments" className={item}>Shop by moment</Link></li>
              {(products ?? []).filter((p) => p.kind !== "bundle").slice(0, 6).map((p) => (
                <li key={p.id}><Link href={`/products/${p.slug}`} className={item}>{p.name}</Link></li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Help" className="md:col-span-2">
            <p className={col}>{f.help}</p>
            <ul className="mt-2">
              <li><Link href="/#faq" className={item}>Questions</Link></li>
              <li><Link href="/#how-it-works" className={item}>How it works</Link></li>
              {links.map((k) => (
                <li key={k}><Link href={`/policies/${k}`} className={`${item} capitalize`}>{k === "returns" ? "Returns" : k}</Link></li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Company" className="md:col-span-2">
            <p className={col}>{f.company}</p>
            <ul className="mt-2">
              <li><Link href="/ambassadors" className={item}>Ambassadors</Link></li>
              <li><Link href="/credits" className={item}>Credits</Link></li>
            </ul>
          </nav>
          <div className="md:col-span-2">
            <p className={col}>{f.contact}</p>
            <ul className="mt-2">
              <li><a href={`https://wa.me/${store.whatsapp}`} target="_blank" rel="noopener noreferrer" className={item}>WhatsApp us</a></li>
              {store.email ? <li><a href={`mailto:${store.email}`} className={item}>{store.email}</a></li> : null}
              {store.phone ? <li><a href={`tel:${store.phone}`} className={item}>{store.phone}</a></li> : null}
            </ul>
            <p className={`${col} mt-6`}>{f.follow}</p>
            <ul className="mt-2 flex gap-2">
              <li>
                <a href={store.instagram_url} target="_blank" rel="noopener noreferrer" aria-label={`Instagram ${store.instagram_handle}`} className="icon-btn"><Insta /></a>
              </li>
              <li>
                <a href={`https://wa.me/${store.whatsapp}?text=${encodeURIComponent("Hi MIEL+, please add me to your updates.")}`} target="_blank" rel="noopener noreferrer" aria-label={f.join} className="icon-btn"><WhatsApp /></a>
              </li>
            </ul>
            <p className="mt-3 text-[15px] text-body">{f.joinLine}</p>
          </div>
        </div>
        <p className="mt-10 max-w-3xl border-t border-white/10 pt-6 text-[15px] text-body">{f.disclaimer}</p>
        <p className="mt-4 text-[16px] !text-body">
          © {new Date().getFullYear()} {SITE.name}. Made for Lebanon.
        </p>
        <p className="mt-2 text-[14px] !text-body">
          Map data © OpenStreetMap contributors, GeoNames.
        </p>
      </div>
    </footer>
  );
}
