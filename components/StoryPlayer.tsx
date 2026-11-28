"use client";

import { useState } from "react";

/**
 * The brand film player: the poster with a large play button; the video is not requested until the visitor presses play
 * (preload none), then plays with the browser's own accessible controls. Nothing downloads on page load.
 */
export function StoryPlayer({ mp4, poster, label }: { mp4: string; poster: string | null; label: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="relative mx-auto aspect-video w-full overflow-hidden rounded-[22px] border border-white/15 bg-black shadow-[0_16px_50px_rgba(0,0,0,0.45)]">
      {playing ? (
        <video src={mp4} poster={poster ?? undefined} controls autoPlay playsInline preload="none" className="absolute inset-0 h-full w-full" />
      ) : (
        <button type="button" onClick={() => setPlaying(true)} aria-label={label} className="group absolute inset-0 grid place-items-center">
          {poster && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={poster} alt="" width={1920} height={1080} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none" />
          )}
          <span className="relative grid h-20 w-20 place-items-center rounded-full bg-acid text-black shadow-[0_0_40px_rgba(218,252,105,0.35)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <span className="mono absolute bottom-4 left-0 right-0 !text-fg">{label}</span>
        </button>
      )}
    </div>
  );
}
