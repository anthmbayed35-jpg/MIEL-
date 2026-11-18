import { requirePerm } from "@/lib/auth";
import { analytics } from "@/lib/analytics";
import { BarChart } from "@/components/admin/BarChart";
import { Card, DataTable, Empty, Money, Num, PageHeader, PillLink, SectionTitle } from "@/components/admin/ui";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  await requirePerm("analytics.read");
  const a = await analytics();
  const totalRev = a.products.reduce((n, p) => n + p.revenue, 0) || 1;
  const top = a.funnel[0].count || 1;
  const cur = a.nvr.current;
  const exp = (kind: string) => `/admin/analytics/export?kind=${kind}`;

  return (
    <>
      <PageHeader eyebrow="Last 30 days unless stated" title="Analytics" actions={<PillLink href={exp("sales")} variant="glass">Export daily sales CSV</PillLink>} />

      <Card>
        <BarChart series={a.series} title="Sales over time" fileName="sales" />
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle right={<a href={exp("products")} className="text-[14px] text-body underline-offset-4 hover:underline">CSV</a>}>Sales by product</SectionTitle>
          <DataTable
            rows={a.products.map((p) => ({ id: p.product, ...p }))}
            empty={<Empty title="No sales yet." />}
            cols={[
              { key: "p", label: "Product", primary: true, render: (p) => <span className="display text-[15px]">{p.product}</span> },
              { key: "q", label: "Pouches", render: (p) => p.qty },
              { key: "r", label: "Revenue", render: (p) => <Money value={p.revenue} className="text-[17px]" /> },
              { key: "s", label: "Share", render: (p) => <span className="mono !text-[13px] !text-fg">{((p.revenue / totalRev) * 100).toFixed(0)}%</span> },
            ]}
          />
        </Card>

        <Card>
          <SectionTitle right={<a href={exp("regions")} className="text-[14px] text-body underline-offset-4 hover:underline">CSV</a>}>Sales by region</SectionTitle>
          <DataTable
            rows={a.regions.map((r) => ({ id: r.region, ...r }))}
            empty={<Empty title="No regional data yet." />}
            cols={[
              { key: "r", label: "Region", primary: true, render: (r) => <span className="text-fg">{r.region}</span> },
              { key: "o", label: "Orders", render: (r) => r.orders },
              { key: "v", label: "Revenue", render: (r) => <Money value={r.revenue} className="text-[17px]" /> },
            ]}
          />
        </Card>

        <Card>
          <SectionTitle>New vs returning customers</SectionTitle>
          <div className="grid grid-cols-2 gap-5">
            <div><p className="mono !text-body">NEW CUSTOMERS</p><Num value={cur.newOrders} className="mt-2 block text-[40px] leading-none" /><p className="mt-2 text-[14px] text-body"><Money value={cur.newRevenue} className="text-[16px]" decimals={false} /> revenue</p></div>
            <div><p className="mono !text-body">RETURNING</p><Num value={cur.returningOrders} className="mt-2 block text-[40px] leading-none" /><p className="mt-2 text-[14px] text-body"><Money value={cur.returningRevenue} className="text-[16px]" decimals={false} /> revenue</p></div>
          </div>
          <p className="mt-4 text-[13px] text-muted">Previous 30 days: {a.nvr.previous.newOrders} new orders, {a.nvr.previous.returningOrders} returning.</p>
        </Card>

        <Card>
          <SectionTitle right={<a href={exp("discounts")} className="text-[14px] text-body underline-offset-4 hover:underline">CSV</a>}>Discount usage</SectionTitle>
          <DataTable
            rows={a.discounts.map((d) => ({ id: d.code, ...d }))}
            empty={<Empty title="No discount codes used." />}
            cols={[
              { key: "c", label: "Code", primary: true, render: (d) => <span className="mono !text-[14px] !text-fg">{d.code}</span> },
              { key: "o", label: "Orders", render: (d) => d.orders },
              { key: "g", label: "Given", render: (d) => <Money value={d.discount} className="text-[17px]" /> },
              { key: "r", label: "Revenue", render: (d) => <Money value={d.revenue} className="text-[17px]" decimals={false} /> },
            ]}
          />
        </Card>

        <Card className="lg:col-span-2">
          <SectionTitle right={<a href={exp("funnel")} className="text-[14px] text-body underline-offset-4 hover:underline">CSV</a>}>Funnel (unique sessions)</SectionTitle>
          {!a.hasEvents ? <p className="text-[15px] text-body">No tracking data yet. Visits, add-to-carts and checkouts are recorded automatically once people use the store.</p> : (
            <ul className="space-y-4">
              {a.funnel.map((f, i) => (
                <li key={f.step}>
                  <div className="flex items-baseline justify-between"><span className="text-[16px] text-fg">{f.step}</span><span className="text-[14px] text-body"><span className="split-num tnum text-[20px] text-fg">{f.count}</span>{i > 0 && a.funnel[i - 1].count ? ` · ${((f.count / a.funnel[i - 1].count) * 100).toFixed(0)}% of previous` : ""}</span></div>
                  <div className="mt-2 h-3 rounded-full bg-white/10"><div className="h-3 rounded-full bg-acid" style={{ width: `${Math.min(100, (f.count / top) * 100)}%`, opacity: 1 - i * 0.18 }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
