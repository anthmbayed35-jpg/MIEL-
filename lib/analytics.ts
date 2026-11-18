import "server-only";
import { getDb, must, type Row } from "./db";
import { buildSeries, isSale, loadData } from "./stats";

const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Everything on the Analytics page (last 30 days unless stated). Also feeds the CSV exports. */
export async function analytics() {
  const d = await loadData();
  const now = Date.now();
  const sales = d.orders.filter(isSale);
  const cur = sales.filter((o) => +new Date(o.created_at) > now - 30 * DAY);
  const curIds = new Set(cur.map((o) => o.id));

  const prod = new Map<string, { product: string; qty: number; revenue: number }>();
  for (const it of d.items.filter((i) => curIds.has(i.order_id))) {
    const e = prod.get(it.name) ?? { product: it.name, qty: 0, revenue: 0 };
    e.qty += it.qty;
    e.revenue += Number(it.unit_price) * it.qty;
    prod.set(it.name, e);
  }
  const reg = new Map<string, { region: string; orders: number; revenue: number }>();
  for (const o of cur) {
    const k = o.region || "Unknown";
    const e = reg.get(k) ?? { region: k, orders: 0, revenue: 0 };
    e.orders++;
    e.revenue += Number(o.total);
    reg.set(k, e);
  }
  const first = new Map<string, number>();
  for (const o of [...d.orders.filter((x) => x.status !== "draft")].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)))
    if (!first.has(o.customer_id)) first.set(o.customer_id, +new Date(o.created_at));
  const nvr = (a: number, b: number) => {
    const os = sales.filter((o) => +new Date(o.created_at) >= a && +new Date(o.created_at) < b);
    const newOrders = os.filter((o) => { const f = first.get(o.customer_id)!; return f >= a && f < b; });
    return { newOrders: newOrders.length, returningOrders: os.length - newOrders.length, newRevenue: r2(newOrders.reduce((n, o) => n + Number(o.total), 0)), returningRevenue: r2(os.filter((o) => !newOrders.includes(o)).reduce((n, o) => n + Number(o.total), 0)) };
  };
  const disc = new Map<string, { code: string; orders: number; discount: number; revenue: number }>();
  for (const o of cur.filter((x) => x.discount_code)) {
    const e = disc.get(o.discount_code) ?? { code: o.discount_code, orders: 0, discount: 0, revenue: 0 };
    e.orders++;
    e.discount += Number(o.discount_total);
    e.revenue += Number(o.total);
    disc.set(o.discount_code, e);
  }

  // Funnel from first-party events (unique sessions)
  const since = new Date(now - 30 * DAY).toISOString();
  const ev = must(await getDb().from("events").select("*").gte("created_at", since)) as Row[];
  const uniq = (t: string) => new Set(ev.filter((e) => e.type === t).map((e) => e.session_id)).size;
  const funnel = [
    { step: "Visits", count: uniq("visit") },
    { step: "Added to cart", count: uniq("add_to_cart") },
    { step: "Started checkout", count: uniq("begin_checkout") },
    { step: "Orders", count: cur.length },
  ];

  return {
    series: buildSeries(d.orders),
    products: [...prod.values()].map((p) => ({ ...p, revenue: r2(p.revenue) })).sort((a, b) => b.revenue - a.revenue),
    regions: [...reg.values()].map((r) => ({ ...r, revenue: r2(r.revenue) })).sort((a, b) => b.revenue - a.revenue),
    nvr: { current: nvr(now - 30 * DAY, now + 1), previous: nvr(now - 60 * DAY, now - 30 * DAY) },
    discounts: [...disc.values()].map((x) => ({ ...x, discount: r2(x.discount), revenue: r2(x.revenue) })).sort((a, b) => b.orders - a.orders),
    funnel,
    hasEvents: ev.length > 0,
  };
}
