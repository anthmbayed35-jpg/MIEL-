import Link from "next/link";
import { DEFAULT_COMMISSION_PERCENT } from "@/config/affiliates";
import { TIER_RULES } from "@/config/affiliates";
import { requirePerm } from "@/lib/auth";
import { listAffiliates, overview } from "@/lib/affiliates";
import { AFFILIATE_TABS, SubNav } from "@/components/admin/SubNav";
import { Card, DataTable, Empty, Money, Num, PageHeader, PillLink, SectionTitle } from "@/components/admin/ui";

export const metadata = { title: "Affiliates" };
export const dynamic = "force-dynamic";

const usd = (cents: number) => cents / 100;
const statusClass = (s: string) => (s === "active" ? "st-delivered" : s === "paused" ? "st-packed" : "st-cancelled");

export default async function AffiliatesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const admin = await requirePerm("affiliates.read");
  const sp = await searchParams;
  // the private partner link is a credential: it never goes into the list (not even as hidden data for the browser)
  const rows = listAffiliates({ q: sp.q, status: sp.status }).map((r) => {
    const c: Record<string, unknown> = { ...r };
    for (const k of ["private_token", "notes", "email", "phone"]) delete c[k];
    return c as unknown as Omit<(typeof r), "private_token" | "notes" | "email" | "phone">;
  });
  const o = overview();
  const month = new Date().toISOString().slice(0, 7);

  return (
    <>
      <PageHeader eyebrow="Influencer codes" title="Affiliates" actions={<PillLink href="/admin/affiliates/new" variant="lime">New affiliate</PillLink>} />
      <SubNav items={AFFILIATE_TABS} role={admin.role} />

      {o.applications > 0 && (
        <Link href="/admin/affiliates/applications" className="admin-card mb-5 flex min-h-12 items-center justify-between gap-3 !py-3 text-[17px] text-fg">
          <span>{o.applications} new application{o.applications === 1 ? "" : "s"} waiting</span>
          <span className="accent">Review →</span>
        </Link>
      )}

      <section aria-label="Overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
        <Card><p className="a-label">Affiliate sales</p><Money value={usd(o.sales_cents)} className="text-[30px] leading-none" /><p className="mt-2 text-[14px] text-body">{o.orders} order{o.orders === 1 ? "" : "s"}, after discount</p></Card>
        <Card><p className="a-label">Commission owed</p><Money value={usd(o.owed_cents)} className="text-[30px] leading-none" /><p className="mt-2 text-[14px] text-body">pending + approved</p></Card>
        <Card><p className="a-label">Ready to pay</p><Money value={usd(o.payable_cents)} className="text-[30px] leading-none" /><p className="mt-2 text-[14px] text-body">approved, unpaid</p></Card>
        {o.corrections_cents > 0 && <Card><p className="a-label">Corrections owed back</p><Money value={usd(o.corrections_cents)} className="text-[30px] leading-none" /><p className="mt-2 text-[14px] text-body">returned after being paid</p></Card>}
        <Card><p className="a-label">Active affiliates</p><Num value={o.active} className="text-[30px] leading-none" /><p className="mt-2 text-[14px] text-body">{usd(o.paid_cents) ? `$${usd(o.paid_cents).toFixed(2)} paid out so far` : "nothing paid out yet"}</p></Card>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Card>
          <SectionTitle>Top affiliates</SectionTitle>
          {o.top.length === 0 ? (
            <p className="text-[16px] text-body">No affiliate orders yet.</p>
          ) : (
            <ol className="space-y-1">
              {o.top.map((t, i) => (
                <li key={t.id}>
                  <Link href={`/admin/affiliates/${t.id}`} className="flex min-h-12 items-center justify-between gap-3 rounded-xl px-2 text-[16px] hover:bg-white/5">
                    <span><span className="mono !text-body mr-3">{i + 1}</span><span className="text-fg">{t.name}</span> <span className="mono !text-[13px]">{t.code}</span></span>
                    <span className="text-fg">${usd(t.sales_cents).toFixed(2)} <span className="text-[14px] text-body">· {t.orders} orders</span></span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card>
          <SectionTitle>Monthly export</SectionTitle>
          <form action="/admin/affiliates/export" className="flex flex-col gap-3" role="search">
            <label className="block"><span className="a-label">Month</span><input type="month" name="month" defaultValue={month} required className="a-input" aria-label="Month" /></label>
            <button className="pill-btn pill-glass">Download CSV</button>
          </form>
          <p className="mt-3 text-[14px] text-body">Orders and commissions for the month, by order date.</p>
        </Card>
      </div>

      <Card className="mt-5">
        <form className="mb-5 grid gap-3 md:grid-cols-[2fr_1fr_auto]" role="search">
          <input name="q" defaultValue={sp.q} placeholder="Search name, code or Instagram" className="a-input" aria-label="Search affiliates" />
          <select name="status" defaultValue={sp.status ?? ""} className="a-input" aria-label="Status">
            <option value="">All statuses</option><option value="active">Active</option><option value="paused">Paused</option><option value="ended">Ended</option>
          </select>
          <div className="flex gap-2"><button className="pill-btn pill-light">Apply</button><Link href="/admin/affiliates" className="pill-btn pill-glass">Reset</Link></div>
        </form>
        <DataTable
          rows={rows}
          href={(a) => `/admin/affiliates/${a.id}`}
          empty={<Empty title="No affiliates yet." hint={`Create one, or approve an application. New affiliates start on ${TIER_RULES.seed.label} at ${DEFAULT_COMMISSION_PERCENT}% commission.`} action={<PillLink href="/admin/affiliates/new" variant="lime">New affiliate</PillLink>} />}
          cols={[
            { key: "name", label: "Affiliate", primary: true, render: (a) => <span>{a.name}{a.instagram_handle && <span className="block text-[14px] text-body">@{a.instagram_handle}</span>}</span> },
            { key: "code", label: "Code", render: (a) => <span className="mono !text-[15px] !text-fg">{a.code}</span> },
            { key: "tier", label: "Tier", render: (a) => TIER_RULES[a.tier].label },
            { key: "orders", label: "Orders", render: (a) => a.orders },
            { key: "sales", label: "Sales", render: (a) => <Money value={usd(a.sales_cents)} className="text-[18px]" /> },
            { key: "pend", label: "Pending", render: (a) => <Money value={usd(a.pending_cents)} className="text-[17px]" /> },
            { key: "appr", label: "Approved", render: (a) => <Money value={usd(a.approved_cents)} className="text-[17px]" /> },
            { key: "paid", label: "Paid", render: (a) => <Money value={usd(a.paid_cents)} className="text-[17px]" /> },
            { key: "status", label: "Status", render: (a) => <span className={`status ${statusClass(a.status)}`}>{a.status}</span> },
          ]}
        />
      </Card>
    </>
  );
}
