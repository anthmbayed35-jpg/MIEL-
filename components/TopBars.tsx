"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * One layout system for the top of the page. Measures the preview bar, the ambassador strip and the floating header (they change
 * with text wrapping, with the preview bar being there or not, with dismissal) and publishes CSS variables on <html>:
 *   --preview-h  height of the sticky preview bar (0 when absent): the header sticks just below it
 *   --strip-h    height of the announcement strip (40px)
 *   --header-h   height of the header (56px)
 *   --top-offset everything above the hero's first content: bars + header
 */
export function TopOffsets() {
  const path = usePathname();
  // the film grain (app/globals.css) is switched on once the page has loaded and the browser is idle
  useEffect(() => {
    const on = () => document.documentElement.classList.add("grain");
    const idle = () => ("requestIdleCallback" in window ? (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(on) : setTimeout(on, 1200));
    if (document.readyState === "complete") idle();
    else window.addEventListener("load", idle, { once: true });
    return () => window.removeEventListener("load", idle);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    const h = (el: Element | null) => (el ? Math.round(el.getBoundingClientRect().height) : 0);
    let raf = 0;
    const measureNow = () => {
      const preview = h(document.querySelector("[data-preview-bar]"));
      const strip = h(document.querySelector("[data-announcement-strip]"));
      const header = h(document.querySelector(".site-header > header")) || 56;
      root.style.setProperty("--preview-h", `${preview}px`);
      root.style.setProperty("--strip-h", `${strip}px`);
      root.style.setProperty("--header-h", `${header}px`);
      root.style.setProperty("--top-offset", `${preview + strip + header}px`);
    };
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measureNow);
    };
    measureNow();
    const ro = new ResizeObserver(measure);
    const watch = () => {
      ro.disconnect();
      for (const s of ["[data-preview-bar]", "[data-announcement-strip]", ".site-header > header"]) {
        const el = document.querySelector(s);
        if (el) ro.observe(el);
      }
    };
    watch();
    // the strip can be dismissed and the header re-mounted by navigation: look again when the DOM around them changes
    // only react when one of the three measured elements (or something containing them) came or went; the thousands of other
    // mutations while the page hydrates must not trigger a forced layout each
    const WATCHED = "[data-preview-bar],[data-announcement-strip],.site-header";
    const touches = (n: Node) => n.nodeType === 1 && ((n as Element).matches(WATCHED) || !!(n as Element).querySelector(WATCHED) || !!(n as Element).closest(WATCHED));
    const mo = new MutationObserver((records) => {
      if (!records.some((r) => [...r.addedNodes, ...r.removedNodes].some(touches))) return;
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
