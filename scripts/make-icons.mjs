// Generates favicon, apple-touch-icon and Open Graph image from the M+ logo
// (centered on the #23201C background). Run: npm run icons
import sharp from "sharp";

const BG = "#23201C";
const logo = "public/brand/miel-m-plus.png";

async function make(file, w, h, logoW) {
  const mark = await sharp(logo).resize({ width: logoW }).toBuffer();
  await sharp({ create: { width: w, height: h, channels: 4, background: BG } })
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toFile(file);
  console.log("wrote", file);
}

await make("app/icon.png", 512, 512, 400);
await make("app/apple-icon.png", 180, 180, 140);
