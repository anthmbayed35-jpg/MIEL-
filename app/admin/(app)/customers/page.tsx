import Link from "next/link";
import { can, requirePerm } from "@/lib/auth";
import { listCustomers } from "@/lib/customers";
import { Pager } from "@/components/admin/Pager";
import { Card, DataTable, Empty, Money, PageHeader, PillLink } from "@/components/admin/ui";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string; blocked?: string; sort?: string; page?: string }> }) {
  const admin = await requirePerm("customers.read");
  const sp = await searchParams;
  const { rows: list, total, page, pages, tags } = listCustomers({ q: sp.q, tag: sp.tag, blocked: sp.blocked, sort: sp.sort, page: Number(sp.page) || 1 });
  const exportQs = new URLSearchParams(Object.entries({ q: sp.q, tag: sp.tag, blocked: sp.blocked, sort: sp.sort }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader eyebrow="Everyone who ordered" title="Customers" actions={can(admin.role, "exports.run") ? <PillLink href={`/admin/customers/export?${exportQs}`} variant="glass">Export CSV</PillLink> : undefined} />
      <Card>
        <form className="mb-6 grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto]" role="search">
          <input name="q" defaultValue={sp.q} placeholder="Search name or phone" className="a-input" aria-label="Search customers" />
          <select name="tag" defaultValue={sp.tag ?? ""} className="a-input" aria-label="Tag"><option value="">All tags</option>{tags.map((t) => <option key={t}>{t}</option>)}</select>
          <select name="blocked" defaultValue={sp.blocked ?? ""} className="a-input" aria-label="Blocked"><option value="">Everyone</option><option value="1">Blocked only</option></select>
          <select name="sort" defaultValue={sp.sort ?? ""} className="a-input" aria-label="Sort"><option value="">Top spenders</option><option value="recent">Most recent</option></select>
          <div className="flex gap-2"><button className="pill-btn pill-light">Apply</button><Link href="/admin/customers" className="pill-btn pill-glass">Reset</Link></div>
        </form>
        <DataTable
          rows={list}
          href={(c) => `/admin/customers/${c.id}`}
          empty={<Empty title="No customers match." hint="Customers are created automatically when someone orders." />}
          cols={[
            { key: "name", label: "Customer", primary: true, render: (c) => <span>{c.name}{c.blocked && <span className="status st-returned ml-2">Blocked</span>}</span> },
            { key: "phone", label: "Phone", render: (c) => <span className="mono !text-body !text-[13px]">{c.phone}</span> },
            { key: "orders", label: "Orders", render: (c) => c.orders },
            { key: "spent", label: "Total spent", render: (c) => <Money value={c.spent} className="text-[18px]" /> },
            { key: "last", label: "Last order", render: (c) => (c.last ? new Date(c.last).toLocaleDateString("en-GB", { timeZone: "Asia/Beirut", day: "numeric", month: "short", year: "numeric" }) : "—") },
            { key: "tags", label: "Tags", render: (c) => <span className="flex flex-wrap gap-1">{(c.tags as string[]).map((t) => <span key={t} className="status st-draft">{t}</span>)}</span> },
          ]}
        />
        <Pager basePath="/admin/customers" params={{ q: sp.q, tag: sp.tag, blocked: sp.blocked, sort: sp.sort }} page={page} pages={pages} total={total} noun="customer" />
      </Card>
    </>
  );
}
