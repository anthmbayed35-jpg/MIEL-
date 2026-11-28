import Link from "next/link";
import type { Product } from "@/config/products";
import { lifestyleFor } from "@/lib/media";
import { copy } from "@/config/copy";
import { HeaderBar } from "./HeaderBar";
import { PicView } from "./media/PicView";

/** The moments read in the order of a day: before the work, the long push, every day. */
const ORDER = ["gold", "red-burn", "creatine"];
const rank = (slug: string) => {
  const i = ORDER.indexOf(slug);
  return i < 0 ? ORDER.length : i;
};

/** The "Shop by moment" cards (server-rendered, so no photo data reaches the client bundle). Each: a photo, the bold product name, its timing cue. */
function MomentCards({ products }: { products: Product[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-3">
      {[...products].sort((a, b) => rank(a.slug) - rank(b.slug)).slice(0, 3).map((p) => {
        const shot = lifestyleFor(p)[0];
        return (
          <li key={p.id}>
            <Link href={`/products/${p.slug}`} className="group relative isolate flex min-h-28 items-end overflow-hidden rounded-2xl border border-white/15 p-4 transition-colors md:aspect-[4/3]" style={{ ["--tint" as string]: p.glow }}>
              {shot && <PicView pic={shot.wide} sizes="(min-width: 768px) 380px, 100vw" className="absolute inset-0 -z-20 h-full w-full" position="50% 40%" />}
              <span aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgba(20,18,15,0.92),rgba(20,18,15,0.35)_70%,rgba(20,18,15,0.15))]" />
              <span aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" style={{ background: "var(--tint)" }} />
              <span>
                <span className="display block text-[22px] leading-none">{p.name}</span>
                <span className="mono mt-1 block !text-[13px]">{p.pageCopy?.moment.label ?? p.descriptor}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * JOB: the way around the site. A 56px header that hides when you scroll down and returns when you scroll up: logo, SHOP / MOMENTS /
 * HOW IT WORKS / FAQ, the cart and a phone menu. SHOP opens a "Shop by moment" panel of three photo cards.
 */
export function Header({ products }: { products: Product[] }) {
  const n = copy().nav;
  return <HeaderBar panel={<MomentCards products={products.filter((p) => p.kind !== "bundle")} />} nav={n} />;
}
