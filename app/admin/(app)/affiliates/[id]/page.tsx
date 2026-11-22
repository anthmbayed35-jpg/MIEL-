import Link from "next/link";
import { notFound } from "next/navigation";
import { DEFAULT_COMMISSION_PERCENT, DEFAULT_CUSTOMER_DISCOUNT_PERCENT, TIER_RULES } from "@/config/affiliates";
import { requirePerm } from "@/lib/auth";
import { affiliateOrders, affiliatePayouts, affiliateStats, suggestedTier } from "@/lib/affiliates";
import { absoluteUrl } from "@/lib/site-url";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { AffiliateForm } from "@/components/admin/AffiliateForm";
import { CopyField } from "@/components/admin/CopyField";
import { AFFILIATE_TABS, SubNav } from "@/components/admin/SubNav";
import { Card, DataTable, Empty, Field, Flash, Money, PageHeader, SectionTitle, StatusBadge } from "@/components/admin/ui";
import { recordPayoutAction, upgradeTierAction } from "../actions";

export const metadata = { title: "Affiliate" };
export const dynamic = "force-dynamic";

const usd = (c: number) => c / 100;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const commClass: Record<string, string> = { pending: "st-packed", approved: "st-confirmed", paid: "st-delivered", void: "st-cancelled" };

