import { copy } from "@/config/copy";

/**
 * JOB: say the three confirmed facts, once, above the header. 40px high, never dismissible, no countdown, no offer.
 * On a narrow phone the text wraps to two short lines inside the 40px.
 */
export function AnnouncementStrip() {
  return (
    <aside data-announcement-strip aria-label="Announcement" className="relative z-30 flex h-10 items-center justify-center overflow-hidden border-b border-white/10 bg-[#2d2924] px-3 text-center">
      <p className="mono !text-[13px] !leading-[1.2] !tracking-[0.1em] !text-fg">{copy().announcement}</p>
    </aside>
  );
}
