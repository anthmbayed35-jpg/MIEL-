"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SLOT_PLACEHOLDERS, type Product, type ProductPhoto } from "@/config/products";
import { Blobs } from "../Blobs";
import { Photo } from "../Photo";

type Slot = { photo?: ProductPhoto; label: string; alt: string };

/** Always 4 slots. Missing photos fall back to labelled placeholders, so products with 0 to 3 images still work. */
function slotsFor(product: Product): Slot[] {
  return SLOT_PLACEHOLDERS.map((ph, i) => {
    const photo = product.images[i];
    return { photo, label: photo?.label ?? ph, alt: photo?.alt ?? `${product.name} ${ph.toLowerCase()}` };
  });
}

const ZoomIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2M11 8.5v5M8.5 11h5" />
  </svg>
);

/** Swipeable (scroll-snap) carousel with dots on mobile, thumbnails on desktop, tap/click to zoom full screen. */
export function Gallery({ product }: { product: Product }) {
  const slots = slotsFor(product);
  const track = useRef<HTMLUListElement>(null);
  const raf = useRef(0);
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState<number | null>(null);

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

  // Zoom only shows real photos
  const zoomable = slots.map((s, n) => (s.photo ? n : -1)).filter((n) => n >= 0);
  const canZoom = !!slots[i]?.photo;

  return (
    <div className="relative isolate">
      {/* Blurred glow blob in the flavour colour behind the pouch */}
      <Blobs spots={[{ x: "5%", y: "0%", color: product.glow }, { x: "30%", y: "35%", color: product.glow, delay: -10 }]} />
      <div className="glass relative overflow-hidden p-2 sm:p-3">
        <ul
          ref={track}
          onScroll={onScroll}
          aria-roledescription="carousel"
          aria-label={`${product.name} photos`}
          className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-[12px]"
        >
          {slots.map((s, n) => (
            <li
              key={s.label + n}
              aria-roledescription="slide"
              aria-label={`${n + 1} of ${slots.length}`}
              className="relative aspect-[4/5] w-full shrink-0 snap-center"
            >
              {s.photo ? (
                <button
                  onClick={() => setZoom(n)}
                  aria-label={`Zoom: ${s.alt}`}
                  className="absolute inset-0 block cursor-zoom-in rounded-[12px] focus-visible:outline-offset-[-3px]"
                >
                  <Photo
                    src={s.photo.src}
                    alt={s.photo.alt}
                    sizes="(min-width: 1024px) 560px, calc(100vw - 56px)"
                    priority={n === 0}
                    className="h-full w-full rounded-[12px]"
                  />
                </button>
              ) : (
                <div
                  role="img"
                  aria-label={`${s.alt} (image placeholder)`}
                  className="flex h-full w-full items-center justify-center rounded-[12px] border border-dashed border-white/20"
                >
                  <span className="mono !text-body text-center opacity-80">{s.label}</span>
                </div>
              )}
            </li>
          ))}
        </ul>

        {/* Glass UI lives in the top corners only: the packaging and its label never sit there. */}
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between sm:inset-x-5 sm:top-5">
          <span className="glass-flat mono flex min-h-9 items-center px-3 !text-[12px] !text-fg" aria-live="polite">
            {i + 1} / {slots.length}
          </span>
          {canZoom && (
            <button
              onClick={() => setZoom(i)}
              aria-label="Zoom photo full screen"
              className="icon-btn pointer-events-auto !border-white/60 bg-black/30"
            >
              <ZoomIcon />
            </button>
          )}
        </div>
      </div>

      {/* Dots (mobile) */}
      <div className="mt-3 flex justify-center md:hidden" role="tablist" aria-label="Choose photo">
        {slots.map((s, n) => (
          <button
            key={s.label + n}
            role="tab"
            aria-selected={i === n}
            aria-label={`Show ${s.label.toLowerCase()}`}
            onClick={() => go(n)}
            className="flex h-12 w-8 items-center justify-center"
          >
            <span className={`block h-2.5 rounded-full transition-all motion-reduce:transition-none ${i === n ? "w-6 bg-acid" : "w-2.5 bg-white/40"}`} />
          </button>
        ))}
      </div>

      {/* Thumbnails (desktop) */}
      <div className="mt-4 hidden grid-cols-4 gap-3 md:grid">
        {slots.map((s, n) => (
          <button
            key={s.label + n}
            onClick={() => go(n)}
            aria-label={`Show ${s.label.toLowerCase()}`}
            aria-current={i === n}
            className={`glass-flat relative aspect-[4/5] overflow-hidden p-1 ${i === n ? "glass-accent" : ""}`}
          >
            {s.photo ? (
              <Photo src={s.photo.src} alt="" sizes="140px" className="h-full w-full rounded-[10px]" />
            ) : (
              <span className="mono !text-body flex h-full items-center justify-center px-1 text-center !text-[11px] opacity-80">{s.label}</span>
            )}
          </button>
        ))}
      </div>

      {zoom !== null && (
        <Lightbox
          slots={zoomable.map((n) => slots[n])}
          start={Math.max(0, zoomable.indexOf(zoom))}
          onClose={(idx) => {
            setZoom(null);
            const real = zoomable[idx];
            if (real !== undefined) go(real);
          }}
        />
      )}
    </div>
  );
}

