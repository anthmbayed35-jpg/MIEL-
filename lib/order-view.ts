import "server-only";
import { getEngine } from "./db";

export type OrderView = {
  number: number;
  status: string;
  isTest: boolean;
  createdAt: string;
  name: string;
  address: string;
  notes: string;
  paymentMethod: string;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  items: { name: string; qty: number; unitPrice: number }[];
};

/**
 * The customer's own order, found ONLY by its private token (128 random bits). Nothing else is ever read: no other order, no customer
 * list, and no phone number is returned. Anything that is not a well-formed token finds nothing without touching the database.
 */
export function orderByToken(token: string): OrderView | null {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const sqlite = getEngine().sqlite;
  const o = sqlite
    .prepare(
      `SELECT o.id, o.order_number, o.status, o.is_test, o.created_at, o.address, o.customer_notes, o.payment_method,
              o.subtotal_cents, o.discount_total_cents, o.shipping_fee_cents, o.total_cents, c.name
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.public_token = ?`,
    )
    .get(token) as Record<string, string | number> | undefined;
  if (!o) return null;
  const items = sqlite.prepare("SELECT name, qty, unit_price_cents FROM order_items WHERE order_id = ?").all(o.id) as { name: string; qty: number; unit_price_cents: number }[];
  return {
    number: Number(o.order_number),
    status: String(o.status),
    isTest: !!o.is_test,
    createdAt: String(o.created_at),
    name: String(o.name ?? ""),
    address: String(o.address),
    notes: String(o.customer_notes).replace(/^\[TEST ORDER\]\s*/, ""),
    paymentMethod: String(o.payment_method),
    subtotal: Number(o.subtotal_cents) / 100,
    discount: Number(o.discount_total_cents) / 100,
    shipping: Number(o.shipping_fee_cents) / 100,
    total: Number(o.total_cents) / 100,
    items: items.map((i) => ({ name: i.name, qty: i.qty, unitPrice: i.unit_price_cents / 100 })),
  };
}
