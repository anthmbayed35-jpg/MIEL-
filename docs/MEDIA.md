# Media to supply

Generated from `config/media.ts` (do not edit here; run `UPDATE_MEDIA_DOC=1 npx vitest run tests/unit/media.test.ts`).

Put the file at that path in the repository (`public/media/...`) and deploy; the page picks it up with no code change. A running server also serves a file added to its `public/media` folder within about 20 seconds (`app/media/[...path]/route.ts`, with Range support for video). A missing file falls back to the existing pouch, flat-lay and ingredient photos, so nothing looks broken. Export web-ready files: lifestyle and background images as `.webp`, the loop as H.264 `.mp4` without an audio track.

Lifestyle and background media are decorative (empty alt text); the text on the page carries the meaning. Do not put packaging, prices or text inside these images. Keep them dark enough for white text.

| File | Pixels | Ratio | Notes |
|---|---|---|---|
| `public/media/hero/hero-loop.mp4` | 1280 x 720 | 16:9 | H.264 mp4, 1280x720, 6-8 s, no audio track, under 2.5 MB |
| `public/media/hero/hero-loop.webm` | 1280 x 720 | 16:9 | optional VP9 webm of the same loop, under 2 MB |
| `public/media/hero/hero-poster.webp` | 1920 x 1080 | 16:9 | first frame of the loop, webp, 1920x1080, under 200 KB (dark; text sits on top) |
| `public/media/lifestyle/gold-1-4x5.webp` | 1080 x 1350 | 4:5 | webp, 1080x1350, under 250 KB |
| `public/media/lifestyle/gold-1-16x9.webp` | 1920 x 1080 | 16:9 | webp, 1920x1080, under 300 KB |
| `public/media/lifestyle/gold-2-4x5.webp` | 1080 x 1350 | 4:5 | webp, 1080x1350, under 250 KB |
| `public/media/lifestyle/gold-2-16x9.webp` | 1920 x 1080 | 16:9 | webp, 1920x1080, under 300 KB |
| `public/media/lifestyle/gold-3-4x5.webp` | 1080 x 1350 | 4:5 | webp, 1080x1350, under 250 KB |
| `public/media/lifestyle/gold-3-16x9.webp` | 1920 x 1080 | 16:9 | webp, 1920x1080, under 300 KB |
| `public/media/lifestyle/red-burn-1-4x5.webp` | 1080 x 1350 | 4:5 | webp, 1080x1350, under 250 KB |
| `public/media/lifestyle/red-burn-1-16x9.webp` | 1920 x 1080 | 16:9 | webp, 1920x1080, under 300 KB |
| `public/media/lifestyle/red-burn-2-4x5.webp` | 1080 x 1350 | 4:5 | webp, 1080x1350, under 250 KB |
| `public/media/lifestyle/red-burn-2-16x9.webp` | 1920 x 1080 | 16:9 | webp, 1920x1080, under 300 KB |
| `public/media/lifestyle/red-burn-3-4x5.webp` | 1080 x 1350 | 4:5 | webp, 1080x1350, under 250 KB |
| `public/media/lifestyle/red-burn-3-16x9.webp` | 1920 x 1080 | 16:9 | webp, 1920x1080, under 300 KB |
| `public/media/lifestyle/creatine-1-4x5.webp` | 1080 x 1350 | 4:5 | webp, 1080x1350, under 250 KB |
| `public/media/lifestyle/creatine-1-16x9.webp` | 1920 x 1080 | 16:9 | webp, 1920x1080, under 300 KB |
| `public/media/lifestyle/creatine-2-4x5.webp` | 1080 x 1350 | 4:5 | webp, 1080x1350, under 250 KB |
| `public/media/lifestyle/creatine-2-16x9.webp` | 1920 x 1080 | 16:9 | webp, 1920x1080, under 300 KB |
| `public/media/lifestyle/creatine-3-4x5.webp` | 1080 x 1350 | 4:5 | webp, 1080x1350, under 250 KB |
| `public/media/lifestyle/creatine-3-16x9.webp` | 1920 x 1080 | 16:9 | webp, 1920x1080, under 300 KB |
| `public/media/cta/closing-cta-16x9.webp` | 1920 x 1080 | 16:9 | webp, 1920x1080, under 300 KB |
| `public/media/cta/closing-cta-4x5.webp` | 1080 x 1350 | 4:5 | webp, 1080x1350, under 250 KB (phones) |

After replacing the hero poster run `npm run media:sizes`: it makes `hero-poster-640.webp` and `hero-poster-1024.webp`, the smaller copies phones and tablets download (the LCP image). They are optional; the 1920 px poster is used when they are missing.

## Optional (a section stays HIDDEN until the file exists)

| File | Pixels | Ratio | Notes |
|---|---|---|---|
| `public/media/story/story.mp4` | 1280 x 720 | 16:9 | H.264 mp4, 1280x720, any length under about 90 s, under 12 MB, faststart |
| `public/media/story/story-poster.webp` | 1920 x 1080 | 16:9 | webp, 1920x1080, under 200 KB (optional: the first frame is used when missing) |

The brand story section (`#story`) renders only when `story.mp4` exists. Until then it is not on the page at all.

Per flavour (`gold`, `red-burn`, `creatine`): three lifestyle images, each in 4:5 (phones, cards) and 16:9 (wide panels). If you supply only one ratio of a pair it is used for both.
