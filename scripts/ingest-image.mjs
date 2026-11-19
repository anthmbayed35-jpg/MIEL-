// Turns one big original (PNG/JPG, 4:5 portrait) into the "untouched original" the image pipeline reads:
//   node scripts/ingest-image.mjs <input-file> <product-slug> <asset-name>
//   e.g. node scripts/ingest-image.mjs incoming-images/x.png gold gold-flat-lay
// Writes assets-src/<slug>/<asset-name>.webp at 2000px tall (the same size and format as the RED BURN originals, ~200-400 KB),
// opaque, no metadata. Then run `npm run images` for the responsive AVIF/WebP sizes and blur placeholders.
// The big originals themselves are never committed (./incoming-images is git-ignored).
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const [input, slug, name] = process.argv.slice(2);
if (!input || !slug || !name) {
  console.error("Usage: node scripts/ingest-image.mjs <input-file> <product-slug> <asset-name>");
  process.exit(1);
}
const dir = path.join("assets-src", slug);
await mkdir(dir, { recursive: true });
const out = path.join(dir, `${name}.webp`);
const info = await sharp(input).removeAlpha().resize({ height: 2000, withoutEnlargement: true }).webp({ quality: 88, effort: 5 }).toFile(out);
console.log(`✓ ${out} ${info.width}x${info.height} ${(info.size / 1024).toFixed(0)} KB`);
