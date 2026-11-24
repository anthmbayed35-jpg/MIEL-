import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "../db";

/** Files ambassadors upload (proof screenshots) and the team uploads (resources). Stored on the volume, outside public/, served only by app/ambassador/files after a sign-in check. */
const root = (kind: "proofs" | "resources") => {
  const d = path.join(dataDir(), "ambassador", kind);
  fs.mkdirSync(/* turbopackIgnore: true */ d, { recursive: true });
  return d;
};

function sniff(b: Buffer): { ext: string; type: string } | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", type: "image/png" };
  if (b.length > 12 && b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return { ext: "webp", type: "image/webp" };
  if (b.length > 5 && b.subarray(0, 5).toString() === "%PDF-") return { ext: "pdf", type: "application/pdf" };
  return null;
}
export const FILE_NAME_RE = /^[0-9a-f]{32}\.(jpg|png|webp|pdf)$/;
const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };
export const typeOf = (name: string) => TYPES[name.split(".").pop() ?? ""] ?? "application/octet-stream";

/** Validates the real bytes (not the name or the browser's type), limits the size, and returns the stored file name. */
export async function saveUpload(kind: "proofs" | "resources", file: File, opts: { pdf: boolean; maxBytes: number }): Promise<{ stored: string; size: number }> {
  if (file.size > opts.maxBytes) throw new Error(`That file is too big (max ${Math.round(opts.maxBytes / 1_048_576)} MB).`);
  const buf = Buffer.from(await file.arrayBuffer());
  const t = sniff(buf);
  if (!t || (t.ext === "pdf" && !opts.pdf)) throw new Error(opts.pdf ? "Upload a JPG, PNG, WebP or PDF file." : "Upload a JPG, PNG or WebP screenshot.");
  const stored = `${crypto.randomBytes(16).toString("hex")}.${t.ext}`;
  fs.writeFileSync(/* turbopackIgnore: true */ path.join(root(kind), stored), buf);
  return { stored, size: buf.length };
}

export function readUpload(kind: "proofs" | "resources", name: string): Buffer | null {
  if (!FILE_NAME_RE.test(name)) return null;
  try {
    return fs.readFileSync(/* turbopackIgnore: true */ path.join(root(kind), name));
  } catch {
    return null;
  }
}