/** Full-screen zoom: close button, swipe between photos, arrow keys. Photos use object-contain so nothing is cropped. */
function Lightbox({ slots, start, onClose }: { slots: Slot[]; start: number; onClose: (idx: number) => void }) {
  const track = useRef<HTMLUListElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [i, setI] = useState(start);
  const iRef = useRef(start);
  useEffect(() => {
    iRef.current = i;
  }, [i]);

  const goTo = useCallback(
    (n: number) => {
      const el = track.current;
      if (!el) return;
      const t = Math.max(0, Math.min(slots.length - 1, n));
      el.scrollTo({ left: t * el.clientWidth, behavior: "smooth" });
    },
    [slots.length],
  );

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const el = track.current;
    if (el) el.scrollLeft = start * el.clientWidth;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(iRef.current);
      else if (e.key === "ArrowRight") goTo(iRef.current + 1);
      else if (e.key === "ArrowLeft") goTo(iRef.current - 1);
      else if (e.key === "Tab") {
        // keep focus inside the dialog
        const f = document.querySelectorAll<HTMLElement>("[data-lightbox] button:not([disabled])");
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      prevFocus?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div data-lightbox role="dialog" aria-modal="true" aria-label="Photo zoom" className="fixed inset-0 z-[60] bg-black">
      <ul
        ref={track}
        onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto overscroll-contain"
      >
        {slots.map((s, n) => (
          <li key={s.label + n} className="flex h-full w-full shrink-0 snap-center items-center justify-center p-3 sm:p-10">
            {s.photo && (
              <Photo
                src={s.photo.src}
                alt={s.photo.alt}
                sizes="100vw"
                fit="contain"
                priority={n === start}
                className="h-full w-full"
              />
            )}
          </li>
        ))}
      </ul>

      {/* UI in corners / edges only */}
      <span className="glass-flat mono pointer-events-none absolute left-3 top-3 flex min-h-9 items-center px-3 !text-[12px] !text-fg sm:left-5 sm:top-5" aria-live="polite">
        {i + 1} / {slots.length}
      </span>
      <button
        ref={closeBtn}
        onClick={() => onClose(i)}
        aria-label="Close zoom"
        className="icon-btn !absolute right-3 top-3 bg-black/40 sm:right-5 sm:top-5"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
      {slots.length > 1 && (
        <>
          <button
            onClick={() => goTo(i - 1)}
            disabled={i === 0}
            aria-label="Previous photo"
            className="icon-btn !absolute left-3 top-1/2 hidden -translate-y-1/2 bg-black/40 disabled:opacity-30 md:flex"
          >
            <span aria-hidden className="text-[26px] leading-none">‹</span>
          </button>
          <button
            onClick={() => goTo(i + 1)}
            disabled={i === slots.length - 1}
            aria-label="Next photo"
            className="icon-btn !absolute right-3 top-1/2 hidden -translate-y-1/2 bg-black/40 disabled:opacity-30 md:flex"
          >
            <span aria-hidden className="text-[26px] leading-none">›</span>
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
