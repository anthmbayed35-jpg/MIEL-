"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { Product } from "@/config/products";
import { Blobs } from "../Blobs";

/** Swipeable (scroll-snap) carousel with dots on mobile, thumbnail strip on desktop. */
export function Gallery({ product }: { product: Product }) {
  const track = useRef<HTMLUListElement>(null);
  const raf = useRef(0);
  const [i, setI] = useState(0);

  const onScroll = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const el = track.current;
      if (el) setI(Math.round(el.scrollLeft / el.clientWidth));
    });
  };

  const go = (n: number) => {
    const el = track.current;
    if (!el) return;
    setI(n);
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="relative isolate">
      {/* Blurred glow blob in the flavour colour behind the pouch */}
      <Blobs spots={[{ x: "5%", y: "0%", color: product.glow }, { x: "30%", y: "35%", color: product.glow, delay: -10 }]} />
      <div className="glass overflow-hidden p-2 sm:p-3">
        <ul
          ref={track}
          onScroll={onScroll}
          aria-roledescription="carousel"
          aria-label={`${product.name} photos`}
          className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-[12px]"
        >
          {product.gallery.map((g, n) => (
            <li
              key={g.label}
              aria-roledescription="slide"
              aria-label={`${n + 1} of ${product.gallery.length}`}
              className="relative aspect-square w-full shrink-0 snap-center"
            >
              {g.src ? (
                <Image
                  src={g.src}
                  alt={g.alt}
                  fill
                  sizes="(min-width: 1024px) 600px, 100vw"
                  className="object-contain"
                  priority={n === 0}
                  loading={n === 0 ? undefined : "lazy"}
                />
              ) : (
                <div
                  role="img"
                  aria-label={`${g.alt} (image placeholder)`}
                  className="flex h-full w-full items-center justify-center rounded-[12px] border border-dashed border-white/20"
                >
                  <span className="mono !text-body text-center opacity-80">{g.label}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Dots (mobile) */}
      <div className="mt-3 flex justify-center md:hidden" role="tablist" aria-label="Choose photo">
        {product.gallery.map((g, n) => (
          <button
            key={g.label}
            role="tab"
            aria-selected={i === n}
            aria-label={`Show ${g.label.toLowerCase()}`}
            onClick={() => go(n)}
            className="flex h-12 w-8 items-center justify-center"
          >
            <span className={`block h-2.5 rounded-full transition-all motion-reduce:transition-none ${i === n ? "w-6 bg-acid" : "w-2.5 bg-white/40"}`} />
          </button>
        ))}
      </div>

      {/* Thumbnails (desktop) */}
      <div className="mt-4 hidden grid-cols-4 gap-3 md:grid">
        {product.gallery.map((g, n) => (
          <button
            key={g.label}
            onClick={() => go(n)}
            aria-label={`Show ${g.label.toLowerCase()}`}
            aria-current={i === n}
            className={`glass-flat relative flex aspect-square items-center justify-center overflow-hidden p-1 ${i === n ? "glass-accent" : ""}`}
          >
            {g.src ? (
              <Image src={g.src} alt="" fill sizes="140px" className="object-contain" loading="lazy" />
            ) : (
              <span className="mono !text-body px-1 text-center !text-[11px] opacity-80">{g.label}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
