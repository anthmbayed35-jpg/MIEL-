import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { listPayouts, newApplicationCount } from "@/lib/affiliates";
import { SubNav } from "@/components/admin/SubNav";
import { affiliateTabs } from "@/lib/admin-tabs";
import { Card, DataTable, Empty, Money, PageHeader, SectionTitle } from "@/components/admin/ui";
import { can } from "@/lib/auth";
import { localStamp } from "@/lib/time";
import { listPayoutRequests } from "@/lib/ambassador/admin";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { rejectPayoutRequestAction } from "../program/actions";

export const metadata = { title: "Affiliate payouts" };
export const dynamic = "force-dynamic";

const usd = (cents: number) => cents / 100;
const LIMIT = 300;

/** Affiliates, Payouts: every payout ever recorded, newest first, and the monthly CSV. Payouts are recorded on the affiliate's page. */
export default async function PayoutsPage() {
  const admin = await requirePerm("affiliates.read");
  const rows = listPayouts({ limit: LIMIT });
  const requests = listPayoutRequests();
  const total = rows.reduce((n, r) => n + r.amount_cents, 0);
  const month = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" }).slice(0, 7);

  return (
    <>
      <PageHeader eyebrow="Money paid to influencers" title="Payouts" />
      <SubNav items={affiliateTabs(newApplicationCount())} role={admin.role} />

      <Card className="mb-5">
        <SectionTitle>Payout requests</SectionTitle>
        {requests.length === 0 ? (
          <p className="text-[16px] text-body">No requests. Ambassadors ask from their portal once their approved balance reaches the minimum.</p>
        ) : (
          <ul className="space-y-4">
            {requests.map((r) => (
              <li key={r.id} className="rounded-2xl bg-white/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link href={`/admin/affiliates/${r.affiliate_id}`} className="text-[18px] font-semibold text-fg underline underline-offset-4">{r.name}</Link> <span className="mono !text-[13px]">{r.code}</span>
                    <p className="mt-1 text-[15px] text-body">Asked for <span className="text-fg">${usd(r.amount_cents).toFixed(2)}</span> on {localStamp(r.created_at).slice(0, 10)} · {r.payout_method || "no method"}{r.payout_details ? `: ${r.payout_details}` : ""}</p>
                    {r.note && <p className="mt-1 text-[14px] text-body">Note: {r.note}</p>}
                  </div>
                  <span className={`status ${r.status === "requested" ? "st-packed" : r.status === "paid" ? "st-delivered" : "st-cancelled"}`}>{r.status}</span>
                </div>
                {r.status === "requested" && (
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                    <Link href={`/admin/affiliates/${r.affiliate_id}#payout`} className="pill-btn pill-lime">Pay on their page</Link>
                    <ActionForm action={rejectPayoutRequestAction} className="flex flex-1 flex-col gap-2 sm:flex-row">
                      <input type="hidden" name="id" value={r.id} />
                      <input name="note" required maxLength={300} placeholder="Reason, shown to them" className="a-input" aria-label="Reason" />
                      <SubmitButton variant="glass" confirm={`Decline ${r.name}'s request?`}>Decline</SubmitButton>
                    </ActionForm>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

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
