import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";
import Database from "better-sqlite3";
import { closeEngine, dataDir, databasePath, getEngine } from "./db/core";

/**
 * Backups and restore. No "server-only" import: scripts (npm run restore) use it too.
 *  - Nightly consistent snapshot with SQLite's online backup API (safe while the store is taking orders).
 *  - Retention: the newest 14, plus the newest of each of the last 8 weeks.
 *  - Optional encrypted off-site copy to an S3-compatible bucket (BACKUP_S3_*).
 *  - Owner download: a zip of the snapshot plus uploads (app/admin/backup/download).
 * Customer data never goes into git: /data and /backups are not in the repo.
 */
export const backupsDir = () => path.join(dataDir(), "backups");
const NAME_RE = /^miel-\d{8}-\d{6}\.db$/;
export const KEEP_DAILY = 14;
export const KEEP_WEEKLY = 8;

const stamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");

export function listBackups(): { file: string; path: string; mtime: number; size: number }[] {
  if (!fs.existsSync(backupsDir())) return [];
  return fs
    .readdirSync(backupsDir())
    .filter((f) => NAME_RE.test(f))
    .map((f) => {
      const p = path.join(backupsDir(), f);
      const s = fs.statSync(p);
      return { file: f, path: p, mtime: s.mtimeMs, size: s.size };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

export function lastBackupAgeHours(now = Date.now()): number | null {
  const newest = listBackups()[0];
  return newest ? Math.round(((now - newest.mtime) / 3_600_000) * 10) / 10 : null;
}

/** Which backups to keep: newest `daily`, plus the newest one of each of the last `weeks` ISO weeks. */
export function retention<T extends { mtime: number }>(all: T[], daily = KEEP_DAILY, weeks = KEEP_WEEKLY): { keep: T[]; drop: T[] } {
  const sorted = [...all].sort((a, b) => b.mtime - a.mtime);
  const keep = new Set<T>(sorted.slice(0, daily));
  const weekKey = (t: number) => {
    const d = new Date(t);
    const day = (d.getUTCDay() + 6) % 7; // Monday = 0
    return Math.floor((t - day * 86_400_000) / (7 * 86_400_000));
  };
  const seen = new Set<number>();
  for (const b of sorted) {
    const k = weekKey(b.mtime);
    if (seen.size >= weeks && !seen.has(k)) continue;
    if (!seen.has(k)) {
      seen.add(k);
      keep.add(b);
    }
  }
  return { keep: sorted.filter((b) => keep.has(b)), drop: sorted.filter((b) => !keep.has(b)) };
}

/** Take a consistent snapshot, verify it, prune old ones, and (if configured) copy it off-site. */
export async function runBackup(): Promise<{ file: string; path: string; offsite: boolean }> {
  fs.mkdirSync(backupsDir(), { recursive: true });
  const dest = path.join(backupsDir(), `miel-${stamp()}.db`);
  await getEngine().sqlite.backup(dest); // online backup API: consistent even while writes continue
  const check = new Database(dest, { readonly: true });
  try {
    const r = check.pragma("integrity_check", { simple: true });
    if (r !== "ok") throw new Error(`Backup integrity check failed: ${String(r)}`);
  } finally {
    check.close();
  }
  for (const b of retention(listBackups()).drop) fs.rmSync(b.path, { force: true });
  let offsite = false;
  if (process.env.BACKUP_S3_BUCKET) {
    try {
      await uploadOffsite(dest);
      offsite = true;
    } catch (e) {
      console.error("off-site backup failed:", (e as Error).message); // the local backup still exists; health stays up
    }
  }
  return { file: path.basename(dest), path: dest, offsite };
}

// ---------- optional encrypted off-site copy ----------
const MAGIC = Buffer.from("MIELBK1");
const backupKey = () => {
  const k = process.env.BACKUP_ENCRYPTION_KEY;
  if (!k || k.length < 32) throw new Error("BACKUP_ENCRYPTION_KEY (32+ characters) is required for off-site backups.");
  return crypto.createHash("sha256").update(k).digest();
};
export function encryptBuffer(plain: Buffer, key = backupKey()): Buffer {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), enc]);
}
export function decryptBuffer(blob: Buffer, key = backupKey()): Buffer {
  if (!blob.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Not an encrypted MIEL+ backup.");
  const iv = blob.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = blob.subarray(MAGIC.length + 12, MAGIC.length + 28);
  const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(blob.subarray(MAGIC.length + 28)), d.final()]);
}

