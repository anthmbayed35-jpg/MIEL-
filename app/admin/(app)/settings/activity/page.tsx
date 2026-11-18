import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { getDb, must, type Row } from "@/lib/db";
import { Card, DataTable, Empty, PageHeader } from "@/components/admin/ui";
import { SETTINGS_TABS, SubNav } from "@/components/admin/SubNav";

export const metadata = { title: "Activity log" };
const SIZE = 50;

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const admin = await requirePerm("audit.read");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  let q = getDb().from("audit_log").select("*", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * SIZE, page * SIZE - 1);
  const term = (sp.q ?? "").trim().replace(/[%,()]/g, "");
  if (term) q = q.or(`actor_email.ilike.%${term}%,action.ilike.%${term}%,entity.ilike.%${term}%`);
  const res = await q;
  const rows = must(res) as Row[];
  const pages = Math.max(1, Math.ceil((res.count ?? rows.length) / SIZE));

  return (
    <>
      <PageHeader eyebrow="Who changed what, and when" title="Activity log" />
      <SubNav items={SETTINGS_TABS} role={admin.role} />
      <Card>
        <form className="mb-5 flex gap-2" role="search">
          <input name="q" defaultValue={sp.q} placeholder="Filter by person, action or area" className="a-input" aria-label="Filter activity" />
          <button className="pill-btn pill-light">Filter</button>
        </form>
        <DataTable
          rows={rows}
          empty={<Empty title="No activity yet." hint="Important changes (orders, prices, stock, settings, team) are recorded here." />}
          cols={[
            { key: "when", label: "When", primary: true, render: (r) => new Date(r.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }) },
            { key: "who", label: "Who", render: (r) => <span className="text-[14px]">{r.actor_email}</span> },
            { key: "what", label: "Action", render: (r) => <span className="mono !text-[13px] !text-fg">{r.action}</span> },
            { key: "ent", label: "Area", render: (r) => <span className="text-[14px]">{r.entity}</span> },
            { key: "det", label: "Details", render: (r) => <span className="mono !text-[11px] !text-body break-all">{Object.keys(r.details ?? {}).length ? JSON.stringify(r.details).slice(0, 140) : "—"}</span> },
          ]}
        />
        {pages > 1 && (
          <nav className="mt-6 flex items-center justify-between" aria-label="Pagination">
            {page > 1 ? <Link href={`/admin/settings/activity?page=${page - 1}${term ? `&q=${term}` : ""}`} className="pill-btn pill-glass">← Newer</Link> : <span />}
            <span className="mono !text-body">PAGE {page} / {pages}</span>
            {page < pages ? <Link href={`/admin/settings/activity?page=${page + 1}${term ? `&q=${term}` : ""}`} className="pill-btn pill-glass">Older →</Link> : <span />}
          </nav>
        )}
      </Card>
    </>
  );
}
