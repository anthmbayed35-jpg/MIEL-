import "server-only";
import { getEngine } from "./db";
import type { Row } from "./db";

export const LIST_PAGE_SIZE = 25;

const clampPage = (page: number | undefined, total: number, size: number) => Math.min(Math.max(1, page ?? 1), Math.max(1, Math.ceil(total / size)));
/** A typed % or _ is plain text ("!" is the LIKE escape character). */
const like = (q: string) => `%${q.replace(/[%_!]/g, (c) => `!${c}`)}%`;

export type InventoryFilters = { q?: string; stock?: string; page?: number };

/**
 * Stock records with their product, filtered and paginated in SQL (low/out of stock first). One query, no per-row lookups.
 * "low" = at or below the low-stock threshold, "out" = zero.
 */
export function inventoryList(f: InventoryFilters) {
  const db = getEngine().sqlite;
  const where = ["p.status <> 'archived' OR i.on_hand > 0"];
  const params: unknown[] = [];
  const q = (f.q ?? "").trim();
  if (q) {
    where.push("(p.name LIKE ? ESCAPE '!' OR i.sku LIKE ? ESCAPE '!')");
    params.push(like(q), like(q));
  }
  if (f.stock === "out") where.push("i.on_hand = 0");
  if (f.stock === "low") where.push("i.on_hand <= i.low_stock_threshold");
  const w = `WHERE (${where[0]})${where.slice(1).map((x) => ` AND ${x}`).join("")}`;
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM inventory_items i JOIN products p ON p.id = i.product_id ${w}`).get(...params) as { n: number }).n;
  const page = clampPage(f.page, total, LIST_PAGE_SIZE);
  const rows = (
    db
      .prepare(
        `SELECT i.id, i.product_id, i.sku, i.on_hand, i.low_stock_threshold, p.name AS product_name, p.kind, p.status
         FROM inventory_items i JOIN products p ON p.id = i.product_id ${w}
         ORDER BY (i.on_hand <= i.low_stock_threshold) DESC, i.on_hand ASC, p.name ASC LIMIT ${LIST_PAGE_SIZE} OFFSET ${(page - 1) * LIST_PAGE_SIZE}`,
      )
      .all(...params) as Record<string, unknown>[]
  ).map((r) => ({ id: r.id as string, i: { id: r.id, product_id: r.product_id, sku: r.sku, on_hand: r.on_hand as number, low_stock_threshold: r.low_stock_threshold as number } as Row, product: { id: r.product_id, name: r.product_name, kind: r.kind, status: r.status } as Row }));
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / LIST_PAGE_SIZE)) };
}

/** id -> product name for every stock item (small: names only), for batches and movement history. */
export const inventoryNames = () => new Map((getEngine().sqlite.prepare("SELECT i.id, p.name FROM inventory_items i JOIN products p ON p.id = i.product_id ORDER BY p.name").all() as { id: string; name: string }[]).map((r) => [r.id, r.name]));

/** Orders, revenue and discount given per discount code, in one grouped query (uses the orders(discount_code) index). */
export function discountUsage(): Map<string, { orders: number; revenue: number; given: number }> {
  const rows = getEngine()
    .sqlite.prepare(
      `SELECT discount_code AS code, COUNT(*) AS orders, SUM(total_cents) AS revenue, SUM(discount_total_cents) AS given
       FROM orders WHERE discount_code IS NOT NULL AND is_test = 0 AND status NOT IN ('draft','cancelled','returned','refused') GROUP BY discount_code`,
    )
    .all() as { code: string; orders: number; revenue: number; given: number }[];
  return new Map(rows.map((r) => [r.code.toUpperCase(), { orders: r.orders, revenue: r.revenue / 100, given: r.given / 100 }]));
}
