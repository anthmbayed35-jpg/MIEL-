import "server-only";
import { getDb, must, type Row } from "./db";

export type OrderFilters = { q?: string; status?: string; pay?: string; region?: string; from?: string; to?: string; page?: number };
export const PAGE_SIZE = 25;

/** Filtered order list with customer attached. paginate=false returns everything (CSV export / bulk print). */
export async function listOrders(f: OrderFilters, paginate = true) {
  const db = getDb();
  let q = db.from("orders").select("*", { count: "exact" }).order("created_at", { ascending: false });
  q = f.status ? q.eq("status", f.status) : q.neq("status", "draft");
  if (f.pay === "collected") q = q.eq("cod_collected", true);
  if (f.pay === "pending") q = q.eq("cod_collected", false);
  if (f.region) q = q.eq("region", f.region);
  if (f.from) q = q.gte("created_at", new Date(f.from).toISOString());
  if (f.to) q = q.lte("created_at", new Date(new Date(f.to).getTime() + 86_399_000).toISOString());
  if (f.q?.trim()) {
    const term = f.q.trim().replace(/[%,()]/g, "");
    if (/^#?\d{3,6}$/.test(term)) q = q.eq("order_number", Number(term.replace("#", ""))); // order number
    else {
      const custs = must(await db.from("customers").select("id").or(`name.ilike.%${term}%,phone.ilike.%${term.replace(/[\s-]/g, "")}%`)) as Row[];
      const ids = custs.map((c) => c.id);
      q = ids.length ? q.in("customer_id", ids) : q.eq("id", "none");
    }
  }
  const page = Math.max(1, f.page ?? 1);
  if (paginate) q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const res = await q;
  let orders = must(res) as Row[];
  if (f.pay === "pending") orders = orders.filter((o) => !["cancelled", "returned", "draft"].includes(o.status));
  const cids = [...new Set(orders.map((o) => o.customer_id).filter(Boolean))];
  const customers = cids.length ? (must(await db.from("customers").select("*").in("id", cids)) as Row[]) : [];
  return {
    orders: orders.map((o): Row & { customer?: Row } => ({ ...o, customer: customers.find((c) => c.id === o.customer_id) })),
    total: res.count ?? orders.length,
    page,
  };
}

export async function orderDetail(id: string) {
  const db = getDb();
  const order = must(await db.from("orders").select("*").eq("id", id).maybeSingle()) as Row | null;
  if (!order) return null;
  const items = must(await db.from("order_items").select("*").eq("order_id", id)) as Row[];
  const events = must(await db.from("order_events").select("*").eq("order_id", id).order("created_at", { ascending: true })) as Row[];
  const customer = (order.customer_id ? must(await db.from("customers").select("*").eq("id", order.customer_id).maybeSingle()) : null) as Row | null;
  const partner = (order.delivery_partner_id ? must(await db.from("delivery_partners").select("*").eq("id", order.delivery_partner_id).maybeSingle()) : null) as Row | null;
  const partners = must(await db.from("delivery_partners").select("*").eq("active", true)) as Row[];
  const orderCount = customer ? (must(await db.from("orders").select("id", { count: "exact" }).eq("customer_id", customer.id).neq("status", "draft")) as Row[]).length : 0;
  return { order, items, events, customer, partner, partners, orderCount };
}

export const mapUrl = (address: string, region: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address}, ${region}, Lebanon`)}`;

export const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
