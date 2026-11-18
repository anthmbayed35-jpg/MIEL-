import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requirePerm } from "@/lib/auth";
import { getDb, must, type Row } from "@/lib/db";
import { isSale } from "@/lib/stats";
import { waLink } from "@/lib/phone";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { Card, DataTable, Money, Num, PageHeader, PayBadge, SectionTitle, StatusBadge } from "@/components/admin/ui";
import { saveCustomer, toggleBlock } from "../actions";

export const metadata = { title: "Customer" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePerm("customers.read");
  const { id } = await params;
  const db = getDb();
  const c = must(await db.from("customers").select("*").eq("id", id).maybeSingle()) as Row | null;
  if (!c) notFound();
  const orders = (must(await db.from("orders").select("*").eq("customer_id", id).order("created_at", { ascending: false })) as Row[]).filter((o) => o.status !== "draft");
  const sales = orders.filter(isSale);
  const spent = sales.reduce((n, o) => n + Number(o.total), 0);
  const canWrite = can(admin.role, "customers.write");

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/admin/customers" className="underline-offset-4 hover:underline">← All customers</Link> as unknown as string}
        title={c.name}
        actions={<a href={waLink(c.phone, `Hi ${c.name.split(" ")[0]}, it's MIEL+.`)} target="_blank" rel="noopener noreferrer" className="pill-btn pill-glass">Message on WhatsApp</a>}
      >
        <p className="mt-3 flex flex-wrap items-center gap-2"><span className="mono !text-body">{c.phone}</span>{c.blocked && <span className="status st-returned">Blocked</span>}</p>
      </PageHeader>

      <div className="grid gap-5 sm:grid-cols-3">
        <Card><p className="text-[16px] text-fg">Total spent</p><div className="mt-5"><Money value={spent} /></div></Card>
        <Card><p className="text-[16px] text-fg">Orders</p><div className="mt-5"><Num value={orders.length} /></div></Card>
        <Card><p className="text-[16px] text-fg">Average order</p><div className="mt-5"><Money value={sales.length ? spent / sales.length : 0} /></div></Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <SectionTitle>Order history</SectionTitle>
          <DataTable
            rows={orders}
            href={(o) => `/admin/orders/${o.id}`}
            cols={[
              { key: "n", label: "Order", primary: true, render: (o) => <span className="mono !text-[14px] !text-fg">#{o.order_number}</span> },
              { key: "d", label: "Date", render: (o) => new Date(o.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) },
              { key: "t", label: "Total", render: (o) => <Money value={Number(o.total)} className="text-[18px]" /> },
              { key: "p", label: "Payment", render: (o) => (["cancelled"].includes(o.status) ? "—" : <PayBadge collected={o.cod_collected} />) },
              { key: "s", label: "Status", render: (o) => <StatusBadge status={o.status} /> },
            ]}
          />
        </Card>
        <div className="space-y-5">
          {canWrite && (
            <Card>
              <SectionTitle>Details</SectionTitle>
              <ActionForm action={saveCustomer} className="space-y-3">
                <input type="hidden" name="id" value={c.id} />
                <label className="block"><span className="a-label">Name</span><input name="name" defaultValue={c.name} className="a-input" /></label>
                <label className="block"><span className="a-label">Tags (comma separated)</span><input name="tags" defaultValue={(c.tags as string[]).join(", ")} placeholder="VIP, runner, gym" className="a-input" /></label>
                <label className="block"><span className="a-label">Private notes</span><textarea name="notes" rows={4} defaultValue={c.notes} className="a-input" /></label>
                <SubmitButton variant="lime">Save</SubmitButton>
              </ActionForm>
            </Card>
          )}
          {can(admin.role, "customers.block") && (
            <Card>
              <SectionTitle>Block list</SectionTitle>
              <p className="mb-3 text-[14px] text-body">Blocked customers can&apos;t place orders on the store (e.g. repeated refused deliveries).</p>
              <ActionForm action={toggleBlock}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="blocked" value={c.blocked ? "0" : "1"} />
                <SubmitButton variant={c.blocked ? "glass" : "danger"} confirm={c.blocked ? undefined : `Block ${c.name} from ordering?`}>{c.blocked ? "Unblock customer" : "Block customer"}</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
