// Makes the smaller copies of the hero poster that phones and tablets download (the 1920 px original is the slot in config/media.ts).
// Run after replacing public/media/hero/hero-poster.webp:  npm run media:sizes
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const dir = path.join(process.cwd(), "public", "media", "hero");
const src = path.join(dir, "hero-poster.webp");
if (!fs.existsSync(src)) {
  console.log("media:sizes: no public/media/hero/hero-poster.webp, nothing to do");
  process.exit(0);
}
for (const w of [640, 1024]) {
  const out = path.join(dir, `hero-poster-${w}.webp`);
  const buf = await sharp(src).resize({ width: w }).webp({ quality: 72, effort: 6 }).toBuffer();
  fs.writeFileSync(out, buf);
  console.log(`hero-poster-${w}.webp ${(buf.length / 1000).toFixed(0)} KB`);
}
