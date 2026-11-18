import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Runs the REAL migrations (0001 + 0002) on real Postgres (PGlite) and tests what each database role can do.
 * Supabase-specific pieces are stood in for: auth.uid() (from a JWT claim setting), the anon / authenticated /
 * service_role roles, and the storage tables. This does not prove Supabase's hosted behaviour, but it does prove
 * the SQL and the policies in this repo.
 */
const SQL = (f: string) => fs.readFileSync(path.join(__dirname, "../../supabase/migrations", f), "utf8");

const OWNER = "00000000-0000-0000-0000-0000000000a1";
const MANAGER = "00000000-0000-0000-0000-0000000000a2";
const STAFF = "00000000-0000-0000-0000-0000000000a3";
const STRANGER = "00000000-0000-0000-0000-0000000000ff"; // valid Supabase account, NOT in admin_users

let db: PGlite;

/** Run SQL as a database role (optionally with a signed-in user id) inside a transaction that is rolled back. */
async function as<T = any>(role: "anon" | "authenticated" | "service_role", sub: string | null, sql: string): Promise<T[]> {
  let out: T[] = [];
  try {
    await db.transaction(async (tx) => {
      await tx.exec(`set local role ${role}`);
      if (sub) await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub]);
      const r = await tx.query<T>(sql);
      out = r.rows;
      throw new Error("__rollback__");
    });
  } catch (e) {
    if ((e as Error).message !== "__rollback__") throw e;
  }
  return out;
}
const denied = (p: Promise<unknown>) => expect(p).rejects.toThrow(/permission denied|row-level security|real_orders_exist|insufficient_stock/i);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text);
    alter table storage.objects enable row level security;
    create publication supabase_realtime;
    grant usage on schema public, auth, storage to anon, authenticated, service_role;
    grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
  `);
  const clean = (s: string) => s.replace(/create extension[^;]*;/gi, "");
  await db.exec(clean(SQL("0001_init.sql")));
  await db.exec(clean(SQL("0002_security.sql")));
  // Seed as the database owner (bypasses RLS)
  await db.exec(`
    insert into admin_users(id,email,name,role) values
      ('${OWNER}','owner@t.test','O','owner'),('${MANAGER}','mgr@t.test','M','manager'),('${STAFF}','staff@t.test','S','staff');
    insert into products(id,slug,name,status,price) values
      ('00000000-0000-0000-0000-000000000001','live','LIVE','active',30),('00000000-0000-0000-0000-000000000002','hidden','HIDDEN','draft',30);
    insert into product_images(product_id,src) values ('00000000-0000-0000-0000-000000000001','/a'),('00000000-0000-0000-0000-000000000002','/b');
    insert into inventory_items(id,product_id,sku,on_hand) values ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000001','S1',10);
    insert into customers(id,name,phone) values ('00000000-0000-0000-0000-0000000000d1','Cust','+96103123456');
    insert into orders(id,order_number,customer_id,total,is_demo) values ('00000000-0000-0000-0000-0000000000e1',1001,'00000000-0000-0000-0000-0000000000d1',30,false);
    insert into shipping_zones(name,fee,active) values ('Beirut',3,true),('Closed',9,false);
    insert into pages_content(key,value) values ('faq','[]'),('hero','{}'),('announcement','{}'),('testimonials','[{"approved":false}]');
    insert into settings(key,value) values ('store','{"whatsapp":"961"}');
    insert into discounts(code,type,value) values ('SECRET10','percent',10);
    insert into audit_log(actor_email,action) values ('x','y');
    insert into storage.buckets(id,name) values ('product-images','product-images') on conflict do nothing;
  `);
  // 0002 ran before the bucket existed in this stand-in, so apply its bucket settings now (mirrors what it does on Supabase)
  await db.exec(`update storage.buckets set public = true, file_size_limit = 8388608, allowed_mime_types = array['image/webp','image/jpeg','image/png'] where id='product-images';`);
}, 120_000);

afterAll(async () => db?.close());

describe("public storefront (anon key) can only read what the shop shows", () => {
  it("sees only active products", async () => {
    const r = await as("anon", null, "select slug from products");
    expect(r.map((x: any) => x.slug)).toEqual(["live"]);
  });
  it("sees images only of active products", async () => {
    const r = await as("anon", null, "select src from product_images");
    expect(r.map((x: any) => x.src)).toEqual(["/a"]);
  });
  it("sees only active shipping zones", async () => {
    const r = await as("anon", null, "select name from shipping_zones");
    expect(r.map((x: any) => x.name)).toEqual(["Beirut"]);
  });
  it("sees only public content keys (not unapproved testimonials)", async () => {
    const r = await as("anon", null, "select key from pages_content order by key");
    expect(r.map((x: any) => x.key)).toEqual(["announcement", "faq", "hero"]);
  });
  for (const t of ["orders", "order_items", "order_events", "customers", "settings", "discounts", "admin_users", "audit_log", "stock_movements", "inventory_items", "abandoned_checkouts", "events", "batches", "delivery_partners"])
    it(`cannot read ${t}`, async () => denied(as("anon", null, `select * from ${t}`)));
  it("cannot write anything", async () => {
    await denied(as("anon", null, "insert into orders(order_number,total) values (9,1)"));
    await denied(as("anon", null, "insert into customers(name,phone) values ('x','y')"));
    await denied(as("anon", null, "update products set price = 0"));
    await denied(as("anon", null, "delete from products"));
    await denied(as("anon", null, "update pages_content set value = '{}'"));
  });
  it("cannot call the stock or order-number functions through the public API", async () => {
    await denied(as("anon", null, "select adjust_stock('00000000-0000-0000-0000-0000000000c1', 99, 'x')"));
    await denied(as("anon", null, "select next_order_number()"));
    await denied(as("anon", null, "select reset_order_sequence()"));
    await denied(as("authenticated", OWNER, "select adjust_stock('00000000-0000-0000-0000-0000000000c1', 99, 'x')"));
  });
});

describe("a signed-in account that is not on the team gets nothing", () => {
  it("reads zero orders, customers, settings", async () => {
    for (const t of ["orders", "customers", "settings", "admin_users", "audit_log", "discounts"]) expect(await as("authenticated", STRANGER, `select * from ${t}`)).toHaveLength(0);
  });
  it("cannot write", async () => {
    await denied(as("authenticated", STRANGER, "insert into orders(order_number,total) values (7,1)"));
    await denied(as("authenticated", STRANGER, "insert into admin_users(id,email,role) values ('00000000-0000-0000-0000-0000000000ff','x@y.z','owner')"));
  });
});

describe("staff", () => {
  it("can read and update orders and customers", async () => {
    expect(await as("authenticated", STAFF, "select id from orders")).toHaveLength(1);
    expect(await as("authenticated", STAFF, "update orders set status='confirmed' returning id")).toHaveLength(1);
    expect(await as("authenticated", STAFF, "update customers set notes='vip' returning id")).toHaveLength(1);
  });
  it("cannot delete orders or customers", async () => {
    expect(await as("authenticated", STAFF, "delete from orders returning id")).toHaveLength(0);
    expect(await as("authenticated", STAFF, "delete from customers returning id")).toHaveLength(0);
  });
  it("cannot create or change products, discounts, zones", async () => {
    await denied(as("authenticated", STAFF, "insert into products(slug,name) values ('n','N')"));
    expect(await as("authenticated", STAFF, "update products set price = 1 returning id")).toHaveLength(0);
    await denied(as("authenticated", STAFF, "insert into discounts(code,type,value) values ('X','percent',1)"));
    expect(await as("authenticated", STAFF, "update shipping_zones set fee = 0 returning name")).toHaveLength(0);
  });
  it("cannot read settings, the audit log, or events; cannot read team rows of others", async () => {
    expect(await as("authenticated", STAFF, "select * from settings")).toHaveLength(0);
    expect(await as("authenticated", STAFF, "select * from audit_log")).toHaveLength(0);
    expect(await as("authenticated", STAFF, "select * from events")).toHaveLength(0);
    expect(await as("authenticated", STAFF, "select id from admin_users")).toHaveLength(1); // only their own
  });
  it("cannot change roles or settings", async () => {
    expect(await as("authenticated", STAFF, "update admin_users set role='owner' returning id")).toHaveLength(0);
    await denied(as("authenticated", STAFF, "insert into settings(key,value) values ('x','{}')"));
  });
  it("stock history is append-only (insert yes, edit/delete never)", async () => {
    expect(await as("authenticated", STAFF, "insert into stock_movements(inventory_item_id,delta,reason) values ('00000000-0000-0000-0000-0000000000c1',1,'t') returning id")).toHaveLength(1);
    await db.exec("insert into stock_movements(id,inventory_item_id,delta,reason) values ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c1',1,'seed')");
    expect(await as("authenticated", STAFF, "update stock_movements set delta=99 returning id")).toHaveLength(0);
    expect(await as("authenticated", OWNER, "delete from stock_movements returning id")).toHaveLength(0);
  });
});

describe("manager", () => {
  it("can create and update products, discounts and zones", async () => {
    expect(await as("authenticated", MANAGER, "update products set price = 31 returning id")).toHaveLength(2);
    expect(await as("authenticated", MANAGER, "insert into discounts(code,type,value) values ('MGR5','fixed',5) returning id")).toHaveLength(1);
  });
  it("cannot delete anything", async () => {
    expect(await as("authenticated", MANAGER, "delete from products returning id")).toHaveLength(0);
    expect(await as("authenticated", MANAGER, "delete from orders returning id")).toHaveLength(0);
    expect(await as("authenticated", MANAGER, "delete from discounts returning id")).toHaveLength(0);
  });
  it("can read settings and the audit log but not change settings or the team", async () => {
    expect(await as("authenticated", MANAGER, "select * from settings")).toHaveLength(1);
    expect(await as("authenticated", MANAGER, "select * from audit_log")).toHaveLength(1);
    await denied(as("authenticated", MANAGER, "insert into settings(key,value) values ('x','{}')"));
    expect(await as("authenticated", MANAGER, "update settings set value='{}' returning key")).toHaveLength(0);
    expect(await as("authenticated", MANAGER, "update admin_users set role='owner' returning id")).toHaveLength(0);
    await denied(as("authenticated", MANAGER, "insert into admin_users(id,email,role) values ('00000000-0000-0000-0000-0000000000f2','n@t.test','owner')"));
  });
});

describe("owner", () => {
  it("can delete, change settings and manage the team", async () => {
    expect(await as("authenticated", OWNER, "delete from discounts returning id")).toHaveLength(1);
  });
  it("owner can write settings and team rows", async () => {
    expect(await as("authenticated", OWNER, "update settings set value='{\"a\":1}' returning key")).toHaveLength(1);
    expect(await as("authenticated", OWNER, "update admin_users set name='Renamed' where id = '" + STAFF + "' returning id")).toHaveLength(1);
  });
});

describe("server functions (service role)", () => {
  it("adjust_stock changes stock atomically and refuses to go below zero", async () => {
    const r = await as("service_role", null, "select adjust_stock('00000000-0000-0000-0000-0000000000c1', -3, 'sale') as q");
    expect(r[0].q).toBe(7);
    await denied(as("service_role", null, "select adjust_stock('00000000-0000-0000-0000-0000000000c1', -999, 'sale')"));
  });
  it("reset_order_sequence refuses while real orders exist", async () => denied(as("service_role", null, "select reset_order_sequence()")));
  it("after clearing real orders, the next order number is 1001", async () => {
    await db.exec("delete from orders");
    await as("service_role", null, "select reset_order_sequence()").catch(() => {});
    await db.exec("select reset_order_sequence()");
    const r = await as("service_role", null, "select next_order_number() as n");
    expect(r[0].n).toBe(1001);
  });
});

describe("storage bucket", () => {
  it("limits size to 8 MB and types to webp/jpeg/png", async () => {
    const r = await db.query<any>("select public, file_size_limit, allowed_mime_types from storage.buckets where id='product-images'");
    expect(r.rows[0].file_size_limit).toBe(8388608);
    expect(r.rows[0].allowed_mime_types).toEqual(["image/webp", "image/jpeg", "image/png"]);
  });
  it("only owner/manager can write objects; the public cannot list or write", async () => {
    await denied(as("anon", null, "insert into storage.objects(bucket_id,name) values ('product-images','x.webp')"));
    expect(await as("anon", null, "select * from storage.objects")).toHaveLength(0);
    await denied(as("authenticated", STAFF, "insert into storage.objects(bucket_id,name) values ('product-images','x.webp')"));
    expect(await as("authenticated", MANAGER, "insert into storage.objects(bucket_id,name) values ('product-images','m.webp') returning id")).toHaveLength(1);
  });
});