export default async function AffiliatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const admin = await requirePerm("affiliates.read");
  const { id } = await params;
  const sp = await searchParams;
  const a = affiliateStats(id);
  if (!a) notFound();
  const orders = affiliateOrders(id);
  const payouts = affiliatePayouts(id);
  const suggest = suggestedTier(a.delivered, a.tier);
  const link = absoluteUrl(`/partner/${a.private_token}`);

  return (
    <>
      <PageHeader eyebrow={`${TIER_RULES[a.tier].label} · ${a.commission_rate_x100 / 100}% commission · ${a.customer_discount_percent_x100 / 100}% off for followers`} title={a.name}
        actions={<span className={`status ${a.status === "active" ? "st-delivered" : a.status === "paused" ? "st-packed" : "st-cancelled"}`}>{a.status}</span>}>
        <p className="mt-2 text-[17px] text-body"><span className="mono !text-[16px] !text-fg">{a.code}</span>{a.instagram_handle && <> · @{a.instagram_handle}</>}</p>
      </PageHeader>
      <SubNav items={AFFILIATE_TABS} role={admin.role} />
      {sp.created && <Flash msg="Affiliate created. Share the code, and the private stats link below." />}

      {suggest && (
        <div className="admin-card mb-5 border-acid/50" role="status">
          <p className="text-[17px] text-fg">{a.name} has {a.delivered} delivered orders: eligible for <span className="accent">{TIER_RULES[suggest].label}</span> ({TIER_RULES[suggest].commissionPercent}% commission).</p>
          <ActionForm action={upgradeTierAction} className="mt-3">
            <input type="hidden" name="id" value={a.id} /><input type="hidden" name="to" value={suggest} />
            <SubmitButton variant="lime" confirm={`Upgrade ${a.name} to ${TIER_RULES[suggest].label}? Their commission becomes ${TIER_RULES[suggest].commissionPercent}% on orders placed from now on.`}>Upgrade to {TIER_RULES[suggest].label}</SubmitButton>
          </ActionForm>
        </div>
      )}

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-5">
        <Card><p className="a-label">Orders</p><p className="display text-[30px] leading-none">{a.orders}</p><p className="mt-2 text-[14px] text-body">{a.delivered} delivered</p></Card>
        <Card><p className="a-label">Sales</p><Money value={usd(a.sales_cents)} className="text-[30px] leading-none" decimals={false} /></Card>
        <Card><p className="a-label">Pending</p><Money value={usd(a.pending_cents)} className="text-[30px] leading-none" /></Card>
        <Card><p className="a-label">Owed now</p><Money value={usd(a.approved_cents)} className="text-[30px] leading-none" /><p className="mt-2 text-[14px] text-body">approved, unpaid</p></Card>
        <Card className="col-span-2 lg:col-span-1"><p className="a-label">Paid</p><Money value={usd(a.paid_cents)} className="text-[30px] leading-none" /></Card>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle>Record payout</SectionTitle>
          {/* one form element for both states, so the success message survives the re-render that empties it */}
          <ActionForm action={recordPayoutAction} className="space-y-4">
            <input type="hidden" name="id" value={a.id} />
            {a.approved_cents > 0 ? (
              <>
                <p className="text-[17px] text-fg">Pays every approved commission: <Money value={usd(a.approved_cents)} className="text-[24px]" />. Those orders are marked paid.</p>
                <Field label="Method"><input name="method" maxLength={80} defaultValue={a.payout_method} placeholder="Whish money, cash, bank" className="a-input" /></Field>
                <Field label="Note"><input name="note" maxLength={300} placeholder="e.g. March payout" className="a-input" /></Field>
                <SubmitButton variant="lime" confirm={`Record a payout of $${usd(a.approved_cents).toFixed(2)} to ${a.name}? It marks those commissions as paid.`}>Record payout of ${usd(a.approved_cents).toFixed(2)}</SubmitButton>
              </>
            ) : (
              <p className="text-[16px] text-body">Nothing to pay yet. A commission is approved 14 days after its order is delivered{a.pending_cents > 0 ? `, and $${usd(a.pending_cents).toFixed(2)} is waiting for that` : ""}.</p>
            )}
          </ActionForm>
        </Card>
        <Card>
          <SectionTitle>Private stats page</SectionTitle>
          <CopyField label="Link for the affiliate (read only)" value={link} note="Anyone with this link sees their code, orders and commission, nothing else. Don't post it publicly." />
        </Card>
      </div>

      <Card className="mt-5">
        <SectionTitle>Orders</SectionTitle>
        <DataTable
          rows={orders}
          href={(o) => `/admin/orders/${o.id}`}
          empty={<Empty title="No orders with this code yet." hint={`Followers get ${a.customer_discount_percent_x100 / 100}% off with ${a.code} at checkout.`} />}
          cols={[
            { key: "n", label: "Order", primary: true, render: (o) => <span className="mono !text-[15px] !text-fg">#{o.order_number}</span> },
            { key: "date", label: "Date", render: (o) => day(o.created_at) },
            { key: "cust", label: "Customer", render: (o) => o.customer_name ?? "—" },
            { key: "st", label: "Status", render: (o) => <StatusBadge status={o.status} /> },
            { key: "sale", label: "Sale", render: (o) => <Money value={usd(o.subtotal_cents - o.discount_amount_cents)} className="text-[17px]" /> },
            { key: "com", label: "Commission", render: (o) => <Money value={usd(o.commission_amount_cents)} className="text-[17px]" /> },
            { key: "cs", label: "Commission status", render: (o) => (o.commission_status ? <span className={`status ${commClass[o.commission_status]}`}>{o.commission_status}</span> : "—") },
          ]}
        />
      </Card>

      <Card className="mt-5">
        <SectionTitle>Payout history</SectionTitle>
        <DataTable
          rows={payouts}
          empty={<Empty title="No payouts yet." />}
          cols={[
            { key: "d", label: "Date", primary: true, render: (p) => day(p.paid_at) },
            { key: "a", label: "Amount", render: (p) => <Money value={usd(p.amount_cents)} className="text-[18px]" /> },
            { key: "m", label: "Method", render: (p) => p.method || "—" },
            { key: "n", label: "Note", render: (p) => p.note || "—" },
          ]}
        />
      </Card>

      <Card className="mt-5">
        <SectionTitle>Edit affiliate</SectionTitle>
        <AffiliateForm a={a} defaults={{ commission: DEFAULT_COMMISSION_PERCENT, discount: DEFAULT_CUSTOMER_DISCOUNT_PERCENT }} />
        <p className="mt-4 text-[14px] text-body">Changing the code or rates only affects orders placed afterwards. <Link href="/admin/affiliates" className="underline underline-offset-4">Back to all affiliates</Link></p>
      </Card>
    </>
  );
}
