import Link from "next/link";
import { findPhoto, type Product } from "@/config/products";
import { FEATURED_SLUG } from "@/config/site";
import { money } from "@/lib/format";
import { Blobs } from "./Blobs";
import { Photo } from "./Photo";
import { Reveal } from "./Reveal";

/** Full-bleed feature band: ingredients photo dimmed under a dark overlay + a glass card. Needs an "ingredients" photo. */
export function FeatureBand({ products }: { products: Product[] }) {
  const p = products.find((x) => x.slug === FEATURED_SLUG);
  const bg = p && findPhoto(p, "ingredients");
  if (!p || !bg) return null;
  const fade = "linear-gradient(to bottom, transparent, #000 10%, #000 90%, transparent)";
  return (
    <section aria-label={`Featured: ${p.name}`} className="relative isolate overflow-x-clip">
      {/* Background is a texture, not packaging, so a focal-point cover crop is fine. Focal point: the fruit. */}
      <div aria-hidden className="absolute inset-0 -z-20 opacity-60" style={{ maskImage: fade, WebkitMaskImage: fade }}>
        <Photo src={bg.src} alt="" sizes="100vw" position="50% 52%" className="h-full w-full" />
      </div>
      <div aria-hidden className="absolute inset-0 -z-10 bg-bg/45" />
      <Blobs spots={[{ x: "62%", y: "10%", color: p.glow }]} />
      <div className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-32">
        <Reveal className="glass max-w-xl p-6 md:p-10">
          <p className="mono mb-3">FEATURED</p>
          <h2 className="display h-section">{p.name}</h2>
          <p className="mono mt-3 !text-[15px]">{p.descriptor}</p>
          <p className="body-lg mt-4 !text-fg">{p.description}</p>
          <p className="display mt-6 text-[40px] leading-none">{money(p.price)}</p>
          <div className="mt-6">
            <Link href={`/products/${p.slug}`} className="btn btn-block">
              SHOP {p.name}
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
