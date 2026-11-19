import "server-only";
import { getDb, must, type Row } from "./db";

const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (cur: number, prev: number) => (prev === 0 ? (cur === 0 ? 0 : null) : r2(((cur - prev) / prev) * 100));

export type Point = { label: string; tip: string; value: number; delta: number | null };
export type SeriesSet = Record<"day" | "week" | "month" | "year", Point[]>;

/** Orders that count as sales: not drafts, cancelled or returned. */
export const isSale = (o: Row) => !o.is_test && !["draft", "cancelled", "returned"].includes(o.status);

export type Data = {
  orders: Row[];
  items: Row[];
  customers: Row[];
  products: Row[];
  inventory: Row[];
};

/** Load the last ~13 months of data (enough for every dashboard widget). */
export async function loadData(months = 13): Promise<Data> {
  const db = getDb();
  const since = new Date(Date.now() - months * 31 * DAY).toISOString();
  // test orders (placed by an admin in preview mode) never count in statistics
  const orders = (must(await db.from("orders").select("*").gte("created_at", since).order("created_at", { ascending: false })) as Row[]).filter((o) => !o.is_test);
  const ids = orders.map((o) => o.id);
  const [items, customers, products, inventory] = await Promise.all([
    ids.length ? db.from("order_items").select("*").in("order_id", ids).then((r: any) => must(r) as Row[]) : Promise.resolve([] as Row[]),
    db.from("customers").select("*").then((r: any) => must(r) as Row[]),
    db.from("products").select("*").then((r: any) => must(r) as Row[]),
    db.from("inventory_items").select("*").then((r: any) => must(r) as Row[]),
  ]);
  return { orders, items, customers, products, inventory };
}

const sum = (os: Row[], k = "total") => r2(os.reduce((n, o) => n + Number(o[k]), 0));
const between = (os: Row[], a: number, b: number) => os.filter((o) => { const t = +new Date(o.created_at); return t >= a && t < b; });

function bucketSeries(sales: Row[], buckets: { start: number; end: number; label: string; tip: string }[]): Point[] {
  const vals = buckets.map((b) => sum(between(sales, b.start, b.end)));
  return buckets.map((b, i) => ({ label: b.label, tip: b.tip, value: vals[i], delta: i === 0 ? null : pct(vals[i], vals[i - 1]) }));
}

export function buildSeries(orders: Row[], now = new Date()): SeriesSet {
  const sales = orders.filter(isSale);
  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-GB", o);
  const hourStart = new Date(now); hourStart.setMinutes(0, 0, 0);
  const sod = new Date(now); sod.setHours(0, 0, 0, 0);

  const day = Array.from({ length: 24 }, (_, i) => {
    const start = +hourStart - (23 - i) * 3_600_000;
    const d = new Date(start);
    return { start, end: start + 3_600_000, label: String(d.getHours()).padStart(2, "0"), tip: `${fmt(d, { day: "numeric", month: "short" })}, ${String(d.getHours()).padStart(2, "0")}:00` };
  });
  const dayBuckets = (n: number) =>
    Array.from({ length: n }, (_, i) => {
      const start = +sod - (n - 1 - i) * DAY;
      const d = new Date(start);
      return { start, end: start + DAY, label: fmt(d, n <= 7 ? { weekday: "short" } : { day: "numeric" }), tip: `${fmt(d, { weekday: "short", day: "numeric", month: "long", year: "numeric" })}` };
    });
  const year = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    const e = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return { start: +d, end: +e, label: fmt(d, { month: "short" }), tip: fmt(d, { month: "long", year: "numeric" }) };
  });
  return { day: bucketSeries(sales, day), week: bucketSeries(sales, dayBuckets(7)), month: bucketSeries(sales, dayBuckets(30)), year: bucketSeries(sales, year) };
}

export type Dashboard = Awaited<ReturnType<typeof dashboard>>;

