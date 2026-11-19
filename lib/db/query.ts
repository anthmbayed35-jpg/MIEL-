import crypto from "node:crypto";
import type Database from "better-sqlite3";
import { TABLES, type Col, type Table } from "./schema";

/**
 * A small parameterized SQL builder with the call shape the whole app uses (`from("orders").select().eq(...)`).
 * Table and column names come ONLY from lib/db/schema.ts (an unknown name throws), every value is a bound parameter,
 * so no string from a request ever becomes SQL. Rows come back with JSON parsed, booleans as booleans and money as
 * dollars (the database stores integer cents).
 */
export type Row = Record<string, any>;
export type Result<T = any> = { data: T; error: { message: string; code?: string } | null; count?: number | null };

const clone = <T>(r: T): T => JSON.parse(JSON.stringify(r));
const like = (s: string) => s.replace(/\\/g, "\\\\");

export class DbError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

function toDb(col: Col, v: any): any {
  if (v === undefined) return null;
  if (v === null) return null;
  switch (col.kind) {
    case "json": return JSON.stringify(v);
    case "bool": return v ? 1 : 0;
    case "money": case "x100": return Math.round(Number(v) * 100);
    default: return v;
  }
}
function fromDb(col: Col, v: any): any {
  if (v === null || v === undefined) return null;
  switch (col.kind) {
    case "json": return typeof v === "string" ? JSON.parse(v) : v;
    case "bool": return v === 1 || v === true;
    case "money": case "x100": return Number(v) / 100;
    default: return v;
  }
}

