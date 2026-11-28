import { copy } from "@/config/copy";

/**
 * JOB: the true facts that make it feel safe to tap, always moving. An acid band of mono capitals, a slow marquee on every width.
 * It pauses on hover, focus and touch, and is a static wrapped row under prefers-reduced-motion. Every item is a confirmed fact.
 */
export function Ticker() {
  const items = copy().ticker;
  return (
    <section aria-label="Key facts" className="ticker overflow-hidden bg-acid">
      <ul className="ticker-track py-4">
        {items.map((f) => (
          <li key={f} className="mono shrink-0 whitespace-nowrap px-6 !text-[14px] font-bold !tracking-[0.14em] !text-black">
            <span aria-hidden className="mr-6 opacity-60">/</span>
            {f}
          </li>
        ))}
        {items.map((f) => (
          <li key={`d-${f}`} aria-hidden className="ticker-dup mono shrink-0 whitespace-nowrap px-6 !text-[14px] font-bold !tracking-[0.14em] !text-black">
            <span className="mr-6 opacity-60">/</span>
            {f}
          </li>
        ))}
      </ul>
    </section>
  );
}
