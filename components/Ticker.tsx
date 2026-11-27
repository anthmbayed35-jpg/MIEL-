import { copy } from "@/config/copy";

/**
 * JOB: the true facts that make it feel safe to tap, always moving. A slow marquee on every width. It pauses on hover and focus and is
 * a static wrapped row under prefers-reduced-motion. Every item is a fact printed on the packs.
 */
export function Ticker() {
  const items = copy().ticker;
  return (
    <section aria-label="Key facts" className="ticker panel panel-edge overflow-hidden">
      <ul className="ticker-track py-5">
        {items.map((f) => (
          <li key={f} className="mono shrink-0 whitespace-nowrap px-7 !text-[14px] !tracking-[0.14em] !text-fg">
            <span aria-hidden className="accent mr-7">/</span>
            {f}
          </li>
        ))}
        {items.map((f) => (
          <li key={`d-${f}`} aria-hidden className="ticker-dup mono shrink-0 whitespace-nowrap px-7 !text-[14px] !tracking-[0.14em] !text-fg">
            <span className="accent mr-7">/</span>
            {f}
          </li>
        ))}
      </ul>
    </section>
  );
}
