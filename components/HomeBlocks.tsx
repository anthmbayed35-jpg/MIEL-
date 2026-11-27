import Link from "next/link";
import type { Product } from "@/config/products";
import { copy } from "@/config/copy";
import type { Testimonial } from "@/config/content";
import type { Pic } from "@/lib/media";
import { Blobs } from "./Blobs";
import { IconBefore, IconDuring, IconEveryDay, IconOnTheGo } from "./icons";
import { PicView } from "./media/PicView";
import { Reveal } from "./Reveal";

const wrap = "mx-auto max-w-[1280px] px-5 md:px-8";

/** JOB: show what they gain by switching. Each old routine next to the sachet that replaces it (no brand names). */
export function OldVsNew({ products }: { products: Product[] }) {
  const t = copy().oldVsNew;
  const rows = products.filter((p) => p.pageCopy?.compare);
  if (!rows.length) return null;
  return (
    <section className="panel panel-edge relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "60%", y: "-10%" }]} />
      <div className={`${wrap} py-14 md:py-24`}>
        <Reveal>
          <p className="eyebrow mb-3">{t.kicker}</p>
          <h2 className="display h-section mb-8 md:mb-12">
            {t.title1} <span className="accent">{t.title2}</span>
          </h2>
        </Reveal>
        <ul className="grid gap-4 lg:grid-cols-3">
          {rows.map((p, i) => (
            <Reveal as="li" key={p.id} delay={i * 80} className="glass-flat overflow-hidden">
              <p className="mono border-b border-white/10 px-5 py-3">{p.name}</p>
              <div className="grid grid-cols-2">
                <div className="border-r border-white/10 p-4 md:p-5">
                  <p className="mono !text-body !text-[13px]">{t.oldLabel}</p>
                  <p className="display mt-2 text-[17px] leading-tight text-body md:text-[19px]">{p.pageCopy!.compare.old}</p>
                </div>
                <div className="bg-acid/10 p-4 md:p-5">
                  <p className="mono !text-[13px]">{t.newLabel}</p>
                  <p className="display mt-2 text-[17px] leading-tight md:text-[19px]">{p.pageCopy!.compare.now}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

const ICONS = [IconBefore, IconDuring, IconEveryDay, IconOnTheGo];

/** JOB: four moments, four short lines, one consistent set of line icons. Serving timing is TBC, so none is stated. */
export function UsageGuide() {
  const u = copy().usage;
  return (
    <section className="relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "-10%", y: "20%" }, { x: "70%", y: "60%", delay: -9 }]} />
      <div className={`${wrap} py-14 md:py-24`}>
        <Reveal>
          <p className="eyebrow mb-3">{u.kicker}</p>
          <h2 className="display h-section mb-8 md:mb-12">
            {u.title1} <span className="accent">{u.title2}</span>
          </h2>
        </Reveal>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {u.cards.map((c, i) => {
            const Icon = ICONS[i];
            return (
              <Reveal as="li" key={c.label} delay={i * 60} className="glass glass-hover p-5 md:p-6">
                <span className="grid h-12 w-12 place-items-center rounded-full border border-acid/50 text-acid">
                  <Icon />
                </span>
                <p className="display mt-5 text-[20px]">{c.label}</p>
                <p className="body-lg mt-2">{c.text}</p>
              </Reveal>
            );
          })}
        </ul>
        <p className="mono mt-6 !text-body !text-[14px]">{u.note}</p>
      </div>
    </section>
  );
}

/** JOB: the slogan, huge, as a pause before the proof. Grain texture and a flavour-coloured glow behind it. */
export function TypoBand() {
  const b = copy().band;
  return (
    <section aria-label={`${b.line1} ${b.line2}`} className="grain-heavy relative isolate overflow-hidden bg-black">
      <span aria-hidden className="mesh absolute inset-0 -z-10 opacity-70" style={{ ["--glow" as string]: "rgba(218,252,105,0.22)", ["--glow2" as string]: "rgba(184,20,62,0.35)" }} />
      <div className={`${wrap} relative z-10 py-16 md:py-28`}>
        <p className="display text-[clamp(2.75rem,0.5rem+12vw,12rem)] leading-[0.95]">
          {b.line1}
          <br />
          <span className="accent">{b.line2}</span>
        </p>
        <p className="mono mt-6 !text-[15px] !tracking-[0.2em]">{b.sub}</p>
      </div>
    </section>
  );
}

/** JOB: real words from real people. Rendered ONLY when real, approved entries exist (Admin > Marketing > Content); otherwise nothing at all. */
export function Reviews({ items }: { items: Testimonial[] }) {
  if (!items.length) return null;
  const r = copy().reviews;
  return (
    <section className="panel panel-edge relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "60%", y: "-10%" }]} />
      <div className={`${wrap} py-14 md:py-24`}>
        <Reveal>
          <p className="eyebrow mb-3">{r.kicker}</p>
          <h2 className="display h-section mb-8 md:mb-12">
            {r.title1} <span className="accent">{r.title2}</span>
          </h2>
        </Reveal>
        <ul className="grid gap-4 lg:grid-cols-3">
          {items.slice(0, 6).map((t, i) => (
            <Reveal as="li" key={t.id} delay={i * 80} className="glass p-5 md:p-8">
              {t.rating > 0 && <p aria-label={`${t.rating} out of 5 stars`} className="accent text-[18px] tracking-widest">{"★".repeat(t.rating)}</p>}
              <p className="body-lg mt-3 !text-fg">&ldquo;{t.text}&rdquo;</p>
              <p className="mono mt-4 !text-body">{t.name}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** JOB: one last clear action, over a full-bleed image (or the glow when there is none). */
export function ClosingCta({ media, action }: { media: { wide: Pic; tall: Pic } | null; action?: React.ReactNode }) {
  const f = copy().finalCta;
  return (
    <section className="relative isolate overflow-hidden bg-black">
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
          <h2 className="display text-[clamp(2.25rem,1rem+6vw,6rem)] leading-[1.02]">
            {f.title1}
            <br />
            <span className="accent">{f.title2}</span>
          </h2>
          <div className="mt-8">
            {action ?? (
              <Link href="/#lineup" className="btn">
                {f.cta}
              </Link>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
