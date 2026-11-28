"use client";

import { useEffect, useRef, useState } from "react";
import type { ProductPhoto } from "@/config/products";
import { Photo } from "../Photo";

/**
 * JOB: give the hero life without costing speed. The background layer of the hero: a muted looping video when one was supplied
 * (config/media.ts), otherwise its poster, otherwise a dimmed product photo. A dark gradient keeps the text legible.
 *
 * The video itself starts only after the first interaction (or 6 s on desktop), never on its own at load.
 * Loading rules: the poster is the LCP image when there is one (it fills the hero), so it is preloaded by components/Hero.tsx, loads eagerly at high priority and has phone-sized copies in a srcset. The video element is preload="none" and is only
 * started after the page has loaded and the hero is on screen. It is NOT started with data-saver on, or under prefers-reduced-motion
 * (the poster stays). It pauses when it scrolls off screen and when the tab is hidden.
 */
export function HeroMedia({ mp4, webm, poster, posterSet, fallback }: { mp4: string | null; webm: string | null; poster: string | null; posterSet: string | null; fallback: ProductPhoto | null }) {
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [still, setStill] = useState(true); // true until the video really plays (and always under reduced motion / data-saver)

  useEffect(() => {
    const v = video.current;
    const el = box.current;
    if (!v || !el || (!mp4 && !webm)) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (reduce || conn?.saveData) return; // poster only
    const desktop = window.matchMedia("(min-width: 1024px)").matches;
    let visible = false;
    let ready = false;
    const sync = () => {
      if (!ready) return;
      if (visible && !document.hidden) {
        v.play().then(() => setStill(false)).catch(() => {});
      } else v.pause();
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      sync();
    });
    io.observe(el);
    const start = () => {
      ready = true;
      if (desktop) v.preload = "auto"; // phones keep preload="none": the file is fetched only when play() is called, once the hero is visible
      sync();
    };
    // The video starts only after the visitor's first interaction (scroll, touch, key, pointer) or, on desktop, after 6 seconds. Until then the
    // poster is the one thing painted, so the video's first frame can never replace it as the LCP candidate, and nothing competes with the page.
    const events = ["pointerdown", "touchstart", "keydown", "wheel", "scroll"] as const;
    let timer = 0;
    const go = () => {
      for (const e of events) window.removeEventListener(e, go);
      window.clearTimeout(timer);
      start();
    };
    for (const e of events) window.addEventListener(e, go, { passive: true, once: true });
    if (desktop) timer = window.setTimeout(go, 6000);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      for (const e of events) window.removeEventListener(e, go);
      window.clearTimeout(timer);
      v.pause();
    };
  }, [mp4, webm]);

  return (
    <div ref={box} aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" width={1920} height={1080} srcSet={posterSet ?? undefined} sizes="100vw" decoding="async" fetchPriority="high" className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${still ? "opacity-100" : "opacity-0"}`} />
      ) : fallback ? (
        <div className="hidden md:block">
          {/* not on phones: a hidden lazy image is never fetched, so the pouch (LCP) has the whole connection */}
          <Photo src={fallback.src} alt="" sizes="100vw" position="50% 52%" className="absolute inset-0 h-full w-full opacity-60" />
        </div>
      ) : null}
      {(mp4 || webm) && (
        <video ref={video} muted loop playsInline preload="none" poster={poster ?? undefined} tabIndex={-1} className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${still ? "opacity-0" : "opacity-100"}`}>
          {webm && <source src={webm} type="video/webm" />}
          {mp4 && <source src={mp4} type="video/mp4" />}
        </video>
      )}
      {/* legibility: the base colour rises from the bottom and the left, plus an even dim */}
      <div className="absolute inset-0 bg-bg/55" />
      <div className="absolute inset-0 bg-[linear-gradient(to_top,var(--color-bg)_4%,transparent_55%),linear-gradient(to_right,rgba(35,32,28,0.85),transparent_70%)]" />
    </div>
  );
}
