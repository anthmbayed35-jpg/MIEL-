import Link from "next/link";
import { can, requirePerm } from "@/lib/auth";
import { getDb, must, type Row } from "@/lib/db";
import { listOrders, PAGE_SIZE } from "@/lib/queries";
import { ORDER_STATUSES, STATUS_LABEL } from "@/lib/status";
import { Card, ErrorState, PageHeader, PillLink } from "@/components/admin/ui";
import { OrdersTable } from "@/components/admin/OrdersTable";

export const metadata = { title: "Orders" };

type SP = { q?: string; status?: string; pay?: string; region?: string; from?: string; to?: string; page?: string };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const admin = await requirePerm("orders.read");
  const sp = await searchParams;
  let data;
  try {
    data = await listOrders({ ...sp, page: Number(sp.page) || 1 });
  } catch (e) {
    return <ErrorState message={(e as Error).message} />;
  }
  const zones = must(await getDb().from("shipping_zones").select("name").order("sort", { ascending: true })) as Row[];
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const qs = (over: Record<string, string | number>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...over }).filter(([, v]) => v !== undefined && v !== "") as [string, string][]);
    return `/admin/orders?${p}`;
  };
  const exportQs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]).toString();

  return (
    <>
      <PageHeader
        eyebrow="Every order, newest first"
        title="Orders"
        actions={
          <>
            {can(admin.role, "exports.run") && <PillLink href={`/admin/orders/export?${exportQs}`} variant="glass">Export CSV</PillLink>}
            <PillLink href="/admin/orders?status=draft" variant="glass">Drafts</PillLink>
            <PillLink href="/admin/orders/new" variant="lime">+ New order</PillLink>
          </>
        }
      />
      <Card>
        <form className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-6" role="search">
          <input name="q" defaultValue={sp.q} placeholder="Search #order, name, phone" className="a-input xl:col-span-2" aria-label="Search orders" />
          <select name="status" defaultValue={sp.status ?? ""} className="a-input" aria-label="Status">
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <select name="pay" defaultValue={sp.pay ?? ""} className="a-input" aria-label="Payment">
            <option value="">Any payment</option>
            <option value="pending">COD pending</option>
            <option value="collected">COD collected</option>
          </select>
          <select name="region" defaultValue={sp.region ?? ""} className="a-input" aria-label="Region">
            <option value="">All regions</option>
            {zones.map((z) => <option key={z.name} value={z.name}>{z.name}</option>)}
          </select>
          <div className="flex gap-2">
            <input type="date" name="from" defaultValue={sp.from} className="a-input" aria-label="From date" />
            <input type="date" name="to" defaultValue={sp.to} className="a-input" aria-label="To date" />
          </div>
          <div className="flex gap-2 md:col-span-2 xl:col-span-6">
            <button className="pill-btn pill-light">Apply filters</button>
            <Link href="/admin/orders" className="pill-btn pill-glass">Reset</Link>
            <span className="ml-auto self-center text-[14px] text-body">{data.total} order{data.total === 1 ? "" : "s"}</span>
          </div>
        </form>

        <OrdersTable
          rows={data.orders.map((o: Row) => ({
            id: o.id, number: o.order_number, date: o.created_at, customer: o.customer?.name ?? "—", phone: o.customer?.phone ?? "",
            region: o.region, total: Number(o.total), status: o.status, collected: !!o.cod_collected, source: o.source, test: !!o.is_test,
          }))}
        />

        {pages > 1 && (
          <nav className="mt-6 flex items-center justify-between" aria-label="Pagination">
            {data.page > 1 ? <Link href={qs({ page: data.page - 1 })} className="pill-btn pill-glass">← Newer</Link> : <span />}
            <span className="mono !text-body">PAGE {data.page} / {pages}</span>
            {data.page < pages ? <Link href={qs({ page: data.page + 1 })} className="pill-btn pill-glass">Older →</Link> : <span />}
          </nav>
        )}
      </Card>
    </>
  );
}
