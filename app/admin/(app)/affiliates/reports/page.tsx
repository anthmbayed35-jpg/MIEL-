import Link from "next/link";
import { requirePerm, can } from "@/lib/auth";
import { newApplicationCount } from "@/lib/affiliates";
import { reportMonths, salesByMonth, salesReport } from "@/lib/ambassador/admin";
import { SubNav } from "@/components/admin/SubNav";
import { affiliateTabs } from "@/lib/admin-tabs";
import { Card, DataTable, Empty, Money, PageHeader, SectionTitle } from "@/components/admin/ui";
import { localStamp } from "@/lib/time";

export const metadata = { title: "Ambassador reports" };
export const dynamic = "force-dynamic";

const usd = (c: number) => c / 100;

/** Sales by ambassador for a month, and the month-by-month totals. */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const admin = await requirePerm("affiliates.read");
  const sp = await searchParams;
  const months = reportMonths();
  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : months[0] ?? localStamp(new Date().toISOString()).slice(0, 7);
  const rows = salesReport(month);
  const byMonth = salesByMonth();
  return (
    <>
      <PageHeader eyebrow="Ambassador program" title="Reports" />
      <SubNav items={affiliateTabs(newApplicationCount())} role={admin.role} />
      <Card className="mb-5">
        <SectionTitle>Sales by ambassador</SectionTitle>
        <form className="mb-4 flex flex-wrap items-end gap-3" role="search">
          <label className="block"><span className="a-label">Month</span><input type="month" name="month" defaultValue={month} className="a-input" aria-label="Month" /></label>
          <button className="pill-btn pill-glass">Show</button>
          {can(admin.role, "exports.run") && <a className="pill-btn pill-glass" href={`/admin/affiliates/reports/export?month=${month}`}>Download CSV</a>}
        </form>
        <DataTable
          rows={rows}
          href={(r) => `/admin/affiliates/${r.id}`}
          empty={<Empty title="No ambassador orders in this month." />}
          cols={[
            { key: "n", label: "Ambassador", primary: true, render: (r) => <span>{r.name} <span className="mono !text-[13px]">{r.code}</span></span> },
            { key: "o", label: "Orders", render: (r) => r.orders },
            { key: "s", label: "Sales", render: (r) => <Money value={usd(r.sales_cents)} className="text-[17px]" /> },
            { key: "d", label: "Discounts", render: (r) => <Money value={usd(r.discount_cents)} className="text-[17px]" /> },
            { key: "c", label: "Commission", render: (r) => <Money value={usd(r.commission_cents)} className="text-[17px]" /> },
            { key: "p", label: "Paid", render: (r) => <Money value={usd(r.paid_cents)} className="text-[17px]" /> },
            { key: "v", label: "Link visits", render: (r) => r.clicks },
          ]}
        />
      </Card>
      <Card>
        <SectionTitle>By month</SectionTitle>
        <DataTable
          rows={byMonth}
          empty={<Empty title="No ambassador sales yet." />}
          cols={[
            { key: "m", label: "Month", primary: true, render: (r) => <Link href={`/admin/affiliates/reports?month=${r.month}`} className="underline underline-offset-4">{r.month}</Link> },
            { key: "o", label: "Orders", render: (r) => r.orders },
            { key: "s", label: "Sales", render: (r) => <Money value={usd(r.sales_cents)} className="text-[17px]" /> },
            { key: "c", label: "Commission", render: (r) => <Money value={usd(r.commission_cents)} className="text-[17px]" /> },
          ]}
        />
      </Card>
    </>
  );
}
