import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Local JSON-file store with a small subset of the Supabase query-builder API.
 * DEV / DEMO ONLY (see lib/db/index.ts for when it is allowed). Everything in the app is written
 * against the Supabase API, so the same code runs on Postgres in production.
 */
type Row = Record<string, any>;
type State = { tables: Record<string, Row[]>; meta: Record<string, number> };

const FILE = path.join(process.cwd(), ".data", "db.json");
const g = globalThis as unknown as { __mielLocal?: { state: State; mtime: number; dirty?: boolean; timer?: NodeJS.Timeout } };

function state(): State {
  let mtime = 0;
  try {
    mtime = fs.statSync(FILE).mtimeMs;
  } catch {}
  if (!g.__mielLocal || (!g.__mielLocal.dirty && mtime && mtime !== g.__mielLocal.mtime)) {
    let s: State = { tables: {}, meta: {} };
    try {
      s = JSON.parse(fs.readFileSync(FILE, "utf8"));
    } catch {}
    g.__mielLocal = { state: s, mtime };
  }
  return g.__mielLocal.state;
}
// Writes are coalesced (many small mutations during seeding become one file write).
function flush() {
  const m = g.__mielLocal;
  if (!m) return;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(m.state));
  m.mtime = fs.statSync(FILE).mtimeMs;
  m.dirty = false;
}
function save() {
  const m = g.__mielLocal!;
  m.dirty = true;
  clearTimeout(m.timer);
  m.timer = setTimeout(flush, 40);
}
const rows = (t: string) => (state().tables[t] ??= []);
const now = () => new Date().toISOString();

type Result = { data: any; error: { message: string; code?: string } | null; count?: number | null };
const regexFor = (pattern: string) =>
  new RegExp("^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$", "i");

function cmp(a: any, b: any) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: any;
  private filters: ((r: Row) => boolean)[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private lim?: number;
  private rng?: [number, number];
  private ret = false;
  private mode: "many" | "single" | "maybe" = "many";
  private wantCount = false;
  private head = false;
  private conflict?: string;
  constructor(private table: string) {}

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

  eq(c: string, v: any) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: any) { this.filters.push((r) => r[c] !== v); return this; }
  gt(c: string, v: any) { this.filters.push((r) => r[c] != null && r[c] > v); return this; }
  gte(c: string, v: any) { this.filters.push((r) => r[c] != null && r[c] >= v); return this; }
  lt(c: string, v: any) { this.filters.push((r) => r[c] != null && r[c] < v); return this; }
  lte(c: string, v: any) { this.filters.push((r) => r[c] != null && r[c] <= v); return this; }
  in(c: string, v: any[]) { this.filters.push((r) => v.includes(r[c])); return this; }
  is(c: string, v: null | boolean) { this.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
  ilike(c: string, p: string) { const re = regexFor(p); this.filters.push((r) => r[c] != null && re.test(String(r[c]))); return this; }
  like(c: string, p: string) { return this.ilike(c, p); }
  or(expr: string) {
    const parts = expr.split(",").map((p) => {
      const [col, op, ...rest] = p.split(".");
      return { col, op, val: rest.join(".") };
    });
    this.filters.push((r) =>
      parts.some(({ col, op, val }) => {
        const v = r[col];
        if (op === "ilike" || op === "like") return v != null && regexFor(val).test(String(v));
        if (op === "eq") return String(v) === val;
        return false;
      }),
    );
    return this;
  }
  order(col: string, o?: { ascending?: boolean }) { this.orders.push({ col, asc: o?.ascending !== false }); return this; }
  limit(n: number) { this.lim = n; return this; }
  range(a: number, b: number) { this.rng = [a, b]; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: any) => B | PromiseLike<B>) | null) {
    return Promise.resolve().then(() => this.exec()).then(ok, bad);
  }

  private exec(): Result {
    try {
      const table = rows(this.table);
      const match = (r: Row) => this.filters.every((f) => f(r));
      let out: Row[] = [];
      if (this.op === "insert" || this.op === "upsert") {
        const list: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload];
        for (const raw of list) {
          const row: Row = { ...raw };
          if (this.op === "upsert") {
            const key = this.conflict ?? "id";
            const keys = key.split(",");
            const existing = table.find((r) => keys.every((k) => r[k] === row[k]));
            if (existing) { Object.assign(existing, row); out.push(existing); continue; }
          }
          if (row.id === undefined && !["pages_content", "settings"].includes(this.table)) row.id = crypto.randomUUID();
          if (row.created_at === undefined && !["pages_content", "settings", "shipping_zones"].includes(this.table)) row.created_at = now();
          // unique constraints we rely on
          const uniq: Record<string, string[]> = {
            products: ["slug"], customers: ["phone"], discounts: ["code"], orders: ["order_number"],
            admin_users: ["email"], shipping_zones: ["name"], inventory_items: ["product_id"],
          };
          for (const k of uniq[this.table] ?? []) {
            if (table.some((r) => r[k] === row[k])) return { data: null, error: { message: `duplicate key value violates unique constraint (${k})`, code: "23505" } };
          }
          table.push(row);
          out.push(row);
        }
        save();
      } else if (this.op === "update") {
        for (const r of table) if (match(r)) { Object.assign(r, this.payload); out.push(r); }
        save();
      } else if (this.op === "delete") {
        const keep: Row[] = [];
        for (const r of table) (match(r) ? out : keep).push(r);
        state().tables[this.table] = keep;
        save();
      } else {
        out = table.filter(match);
      }

      let count: number | null = null;
      if (this.op === "select" || this.wantCount) count = out.length;
      if (this.op === "select" || this.ret) {
        for (const { col, asc } of [...this.orders].reverse()) out = [...out].sort((a, b) => (asc ? 1 : -1) * cmp(a[col], b[col]));
        if (this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
        else if (this.lim !== undefined) out = out.slice(0, this.lim);
      }
      if (this.head) return { data: null, error: null, count };
      if (!this.ret && this.op !== "select") return { data: null, error: null, count: null };
      const clone = (r: Row) => JSON.parse(JSON.stringify(r));
      if (this.mode === "single") {
        if (out.length !== 1) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" }, count };
        return { data: clone(out[0]), error: null, count };
      }
      if (this.mode === "maybe") return { data: out[0] ? clone(out[0]) : null, error: null, count };
      return { data: out.map(clone), error: null, count };
    } catch (e: any) {
      return { data: null, error: { message: String(e?.message ?? e) } };
    }
  }
}

export function createLocalClient() {
  return {
    from: (t: string) => new Query(t),
    async rpc(name: string, a: Row = {}): Promise<Result> {
      const s = state();
      if (name === "next_order_number") {
        s.meta.order_number = (s.meta.order_number ?? 1000) + 1;
        save();
        return { data: s.meta.order_number, error: null };
      }
      if (name === "adjust_stock") {
        const item = rows("inventory_items").find((r) => r.id === a.p_item);
        if (!item || item.on_hand + a.p_delta < 0) return { data: null, error: { message: "insufficient_stock" } };
        item.on_hand += a.p_delta;
        rows("stock_movements").push({
          id: crypto.randomUUID(), inventory_item_id: a.p_item, delta: a.p_delta, reason: a.p_reason,
          note: a.p_note ?? "", order_id: a.p_order ?? null, batch_id: null, actor: a.p_actor ?? "",
          is_demo: !!a.p_demo, created_at: now(),
        });
        save();
        return { data: item.on_hand, error: null };
      }
      return { data: null, error: { message: `unknown rpc ${name}` } };
    },
  };
}
