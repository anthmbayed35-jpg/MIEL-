import Link from "next/link";
import { DEFAULT_COMMISSION_PERCENT, TIER_RULES } from "@/config/affiliates";
import { requirePerm } from "@/lib/auth";
import { listAffiliates, newApplicationCount } from "@/lib/affiliates";
import { SubNav } from "@/components/admin/SubNav";
import { affiliateTabs } from "@/lib/admin-tabs";
import { Card, DataTable, Empty, Money, PageHeader, PillLink } from "@/components/admin/ui";

export const metadata = { title: "Affiliates" };
export const dynamic = "force-dynamic";

const usd = (cents: number) => cents / 100;
const statusClass = (s: string) => (s === "active" ? "st-delivered" : s === "paused" ? "st-packed" : "st-cancelled");

/** Affiliates, the list: search, status filter, every row opens the affiliate. */
export default async function AffiliatesListPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const admin = await requirePerm("affiliates.read");
  const sp = await searchParams;
  // the private partner link is a credential: it never goes into the list (not even as hidden data for the browser)
  const rows = listAffiliates({ q: sp.q, status: sp.status }).map((r) => {
    const c: Record<string, unknown> = { ...r };
    for (const k of ["private_token", "notes", "email", "phone"]) delete c[k];
    return c as unknown as Omit<typeof r, "private_token" | "notes" | "email" | "phone">;
  });

  return (
    <>
      <PageHeader eyebrow="Influencer codes" title="Affiliates" actions={<PillLink href="/admin/affiliates/new" variant="lime">Add affiliate</PillLink>} />
      <SubNav items={affiliateTabs(newApplicationCount())} role={admin.role} />
      <Card>
        <form className="mb-5 grid gap-3 md:grid-cols-[2fr_1fr_auto]" role="search">
          <input name="q" defaultValue={sp.q} placeholder="Search name, code or Instagram" className="a-input" aria-label="Search affiliates" />
          <select name="status" defaultValue={sp.status ?? ""} className="a-input" aria-label="Status">
            <option value="">All statuses</option><option value="active">Active</option><option value="paused">Paused</option><option value="ended">Ended</option>
          </select>
          <div className="flex gap-2"><button className="pill-btn pill-light">Apply</button><Link href="/admin/affiliates/list" className="pill-btn pill-glass">Reset</Link></div>
        </form>
        <DataTable
          rows={rows}
          href={(a) => `/admin/affiliates/${a.id}`}
          empty={<Empty title={sp.q || sp.status ? "No affiliates match." : "No affiliates yet."} hint={`Add one, or approve an application. New affiliates start on ${TIER_RULES.seed.label} at ${DEFAULT_COMMISSION_PERCENT}% commission.`} action={<PillLink href="/admin/affiliates/new" variant="lime">Add affiliate</PillLink>} />}
          cols={[
            { key: "name", label: "Affiliate", primary: true, render: (a) => a.name },
            { key: "ig", label: "Instagram", render: (a) => (a.instagram_handle ? `@${a.instagram_handle}` : "—") },
            { key: "code", label: "Code", render: (a) => <span className="mono !text-[15px] !text-fg">{a.code}</span> },
            { key: "tier", label: "Tier", render: (a) => TIER_RULES[a.tier].label },
            { key: "orders", label: "Orders", render: (a) => a.orders },
            { key: "sales", label: "Sales", render: (a) => <Money value={usd(a.sales_cents)} className="text-[18px]" /> },
            { key: "owed", label: "Commission owed", render: (a) => <Money value={usd(a.pending_cents + a.approved_cents)} className="text-[17px]" /> },
            { key: "status", label: "Status", render: (a) => <span className={`status ${statusClass(a.status)}`}>{a.status}</span> },
          ]}
        />
      </Card>
    </>
  );
}
