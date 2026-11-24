import Link from "next/link";
import { requireAmbassador } from "@/lib/ambassador/auth";
import { salesFor } from "@/lib/ambassador/portal";
import { Card, PageTitle, Pill, day, usd } from "@/components/ambassador/ui";

export const metadata = { title: "Sales" };

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ month?: string; status?: string; page?: string }> }) {
  const me = await requireAmbassador();
  const q = await searchParams;
  const s = salesFor(me.id, { month: q.month, status: q.status, page: Number(q.page) || 1 });
  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const m = { month: q.month, status: q.status, page: undefined, ...over };
    for (const [k, v] of Object.entries(m)) if (v) p.set(k, v);
    const str = p.toString();
    return `/ambassador/sales${str ? `?${str}` : ""}`;
  };
  const chip = (on: boolean) => `mono flex min-h-12 items-center rounded-full border px-4 ${on ? "border-acid bg-acid !text-black" : "glass-flat border-white/15"}`;
  return (
    <>
      <PageTitle kicker="ORDERS" title="Your sales." />
      <form action="/ambassador/sales" className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="m" className="mono mb-2 block">MONTH</label>
          <select id="m" name="month" defaultValue={q.month ?? ""} className="min-h-14 rounded-[14px] border border-white/15 bg-white/5 px-4 text-[18px] text-fg">
            <option value="">All</option>
            {s.months.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="st" className="mono mb-2 block">COMMISSION</label>
          <select id="st" name="status" defaultValue={q.status ?? ""} className="min-h-14 rounded-[14px] border border-white/15 bg-white/5 px-4 text-[18px] text-fg">
            <option value="">All</option>
            {["pending", "approved", "paid", "void"].map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <button className="btn !w-auto px-6">FILTER</button>
      </form>

      {s.rows.length === 0 ? (
        <Card><p className="body-lg">No orders here yet. Share your link to get the first one.</p></Card>
      ) : (
        <ul className="space-y-3">
          {s.rows.map((r) => (
            <li key={r.order_number} className="glass-flat rounded-[20px] p-4 md:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="mono">#{r.order_number} · {day(r.created_at).toUpperCase()}</p>
                  <p className="mt-1 text-[18px] text-fg">{r.first_name || "Customer"} · {r.products}</p>
                  <p className="mt-1 text-[15px] text-muted">via {r.via === "link" ? "your link" : "your code"} · order {r.order_status.replace(/_/g, " ")}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="display accent text-[24px] leading-none">{usd(r.commission_cents)}</p>
                  {r.commission_status && <div className="mt-2"><Pill value={r.commission_status} /></div>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {s.pages > 1 && (
        <div className="mt-6 flex items-center justify-between gap-3">
          {s.page > 1 ? <Link href={href({ page: String(s.page - 1) })} className={chip(false)}>← NEWER</Link> : <span />}
          <span className="mono">{s.page} / {s.pages}</span>
          {s.page < s.pages ? <Link href={href({ page: String(s.page + 1) })} className={chip(false)}>OLDER →</Link> : <span />}
        </div>
      )}
    </>
  );
}
