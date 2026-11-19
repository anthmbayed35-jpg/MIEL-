import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { Query, type Result, type Row } from "./query";

/**
 * Connection, migrations and the few operations that must be atomic. No "server-only" import on purpose: proxy.ts
 * (the sign-in gate) uses it too. Nothing here is ever imported by browser code, and the database file lives on the
 * volume (DATABASE_PATH), never under public/.
 */
export const databasePath = () => process.env.DATABASE_PATH || path.join(process.cwd(), ".data", "miel.db");
/** Folder for everything that must survive a redeploy (database, uploads, backups). */
export const dataDir = () => (process.env.DATABASE_PATH && process.env.DATABASE_PATH !== ":memory:" ? path.dirname(process.env.DATABASE_PATH) : path.join(process.cwd(), ".data"));

export type Migration = { version: number; name: string; sql: string };

export function loadMigrations(dir = process.env.MIGRATIONS_DIR || path.join(process.cwd(), "migrations")): Migration[] {
  if (!fs.existsSync(dir)) throw new Error(`Migrations folder not found: ${dir}`);
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map((f) => ({ version: Number(f.slice(0, 4)), name: f.replace(/\.sql$/, ""), sql: fs.readFileSync(path.join(dir, f), "utf8") }));
}

/**
 * Apply pending migrations, each inside its own transaction, and record them. A failing migration rolls back and
 * throws, so the server refuses to start instead of running on a half-migrated database.
 * Before changing a database that already has data, a copy is saved next to it (pre-migration-<time>.db).
 */
export function migrate(db: Database.Database, dir?: string, file?: string): number[] {
  db.exec("CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
  const done = new Set((db.prepare("SELECT version FROM migrations").all() as { version: number }[]).map((r) => r.version));
  const all = loadMigrations(dir);
  const pending = all.filter((m) => !done.has(m.version));
  const applied: number[] = [];
  if (!pending.length) return applied;
  if (done.size && file && file !== ":memory:") {
    const backups = path.join(path.dirname(file), "backups");
    fs.mkdirSync(backups, { recursive: true });
    db.exec(`VACUUM INTO '${path.join(backups, `pre-migration-${new Date().toISOString().replace(/[:.]/g, "-")}.db`).replace(/'/g, "''")}'`);
  }
  for (const m of pending) {
    try {
      db.transaction(() => {
        db.exec(m.sql);
        db.prepare("INSERT INTO migrations (version, name, applied_at) VALUES (?, ?, ?)").run(m.version, m.name, new Date().toISOString());
      })();
      applied.push(m.version);
    } catch (e) {
      throw new Error(`Migration ${m.name} failed and was rolled back: ${(e as Error).message}. The server will not start on a half-migrated database.`);
    }
  }
  return applied;
}

export function openSqlite(file: string): Database.Database {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  if (file !== ":memory:") db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  return db;
}

export class Engine {
  constructor(public sqlite: Database.Database, public file: string) {}
  from(table: string) {
    return new Query(this.sqlite, table);
  }
  rpc(name: string, a: Row = {}): Promise<Result> {
    return Promise.resolve().then(() => rpc(this.sqlite, name, a));
  }
  /** One atomic unit: BEGIN IMMEDIATE (takes the write lock up front) ... COMMIT, or ROLLBACK if `fn` throws. */
  tx<T>(fn: () => T): T {
    return this.sqlite.transaction(fn).immediate();
  }
  close() {
    this.sqlite.close();
  }
}

const g = globalThis as unknown as { __mielEngine?: Engine };

/** The one database connection of this process (shared by every bundle: pages, actions, routes and the proxy). */
export function getEngine(): Engine {
  const file = databasePath();
  if (g.__mielEngine && g.__mielEngine.file === file) return g.__mielEngine;
  g.__mielEngine?.close();
  const sqlite = openSqlite(file);
  migrate(sqlite, undefined, file);
  g.__mielEngine = new Engine(sqlite, file);
  return g.__mielEngine;
}

/** Tests: drop the cached connection (e.g. after pointing DATABASE_PATH somewhere else). */
export function closeEngine() {
  g.__mielEngine?.close();
  g.__mielEngine = undefined;
}

// ---------- atomic helpers (these were Postgres functions) ----------
export function adjustStock(db: Database.Database, a: { p_item: string; p_delta: number; p_reason: string; p_note?: string; p_order?: string | null; p_actor?: string; p_demo?: boolean }): number {
  const row = db
    .prepare(`UPDATE inventory_items SET on_hand = on_hand + ?, version = version + 1 WHERE id = ? AND on_hand + ? >= 0 RETURNING on_hand`)
    .get(a.p_delta, a.p_item, a.p_delta) as { on_hand: number } | undefined;
  if (!row) throw new Error("insufficient_stock");
  db.prepare(`INSERT INTO stock_movements (id, inventory_item_id, delta, reason, note, order_id, actor, is_demo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    crypto.randomUUID(), a.p_item, a.p_delta, a.p_reason, a.p_note ?? "", a.p_order ?? null, a.p_actor ?? "", a.p_demo ? 1 : 0,
  );
  return row.on_hand;
}

export function nextOrderNumber(db: Database.Database): number {
  return (db.prepare(`UPDATE counters SET value = value + 1 WHERE name = 'order_number' RETURNING value`).get() as { value: number }).value;
}

function rpc(db: Database.Database, name: string, a: Row): Result {
  try {
    if (name === "next_order_number") return { data: db.transaction(() => nextOrderNumber(db)).immediate(), error: null };
    if (name === "reset_order_sequence") {
      db.prepare(`UPDATE counters SET value = 1000 WHERE name = 'order_number'`).run();
      return { data: 1000, error: null };
    }
    if (name === "adjust_stock") return { data: db.transaction(() => adjustStock(db, a as never)).immediate(), error: null };
    return { data: null, error: { message: `unknown rpc ${name}` } };
  } catch (e: any) {
    return { data: null, error: { message: String(e?.message ?? e) } };
  }
}
