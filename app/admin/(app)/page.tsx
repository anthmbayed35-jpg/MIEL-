import Link from "next/link";
import { requireAdmin, can } from "@/lib/auth";
import { dashboard } from "@/lib/stats";
import { Card, Delta, Empty, Flash, Money, Num, PillLink, SectionTitle, StatusBadge } from "@/components/admin/ui";
import { BarChart } from "@/components/admin/BarChart";
import { ORDER_STATUSES, STATUS_LABEL } from "@/lib/status";

export const metadata = { title: "Dashboard" };

function Kpi({ title, icon, children, foot }: { title: string; icon: string; children: React.ReactNode; foot: React.ReactNode }) {
  return (
    <Card className="flex min-h-[190px] flex-col justify-between">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[17px] text-fg">{title}</p>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-muted" aria-hidden>
          <path d={icon} />
        </svg>
      </div>
      <div>
        <div className="mt-6">{children}</div>
        <div className="mt-3">{foot}</div>
      </div>
    </Card>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const d = await dashboard();
  const first = admin.name.split(" ")[0];
  const maxFlavor = Math.max(1, ...d.flavors.map((f) => f.revenue));
  const totalStatus = Object.values(d.status).reduce((a, b) => a + b, 0) || 1;
  const maxRegion = Math.max(1, ...d.regions.map((r) => r.revenue));

  return (
    <>
      <div className="admin-band" aria-hidden />
      {sp.denied && <Flash error={`Your role doesn't have access to that area (${sp.denied}).`} />}

      <section className="relative grid gap-8 pb-10 pt-2 lg:grid-cols-[1fr_440px] lg:items-start">
        <div>
          <p className="mb-3 text-[16px] text-body">Track your sales, orders and stock</p>
          <h1 className="display text-[clamp(1.9rem,1.1rem+3.4vw,3.75rem)]">Welcome back, {first}</h1>
          <div className="mt-7 flex flex-wrap gap-3">
            <PillLink href="/admin/orders/new" variant="light">+ New order</PillLink>
            {can(admin.role, "products.write") && <PillLink href="/admin/products/new" variant="lime">+ Add product</PillLink>}
          </div>
        </div>

        {/* Hero glass card: stack of layered translucent cards */}
        <div className="relative mx-auto w-full max-w-[440px] pt-6 lg:pt-4" aria-label="Today's sales">
          <div className="absolute inset-x-8 top-0 h-24 rounded-[28px] border border-white/10 bg-white/5" aria-hidden />
          <div className="absolute inset-x-4 top-3 h-24 rounded-[28px] border border-white/10 bg-white/7" aria-hidden />
          <div className="admin-card relative !bg-white/12 text-center">
            <div className="flex items-center justify-between">
              <p className="mono !text-body">TODAY&apos;S SALES</p>
              <p className="mono !text-body">{new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
            </div>
            <div className="mt-4">
              <Money value={d.today.revenue} className="text-[clamp(2.4rem,2rem+1.6vw,3.25rem)] leading-none" />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="status st-new">{d.today.orders} {d.today.orders === 1 ? "order" : "orders"}</span>
              <Delta value={d.today.delta} caption="vs yesterday" />
            </div>
          </div>
        </div>
      </section>

      {d.empty && (
        <Card className="mb-6">
          <Empty
            title="No orders yet."
            hint="Orders from your store land here in real time. Want to see the dashboard filled in first? Load the demo data (you can wipe it with one click)."
            action={admin.role === "owner" ? <PillLink href="/admin/settings#demo" variant="lime">Load demo data</PillLink> : undefined}
          />
        </Card>
      )}
      {d.stockEmpty && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3" flat>
          <p className="text-[16px] text-fg">All products show 0 in stock, so checkout will say &ldquo;out of stock&rdquo;. Add your starting stock.</p>
          <PillLink href="/admin/inventory" variant="lime">Set stock</PillLink>
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <Card className="md:col-span-2 xl:row-span-2">
          <BarChart series={d.series} title="Sales overview" />
        </Card>
        <Kpi title="Revenue" icon="M12 3v18M16 7H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H8" foot={<Delta value={d.kpi.revenue.delta} caption="from last 30 days" />}>
          <Money value={d.kpi.revenue.value} />
        </Kpi>
        <Kpi title="Orders" icon="M6 2h12l2 5H4l2-5Zm-2 7h16v11H4V9Z" foot={<Delta value={d.kpi.orders.delta} caption="from last 30 days" />}>
          <Num value={d.kpi.orders.value} />
        </Kpi>
        <Kpi title="Average order value" icon="M4 20V10m6 10V4m6 16v-7" foot={<Delta value={d.kpi.aov.delta} caption="from last 30 days" />}>
          <Money value={d.kpi.aov.value} />
        </Kpi>
        <Kpi
          title="COD to collect"
          icon="M3 7h18v10H3V7Zm9 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
          foot={<span className="text-[13px] text-body">{d.kpi.cod.count} {d.kpi.cod.count === 1 ? "order" : "orders"} out or delivered, cash not collected</span>}
        >
          <Money value={d.kpi.cod.value} />
        </Kpi>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <SectionTitle>Customers (30 days)</SectionTitle>
          <div className="flex items-end gap-6">
            <div>
              <Num value={d.kpi.customers.new} className="text-[44px] leading-none" />
              <p className="mono mt-2 !text-body">NEW</p>
            </div>
            <div>
              <Num value={d.kpi.customers.returning} className="text-[44px] leading-none" />
              <p className="mono mt-2 !text-body">RETURNING</p>
            </div>
          </div>
          <div className="mt-4"><Delta value={d.kpi.customers.delta} caption="active customers" /></div>
        </Card>

        <Card>
          <SectionTitle>Sales by flavor</SectionTitle>
          {d.flavors.length === 0 ? <p className="text-[15px] text-body">No sales in the last 30 days.</p> : (
            <ul className="space-y-4">
              {d.flavors.map((f) => (
                <li key={f.name}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="display text-[15px]">{f.name}</span>
                    <Money value={f.revenue} className="text-[16px]" decimals={false} />
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-white/10">
                    <div className="h-2 rounded-full bg-acid" style={{ width: `${(f.revenue / maxFlavor) * 100}%` }} />
                  </div>
                  <p className="mt-1 text-[12px] text-muted">{f.qty} pouches</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionTitle>Orders by status</SectionTitle>
          <ul className="space-y-2.5">
            {ORDER_STATUSES.filter((s) => d.status[s]).map((s) => (
              <li key={s}>
                <Link href={`/admin/orders?status=${s}`} className="flex min-h-9 items-center justify-between gap-3">
                  <StatusBadge status={s} />
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="h-1.5 w-14 rounded-full bg-white/10"><span className="block h-1.5 rounded-full bg-fg/60" style={{ width: `${(d.status[s] / totalStatus) * 100}%` }} /></span>
                    <span className="split-num tnum w-8 text-right text-[16px]">{d.status[s]}</span>
                  </span>
                </Link>
              </li>
            ))}
            {Object.keys(d.status).length === 0 && <p className="text-[15px] text-body">No orders in the last 30 days.</p>}
          </ul>
        </Card>

        <Card>
          <SectionTitle>Top regions</SectionTitle>
          {d.regions.length === 0 ? <p className="text-[15px] text-body">No regional data yet.</p> : (
            <ul className="space-y-4">
              {d.regions.map((r) => (
                <li key={r.region}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[15px] text-fg">{r.region}</span>
                    <span className="text-[13px] text-body">{r.orders} orders</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-[#B8143E]" style={{ width: `${(r.revenue / maxRegion) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Card>
          <SectionTitle right={<Link href="/admin/orders" className="text-[14px] text-body underline-offset-4 hover:underline">View all</Link>}>Recent orders</SectionTitle>
          {d.recent.length === 0 ? <Empty title="Nothing yet." hint="New orders will appear here." /> : (
            <ul className="divide-y divide-white/8">
              {d.recent.map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/orders/${o.id}`} className="flex min-h-16 items-center justify-between gap-3 rounded-2xl px-1 py-2 hover:bg-white/5">
                    <span className="min-w-0">
                      <span className="mono !text-body block">#{o.number}</span>
                      <span className="block truncate text-[16px] font-medium text-fg">{o.customer}</span>
                    </span>
                    <span className="hidden sm:block"><StatusBadge status={o.status} /></span>
                    <Money value={o.total} className="text-[20px]" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <SectionTitle right={<Link href="/admin/inventory" className="text-[14px] text-body underline-offset-4 hover:underline">Inventory</Link>}>Low-stock alerts</SectionTitle>
          {d.low.length === 0 ? <p className="text-[15px] text-body">All good. Stock is above your thresholds.</p> : (
            <ul className="space-y-3">
              {d.low.map((i) => (
                <li key={i.id} className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-[#FF5C7A]/10 px-4">
                  <span className="display text-[15px]">{i.name}</span>
                  <span className="mono !text-[#ff8aa0]">{i.on_hand} LEFT</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
