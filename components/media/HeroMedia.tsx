"use client";

import { useEffect, useRef, useState } from "react";
import type { ProductPhoto } from "@/config/products";
import { Photo } from "../Photo";

/**
 * JOB: give the hero life without costing speed. The background layer of the hero: a muted looping video when one was supplied
 * (config/media.ts), otherwise its poster, otherwise a dimmed product photo. A dark gradient keeps the text legible.
 *
 * Loading rules: the poster is a low-priority image, never the LCP (the pouch is). The video element is preload="none" and is only
 * started after the page has loaded and the hero is on screen. It is NOT started with data-saver on, or under prefers-reduced-motion
 * (the poster stays). It pauses when it scrolls off screen and when the tab is hidden.
 */
export function HeroMedia({ mp4, webm, poster, fallback }: { mp4: string | null; webm: string | null; poster: string | null; fallback: ProductPhoto | null }) {
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
    // after load + idle, so the pouch (LCP) and the rest of the page are never competing with the video
    const idle = () => ("requestIdleCallback" in window ? (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(start) : setTimeout(start, 800));
    if (document.readyState === "complete") idle();
    else window.addEventListener("load", idle, { once: true });
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("load", idle);
      v.pause();
    };
  }, [mp4, webm]);

  return (
    <div ref={box} aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" width={1920} height={1080} loading="lazy" decoding="async" fetchPriority="low" className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${still ? "opacity-100" : "opacity-0"}`} />
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
