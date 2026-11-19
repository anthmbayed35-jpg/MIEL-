import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp, { type Metadata } from "sharp";
import { uploadsDir } from "./db";

/**
 * Product image storage on the volume (DATA_DIR/uploads). An upload is validated (real JPEG/PNG/WebP, size, dimensions),
 * re-encoded with sharp (EXIF/metadata stripped, orientation applied), and saved as AVIF + WebP at responsive widths,
 * never upscaled. Files are served by app/uploads/[file]/route.ts, which only serves names this module creates.
 *
 * The value stored in product_images.src is `/uploads/<id>@<widths>@<W>x<H>` (components/Photo.tsx understands it).
 */
export const UPLOAD_WIDTHS = [480, 768, 1080, 1600] as const;
export const MAX_BYTES = 8 * 1024 * 1024;
export const MIN_SIDE = 600;
export const MAX_SIDE = 8000;
export const FILE_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(480|768|1080|1600)\.(avif|webp)$/;

export class ImageError extends Error {}

export async function saveProductImage(file: File): Promise<string> {
  if (!file || !file.size) throw new ImageError("Choose an image file.");
  if (file.size > MAX_BYTES) throw new ImageError("That image is over 8 MB.");
  const input = Buffer.from(await file.arrayBuffer());
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 64_000_000 }).metadata(); // refuses decompression bombs
  } catch {
    throw new ImageError("That file isn't a valid image (use JPG, PNG or WebP).");
  }
  if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) throw new ImageError("Only JPG, PNG or WebP images are allowed.");
  const rotated = (meta.orientation ?? 1) >= 5; // EXIF orientation swaps width and height
  const w0 = (rotated ? meta.height : meta.width) ?? 0;
  const h0 = (rotated ? meta.width : meta.height) ?? 0;
  if (Math.min(w0, h0) < MIN_SIDE) throw new ImageError(`The image is too small. Use at least ${MIN_SIDE}px on the short side.`);
  if (Math.max(w0, h0) > MAX_SIDE) throw new ImageError(`The image is too large. Use at most ${MAX_SIDE}px on the long side.`);

  const id = crypto.randomUUID();
  const dir = uploadsDir();
  fs.mkdirSync(dir, { recursive: true });
  const used = UPLOAD_WIDTHS.filter((w) => w <= w0); // never upscaled; w0 >= 600 so there is always at least 480
  try {
    for (const w of used) {
      const base = sharp(input, { limitInputPixels: 64_000_000 }).rotate().resize({ width: w, withoutEnlargement: true }); // no .withMetadata(): all EXIF/GPS is dropped
      await base.clone().avif({ quality: 55, effort: 4 }).toFile(path.join(dir, `${id}-${w}.avif`));
      await base.clone().webp({ quality: 80 }).toFile(path.join(dir, `${id}-${w}.webp`));
    }
  } catch {
    deleteUpload(`/uploads/${id}@${used.join("-")}@${w0}x${h0}`);
    throw new ImageError("That file isn't a valid image (use JPG, PNG or WebP).");
  }
  return `/uploads/${id}@${used.join("-")}@${w0}x${h0}`;
}

/** Parse a stored upload src. */
export function parseUpload(src: string): { id: string; widths: number[]; width: number; height: number } | null {
  const m = src.match(/^\/uploads\/([0-9a-f-]{36})@([\d-]+)@(\d+)x(\d+)$/);
  if (!m) return null;
  return { id: m[1], widths: m[2].split("-").map(Number), width: Number(m[3]), height: Number(m[4]) };
}

/** Remove every file of an upload (used when an image is deleted or an upload fails half way). */
export function deleteUpload(src: string) {
  const u = parseUpload(src);
  if (!u) return;
  for (const w of UPLOAD_WIDTHS) for (const ext of ["avif", "webp"]) fs.rmSync(path.join(uploadsDir(), `${u.id}-${w}.${ext}`), { force: true });
}
