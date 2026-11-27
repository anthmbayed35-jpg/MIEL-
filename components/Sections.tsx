import { SITE } from "@/config/site";
import { copy } from "@/config/copy";
import Link from "next/link";
import type { FaqItem, Policies, StoreSettings } from "@/config/content";
import type { Product } from "@/config/products";
import { Blobs } from "./Blobs";
import { Reveal } from "./Reveal";

const wrap = "mx-auto max-w-[1280px] px-5 md:px-8";

export function Faq({ items: faqs }: { items: FaqItem[] }) {
  return (
    <section id="faq" className="relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "-12%", y: "20%" }, { x: "70%", y: "60%", delay: -9 }]} />
      <div className={`${wrap} pb-16 md:pb-24`}>
      <Reveal>
        <p className="eyebrow mb-3">FAQ</p>
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

/** JOB: the slogan, the ways to reach us and where to follow. Links only to things that exist (policies only when written). */
export function Footer({ store, policies, products }: { store: StoreSettings; policies?: Policies; products?: Product[] }) {
  const f = copy().footer;
  const links = (["shipping", "returns", "privacy", "terms"] as const).filter((k) => policies?.[k]?.trim());
  const col = "text-[15px] font-semibold uppercase tracking-[0.12em] text-fg font-[family-name:var(--font-space-mono)]";
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
            <p className="mono mt-3 !text-body">{copy().heroChips.join(" / ")}</p>
          </div>
          <nav aria-label="Shop" className="md:col-span-2">
            <p className={col}>{f.shop}</p>
            <ul className="mt-2">
              <li><Link href="/#lineup" className="link text-[17px]">The lineup</Link></li>
              {(products ?? []).filter((p) => p.kind !== "bundle").slice(0, 6).map((p) => (
                <li key={p.id}><Link href={`/products/${p.slug}`} className="link text-[17px]">{p.name}</Link></li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Help" className="md:col-span-3">
            <p className={col}>{f.help}</p>
            <ul className="mt-2">
              <li><Link href="/#faq" className="link text-[17px]">Questions</Link></li>
              {links.map((k) => (
                <li key={k}><Link href={`/policies/${k}`} className="link text-[17px] capitalize">{k === "returns" ? "Returns" : k}</Link></li>
              ))}
              <li><Link href="/ambassadors" className="link text-[17px]">Ambassadors</Link></li>
            </ul>
          </nav>
          <div className="md:col-span-3">
            <p className={col}>{f.follow}</p>
            <ul className="mt-2">
              <li>
                <a href={store.instagram_url} target="_blank" rel="noopener noreferrer" className="link text-[17px]">Instagram {store.instagram_handle}</a>
              </li>
            </ul>
            <p className={`${col} mt-6`}>{f.contact}</p>
            <ul className="mt-2">
              <li>
                <a href={`https://wa.me/${store.whatsapp}`} target="_blank" rel="noopener noreferrer" className="link text-[17px]">WhatsApp us</a>
              </li>
              {store.email ? <li><a href={`mailto:${store.email}`} className="link text-[17px]">{store.email}</a></li> : null}
              {store.phone ? <li><a href={`tel:${store.phone}`} className="link text-[17px]">{store.phone}</a></li> : null}
            </ul>
          </div>
        </div>
        <p className="mt-10 text-[16px] !text-body">
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
