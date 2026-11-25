import "server-only";
import { getDb, getEngine, must, type Row } from "./db";
import { parseOrderRef } from "./order-ref";
import { normalizeLebanesePhone } from "./phone";

export type OrderFilters = { q?: string; status?: string; pay?: string; region?: string; governorate?: string; district?: string; affiliate?: string; from?: string; to?: string; page?: number };
export const PAGE_SIZE = 25;

/** Filtered order list with customer attached. paginate=false returns everything (CSV export / bulk print). */
export async function listOrders(f: OrderFilters, paginate = true) {
  const db = getDb();
  let q = db.from("orders").select("*", { count: "exact" }).order("created_at", { ascending: false });
  q = f.status ? q.eq("status", f.status) : q.neq("status", "draft");
  if (f.pay === "collected") q = q.eq("cod_collected", true);
  if (f.pay === "pending") {
    // "COD still to collect" excludes cancelled / returned / draft orders IN THE QUERY (it used to filter after paging, so pages
    // could come back short and the count was wrong)
    q = q.eq("cod_collected", false);
    q = f.status && ["cancelled", "returned", "refused", "draft"].includes(f.status) ? q.eq("id", "none") : q.neq("status", "cancelled").neq("status", "returned").neq("status", "refused");
  }
  if (f.region) q = q.eq("region", f.region);
  // location filters take a location id from the menu. New orders match by id; older orders (placed before the location ids existed) by the name they were saved with.
  for (const [id, idCol, nameCol] of [[f.governorate, "governorate_id", "governorate"], [f.district, "district_id", "district"]] as const) {
    if (!id) continue;
    const loc = getEngine().sqlite.prepare("SELECT name_en FROM locations WHERE id = ?").get(id) as { name_en: string } | undefined;
    q = loc ? q.or(`${idCol}.eq.${id},${nameCol}.eq.${loc.name_en.replace(/[%,()]/g, "")}`) : q.eq("id", "none");
  }
  if (f.affiliate) q = q.eq("affiliate_id", f.affiliate); // an id from the menu; anything else simply matches nothing
  if (f.from) q = q.gte("created_at", new Date(f.from).toISOString());
  if (f.to) q = q.lte("created_at", new Date(new Date(f.to).getTime() + 86_399_000).toISOString());
  if (f.q?.trim()) {
    const term = f.q.trim().replace(/[%,()]/g, "");
    const asNumber = parseOrderRef(term); // 1001, #1001 or MP-1001
    // digits are an order number only when such an order exists (a phone fragment like 424242 must still find the customer)
    const numberHit = asNumber !== null && term.replace(/\D/g, "").length >= 3 && !!getEngine().sqlite.prepare("SELECT 1 FROM orders WHERE order_number = ?").get(asNumber);
    if (numberHit) q = q.eq("order_number", asNumber as number);
    else {
      const norm = normalizeLebanesePhone(term); // "03 424 242" finds +9613424242
      const custs = must(await db.from("customers").select("id").or(`name.ilike.%${term}%,phone.ilike.%${term.replace(/[\s-]/g, "")}%${norm ? `,phone.eq.${norm}` : ""}`)) as Row[];
      const ids = custs.map((c) => c.id);
      q = ids.length ? q.in("customer_id", ids) : q.eq("id", "none");
    }
  }
  const page = Math.max(1, f.page ?? 1);
  if (paginate) q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const res = await q;
  const orders = must(res) as Row[];
  const cids = [...new Set(orders.map((o) => o.customer_id).filter(Boolean))];
  const customers = cids.length ? (must(await db.from("customers").select("*").in("id", cids)) as Row[]) : [];
  const aids = [...new Set(orders.map((o) => o.affiliate_id).filter(Boolean))];
  const affiliates = aids.length ? (must(await db.from("affiliates").select("id, name, code").in("id", aids)) as Row[]) : [];
  return {
    orders: orders.map((o): Row & { customer?: Row; affiliate?: Row } => ({ ...o, customer: customers.find((c) => c.id === o.customer_id), affiliate: affiliates.find((a) => a.id === o.affiliate_id) })),
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

/** Google Maps search for the full address text (no API key needed). `region` is only added for older orders whose address line does not carry the place. */
export const mapUrl = (address: string, region: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([address, region, "Lebanon"].filter(Boolean).join(", "))}`;

/**
 * One CSV cell, quoted. Text that a spreadsheet would run as a formula (starts with = + - @ or a tab / carriage return) gets a
 * leading apostrophe, so a customer named =HYPERLINK(...) can never execute when the team opens the export (CSV injection).
 * Real numbers and plain phone-style values (digits, spaces, + - . ( )) are left alone: they cannot execute anything.
 */
export const csvCell = (v: unknown) => {
  let s = String(v ?? "");
  if (typeof v !== "number" && /^[=+\-@\t\r]/.test(s) && !/^[+-]?[0-9][0-9\s().,-]*$/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};

/** How many orders are in each status (drafts excluded from "all"), for the chips on the Orders page. TEST orders are not counted. */
export function orderStatusCounts(): Record<string, number> {
  const rows = getEngine().sqlite.prepare("SELECT status, COUNT(*) AS n FROM orders WHERE is_test = 0 GROUP BY status").all() as { status: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

/** New orders nobody has looked at yet (status "new"): the badge on the Orders menu item. */
export const newOrderCount = (): number => (getEngine().sqlite.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'new' AND is_test = 0").get() as { n: number }).n;
