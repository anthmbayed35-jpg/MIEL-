import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { getEngine } from "../../lib/db/core";
import { deleteUpload, FILE_RE, parseUpload, saveProductImage } from "@/lib/storage";
import { GET as serve } from "@/app/uploads/[file]/route";
import { h, ID, resetState, testDir } from "../support/state";
import { seedStore } from "../support/seed";

sharp.cache(false); // Windows keeps files open while sharp caches them
let S: Awaited<ReturnType<typeof seedStore>>;
beforeEach(async () => {
  resetState();
  S = await seedStore();
});
const uploads = () => path.join(testDir(), "uploads");

const img = async (w: number, h: number, fmt: "jpeg" | "png" | "webp" = "jpeg", exif = false) => {
  let s = sharp({ create: { width: w, height: h, channels: 3, background: "#DAFC69" } });
  if (exif) s = s.withExif({ IFD0: { Copyright: "SECRET-OWNER-NAME", Software: "gps-phone" } });
  const buf = await s[fmt]().toBuffer();
  return new File([new Uint8Array(buf)], `photo.${fmt}`, { type: `image/${fmt}` });
};
const get = (file: string) => serve(new Request(`https://miel.example/uploads/${file}`), { params: Promise.resolve({ file }) });

describe("image upload: validation and re-encoding", () => {
  it("a JPEG becomes AVIF + WebP at responsive widths, never upscaled", async () => {
    const src = await saveProductImage(await img(1200, 1500));
    const u = parseUpload(src)!;
    expect(u).toMatchObject({ widths: [480, 768, 1080], width: 1200, height: 1500 }); // 1600 would upscale: not made
    for (const w of u.widths) for (const ext of ["avif", "webp"]) expect(fs.existsSync(path.join(uploads(), `${u.id}-${w}.${ext}`)), `${w}.${ext}`).toBe(true);
    expect(fs.existsSync(path.join(uploads(), `${u.id}-1600.webp`))).toBe(false);
    const meta = await sharp(path.join(uploads(), `${u.id}-768.webp`)).metadata();
    expect(meta.width).toBe(768);
    expect(meta.height).toBe(960);
  });

  it("a large image gets all four sizes", async () => {
    expect(parseUpload(await saveProductImage(await img(2400, 3000)))!.widths).toEqual([480, 768, 1080, 1600]);
  });

  it("strips EXIF and every other metadata (no GPS, no names) from every output file", async () => {
    const src = await saveProductImage(await img(1200, 1500, "jpeg", true));
    const u = parseUpload(src)!;
    for (const f of fs.readdirSync(uploads()).filter((x) => x.startsWith(u.id))) {
      const bytes = fs.readFileSync(path.join(uploads(), f));
      expect(bytes.includes(Buffer.from("SECRET-OWNER-NAME")), f).toBe(false);
      const m = await sharp(bytes).metadata();
      expect(m.exif, f).toBeUndefined();
    }
  });

  it("accepts PNG and WebP, refuses everything else (GIF, SVG, text, HTML, a PNG that is really a script)", async () => {
    await saveProductImage(await img(800, 800, "png"));
    await saveProductImage(await img(800, 800, "webp"));
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><script>alert(1)</script></svg>'], "x.svg", { type: "image/svg+xml" });
    const gif = new File([new Uint8Array(await sharp({ create: { width: 800, height: 800, channels: 3, background: "#fff" } }).gif().toBuffer())], "x.gif", { type: "image/gif" });
    const html = new File(["<html><script>alert(1)</script></html>"], "x.png", { type: "image/png" });
    const text = new File(["hello"], "x.jpg", { type: "image/jpeg" });
    for (const f of [svg, gif, html, text]) await expect(saveProductImage(f), f.name).rejects.toThrow(/valid image|Only JPG/);
    expect(fs.readdirSync(uploads()).every((n) => FILE_RE.test(n))).toBe(true); // nothing odd was written
  });

  it("enforces size and dimensions", async () => {
    await expect(saveProductImage(await img(400, 400))).rejects.toThrow(/too small/);
    await expect(saveProductImage(await img(8100, 700))).rejects.toThrow(/too large/);
    await expect(saveProductImage(new File([new Uint8Array(9 * 1024 * 1024)], "big.jpg"))).rejects.toThrow(/over 8 MB/);
    await expect(saveProductImage(new File([], "empty.jpg"))).rejects.toThrow(/Choose an image/);
  });

  it("an EXIF-rotated photo is measured after rotation", async () => {
    const portrait = await sharp({ create: { width: 1500, height: 1000, channels: 3, background: "#123456" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const u = parseUpload(await saveProductImage(new File([new Uint8Array(portrait)], "p.jpg")))!;
    expect([u.width, u.height]).toEqual([1000, 1500]);
  });

  it("deleting an upload removes every file and ignores built-in photo paths", async () => {
    const src = await saveProductImage(await img(1200, 1500));
    expect(fs.readdirSync(uploads()).length).toBeGreaterThan(0);
    deleteUpload("/images/red-burn/pouch-hero"); // a built-in photo: untouched, no error
    deleteUpload(src);
    expect(fs.readdirSync(uploads())).toEqual([]);
  });
});

describe("serving uploads: GET /uploads/<file>", () => {
  it("serves exactly the files the app made, with long-lived immutable caching and the right type", async () => {
    const u = parseUpload(await saveProductImage(await img(1200, 1500)))!;
    const webp = await get(`${u.id}-480.webp`);
    expect(webp.status).toBe(200);
    expect(webp.headers.get("content-type")).toBe("image/webp");
    expect(webp.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(webp.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await get(`${u.id}-480.avif`)).headers.get("content-type")).toBe("image/avif");
    expect((await get(`${u.id}-1600.webp`)).status).toBe(404); // not generated for this image
  });

  it("path traversal, listing, other file types and odd names are all 404", async () => {
    fs.writeFileSync(path.join(testDir(), "secret.txt"), "top secret");
    const evil = [
      "../miel.db", "..%2fmiel.db", "..\\miel.db", "%2e%2e/miel.db", "../../secret.txt", "secret.txt", "miel.db", "miel.db-wal", "",
      ".", "..", "/etc/passwd", "C:\\Windows\\win.ini", "11111111-1111-4111-8111-111111111111-480.png", "11111111-1111-4111-8111-111111111111-480.webp/../../miel.db",
      "11111111-1111-4111-8111-111111111111-999.webp", "x".repeat(5000), "11111111-1111-4111-8111-111111111111-480.webp\0.png",
    ];
    for (const f of evil) expect((await get(f)).status, JSON.stringify(f)).toBe(404);
    expect(fs.readFileSync(path.join(testDir(), "secret.txt"), "utf8")).toBe("top secret");
  });
});

describe("who may upload or delete", () => {
  const fd = async () => {
    const f = new FormData();
    f.set("id", S.red.id);
    f.set("alt", "RED BURN pouch on a table");
    f.set("file", await img(1200, 1500));
    return f;
  };
  it("not signed in: 401. Staff: 403. Manager: can upload, cannot delete. Owner: both", async () => {
    const { uploadImage, deleteImage } = await import("@/app/admin/(app)/products/actions");
    h.user = null;
    await expect(uploadImage(null, await fd())).rejects.toThrow("HTTP_401");
    h.user = { id: ID.staff, email: "staff@t.test" };
    await expect(uploadImage(null, await fd())).rejects.toThrow("HTTP_403");
    h.user = { id: ID.manager, email: "manager@t.test" };
    expect(await uploadImage(null, await fd())).toMatchObject({ ok: expect.stringMatching(/Image uploaded/) });
    const row = getEngine().sqlite.prepare("SELECT id, src FROM product_images").get() as { id: string; src: string };
    expect(row.src).toMatch(/^\/uploads\/[0-9a-f-]{36}@480-768-1080@1200x1500$/);
    const del = new FormData();
    del.set("image_id", row.id);
    await expect(deleteImage(null, del)).rejects.toThrow("HTTP_403");
    h.user = { id: ID.owner, email: "owner@t.test" };
    expect(await deleteImage(null, del)).toMatchObject({ ok: expect.stringMatching(/removed/) });
    expect(fs.readdirSync(uploads())).toEqual([]); // files are gone with the row
  });
  it("a bad file shows a clear message and leaves nothing behind", async () => {
    const { uploadImage } = await import("@/app/admin/(app)/products/actions");
    h.user = { id: ID.manager, email: "manager@t.test" };
    const f = await fd();
    f.set("file", new File(["not an image"], "x.jpg"));
    expect(await uploadImage(null, f)).toEqual({ error: expect.stringMatching(/valid image/) });
    expect(getEngine().sqlite.prepare("SELECT COUNT(*) n FROM product_images").get()).toEqual({ n: 0 });
  });
});
