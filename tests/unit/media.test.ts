import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { allSlots, LIFESTYLE_COUNT } from "../../config/media";
import { products } from "../../config/products";
import { closingMedia, heroMedia, lifestyleFor } from "../../lib/media";

const DOC = path.resolve(__dirname, "../../docs/MEDIA.md");

/** A throwaway working directory with an (optionally filled) public/media folder, so the resolver sees exactly these files. */
function withFiles(files: string[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "miel-media-"));
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(dir, "public", f)), { recursive: true });
    fs.writeFileSync(path.join(dir, "public", f), "x");
  }
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  return dir;
}
afterEach(() => vi.restoreAllMocks());

describe("media slots fall back to the existing photos", () => {
  const gold = products.find((p) => p.slug === "gold")!;

  it("with no media files nothing is missing: the hero uses a product photo, lifestyle uses flat-lay, sachet and ingredients, the closing image a product photo", () => {
    withFiles([]);
    const h = heroMedia(products);
    expect(h).toMatchObject({ mp4: null, webm: null, poster: null });
    expect(h.fallback?.kind).toBe("ingredients");
    const l = lifestyleFor(gold);
    expect(l).toHaveLength(LIFESTYLE_COUNT);
    for (const x of l) {
      expect(x.tall.kind).toBe("photo");
      expect(x.wide.kind).toBe("photo");
    }
    expect(l[0].tall.kind === "photo" && l[0].tall.photo.kind).toBe("ingredients"); // the first card never shows packaging text under the headline
    expect(closingMedia(products)?.wide.kind).toBe("photo");
  });

  it("supplied files are used, and a slot with only one ratio uses it for both", () => {
    withFiles(["/media/hero/hero-loop.mp4", "/media/hero/hero-poster.webp", "/media/lifestyle/gold-1-4x5.webp", "/media/lifestyle/gold-2-16x9.webp", "/media/cta/closing-cta-16x9.webp"]);
    const h = heroMedia(products);
    expect(h.mp4).toBe("/media/hero/hero-loop.mp4");
    expect(h.poster).toBe("/media/hero/hero-poster.webp");
    expect(h.webm).toBeNull();
    expect(h.fallback).toBeNull();
    const l = lifestyleFor(gold);
    expect(l[0].tall).toMatchObject({ kind: "file" });
    expect(l[0].wide).toMatchObject({ kind: "file" }); // only the 4:5 was supplied: reused for the wide slot
    expect(l[1].tall).toMatchObject({ kind: "file" });
    expect(l[2].tall.kind).toBe("photo"); // nothing supplied for number 3
    expect(closingMedia(products)?.tall).toMatchObject({ kind: "file" });
  });
});

describe("docs/MEDIA.md", () => {
  it("lists exactly the slots in config/media.ts (regenerate with UPDATE_MEDIA_DOC=1)", () => {
    const rows = allSlots().map((s) => `| \`public${s.path}\` | ${s.width} x ${s.height} | ${s.ratio} | ${s.note} |`);
    const md = [
      "# Media to supply",
      "",
      "Generated from `config/media.ts` (do not edit here; run `UPDATE_MEDIA_DOC=1 npx vitest run tests/unit/media.test.ts`).",
      "",
      "Put the file at that path in the repository (`public/media/...`) and deploy; the page picks it up with no code change. A running server also serves a file added to its `public/media` folder within about 20 seconds (`app/media/[...path]/route.ts`, with Range support for video). A missing file falls back to the existing pouch, flat-lay and ingredient photos, so nothing looks broken. Export web-ready files: lifestyle and background images as `.webp`, the loop as H.264 `.mp4` without an audio track.",
      "",
      "Lifestyle and background media are decorative (empty alt text); the text on the page carries the meaning. Do not put packaging, prices or text inside these images. Keep them dark enough for white text.",
      "",
      "| File | Pixels | Ratio | Notes |",
      "|---|---|---|---|",
      ...rows,
      "",
      "Per flavour (`gold`, `red-burn`, `creatine`): three lifestyle images, each in 4:5 (phones, cards) and 16:9 (wide panels). If you supply only one ratio of a pair it is used for both.",
      "",
    ].join("\n");
    if (process.env.UPDATE_MEDIA_DOC) fs.writeFileSync(DOC, md);
    expect(fs.existsSync(DOC), "run UPDATE_MEDIA_DOC=1 once to create docs/MEDIA.md").toBe(true);
    expect(fs.readFileSync(DOC, "utf8").split("\r\n").join("\n")).toBe(md);
    expect(allSlots()).toHaveLength(3 + 3 * LIFESTYLE_COUNT * 2 + 2);
  });
});
