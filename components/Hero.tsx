import Image from "next/image";
import { heroImage } from "@/config/products";
import { SACHETS_PER_POUCH } from "@/config/site";
import { Blobs } from "./Blobs";
import { ProductImage } from "./ProductImage";

export function Hero() {
  return (
    <section id="top" className="relative isolate overflow-x-clip">
      {/* Full-bleed pouch photo (when provided) with a dark overlay to keep text readable */}
      {heroImage.src && (
        <>
          <Image src={heroImage.src} alt={heroImage.alt} fill priority sizes="100vw" className="-z-20 object-cover" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-bg/70" />
        </>
      )}
      <Blobs
        spots={[
          { x: "-12%", y: "6%" },
          { x: "55%", y: "38%", delay: -9 },
          { x: "20%", y: "72%", delay: -14 },
        ]}
      />
      <div className="mx-auto grid max-w-7xl gap-10 px-5 pb-14 pt-[112px] md:px-8 md:pt-[136px] lg:min-h-[100svh] lg:grid-cols-2 lg:items-center lg:gap-12 lg:pb-16">
        <div>
          {/* Logo width = min(80vw, 520px). Padding = half its height (height = 0.2169 × width) on all sides. */}
          <div
            className="logo-slide"
            style={{ ["--lw" as string]: "min(80vw, 520px)", width: "var(--lw)", padding: "calc(var(--lw) * 0.1085) 0" }}
          >
            <Image src="/brand/miel-full.png" alt="MIEL+" width={1051} height={228} priority className="block h-auto w-full" />
          </div>
          <h1 className="display h-hero">
            Fuel the
            <br />
            <span className="accent">grind.</span>
          </h1>
          <p className="body-lg mt-5 max-w-xl">Honey-powered sachets for people who train. Rip. Sip. Go.</p>
          <div className="glass mt-6 inline-flex min-h-12 items-center px-5 py-2">
            <span className="mono !text-[14px]">{SACHETS_PER_POUCH} SACHETS · REAL HONEY</span>
          </div>
          <div className="mt-6">
            <a href="#lineup" className="btn">
              SHOP THE LINEUP
            </a>
          </div>
        </div>
        {!heroImage.src && (
          <ProductImage
            src={null}
            alt={heroImage.alt}
            label="HERO POUCH IMAGE"
            className="glass aspect-square w-full lg:aspect-[4/5]"
          />
        )}
      </div>
    </section>
  );
}
