import "server-only";
import { getDb, must, type Row } from "./db";
import { isSale } from "./stats";

export type CustomerRow = Row & { orders: number; spent: number; last: string | null };

/** Customers with order count and total spent (cancelled / returned / draft orders don't count as spend). */
export async function customersWithStats(): Promise<CustomerRow[]> {
  const db = getDb();
  const customers = must(await db.from("customers").select("*")) as Row[];
  const orders = must(await db.from("orders").select("customer_id, total, status, created_at")) as Row[];
  return customers.map((c) => {
    const mine = orders.filter((o) => o.customer_id === c.id && o.status !== "draft");
    const sales = mine.filter(isSale);
    const last = mine.map((o) => o.created_at as string).sort().pop() ?? null;
    return { ...c, orders: mine.length, spent: Math.round(sales.reduce((n, o) => n + Number(o.total), 0) * 100) / 100, last };
  });
}