async function uploadOffsite(file: string) {
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({
    region: process.env.BACKUP_S3_REGION || "auto",
    endpoint: process.env.BACKUP_S3_ENDPOINT || undefined,
    forcePathStyle: !!process.env.BACKUP_S3_ENDPOINT,
    credentials: { accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID!, secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY! },
  });
  const body = encryptBuffer(fs.readFileSync(file));
  await s3.send(new PutObjectCommand({ Bucket: process.env.BACKUP_S3_BUCKET!, Key: `${process.env.BACKUP_S3_PREFIX ?? "miel/"}${path.basename(file)}.enc`, Body: body }));
}

// ---------- scheduler (started from instrumentation.ts) ----------
const g = globalThis as unknown as { __mielBackupTimer?: NodeJS.Timeout };
export function startBackupScheduler() {
  if (g.__mielBackupTimer || process.env.BACKUPS_DISABLED === "1") return;
  const tick = async () => {
    try {
      const age = lastBackupAgeHours();
      const beirutHour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Beirut" }).format(new Date()));
      if (age === null || age > 24 || (age > 12 && beirutHour === 3)) await runBackup(); // nightly around 03:00, or catch up after downtime
    } catch (e) {
      console.error("scheduled backup failed:", (e as Error).message);
    }
  };
  setTimeout(tick, 30_000).unref(); // shortly after boot
  g.__mielBackupTimer = setInterval(tick, 30 * 60_000);
  g.__mielBackupTimer.unref();
}

// ---------- restore ----------
/**
 * Replace the live database (and uploads, for a .zip) with a backup. The current database is saved first as
 * backups/pre-restore-<time>.db. The app must be stopped (or the next start picks the restored file up).
 * Accepts: .db, .db.enc (needs BACKUP_ENCRYPTION_KEY) or the .zip from "Download backup".
 */
export function restoreFrom(source: string, opts: { dir?: string } = {}): { restoredTables: number; savedPrevious?: string } {
  const dir = opts.dir ?? dataDir();
  const dbFile = opts.dir ? path.join(dir, "miel.db") : databasePath();
  let dbBytes: Buffer;
  let uploads: Record<string, Uint8Array> = {};
  const raw = fs.readFileSync(source);
  if (source.endsWith(".zip")) {
    const files = unzipSync(new Uint8Array(raw));
    const dbEntry = files["miel.db"];
    if (!dbEntry) throw new Error("This zip has no miel.db inside.");
    dbBytes = Buffer.from(dbEntry);
    uploads = Object.fromEntries(Object.entries(files).filter(([n]) => n.startsWith("uploads/") && !n.endsWith("/")));
  } else if (source.endsWith(".enc")) dbBytes = decryptBuffer(raw);
  else dbBytes = raw;

  // verify before touching anything
  const probeFile = path.join(dir, `.restore-probe-${process.pid}.db`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(probeFile, dbBytes);
  let tables: number;
  try {
    const probe = new Database(probeFile, { readonly: true });
    if (probe.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("The backup file is damaged (integrity check failed).");
    tables = (probe.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get() as { n: number }).n;
    if (!probe.prepare("SELECT name FROM sqlite_master WHERE name = 'migrations'").get()) throw new Error("This doesn't look like a MIEL+ database.");
    probe.close();
  } catch (e) {
    fs.rmSync(probeFile, { force: true });
    throw e;
  }

  closeEngine();
  let savedPrevious: string | undefined;
  if (fs.existsSync(dbFile)) {
    fs.mkdirSync(path.join(dir, "backups"), { recursive: true });
    savedPrevious = path.join(dir, "backups", `pre-restore-${stamp()}.db`);
    fs.copyFileSync(dbFile, savedPrevious);
  }
  for (const ext of ["", "-wal", "-shm"]) fs.rmSync(dbFile + ext, { force: true });
  fs.renameSync(probeFile, dbFile);
  for (const [name, bytes] of Object.entries(uploads)) {
    const rel = name.replace(/^uploads\//, "");
    if (!/^[0-9a-f-]{36}-\d+\.(avif|webp)$/.test(rel)) continue; // only files the app itself creates; no path tricks
    fs.mkdirSync(path.join(dir, "uploads"), { recursive: true });
    fs.writeFileSync(path.join(dir, "uploads", rel), bytes);
  }
  return { restoredTables: tables, savedPrevious };
}