export async function dashboard() {
  const d = await loadData();
  const now = Date.now();
  const sod = new Date(); sod.setHours(0, 0, 0, 0);
  const sales = d.orders.filter(isSale);
  const T = +sod;

  const todays = between(sales, T, T + DAY);
  const yest = between(sales, T - DAY, T);
  const cur = between(sales, now - 30 * DAY, now + 1);
  const prev = between(sales, now - 60 * DAY, now - 30 * DAY);
  const rev = sum(cur), prevRev = sum(prev);
  const aov = cur.length ? r2(rev / cur.length) : 0, prevAov = prev.length ? r2(prevRev / prev.length) : 0;

  // new vs returning customers in the period: "new" = customer's first-ever order falls in the period
  const firstOrder = new Map<string, number>();
  for (const o of [...d.orders.filter((x) => x.status !== "draft")].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)))
    if (!firstOrder.has(o.customer_id)) firstOrder.set(o.customer_id, +new Date(o.created_at));
  const split = (os: Row[], a: number, b: number) => {
    const cs = [...new Set(os.map((o) => o.customer_id))];
    const isNew = cs.filter((c) => { const f = firstOrder.get(c)!; return f >= a && f < b; }).length;
    return { new: isNew, returning: cs.length - isNew };
  };
  const nr = split(cur, now - 30 * DAY, now + 1);
  const nrPrev = split(prev, now - 60 * DAY, now - 30 * DAY);

  const codPending = d.orders.filter((o) => ["out_for_delivery", "delivered"].includes(o.status) && !o.cod_collected);
  const prevCod = 0;

  const byProduct = new Map<string, { name: string; revenue: number; qty: number }>();
  const curIds = new Set(cur.map((o) => o.id));
  for (const it of d.items.filter((i) => curIds.has(i.order_id))) {
    const e = byProduct.get(it.name) ?? { name: it.name, revenue: 0, qty: 0 };
    e.revenue += Number(it.unit_price) * it.qty;
    e.qty += it.qty;
    byProduct.set(it.name, e);
  }
  const status: Record<string, number> = {};
  for (const o of d.orders.filter((x) => +new Date(x.created_at) > now - 30 * DAY)) status[o.status] = (status[o.status] ?? 0) + 1;
  const regions = new Map<string, { region: string; revenue: number; orders: number }>();
  for (const o of cur) {
    const e = regions.get(o.region || "Unknown") ?? { region: o.region || "Unknown", revenue: 0, orders: 0 };
    e.revenue += Number(o.total);
    e.orders++;
    regions.set(e.region, e);
  }
  const custName = (id: string) => d.customers.find((c) => c.id === id)?.name ?? "Customer";
  const low = d.inventory
    .filter((i) => i.on_hand <= i.low_stock_threshold)
    .map((i): Row => ({ ...i, name: d.products.find((p) => p.id === i.product_id)?.name ?? "Product" }));

  return {
    series: buildSeries(d.orders),
    today: { revenue: sum(todays), orders: todays.length, delta: pct(sum(todays), sum(yest)) },
    kpi: {
      revenue: { value: rev, delta: pct(rev, prevRev) },
      orders: { value: cur.length, delta: pct(cur.length, prev.length) },
      aov: { value: aov, delta: pct(aov, prevAov) },
      cod: { value: sum(codPending, "cod_amount_due"), count: codPending.length, delta: prevCod ? null : null },
      customers: { ...nr, delta: pct(nr.new + nr.returning, nrPrev.new + nrPrev.returning) },
    },
    flavors: [...byProduct.values()].sort((a, b) => b.revenue - a.revenue),
    status,
    recent: d.orders.filter((o) => o.status !== "draft").slice(0, 6).map((o) => ({ id: o.id, number: o.order_number, total: Number(o.total), status: o.status, customer: custName(o.customer_id), created_at: o.created_at })),
    low,
    regions: [...regions.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    empty: d.orders.length === 0,
    stockEmpty: d.inventory.length > 0 && d.inventory.every((i) => i.on_hand === 0),
  };
}
