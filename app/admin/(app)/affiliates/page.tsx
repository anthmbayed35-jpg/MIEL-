import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { newApplicationCount, overview, topThisMonth } from "@/lib/affiliates";
import { SubNav } from "@/components/admin/SubNav";
import { affiliateTabs } from "@/lib/admin-tabs";
import { needsAction } from "@/lib/ambassador/admin";
import { Card, Money, Num, PageHeader, PillLink, SectionTitle } from "@/components/admin/ui";

export const metadata = { title: "Ambassadors" };
export const dynamic = "force-dynamic";

const usd = (cents: number) => cents / 100;

/** Affiliates, Overview: the money at a glance and this month's best performers. */
export default async function AffiliatesOverviewPage() {
  const admin = await requirePerm("affiliates.read");
  const o = overview();
  const apps = newApplicationCount();
  const needs = needsAction();
  const top = topThisMonth(5);
  const month = new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Beirut", month: "long", year: "numeric" });
  const pending = o.owed_cents - o.payable_cents; // owed = pending + approved

  return (
    <>
      <PageHeader eyebrow="Ambassador program" title="Ambassadors" actions={<PillLink href="/admin/affiliates/new" variant="lime">Add ambassador</PillLink>} />
      <SubNav items={affiliateTabs(apps)} role={admin.role} />

      <Card className="mb-5">
        <SectionTitle>Needs action</SectionTitle>
        {needs.total === 0 ? (
          <p className="text-[16px] text-body">Nothing waiting. All caught up.</p>
        ) : (
          <ul className="space-y-1">
            {([
              [needs.applications, "new application", "/admin/affiliates/applications"],
              [needs.payoutRequests, "payout request", "/admin/affiliates/payouts"],
              [needs.proofs, "mission proof to review", "/admin/affiliates/missions"],
              [needs.kits, "kit or pouch to send", "/admin/affiliates/kits"],
            ] as const).filter(([n]) => n > 0).map(([n, label, href]) => (
              <li key={href}>
                <Link href={href} className="flex min-h-12 items-center justify-between gap-3 rounded-xl px-2 text-[17px] text-fg hover:bg-white/5">
                  <span>{n} {label}{n === 1 ? "" : "s"}</span>
                  <span className="accent">Open →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section aria-label="Overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
        <Card><p className="a-label">Affiliate sales</p><Money value={usd(o.sales_cents)} className="text-[30px] leading-none" /><p className="mt-2 text-[14px] text-body">{o.orders} order{o.orders === 1 ? "" : "s"}, after discount</p></Card>
        <Card><p className="a-label">Commission pending</p><Money value={usd(pending)} className="text-[30px] leading-none" /><p className="mt-2 text-[14px] text-body">until 14 days after delivery</p></Card>
        <Card><p className="a-label">Commission approved</p><Money value={usd(o.payable_cents)} className="text-[30px] leading-none" /><p className="mt-2 text-[14px] text-body">ready to pay</p></Card>
        <Card><p className="a-label">Commission paid</p><Money value={usd(o.paid_cents)} className="text-[30px] leading-none" /><p className="mt-2 text-[14px] text-body">paid out so far</p></Card>
        {o.corrections_cents > 0 && (
          <Card><p className="a-label">Corrections owed back</p><Money value={usd(o.corrections_cents)} className="text-[30px] leading-none" /><p className="mt-2 text-[14px] text-body">returned after being paid</p></Card>
        )}
        <Card><p className="a-label">Active affiliates</p><Num value={o.active} className="text-[30px] leading-none" /><p className="mt-2 text-[14px] text-body">with a working code</p></Card>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Card>
          <SectionTitle>Top 5 this month ({month})</SectionTitle>
          {top.length === 0 ? (
            <p className="text-[16px] text-body">No affiliate orders yet this month.</p>
          ) : (
            <ol className="space-y-1">
              {top.map((t, i) => (
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
            <label className="block"><span className="a-label">Month</span><input type="month" name="month" defaultValue={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" }).slice(0, 7)} required className="a-input" aria-label="Month" /></label>
            <button className="pill-btn pill-glass">Orders and commissions CSV</button>
          </form>
          <p className="mt-3 text-[14px] text-body">Every affiliate order of the month, by order date (Beirut time). Payouts have their own export.</p>
        </Card>
      </div>
    </>
  );
}