function mapError(e: any): { message: string; code?: string } {
  const code = String(e?.code ?? "");
  if (code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT_PRIMARYKEY") return { message: `duplicate key value violates unique constraint (${e.message})`, code: "23505" };
  if (code === "SQLITE_CONSTRAINT_FOREIGNKEY") return { message: "violates foreign key constraint", code: "23503" };
  if (code === "SQLITE_CONSTRAINT_CHECK") return { message: `violates check constraint (${e.message})`, code: "23514" };
  if (code === "SQLITE_BUSY") return { message: "The database is busy. Try again.", code: "SQLITE_BUSY" };
  return { message: String(e?.message ?? e), code: e?.code };
}

export class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: any;
  private where: string[] = [];
  private params: any[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private lim?: number;
  private off?: number;
  private ret = false;
  private mode: "many" | "single" | "maybe" = "many";
  private wantCount = false;
  private head = false;
  private conflict?: string;
  private expect?: number;
  private t: Table;

  constructor(private db: Database.Database, private table: string) {
    const t = TABLES[table];
    if (!t) throw new DbError(`unknown table ${table}`);
    this.t = t;
  }

  private col(name: string): Col {
    const c = this.t.cols[name];
    if (!c) throw new DbError(`unknown column ${this.table}.${name}`);
    return c;
  }
  private q(name: string) {
    return `"${this.col(name).db}"`;
  }
  private add(sql: string, ...p: any[]) {
    this.where.push(sql);
    this.params.push(...p);
    return this;
  }

  select(_cols?: string, opts?: { count?: "exact"; head?: boolean }) {
    this.ret = true;
    if (opts?.count) this.wantCount = true;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(v: Row | Row[]) { this.op = "insert"; this.payload = v; return this; }
  update(v: Row) { this.op = "update"; this.payload = v; return this; }
  upsert(v: Row | Row[], o?: { onConflict?: string }) { this.op = "upsert"; this.payload = v; this.conflict = o?.onConflict; return this; }
  delete() { this.op = "delete"; return this; }
  /** Optimistic concurrency: the update only applies if the row is still at this version. */
  ifVersion(v: number) { this.expect = v; return this; }

  eq(c: string, v: any) { return v === null ? this.add(`${this.q(c)} IS NULL`) : this.add(`${this.q(c)} = ?`, toDb(this.col(c), v)); }
  neq(c: string, v: any) { return v === null ? this.add(`${this.q(c)} IS NOT NULL`) : this.add(`(${this.q(c)} IS NULL OR ${this.q(c)} <> ?)`, toDb(this.col(c), v)); }
  gt(c: string, v: any) { return this.add(`${this.q(c)} > ?`, toDb(this.col(c), v)); }
  gte(c: string, v: any) { return this.add(`${this.q(c)} >= ?`, toDb(this.col(c), v)); }
  lt(c: string, v: any) { return this.add(`${this.q(c)} < ?`, toDb(this.col(c), v)); }
  lte(c: string, v: any) { return this.add(`${this.q(c)} <= ?`, toDb(this.col(c), v)); }
  in(c: string, v: any[]) {
    if (!v.length) return this.add("0");
    return this.add(`${this.q(c)} IN (${v.map(() => "?").join(",")})`, ...v.map((x) => toDb(this.col(c), x)));
  }
  is(c: string, v: null | boolean) { return v === null ? this.add(`${this.q(c)} IS NULL`) : this.add(`${this.q(c)} = ?`, v ? 1 : 0); }
  ilike(c: string, p: string) { return this.add(`${this.q(c)} LIKE ? ESCAPE '\\'`, p); }
  like(c: string, p: string) { return this.ilike(c, p); }
  /** "col.op.value,col.op.value" (same syntax as before). Columns are whitelisted, values are bound. */
  or(expr: string) {
    const parts: string[] = [];
    const params: any[] = [];
    for (const piece of expr.split(",")) {
      const [col, op, ...rest] = piece.split(".");
      const val = rest.join(".");
      if (op === "ilike" || op === "like") { parts.push(`${this.q(col)} LIKE ? ESCAPE '\\'`); params.push(val); }
      else if (op === "eq") { parts.push(`CAST(${this.q(col)} AS TEXT) = ?`); params.push(val); }
      else throw new DbError(`unsupported or() operator ${op}`);
    }
    this.where.push(`(${parts.join(" OR ")})`);
    this.params.push(...params);
    return this;
  }
  order(col: string, o?: { ascending?: boolean }) { this.col(col); this.orders.push({ col, asc: o?.ascending !== false }); return this; }
  limit(n: number) { this.lim = Math.max(0, Math.floor(n)); return this; }
  range(a: number, b: number) { this.off = Math.max(0, Math.floor(a)); this.lim = Math.max(0, Math.floor(b) - this.off + 1); return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: any) => B | PromiseLike<B>) | null) {
    return Promise.resolve().then(() => this.execute()).then(ok, bad);
  }

  private whereSql() {
    return this.where.length ? ` WHERE ${this.where.join(" AND ")}` : "";
  }
  private fromRow(r: Row): Row {
    const out: Row = {};
    for (const [name, c] of Object.entries(this.t.cols)) if (c.db in r) out[name] = fromDb(c, r[c.db]);
    return out;
  }
  private orderSql() {
    if (!this.orders.length) return "";
    // Postgres semantics kept: nulls last when ascending, first when descending
    return " ORDER BY " + this.orders.map(({ col, asc }) => (asc ? `${this.q(col)} IS NULL, ${this.q(col)} ASC` : `${this.q(col)} IS NOT NULL, ${this.q(col)} DESC`)).join(", ");
  }
  private insertSql(row: Row) {
    const cols: string[] = [];
    const vals: any[] = [];
    const r = { ...row };
    if (this.t.pk === "id" && r.id === undefined) r.id = crypto.randomUUID();
    for (const [k, v] of Object.entries(r)) {
      if (v === undefined) continue;
      cols.push(this.q(k));
      vals.push(toDb(this.col(k), v));
    }
    return { cols, vals };
  }

  /** Run synchronously (used inside transactions); `await` on the builder calls this too. */
  execute(): Result {
    try {
      const db = this.db;
      let rows: Row[] = [];
      let count: number | null = null;

      if (this.op === "insert" || this.op === "upsert") {
        const list: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload];
        const run = db.transaction(() => {
          for (const raw of list) {
            const { cols, vals } = this.insertSql(raw);
            let sql = `INSERT INTO ${this.table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`;
            if (this.op === "upsert") {
              const keys = (this.conflict ?? this.t.pk).split(",").map((k) => this.q(k.trim()));
              const sets = cols.filter((c) => !keys.includes(c)).map((c) => `${c} = excluded.${c}`);
              if (this.t.hasVersion) sets.push(`"version" = "version" + 1`);
              sql += ` ON CONFLICT(${keys.join(",")}) DO ${sets.length ? `UPDATE SET ${sets.join(", ")}` : "NOTHING"}`;
            }
            rows.push(...(db.prepare(`${sql} RETURNING *`).all(...vals) as Row[]));
          }
        });
        run();
      } else if (this.op === "update") {
        const sets: string[] = [];
        const vals: any[] = [];
        for (const [k, v] of Object.entries(this.payload as Row)) {
          if (v === undefined) continue;
          sets.push(`${this.q(k)} = ?`);
          vals.push(toDb(this.col(k), v));
        }
        if (this.t.hasVersion && !("version" in this.payload)) sets.push(`"version" = "version" + 1`);
        if (this.expect !== undefined) { this.where.push(`"version" = ?`); this.params.push(this.expect); }
        rows = db.prepare(`UPDATE ${this.table} SET ${sets.join(", ")}${this.whereSql()} RETURNING *`).all(...vals, ...this.params) as Row[];
        if (this.expect !== undefined && rows.length === 0)
          return { data: null, error: { message: "Someone else changed this record while you were editing. Reload the page and try again.", code: "VERSION_CONFLICT" } };
      } else if (this.op === "delete") {
        rows = db.prepare(`DELETE FROM ${this.table}${this.whereSql()} RETURNING *`).all(...this.params) as Row[];
      } else {
        if (this.wantCount || this.head) count = (db.prepare(`SELECT COUNT(*) AS n FROM ${this.table}${this.whereSql()}`).get(...this.params) as { n: number }).n;
        if (this.head) return { data: null, error: null, count };
        let sql = `SELECT * FROM ${this.table}${this.whereSql()}${this.orderSql()}`;
        const p = [...this.params];
        if (this.lim !== undefined) { sql += " LIMIT ?"; p.push(this.lim); if (this.off) { sql += " OFFSET ?"; p.push(this.off); } }
        else if (this.off) { sql += " LIMIT -1 OFFSET ?"; p.push(this.off); }
        rows = db.prepare(sql).all(...p) as Row[];
      }

      if (this.op !== "select" && !this.ret) return { data: null, error: null, count: null };
      const out = rows.map((r) => this.fromRow(r));
      if (this.mode === "single") {
        if (out.length !== 1) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" }, count };
        return { data: clone(out[0]), error: null, count: this.wantCount ? count ?? out.length : count };
      }
      if (this.mode === "maybe") return { data: out[0] ? clone(out[0]) : null, error: null, count };
      return { data: out, error: null, count: this.wantCount ? count ?? out.length : count };
    } catch (e: any) {
      if (e instanceof DbError) return { data: null, error: { message: e.message, code: e.code } };
      return { data: null, error: mapError(e) };
    }
  }
}

export { like };
