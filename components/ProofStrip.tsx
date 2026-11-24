import { COPY } from "@/config/copy";

const facts = COPY.proofStrip;

export function ProofStrip() {
  return (
    <section aria-label="Key facts" className="mx-auto max-w-7xl px-5 md:px-8">
      <div className="glass overflow-hidden">
        <ul className="marquee-track py-5 md:px-8">
          {facts.map((f) => (
            <li key={f} className="mono shrink-0 whitespace-nowrap px-6 !text-[14px] !text-fg md:px-0">
              <span aria-hidden className="accent mr-6 md:hidden">/</span>
              {f}
            </li>
          ))}
          {/* Duplicate set for a seamless loop on mobile only */}
          {facts.map((f) => (
            <li key={`d-${f}`} aria-hidden className="marquee-dup mono shrink-0 whitespace-nowrap px-6 !text-[14px] !text-fg">
              <span className="accent mr-6">/</span>
              {f}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
