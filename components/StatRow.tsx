import { copy } from "@/config/copy";
import { Reveal } from "./Reveal";

/** JOB: big true numbers a glance can take in: 12 sachets, 150 mg, 5 g, 0 mixing. Only facts printed on the packs. */
export function StatRow() {
  const s = copy().stats;
  return (
    <section aria-label={s.kicker} className="relative isolate overflow-x-clip">
      <div className="mx-auto max-w-[1280px] px-5 py-14 md:px-8 md:py-20">
        <ul className="grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
          {s.items.map((it, i) => (
            <Reveal as="li" key={it.caption} delay={i * 60} className="border-t-2 border-acid pt-4">
              <p className="display accent text-[clamp(3rem,2rem+5vw,6rem)] leading-none">
                {it.value}
                {it.unit && <span className="ml-1 text-[0.4em]">{it.unit}</span>}
              </p>
              <p className="mono mt-3 !text-body !tracking-[0.12em]">{it.caption}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
