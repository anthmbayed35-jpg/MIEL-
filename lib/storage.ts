import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { dbMode } from "./db";

/**
 * Store an uploaded product image. It is re-encoded with sharp (this also rejects anything that isn't a real
 * image), limited to 1600px wide, and saved as WebP. Production: Supabase Storage bucket "product-images".
 * Local dev: public/uploads/.
 */
export async function saveProductImage(file: File): Promise<string> {
  if (dbMode() === "demo") throw new Error("Image uploads need Supabase Storage, which isn't connected in preview mode.");
  if (!file || !file.size) throw new Error("Choose an image file.");
  if (file.size > 8 * 1024 * 1024) throw new Error("That image is over 8 MB.");
  let out: Buffer;
  try {
    out = await sharp(Buffer.from(await file.arrayBuffer())).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  } catch {
    throw new Error("That file isn't a valid image (use JPG, PNG or WebP).");
  }
  const name = `${crypto.randomUUID()}.webp`;
  if (dbMode() === "supabase") {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const { error } = await sb.storage.from("product-images").upload(name, out, { contentType: "image/webp", cacheControl: "31536000" });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    return sb.storage.from("product-images").getPublicUrl(name).data.publicUrl;
  }
  const dir = path.join(process.cwd(), "public", "uploads");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), out);
  return `/uploads/${name}`;
}
