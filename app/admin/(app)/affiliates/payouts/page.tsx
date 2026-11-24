import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { listPayouts, newApplicationCount } from "@/lib/affiliates";
import { SubNav } from "@/components/admin/SubNav";
import { affiliateTabs } from "@/lib/admin-tabs";
import { Card, DataTable, Empty, Money, PageHeader, SectionTitle } from "@/components/admin/ui";
import { can } from "@/lib/auth";
import { localStamp } from "@/lib/time";

export const metadata = { title: "Affiliate payouts" };
export const dynamic = "force-dynamic";

const usd = (cents: number) => cents / 100;
const LIMIT = 300;

/** Affiliates, Payouts: every payout ever recorded, newest first, and the monthly CSV. Payouts are recorded on the affiliate's page. */
export default async function PayoutsPage() {
  const admin = await requirePerm("affiliates.read");
  const rows = listPayouts({ limit: LIMIT });
  const total = rows.reduce((n, r) => n + r.amount_cents, 0);
  const month = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" }).slice(0, 7);

  return (
    <>
      <PageHeader eyebrow="Money paid to influencers" title="Payouts" />
      <SubNav items={affiliateTabs(newApplicationCount())} role={admin.role} />

      <div className="mb-5 grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Card>
          <p className="a-label">Paid out (shown below)</p>
          <Money value={usd(total)} className="text-[30px] leading-none" />
          <p className="mt-2 text-[14px] text-body">{rows.length} payout{rows.length === 1 ? "" : "s"}{rows.length === LIMIT ? ` (the latest ${LIMIT})` : ""}. To pay someone, open their page and use Record payout.</p>
        </Card>
        {can(admin.role, "exports.run") && (
          <Card>
            <SectionTitle>Export by month</SectionTitle>
            <form action="/admin/affiliates/payouts/export" className="flex flex-col gap-3" role="search">
              <label className="block"><span className="a-label">Month</span><input type="month" name="month" defaultValue={month} required className="a-input" aria-label="Month" /></label>
              <button className="pill-btn pill-glass">Download payouts CSV</button>
            </form>
          </Card>
        )}
      </div>

      <Card>
        <DataTable
          rows={rows}
          href={(p) => `/admin/affiliates/${p.affiliate_id}`}
          empty={<Empty title="No payouts yet." hint="A payout is recorded from an affiliate's page once some of their commission is approved." />}
          cols={[
            { key: "date", label: "Date", primary: true, render: (p) => localStamp(p.paid_at) },
            { key: "who", label: "Affiliate", render: (p) => <span>{p.name} <span className="mono !text-[13px]">{p.code}</span></span> },
            { key: "amount", label: "Amount", render: (p) => <Money value={usd(p.amount_cents)} className="text-[18px]" /> },
            { key: "adj", label: "Of which corrections", render: (p) => (p.corrections_cents ? <span className="text-[#FF8AA0]">−${usd(p.corrections_cents).toFixed(2)}</span> : "—") },
            { key: "method", label: "Method", render: (p) => p.method || "—" },
            { key: "note", label: "Note", render: (p) => p.note || "—" },
          ]}
        />
        <p className="mt-4 text-[14px] text-body"><Link href="/admin/affiliates/list" className="underline underline-offset-4">Back to all affiliates</Link></p>
      </Card>
    </>
  );
}
