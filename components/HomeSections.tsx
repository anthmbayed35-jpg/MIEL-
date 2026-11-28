import Link from "next/link";
import { copy } from "@/config/copy";
import type { GalleryItem, Testimonial } from "@/config/content";
import { findPhoto, type Product } from "@/config/products";
import type { Pic } from "@/lib/media";
import { lifestyleFor } from "@/lib/media";
import { Blobs } from "./Blobs";
import { ExplorerTabs, type ExplorerItem } from "./ExplorerTabs";
import { IconBefore, IconDuring, IconEveryDay, IconOnTheGo } from "./icons";
import { DrawDose, DrawHoney, DrawNoMixing, DrawSachet } from "./icons-lg";
import { PicView } from "./media/PicView";
import { Photo } from "./Photo";
import { ProductImage } from "./ProductImage";
import { Reveal } from "./Reveal";
import { StoryPlayer } from "./StoryPlayer";

const wrap = "mx-auto max-w-[1280px] px-5 md:px-8";
/** The moments read in the order of a day. Other products follow. */
const ORDER = ["gold", "red-burn", "creatine"];
const rank = (slug: string) => {
  const i = ORDER.indexOf(slug);
  return i < 0 ? ORDER.length : i;
};
export const inOrder = (products: Product[]) => [...products].filter((p) => p.kind !== "bundle").sort((a, b) => rank(a.slug) - rank(b.slug));
const alpha = (rgba: string, a: number) => rgba.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${a})`);

/**
 * JOB (feature panels): one stacked two-column panel per product with the one confirmed number it leads with, big, plus when to use it.
 * Image first on phones; on desktop the image alternates sides. Nothing TBC is shown.
 */
export function FeaturePanels({ products }: { products: Product[] }) {
  const f = copy().features;
  const list = inOrder(products).filter((p) => p.pageCopy);
  if (!list.length) return null;
  return (
    <div id="features">
      {list.map((p, i) => {
        const c = p.pageCopy!;
        const shot = lifestyleFor(p)[1] ?? lifestyleFor(p)[0];
        return (
          <section key={p.id} aria-label={`${p.name}: ${c.moment.label}`} className={`relative isolate overflow-x-clip ${i % 2 === 0 ? "panel panel-edge" : ""}`}>
            <span aria-hidden className="mesh pointer-events-none absolute inset-0 -z-10 opacity-40" style={{ ["--glow" as string]: alpha(p.glow, 0.4) }} />
            <div className={`${wrap} grid items-center gap-8 py-14 md:py-24 lg:grid-cols-12 lg:gap-14`}>
              <Reveal className={`lg:col-span-6 ${i % 2 === 1 ? "lg:order-2" : ""}`}>
                <div className="relative mx-auto aspect-[4/5] w-full max-w-[520px] overflow-hidden rounded-[22px] border border-white/15 shadow-[0_16px_50px_rgba(0,0,0,0.45)]">
                  {shot && <PicView pic={shot.tall} sizes="(min-width: 1024px) 520px, calc(100vw - 40px)" className="h-full w-full" position="50% 40%" />}
                </div>
              </Reveal>
              <Reveal delay={80} className="lg:col-span-6">
                <p className="eyebrow mb-3">{c.moment.label}</p>
                <h3 className="display h-section">{p.name}</h3>
                <p className="display mt-2 text-[18px] text-fg md:text-[22px]">{c.descriptor3}</p>
                <p className="display accent mt-6 text-[clamp(4.5rem,3rem+9vw,10rem)] leading-[0.9]">
                  {c.stat.value}
                  <span className="ml-2 text-[0.38em]">{c.stat.unit}</span>
                </p>
                <p className="mono mt-2 !tracking-[0.14em]">{c.stat.caption}</p>
                <p className="body-lg mt-5 max-w-xl">{c.body}</p>
                <p className="mono mt-6 !text-body">{f.whenLabel}</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {c.takeWhen.map((t) => (
                    <li key={t} className="glass-flat flex min-h-12 items-center px-4 text-[16px] text-fg">{t}</li>
                  ))}
                </ul>
                <div className="mt-7">
                  <Link href={`/products/${p.slug}`} className="btn">{f.shop} {p.name}</Link>
                </div>
              </Reveal>
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** JOB (flavour explorer): see what is in each flavour. Builds the tab data on the server (photos stay out of the client bundle). */
export function FlavorExplorer({ products }: { products: Product[] }) {
  const list = inOrder(products).filter((p) => p.pageCopy).slice(0, 3);
  if (!list.length) return null;
  const t = copy().explorer;
  const steps = copy().howTo.steps;
  const items: ExplorerItem[] = list.map((p) => {
    const c = p.pageCopy!;
    const photo = findPhoto(p, "ingredients") ?? findPhoto(p, "pouch-hero");
    return {
      slug: p.slug,
      name: p.name,
      glow: p.glow,
      descriptor3: c.descriptor3,
      tagline: c.tagline,
      body: c.body,
      benefits: p.why.map((b) => ({ title: b.title, text: b.text })),
      tags: c.takeWhen,
      steps: steps.map((s) => ({ title: s.title, text: s.text })),
      // only what is confirmed: a fact that is TBC is not shown at all
      facts: p.facts.filter((x) => x.value !== null && x.label !== "Sachets per pouch").map((x) => ({ label: x.label, value: String(x.value) })),
      image: <ProductImage photo={photo} alt={photo?.alt ?? p.imageAlt} label={`${p.name} INGREDIENTS`} sizes="(min-width: 1024px) 460px, calc(100vw - 56px)" className="h-full w-full" />,
    };
  });
  return <ExplorerTabs items={items} text={t} />;
}

const DRAWINGS = [DrawNoMixing, DrawSachet, DrawDose, DrawHoney];

/** JOB (why honey): four numbered pillars that attack the old routine. Anchor: #how-it-works. */
export function WhyHoney() {
  const w = copy().whyHoney;
  return (
    <section id="how-it-works" className="panel panel-edge relative isolate scroll-mt-14 overflow-x-clip">
      <Blobs spots={[{ x: "65%", y: "-10%" }, { x: "-15%", y: "60%", delay: -11 }]} />
      <div className={`${wrap} py-14 md:py-24`}>
        <Reveal>
          <p className="eyebrow mb-3">{w.kicker}</p>
          <h2 className="display h-section mb-8 md:mb-12">
            {w.title1} <span className="accent">{w.title2}</span>
          </h2>
        </Reveal>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {w.cards.map((c, i) => {
            const Draw = DRAWINGS[i];
            return (
              <Reveal as="li" key={c.title} delay={i * 70} className="glass flex flex-col p-5 md:p-6">
                <span className="mono !text-[13px] !tracking-[0.2em]">{String(i + 1).padStart(2, "0")}/{String(w.cards.length).padStart(2, "0")}</span>
                <span className="mt-5 text-acid"><Draw /></span>
                <h3 className="display mt-5 text-[20px] leading-tight">{c.title}</h3>
                <p className="body-lg mt-3">{c.text}</p>
              </Reveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/**
 * JOB (comparison): factual, non-disparaging attributes of product TYPES (no brand names). Scrolls sideways on a phone with the first
 * column fixed. All wording is in config/copy.ts and needs owner approval before launch (docs/COPY.md).
 */
export function CompareMatrix() {
  const m = copy().compare;
  return (
    <section id="compare" className="relative isolate scroll-mt-14 overflow-x-clip">
      <div className={`${wrap} py-14 md:py-24`}>
        <Reveal>
          <p className="eyebrow mb-3">{m.kicker}</p>
          <h2 className="display h-section mb-8 md:mb-12">
            {m.title1} <span className="accent">{m.title2}</span>
          </h2>
        </Reveal>
        <Reveal className="glass overflow-hidden">
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${m.title1} ${m.title2}`}>
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left">
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 bg-[#2a2622] px-4 py-4"><span className="sr-only">Attribute</span></th>
                  {m.cols.map((c, i) => (
                    <th key={c} scope="col" className={`mono px-4 py-4 text-center !text-[13px] ${i === 0 ? "bg-acid/15 !text-acid" : "!text-body"}`}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row" className="sticky left-0 z-10 border-t border-white/10 bg-[#2a2622] px-4 py-4 text-[16px] font-semibold text-fg">{r.label}</th>
                    {r.cells.map((cell, i) => (
                      <td key={i} className={`border-t border-white/10 px-4 py-4 text-center text-[16px] ${i === 0 ? "bg-acid/10 font-semibold text-fg" : "text-body"}`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
        <p className="mt-4 text-[15px] text-body">{m.note}</p>
      </div>
    </section>
  );
}

const ICONS = [IconBefore, IconDuring, IconEveryDay, IconOnTheGo];

/** JOB (how to use): numbered steps, one per moment, with the line-icon set. Serving timing is TBC, so none is stated. */
export function UsageGuide() {
  const u = copy().usage;
  return (
    <section id="usage" className="panel panel-edge relative isolate scroll-mt-14 overflow-x-clip">
      <Blobs spots={[{ x: "-10%", y: "20%" }, { x: "70%", y: "60%", delay: -9 }]} />
      <div className={`${wrap} py-14 md:py-24`}>
        <Reveal>
          <p className="eyebrow mb-3">{u.kicker}</p>
          <h2 className="display h-section mb-8 md:mb-12">
            {u.title1} <span className="accent">{u.title2}</span>
          </h2>
        </Reveal>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {u.cards.map((c, i) => {
            const Icon = ICONS[i];
            return (
              <Reveal as="li" key={c.label} delay={i * 60} className="glass glass-hover p-5 md:p-6">
                <div className="flex items-center justify-between">
                  <span className="display accent text-[44px] leading-none">{String(i + 1).padStart(2, "0")}</span>
                  <span className="grid h-12 w-12 place-items-center rounded-full border border-acid/50 text-acid"><Icon /></span>
                </div>
                <p className="display mt-5 text-[20px]">{c.label}</p>
                <p className="body-lg mt-2">{c.text}</p>
              </Reveal>
            );
          })}
        </ol>
        <p className="mono mt-6 !text-body !text-[14px]">{u.note}</p>
      </div>
    </section>
  );
}

/** JOB (brand story): why we built MIEL+. Rendered by the page only when a story film exists. Anchor: #story. */
export function StorySection({ story }: { story: { mp4: string; poster: string | null } }) {
  const s = copy().story;
  return (
    <section id="story" className="relative isolate scroll-mt-14 overflow-x-clip">
      <Blobs spots={[{ x: "30%", y: "-10%" }]} />
      <div className={`${wrap} py-14 md:py-24`}>
        <Reveal className="mx-auto max-w-4xl text-center">
          <p className="eyebrow mb-3 justify-center">{s.kicker}</p>
          <h2 className="display h-section mb-8">
            {s.title1} <span className="accent">{s.title2}</span>
          </h2>
          <StoryPlayer mp4={story.mp4} poster={story.poster} label={s.play} />
        </Reveal>
      </div>
    </section>
  );
}

/**
 * JOB (community): real words and real photos. The page renders this ONLY when approved reviews or approved gallery photos exist;
 * there are no placeholder entries, ever. Reviews are a swipeable row; "Fueled by you" is a photo grid.
 */
export function Community({ reviews, gallery }: { reviews: Testimonial[]; gallery: GalleryItem[] }) {
  const c = copy().community;
  if (!reviews.length && !gallery.length) return null;
  return (
    <section id="community" className="panel panel-edge relative isolate scroll-mt-14 overflow-x-clip">
      <div className={`${wrap} py-14 md:py-24`}>
        {reviews.length > 0 && (
          <>
            <Reveal>
              <p className="eyebrow mb-3">{c.reviewsKicker}</p>
              <h2 className="display h-section mb-8 md:mb-12">
                {c.reviewsTitle1} <span className="accent">{c.reviewsTitle2}</span>
              </h2>
            </Reveal>
            <ul className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 md:mx-0 md:px-0 lg:grid lg:grid-cols-3 lg:overflow-visible">
              {reviews.slice(0, 9).map((t) => (
                <li key={t.id} className="glass w-[84%] shrink-0 snap-center p-5 md:w-[46%] md:p-8 lg:w-auto">
                  {t.rating > 0 && <p aria-label={`${t.rating} out of 5 stars`} className="accent text-[18px] tracking-widest">{"★".repeat(t.rating)}</p>}
                  <p className="body-lg mt-3 !text-fg">&ldquo;{t.text}&rdquo;</p>
                  <p className="mono mt-4 !text-body">{t.name}</p>
                </li>
              ))}
            </ul>
          </>
        )}
        {gallery.length > 0 && (
          <div className={reviews.length ? "mt-16 md:mt-24" : ""}>
            <Reveal>
              <p className="eyebrow mb-3">{c.galleryKicker}</p>
              <h2 className="display h-section mb-8 md:mb-12">
                {c.galleryTitle1} <span className="accent">{c.galleryTitle2}</span>
              </h2>
            </Reveal>
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {gallery.slice(0, 12).map((g) => (
                <li key={g.id} className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-white/10">
                  <Photo src={g.src} alt={g.alt} sizes="(min-width: 1024px) 300px, 50vw" className="h-full w-full" />
                  {g.credit && <span className="mono absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 !text-[13px] !text-fg">{g.credit}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

/** JOB (closing band): mirrors the hero: FUEL THE GRIND over the closing image and one clear button. On product pages it keeps its own line and button (`action`). */
export function ClosingCta({ media, action, home = false }: { media: { wide: Pic; tall: Pic } | null; action?: React.ReactNode; home?: boolean }) {
  const cp = copy();
  const f = home ? cp.closing : cp.finalCta;
  return (
    <section id={home ? "closing" : undefined} className="relative isolate overflow-hidden bg-black">
      {media && (
        <>
          <PicView pic={media.tall} sizes="100vw" className="absolute inset-0 -z-20 h-full w-full opacity-55 md:hidden" position="50% 50%" />
          <PicView pic={media.wide} sizes="100vw" className="absolute inset-0 -z-20 hidden h-full w-full opacity-55 md:block" position="50% 50%" />
        </>
      )}
      <span aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,#000_6%,rgba(0,0,0,0.35)_60%,rgba(0,0,0,0.6)_100%)]" />
      <Blobs spots={[{ x: "50%", y: "-30%" }, { x: "-10%", y: "30%", delay: -8 }]} />
      <div className={`${wrap} py-20 md:py-36`}>
        <Reveal>
          {home && <p className="eyebrow mb-4">{cp.brandTagline}</p>}
          <h2 className="display text-[clamp(2.25rem,1rem+6vw,6rem)] leading-[1.02]">
            {f.title1}
            <br />
            <span className="accent">{f.title2}</span>
          </h2>
          <div className="mt-8">
            {action ?? (
              <Link href="/#shop" className="btn">
                {f.cta}
              </Link>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/** JOB (ambassador band): one line and one button to the application. No money, levels or perks. */
export function AmbassadorBand() {
  const a = copy().ambassador;
  return (
    <section id="ambassadors" className="panel panel-edge relative isolate overflow-x-clip">
      <div className={`${wrap} flex flex-col gap-6 py-14 md:flex-row md:items-center md:justify-between md:py-20`}>
        <Reveal>
          <p className="eyebrow mb-3">{a.kicker}</p>
          <h2 className="display h-section">
            {a.title1} <span className="accent">{a.title2}</span>
          </h2>
          <p className="body-lg mt-3 max-w-xl">{a.line}</p>
        </Reveal>
        <Reveal delay={80}>
          <Link href="/ambassadors" className="btn">{a.cta}</Link>
        </Reveal>
      </div>
    </section>
  );
}
