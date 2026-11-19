import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TABLES } from "@/lib/db/schema";
import { Engine, migrate, openSqlite, loadMigrations } from "@/lib/db/core";

let e: Engine;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "miel-db-"));
beforeAll(() => {
  const s = openSqlite(":memory:");
  migrate(s);
  e = new Engine(s, ":memory:");
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("schema registry matches the real tables", () => {
  for (const [name, t] of Object.entries(TABLES))
    it(name, () => {
      const real = (e.sqlite.prepare(`PRAGMA table_info(${name})`).all() as { name: string }[]).map((c) => c.name).sort();
      expect(Object.values(t.cols).map((c) => c.db).sort()).toEqual(real);
    });
  it("every table in the database is registered", () => {
    const tables = (e.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> 'migrations'").all() as { name: string }[]).map((r) => r.name).sort();
    expect(Object.keys(TABLES).sort()).toEqual(tables);
  });
});

describe("migrations", () => {
  it("apply on an empty database and are recorded", () => {
    const rows = e.sqlite.prepare("SELECT version FROM migrations").all();
    expect(rows.length).toBe(loadMigrations().length);
  });
  it("running again does nothing", () => expect(migrate(e.sqlite)).toEqual([]));
  it("a failing migration rolls back and refuses to continue", () => {
    const m = fs.mkdtempSync(path.join(dir, "m-"));
    fs.writeFileSync(path.join(m, "0001_a.sql"), "CREATE TABLE a (x INTEGER);");
    fs.writeFileSync(path.join(m, "0002_b.sql"), "CREATE TABLE b (x INTEGER); CREATE TABLE a (x INTEGER);"); // second statement fails
    const db = new Database(":memory:");
    expect(() => migrate(db, m)).toThrow(/0002_b failed and was rolled back/);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'b'").get()).toBeUndefined(); // rolled back
    expect((db.prepare("SELECT version FROM migrations").all() as unknown[]).length).toBe(1); // 0001 stays applied
  });
  it("one version behind: only the missing migration is applied, data is kept, and a copy is saved first", () => {
    const m = fs.mkdtempSync(path.join(dir, "m-"));
    fs.writeFileSync(path.join(m, "0001_a.sql"), "CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT); ");
    const file = path.join(dir, "behind.db");
    const db = openSqlite(file);
    migrate(db, m, file);
    db.prepare("INSERT INTO t (v) VALUES ('keep me')").run();
    fs.writeFileSync(path.join(m, "0002_b.sql"), "ALTER TABLE t ADD COLUMN w TEXT DEFAULT 'new';");
    expect(migrate(db, m, file)).toEqual([2]);
    expect(db.prepare("SELECT v, w FROM t").get()).toEqual({ v: "keep me", w: "new" });
    expect(fs.readdirSync(path.join(dir, "backups")).some((f) => f.startsWith("pre-migration-"))).toBe(true);
    db.close();
  });
});

describe("query builder", () => {
  it("insert, defaults, select, update bumps version, delete", async () => {
    const p = (await e.from("products").insert({ slug: "t1", name: "T1", price: 12.34, chips: ["a", "b"] }).select().single()).data;
    expect(p).toMatchObject({ slug: "t1", price: 12.34, chips: ["a", "b"], status: "draft", version: 1, kind: "single" });
    expect(e.sqlite.prepare("SELECT price_cents FROM products WHERE id = ?").get(p.id)).toEqual({ price_cents: 1234 }); // stored as cents
    const u = (await e.from("products").update({ name: "T1b" }).eq("id", p.id).select().single()).data;
    expect(u).toMatchObject({ name: "T1b", version: 2 });
    expect((await e.from("products").select("id").eq("slug", "t1")).data).toHaveLength(1);
    await e.from("products").delete().eq("id", p.id);
    expect((await e.from("products").select("id").eq("slug", "t1")).data).toHaveLength(0);
  });
  it("optimistic concurrency: the second editor gets a conflict", async () => {
    const p = (await e.from("products").insert({ slug: "t2", name: "T2" }).select().single()).data;
    const a = await e.from("products").update({ name: "A" }).eq("id", p.id).ifVersion(1).select().single();
    const b = await e.from("products").update({ name: "B" }).eq("id", p.id).ifVersion(1).select().single();
    expect(a.error).toBeNull();
    expect(b.error?.code).toBe("VERSION_CONFLICT");
    expect((await e.from("products").select("name").eq("id", p.id).single()).data.name).toBe("A");
  });
  it("unique violations look like before (23505)", async () => {
    await e.from("products").insert({ slug: "dup", name: "x" });
    const r = await e.from("products").insert({ slug: "dup", name: "y" });
    expect(r.error?.code).toBe("23505");
    expect(r.error?.message).toMatch(/duplicate|unique/i);
  });
  it("filters, ordering with nulls, ranges, counts", async () => {
    for (const [i, c] of [[1, null], [2, 500], [3, 100]] as const) await e.from("products").insert({ slug: `f${i}`, name: `F${i}`, compare_at_price: c === null ? null : c / 100, sort: i });
    const asc = (await e.from("products").select("slug").like("slug", "f%").order("compare_at_price", { ascending: true })).data.map((r: any) => r.slug);
    expect(asc).toEqual(["f3", "f2", "f1"]); // nulls last when ascending
    const desc = (await e.from("products").select("slug").like("slug", "f%").order("compare_at_price", { ascending: false })).data.map((r: any) => r.slug);
    expect(desc).toEqual(["f1", "f2", "f3"]); // nulls first when descending
    const c = await e.from("products").select("id", { count: "exact" }).like("slug", "f%").range(1, 1);
    expect(c.count).toBe(3);
    expect(c.data).toHaveLength(1);
    expect((await e.from("products").select("slug").in("slug", ["f1", "f3"]).order("slug")).data.map((r: any) => r.slug)).toEqual(["f1", "f3"]);
    expect((await e.from("products").select("slug").in("slug", [])).data).toEqual([]);
    expect((await e.from("products").select("slug").or("slug.ilike.F1%,slug.eq.f2").order("slug")).data.map((r: any) => r.slug)).toEqual(["f1", "f2"]);
  });
  it("unknown tables and columns are refused (never reach SQL)", async () => {
    expect(() => e.from("products; DROP TABLE products")).toThrow();
    expect(() => e.from("products").select("id").eq("slug; DROP TABLE products; --", "x")).toThrow(/unknown column/);
    expect((await e.from("products").insert({ slug: "z", name: "z", evil: 1 })).error?.message).toMatch(/unknown column/);
  });
  it("values are bound, not concatenated (injection attempts are just text)", async () => {
    const evil = "x'; DROP TABLE products; --";
    await e.from("products").insert({ slug: "inj", name: evil });
    expect((await e.from("products").select("name").eq("slug", "inj").single()).data.name).toBe(evil);
    expect((await e.from("products").select("id").eq("name", "' OR '1'='1")).data).toHaveLength(0);
    expect(e.sqlite.prepare("SELECT count(*) n FROM products").get()).toMatchObject({ n: expect.any(Number) });
  });
  it("negative stock is impossible (CHECK constraint + adjust_stock)", async () => {
    const p = (await e.from("products").insert({ slug: "stk", name: "S" }).select().single()).data;
    const it = (await e.from("inventory_items").insert({ product_id: p.id, on_hand: 3 }).select().single()).data;
    expect((await e.rpc("adjust_stock", { p_item: it.id, p_delta: -4, p_reason: "sale" })).error?.message).toBe("insufficient_stock");
    expect((await e.rpc("adjust_stock", { p_item: it.id, p_delta: -3, p_reason: "sale" })).data).toBe(0);
    expect((await e.from("stock_movements").select("id").eq("inventory_item_id", it.id)).data).toHaveLength(1);
    expect(() => e.sqlite.prepare("UPDATE inventory_items SET on_hand = -1 WHERE id = ?").run(it.id)).toThrow(/CHECK/);
  });
});
