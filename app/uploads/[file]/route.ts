import fs from "node:fs";
import path from "node:path";
import { uploadsDir } from "@/lib/db";
import { FILE_RE } from "@/lib/storage";

/**
 * Serves product images from the volume. Public (they are shop photos) but strictly limited: the name must match the
 * exact pattern lib/storage.ts generates (`<uuid>-<width>.avif|webp`), so there is no directory listing, no other file
 * type and no way to climb out of the folder. Immutable names, so they cache for a year.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const m = FILE_RE.exec(file);
  if (!m) return new Response("Not found", { status: 404 });
  const full = path.join(uploadsDir(), file);
  if (path.dirname(full) !== uploadsDir()) return new Response("Not found", { status: 404 }); // belt and braces
  let data: Buffer;
  try {
    data = fs.readFileSync(full);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": m[3] === "avif" ? "image/avif" : "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
