import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

/**
 * Serves /public/media at request time (the media slots of config/media.ts). Next serves the files that existed when the server
 * started; this route also serves a file that was added afterwards, and supports Range requests (iOS Safari needs them for video).
 * Only the three media folders and plain file names with a media extension are served: no path can leave /public/media.
 */
const TYPES: Record<string, string> = { ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".mp4": "video/mp4", ".webm": "video/webm" };
const NAME = /^[a-z0-9][a-z0-9._-]{0,80}$/;
const FOLDERS = new Set(["hero", "lifestyle", "cta", "story"]);

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await ctx.params;
  if (parts.length !== 2 || !FOLDERS.has(parts[0]) || !NAME.test(parts[1])) return new Response("Not found", { status: 404 });
  const type = TYPES[path.extname(parts[1])];
  if (!type) return new Response("Not found", { status: 404 });
  const file = path.join(process.cwd(), "public", "media", parts[0], parts[1]);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
    if (!stat.isFile()) throw new Error("not a file");
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const headers: Record<string, string> = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=3600" };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : stat.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : stat.size - 1;
    start = Math.max(0, start);
    end = Math.min(stat.size - 1, end);
    if (start > end || start >= stat.size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    const buf = Buffer.alloc(end - start + 1);
    const fd = fs.openSync(file, "r");
    try {
      fs.readSync(fd, buf, 0, buf.length, start);
    } finally {
      fs.closeSync(fd);
    }
    return new Response(new Uint8Array(buf), { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Content-Length": String(buf.length) } });
  }
  return new Response(new Uint8Array(fs.readFileSync(file)), { headers: { ...headers, "Content-Length": String(stat.size) } });
}
