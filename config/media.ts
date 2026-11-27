/**
 * MEDIA SLOTS. Put a file at the path below and it appears; a slot with no file falls back to the existing pouch, flat-lay and
 * ingredient photos, so nothing ever looks broken. Files live in /public/media (served as they are, so export them web-ready).
 * The list of what to supply (names, sizes, ratios) is in docs/MEDIA.md and is generated from this file by tests/unit/media.test.ts.
 *
 * Alt text: lifestyle and background media are decorative (alt=""): the card or section text carries the meaning.
 */
export type MediaSlot = { path: string; width: number; height: number; ratio: string; note: string };

/** The lifestyle images each flavour can have: three, each in 4:5 (cards, phones) and 16:9 (wide panels, desktop). */
export const LIFESTYLE_COUNT = 3;
export const LIFESTYLE_SLUGS = ["gold", "red-burn", "creatine"] as const;

export const MEDIA = {
  /** Hero background loop. 6-8 seconds, muted, loops cleanly. mp4 (H.264) is required, webm (VP9) is optional and tried first. Keep each under 2.5 MB. */
  heroVideo: {
    mp4: { path: "/media/hero/hero-loop.mp4", width: 1280, height: 720, ratio: "16:9", note: "H.264 mp4, 1280x720, 6-8 s, no audio track, under 2.5 MB" },
    webm: { path: "/media/hero/hero-loop.webm", width: 1280, height: 720, ratio: "16:9", note: "optional VP9 webm of the same loop, under 2 MB" },
    /** Shown before the video plays, on phones with data-saver, and under reduced motion. It is also the fallback when there is no video. */
    poster: { path: "/media/hero/hero-poster.webp", width: 1920, height: 1080, ratio: "16:9", note: "first frame of the loop, webp, 1920x1080, under 200 KB (dark; text sits on top)" },
  },
  /** Lifestyle image n (1-3) of a flavour in a ratio ("4x5" or "16x9"). */
  lifestyle: (slug: string, n: number, ratio: "4x5" | "16x9"): MediaSlot =>
    ratio === "4x5"
      ? { path: `/media/lifestyle/${slug}-${n}-4x5.webp`, width: 1080, height: 1350, ratio: "4:5", note: "webp, 1080x1350, under 250 KB" }
      : { path: `/media/lifestyle/${slug}-${n}-16x9.webp`, width: 1920, height: 1080, ratio: "16:9", note: "webp, 1920x1080, under 300 KB" },
  /** Closing call-to-action background (full bleed, dark enough for white text). */
  closing: {
    wide: { path: "/media/cta/closing-cta-16x9.webp", width: 1920, height: 1080, ratio: "16:9", note: "webp, 1920x1080, under 300 KB" } as MediaSlot,
    tall: { path: "/media/cta/closing-cta-4x5.webp", width: 1080, height: 1350, ratio: "4:5", note: "webp, 1080x1350, under 250 KB (phones)" } as MediaSlot,
  },
} as const;

/** Every slot, flat, for the supply list. */
export function allSlots(): MediaSlot[] {
  const out: MediaSlot[] = [MEDIA.heroVideo.mp4, MEDIA.heroVideo.webm, MEDIA.heroVideo.poster];
  for (const s of LIFESTYLE_SLUGS) for (let n = 1; n <= LIFESTYLE_COUNT; n++) out.push(MEDIA.lifestyle(s, n, "4x5"), MEDIA.lifestyle(s, n, "16x9"));
  out.push(MEDIA.closing.wide, MEDIA.closing.tall);
  return out;
}
