import "server-only";
import crypto from "node:crypto";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { dbMode } from "./db";

/**
 * Store an uploaded product image. It is re-encoded with sharp (this also rejects anything that isn't a real
 * image), limited to 1600px wide, and saved as WebP in the Supabase Storage bucket "product-images".
 * Only admins can reach this (the calling server action checks the role); the bucket also limits size and type.
 */
export async function saveProductImage(file: File): Promise<string> {
  if (!file || !file.size) throw new Error("Choose an image file.");
  if (file.size > 8 * 1024 * 1024) throw new Error("That image is over 8 MB.");
  let out: Buffer;
  try {
    out = await sharp(Buffer.from(await file.arrayBuffer())).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  } catch {
    throw new Error("That file isn't a valid image (use JPG, PNG or WebP).");
  }
  const name = `${crypto.randomUUID()}.webp`;
  if (dbMode() !== "supabase") throw new Error("Image uploads need the Supabase project to be configured.");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { error } = await sb.storage.from("product-images").upload(name, out, { contentType: "image/webp", cacheControl: "31536000" });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return sb.storage.from("product-images").getPublicUrl(name).data.publicUrl;
}
