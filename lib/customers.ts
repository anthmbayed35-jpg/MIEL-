import "server-only";
import { getEngine } from "./db";
import type { Row } from "./db";

export type CustomerRow = Row & { orders: number; spent: number; last: string | null };
export type CustomerFilters = { q?: string; tag?: string; blocked?: string; sort?: string; page?: number };
export const CUSTOMER_PAGE_SIZE = 50;

/**
 * One aggregate query (orders counted and summed in SQL, using the orders(customer_id) index), filtered, sorted and
 * paginated in the database. Spend ignores cancelled / returned / draft / test orders. The old version loaded every customer
 * and every order and compared them in JavaScript (2,000 x 5,000 comparisons, a 10 MB page).
 */
function build(f: CustomerFilters) {
  const where: string[] = [];
  const params: unknown[] = [];
  const q = (f.q ?? "").trim();
  if (q) {
    const digits = q.replace(/\D/g, "");
    const like = `%${q.replace(/[%_!]/g, (c) => `!${c}`)}%`; // "!" is the LIKE escape character, so a typed % or _ is just text
    if (digits) {
      where.push("(c.name LIKE ? ESCAPE '!' OR c.phone LIKE ?)");
      params.push(like, `%${digits}%`);
    } else {
      where.push("c.name LIKE ? ESCAPE '!'");
      params.push(like);
    }
  }
  if (f.tag) {
    where.push("EXISTS (SELECT 1 FROM json_each(c.tags) WHERE json_each.value = ?)");
    params.push(f.tag);
  }
  if (f.blocked === "1") where.push("c.blocked = 1");
  return { where: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

const SELECT = `
  SELECT c.*, COUNT(o.id) AS orders,
         COALESCE(SUM(CASE WHEN o.status NOT IN ('cancelled','returned','draft') AND o.is_test = 0 THEN o.total_cents END), 0) AS spent_cents,
         MAX(o.created_at) AS last
  FROM customers c LEFT JOIN orders o ON o.customer_id = c.id AND o.status <> 'draft'`;

function shape(r: Record<string, any>): CustomerRow {
  const { spent_cents, tags, blocked, is_demo, ...rest } = r;
  return { ...rest, tags: JSON.parse(tags ?? "[]"), blocked: !!blocked, is_demo: !!is_demo, orders: r.orders, spent: Number(spent_cents) / 100, last: r.last ?? null } as CustomerRow;
}

export function listCustomers(f: CustomerFilters, paginate = true) {
  const db = getEngine().sqlite;
  const { where, params } = build(f);
  const order = f.sort === "recent" ? "last DESC, c.created_at DESC" : "spent_cents DESC, c.created_at DESC";
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM customers c ${where}`).get(...params) as { n: number }).n;
  const pages = Math.max(1, Math.ceil(total / CUSTOMER_PAGE_SIZE));
  const page = Math.min(Math.max(1, f.page ?? 1), pages);
  const limit = paginate ? ` LIMIT ${CUSTOMER_PAGE_SIZE} OFFSET ${(page - 1) * CUSTOMER_PAGE_SIZE}` : "";
  const rows = (db.prepare(`${SELECT} ${where} GROUP BY c.id ORDER BY ${order}${limit}`).all(...params) as Record<string, any>[]).map(shape);
  const tags = (db.prepare("SELECT DISTINCT json_each.value AS t FROM customers, json_each(customers.tags) ORDER BY t").all() as { t: string }[]).map((r) => r.t);
  return { rows, total, page, pages, tags };
}

/** All customers matching the filters, with stats (CSV export). */
export const customersWithStats = (f: CustomerFilters = {}) => listCustomers(f, false).rows;
