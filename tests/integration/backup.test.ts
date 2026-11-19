import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { zipSync } from "fflate";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { closeEngine, getEngine } from "../../lib/db/core";
import { backupsDir, decryptBuffer, encryptBuffer, lastBackupAgeHours, listBackups, restoreFrom, retention, runBackup } from "@/lib/backup";
import { placeOrder } from "@/lib/orders";
import { h, ID, resetState, testDir } from "../support/state";
import { seedStore } from "../support/seed";

const count = (t: string) => (getEngine().sqlite.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n;
let S: Awaited<ReturnType<typeof seedStore>>;

beforeEach(async () => {
  resetState();
  S = await seedStore();
});

const order = (n: number) =>
  placeOrder({ customer: { name: `Cust ${n}`, phone: `03 10000${n}`, address: "Hamra, Bldg 5" }, items: [{ productId: S.red.id, qty: 2 }], region: "Beirut", source: "web", actor: "customer" });

describe("backup", () => {
  it("makes a consistent snapshot (integrity checked) and reports its age", async () => {
    expect(lastBackupAgeHours()).toBeNull();
    order(1);
    const b = await runBackup();
    expect(fs.existsSync(b.path)).toBe(true);
    expect(b.file).toMatch(/^miel-\d{8}-\d{6}\.db$/);
    expect(lastBackupAgeHours()).toBeLessThan(0.1);
    expect(listBackups()).toHaveLength(1);
  });

  it("backup, wipe, restore: row counts and a sample order come back exactly", async () => {
    const placed = order(1);
    order(2);
    getEngine().sqlite.prepare("INSERT INTO settings (key, value) VALUES ('store', ?)").run(JSON.stringify({ name: "MIEL+" }));
    const before = Object.fromEntries(["products", "orders", "order_items", "customers", "stock_movements", "admin_users", "order_events", "inventory_items"].map((t) => [t, count(t)]));
    const sample = getEngine().sqlite.prepare("SELECT order_number, total_cents, status, region FROM orders WHERE id = ?").get(placed.order.id);
    const stockBefore = getEngine().sqlite.prepare("SELECT on_hand FROM inventory_items WHERE product_id = ?").get(S.red.id);
    const snap = await runBackup();

    // wipe: delete the database file and everything in it
    closeEngine();
    for (const ext of ["", "-wal", "-shm"]) fs.rmSync(process.env.DATABASE_PATH! + ext, { force: true });
    expect(fs.existsSync(process.env.DATABASE_PATH!)).toBe(false);
    expect(count("orders")).toBe(0); // a brand-new empty database

    closeEngine();
    const r = restoreFrom(snap.path);
    expect(r.restoredTables).toBeGreaterThan(20);
    for (const [t, n] of Object.entries(before)) expect(count(t), t).toBe(n);
    expect(getEngine().sqlite.prepare("SELECT order_number, total_cents, status, region FROM orders WHERE id = ?").get(placed.order.id)).toEqual(sample);
    expect(getEngine().sqlite.prepare("SELECT on_hand FROM inventory_items WHERE product_id = ?").get(S.red.id)).toEqual(stockBefore);
    expect(getEngine().sqlite.prepare("SELECT value FROM counters WHERE name = 'order_number'").get()).toEqual({ value: 1002 }); // numbering continues
    expect(order(3).order.order_number).toBe(1003);
  });

  it("restore saves the current database first, and refuses damaged or foreign files without touching anything", async () => {
    order(1);
    const snap = await runBackup();
    order(2);
    const r = restoreFrom(snap.path);
    expect(r.savedPrevious && fs.existsSync(r.savedPrevious)).toBe(true);
    expect(count("orders")).toBe(1);

    const junk = path.join(testDir(), "junk.db");
    fs.writeFileSync(junk, "this is not a database");
    expect(() => restoreFrom(junk)).toThrow();
    const foreign = path.join(testDir(), "foreign.db");
    const Database = (await import("better-sqlite3")).default;
    const f = new Database(foreign);
    f.exec("CREATE TABLE t (x)");
    f.close();
    expect(() => restoreFrom(foreign)).toThrow(/doesn't look like a MIEL\+ database/);
    expect(count("orders")).toBe(1); // still the restored data
  });

  it("encrypted off-site copies round-trip, and the wrong key or a tampered file is refused", () => {
    const key = Buffer.alloc(32, 7);
    const enc = encryptBuffer(Buffer.from("customer data"), key);
    expect(enc.includes(Buffer.from("customer data"))).toBe(false);
    expect(decryptBuffer(enc, key).toString()).toBe("customer data");
    expect(() => decryptBuffer(enc, Buffer.alloc(32, 8))).toThrow();
    const bad = Buffer.from(enc);
    bad[bad.length - 1] ^= 1;
    expect(() => decryptBuffer(bad, key)).toThrow();
  });

  it("an .enc backup restores with BACKUP_ENCRYPTION_KEY", async () => {
    order(1);
    const snap = await runBackup();
    process.env.BACKUP_ENCRYPTION_KEY = "k".repeat(40);
    try {
      const encFile = path.join(testDir(), "snap.db.enc");
      fs.writeFileSync(encFile, encryptBuffer(fs.readFileSync(snap.path)));
      order(2);
      restoreFrom(encFile);
      expect(count("orders")).toBe(1);
    } finally {
      delete process.env.BACKUP_ENCRYPTION_KEY;
    }
  });

  it("restores the zip from 'Download backup' including uploads, and ignores path tricks inside it", async () => {
    order(1);
    const snap = await runBackup();
    const id = "11111111-1111-4111-8111-111111111111";
    const zip = zipSync({
      "miel.db": new Uint8Array(fs.readFileSync(snap.path)),
      [`uploads/${id}-480.webp`]: new Uint8Array([1, 2, 3]),
      "uploads/../../evil.txt": new Uint8Array([9]),
      "uploads/not-an-image.php": new Uint8Array([9]),
    });
    const zf = path.join(testDir(), "backup.zip");
    fs.writeFileSync(zf, zip);
    order(2);
    restoreFrom(zf);
    expect(count("orders")).toBe(1);
    expect(fs.readFileSync(path.join(testDir(), "uploads", `${id}-480.webp`))).toEqual(Buffer.from([1, 2, 3]));
    expect(fs.existsSync(path.join(testDir(), "uploads", "not-an-image.php"))).toBe(false);
    expect(fs.existsSync(path.join(testDir(), "..", "evil.txt"))).toBe(false);
  });

  it("retention keeps the newest 14 plus one per week for 8 weeks, and nothing else", () => {
    const DAY = 86_400_000;
    const base = Date.UTC(2026, 5, 1, 3);
    const all = Array.from({ length: 100 }, (_, i) => ({ id: i, mtime: base - i * DAY })); // 100 nightly backups
    const { keep, drop } = retention(all);
    const kept = new Set(keep.map((k) => k.id));
    for (let i = 0; i < 14; i++) expect(kept.has(i), `day ${i}`).toBe(true);
    expect(kept.size).toBeGreaterThanOrEqual(14 + 5); // the newest ~2 weeks overlap the 14 dailies
    expect(kept.size).toBeLessThanOrEqual(14 + 8);
    expect(keep.length + drop.length).toBe(100);
    expect(kept.has(99)).toBe(false); // very old: gone
    expect(retention(all.slice(0, 5)).drop).toHaveLength(0); // a young store loses nothing
  });

  it("running backups repeatedly prunes old files but never the newest", async () => {
    const files: string[] = [];
    for (let i = 0; i < 3; i++) {
      files.push((await runBackup()).path);
      await new Promise((r) => setTimeout(r, 1100)); // names have 1 s resolution
    }
    expect(listBackups().length).toBe(3);
    expect(fs.existsSync(files[2])).toBe(true);
    expect(backupsDir().startsWith(testDir())).toBe(true);
  }, 20_000);
});

describe("owner-only download", () => {
  it("401 without a session, 403 for staff and manager, a zip with miel.db for the owner (and it is audited)", async () => {
    const { GET } = await import("@/app/admin/backup/download/route");
    h.user = null;
    expect((await GET()).status).toBe(401);
    h.user = { id: ID.staff, email: "staff@t.test" };
    expect((await GET()).status).toBe(403);
    h.user = { id: ID.manager, email: "manager@t.test" };
    expect((await GET()).status).toBe(403);
    h.user = { id: ID.owner, email: "owner@t.test" };
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    const { unzipSync } = await import("fflate");
    const files = unzipSync(new Uint8Array(buf));
    expect(Object.keys(files)).toContain("miel.db");
    expect(Buffer.from(files["miel.db"]).subarray(0, 15).toString()).toBe("SQLite format 3");
    expect(getEngine().sqlite.prepare("SELECT COUNT(*) n FROM audit_log WHERE action = 'backup_download'").get()).toEqual({ n: 1 });
  });
});
