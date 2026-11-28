"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Blobs } from "./Blobs";

export type ExplorerItem = {
  slug: string;
  name: string;
  glow: string; // rgba(r, g, b, a)
  descriptor3: string;
  tagline: string;
  body: string;
  benefits: { title: string; text: string }[];
  tags: string[];
  steps: { title: string; text: string }[];
  facts: { label: string; value: string }[];
  /** the ingredient photo, rendered on the server */
  image: React.ReactNode;
};
export type ExplorerCopy = { kicker: string; title1: string; title2: string; benefits: string; usage: string; facts: string; cta: string };

const alpha = (rgba: string, a: number) => rgba.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${a})`);

/**
 * JOB: see what is in each flavour. Three large swatch tiles (a tablist: arrow keys, Home and End move between them); the panel under
 * them swaps with a short fade (image, descriptor, benefits, usage, the facts that are confirmed). Facts that are TBC are not shown.
 */
export function ExplorerTabs({ items, text }: { items: ExplorerItem[]; text: ExplorerCopy }) {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const cur = items[active] ?? items[0];
  if (!cur) return null;

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = items.length;
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % n;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    if (next < 0) return;
    e.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <section id="explorer" className="relative isolate scroll-mt-14 overflow-x-clip">
      <Blobs spots={[{ x: "-12%", y: "10%" }]} />
      {/* the flavour glow: one mesh that changes colour with the selected flavour */}
      <span aria-hidden className="mesh pointer-events-none absolute inset-0 -z-10 opacity-60 transition-opacity duration-300" style={{ ["--glow" as string]: alpha(cur.glow, 0.45) }} />
      <div className="mx-auto max-w-[1280px] px-5 py-14 md:px-8 md:py-24">
        <p className="eyebrow mb-3">{text.kicker}</p>
        <h2 className="display h-section mb-8 md:mb-12">
          {text.title1} <span className="accent">{text.title2}</span>
        </h2>

        <div role="tablist" aria-label={`${text.title1} ${text.title2}`} className="grid gap-2 sm:grid-cols-3 md:gap-4">
          {items.map((it, i) => {
            const on = i === active;
            return (
              <button
                key={it.slug}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                role="tab"
                id={`tab-${it.slug}`}
                aria-selected={on}
                aria-controls="explorer-panel"
                tabIndex={on ? 0 : -1}
                onClick={() => setActive(i)}
                onKeyDown={(e) => onKey(e, i)}
                className={`relative isolate flex min-h-16 flex-col justify-end overflow-hidden rounded-2xl border p-4 text-left transition-[border-color,transform] duration-200 sm:min-h-28 md:min-h-32 md:p-5 ${on ? "sm:-translate-y-0.5" : "opacity-85 hover:opacity-100"}`}
                style={{ borderColor: on ? alpha(it.glow, 1) : "rgba(255,255,255,0.14)", background: `linear-gradient(160deg, ${alpha(it.glow, on ? 0.55 : 0.28)}, rgba(35,32,28,0.9) 75%)` }}
              >
                <span className="display text-[20px] leading-tight md:text-[22px]">{it.name}</span>
                <span className="mono mt-1 !text-[13px] !leading-tight">{it.descriptor3}</span>
              </button>
            );
          })}
        </div>

        <div key={cur.slug} id="explorer-panel" role="tabpanel" aria-labelledby={`tab-${cur.slug}`} tabIndex={0} className="panel-in mt-6 grid gap-6 lg:grid-cols-12 lg:items-start lg:gap-10">
          <div className="glass mx-auto w-full max-w-[460px] p-2 sm:p-3 lg:col-span-5 lg:mx-0">
            <div className="aspect-[4/5] w-full overflow-hidden rounded-[12px]">{cur.image}</div>
          </div>
          <div className="glass p-5 md:p-8 lg:col-span-7">
            <p className="mono">{cur.tagline}</p>
            <h3 className="display mt-2 text-[clamp(1.75rem,1.2rem+2vw,2.75rem)]">{cur.name}</h3>
            <p className="display mt-1 text-[18px] text-fg">{cur.descriptor3}</p>
            <p className="body-lg mt-4">{cur.body}</p>

            <p className="mono mt-6 !text-body">{text.benefits}</p>
            <ul className="mt-2 space-y-2">
              {cur.benefits.map((b) => (
                <li key={b.title} className="flex gap-3 text-[17px] leading-snug text-fg">
                  <span aria-hidden className="accent shrink-0">+</span>
                  <span><strong className="font-semibold">{b.title}.</strong> <span className="text-body">{b.text}</span></span>
                </li>
              ))}
            </ul>

            <p className="mono mt-6 !text-body">{text.usage}</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {cur.tags.map((t) => (
                <li key={t} className="rounded-full border border-white/20 px-3 py-1 text-[15px] text-fg">{t}</li>
              ))}
            </ul>
            <ol className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[16px] text-body">
              {cur.steps.map((s, i) => (
                <li key={s.title}><span className="accent mono mr-1">{String(i + 1).padStart(2, "0")}</span>{s.title}: {s.text}</li>
              ))}
            </ol>

            {cur.facts.length > 0 && (
              <>
                <p className="mono mt-6 !text-body">{text.facts}</p>
                <dl className="mt-2 divide-y divide-white/10">
                  {cur.facts.map((f) => (
                    <div key={f.label} className="flex min-h-11 items-center justify-between gap-4 py-2">
                      <dt className="mono !text-body">{f.label}</dt>
                      <dd className="mono text-right">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
            <div className="mt-6">
              <Link href={`/products/${cur.slug}`} className="btn">{text.cta} {cur.name}</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
