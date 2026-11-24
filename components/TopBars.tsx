"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const KEY = "miel_amb_strip_dismissed";

/**
 * The strip under the preview bar and above the floating header: "Train with MIEL+. Become an ambassador. APPLY".
 * Normal flow (it scrolls away, the header stays), at least 48px tall, dismissible; the choice is remembered per visitor.
 */
export function AmbassadorStrip({ text }: { text: string }) {
  const path = usePathname();
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "1") setHidden(true);
    } catch {
      /* storage blocked: the strip simply shows */
    }
  }, []);
  if (hidden || path === "/ambassadors" || path.startsWith("/ambassadors/")) return null;
  return (
    <aside data-ambassador-strip aria-label="Ambassador program" className="relative z-30 flex min-h-12 items-stretch border-b border-white/10 bg-[#2d2924]">
      <Link href="/ambassadors" className="flex min-h-12 flex-1 flex-wrap items-center justify-center gap-x-3 gap-y-0 px-4 py-2 text-center text-[15px] leading-snug text-fg md:text-[16px]">
        <span>{text}</span>
        <span className="mono !text-[13px]">APPLY →</span>
      </Link>
      <button
        type="button"
        aria-label="Dismiss the ambassador banner"
        className="grid min-h-12 w-12 shrink-0 place-items-center text-[22px] leading-none text-body hover:text-fg"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem(KEY, "1");
          } catch {
            /* storage blocked: it comes back next visit */
          }
        }}
      >
        <span aria-hidden>×</span>
      </button>
    </aside>
  );
}

/**
 * One layout system for the top of the page. Measures the preview bar, the ambassador strip and the floating header (they change
 * with text wrapping, with the preview bar being there or not, with dismissal) and publishes CSS variables on <html>:
 *   --preview-h  height of the sticky preview bar (0 when absent): the header sticks just below it
 *   --strip-h    height of the ambassador strip (0 when absent or dismissed)
 *   --header-h   height of the floating header pill
 *   --top-offset everything above the hero's first content: bars + header + its 12px gap
 */
export function TopOffsets() {
  const path = usePathname();
  useEffect(() => {
    const root = document.documentElement;
    const h = (el: Element | null) => (el ? Math.round(el.getBoundingClientRect().height) : 0);
    let raf = 0;
    const measureNow = () => {
      const preview = h(document.querySelector("[data-preview-bar]"));
      const strip = h(document.querySelector("[data-ambassador-strip]"));
      const header = h(document.querySelector(".site-header > header")) || 72;
      root.style.setProperty("--preview-h", `${preview}px`);
      root.style.setProperty("--strip-h", `${strip}px`);
      root.style.setProperty("--header-h", `${header}px`);
      root.style.setProperty("--top-offset", `${preview + strip + header + 12}px`);
    };
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measureNow);
    };
    measureNow();
    const ro = new ResizeObserver(measure);
    const watch = () => {
      ro.disconnect();
      for (const s of ["[data-preview-bar]", "[data-ambassador-strip]", ".site-header > header"]) {
        const el = document.querySelector(s);
        if (el) ro.observe(el);
      }
    };
    watch();
    // the strip can be dismissed and the header re-mounted by navigation: look again when the DOM around them changes
    const mo = new MutationObserver(() => {
      watch();
      measure();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [path]);
  return null;
}
