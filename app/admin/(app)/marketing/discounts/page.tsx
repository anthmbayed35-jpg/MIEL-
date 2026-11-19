import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { getDb, must, type Row } from "@/lib/db";
import { discountUsage, LIST_PAGE_SIZE } from "@/lib/lists";
import { Pager } from "@/components/admin/Pager";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { Card, DataTable, Empty, Field, Money, PageHeader, SectionTitle } from "@/components/admin/ui";
import { MARKETING_TABS, SubNav } from "@/components/admin/SubNav";
import { saveDiscount, toggleDiscount } from "../actions";

export const metadata = { title: "Discounts" };

const label = (d: Row) => (d.type === "percent" ? `${Number(d.value)}% off` : d.type === "fixed" ? `$${Number(d.value)} off` : "Free delivery");
const day = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");

function DiscountForm({ d, products }: { d?: Row; products: Row[] }) {
  return (
    <ActionForm action={saveDiscount} className="space-y-4">
      {d && <><input type="hidden" name="id" value={d.id} /><input type="hidden" name="version" value={d.version} /></>}
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Code"><input name="code" required defaultValue={d?.code} placeholder="WELCOME10" className="a-input uppercase" /></Field>
        <Field label="Type"><select name="type" defaultValue={d?.type ?? "percent"} className="a-input"><option value="percent">Percent off</option><option value="fixed">Amount off ($)</option><option value="free_delivery">Free delivery</option></select></Field>
        <Field label="Value" hint="% or $ (ignored for free delivery)"><input name="value" type="number" step="0.01" min="0" defaultValue={d?.value ?? 10} className="a-input" /></Field>
        <Field label="Minimum order ($)"><input name="min_order" type="number" step="0.01" min="0" defaultValue={d?.min_order ?? 0} className="a-input" /></Field>
        <Field label="Starts"><input name="starts_at" type="date" defaultValue={day(d?.starts_at)} className="a-input" /></Field>
        <Field label="Ends"><input name="ends_at" type="date" defaultValue={day(d?.ends_at)} className="a-input" /></Field>
        <Field label="Usage limit" hint="Empty = unlimited"><input name="usage_limit" type="number" min="1" defaultValue={d?.usage_limit ?? ""} className="a-input" /></Field>
        <label className="flex min-h-12 items-center gap-3 self-end text-[16px] text-fg"><input type="checkbox" name="active" defaultChecked={d ? d.active : true} className="h-6 w-6 accent-[#DAFC69]" /> Active</label>
      </div>
      <fieldset>
        <legend className="a-label">Limit to products (none ticked = all products)</legend>
        <div className="flex flex-wrap gap-3">
          {products.map((p) => (
            <label key={p.id} className="flex min-h-11 items-center gap-2 rounded-full bg-white/8 px-4 text-[15px]"><input type="checkbox" name="products" value={p.id} defaultChecked={(d?.product_ids as string[] | null)?.includes(p.id)} className="h-5 w-5 accent-[#DAFC69]" />{p.name}</label>
          ))}
        </div>
      </fieldset>
      <SubmitButton variant="lime">{d ? "Save discount" : "Create discount"}</SubmitButton>
    </ActionForm>
  );
}

export default async function DiscountsPage({ searchParams }: { searchParams: Promise<{ page?: string; edit?: string }> }) {
  const admin = await requirePerm("discounts.manage");
  const db = getDb();
  const sp = await searchParams;
  const dres = await db.from("discounts").select("*", { count: "exact" }).order("created_at", { ascending: false }).limit(1);
  const total = dres.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(sp.page) || 1), pages);
  const discounts = must(await db.from("discounts").select("*").order("created_at", { ascending: false }).range((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE - 1)) as Row[];
  const products = must(await db.from("products").select("id, name").eq("status", "active").limit(300)) as Row[];
  const used = discountUsage(); // one grouped query, not every order loaded into memory
  const usage = (code: string) => used.get(code.toUpperCase()) ?? { orders: 0, revenue: 0, given: 0 };
  const rows = discounts.map((d): Row & { u: ReturnType<typeof usage> } => ({ ...d, u: usage(d.code) }));

  return (
    <>
      <PageHeader eyebrow="Codes customers type at checkout" title="Discounts" />
      <SubNav items={MARKETING_TABS} role={admin.role} />
      <Card>
        <SectionTitle>Usage report</SectionTitle>
        <DataTable
          rows={rows}
          empty={<Empty title="No discount codes yet." hint="Create one below, e.g. WELCOME10 for 10% off." />}
          cols={[
            { key: "code", label: "Code", primary: true, render: (d) => <span className="mono !text-[15px] !text-fg">{d.code}</span> },
            { key: "what", label: "Offer", render: (d) => <span>{label(d)}{Number(d.min_order) > 0 ? <span className="text-[13px] text-muted"> · min ${Number(d.min_order)}</span> : null}</span> },
            { key: "used", label: "Used", render: (d) => `${d.used_count}${d.usage_limit ? ` / ${d.usage_limit}` : ""}` },
            { key: "rev", label: "Revenue", render: (d) => <Money value={d.u.revenue} className="text-[17px]" decimals={false} /> },
            { key: "given", label: "Discount given", render: (d) => <Money value={d.u.given} className="text-[17px]" /> },
            { key: "when", label: "Dates", render: (d) => <span className="text-[13px]">{d.starts_at ? day(d.starts_at) : "—"} → {d.ends_at ? day(d.ends_at) : "no end"}</span> },
            {
              key: "st", label: "Status",
              render: (d) => (
                <ActionForm action={toggleDiscount} className="contents">
                  <input type="hidden" name="id" value={d.id} /><input type="hidden" name="active" value={d.active ? "0" : "1"} />
                  <SubmitButton variant={d.active ? "glass" : "lime"} className="!min-h-10">{d.active ? "Active · disable" : "Disabled · enable"}</SubmitButton>
                </ActionForm>
              ),
            },
          ]}
        />
        <Pager basePath="/admin/marketing/discounts" params={{}} page={page} pages={pages} total={total} noun="code" />
      </Card>

      <div className="mt-5 grid gap-5">
        <Card><SectionTitle>Create a discount</SectionTitle><DiscountForm products={products} /></Card>
        {/* Only the discount being edited gets its form (each form lists every product: one per row made the page megabytes). */}
        {discounts.map((d) =>
          d.id === sp.edit ? (
            <details key={d.id} open id="edit" className="admin-card group">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
                <span className="text-[17px] font-semibold text-fg">Edit {d.code} <span className="mono !text-body ml-2">{label(d)}</span></span>
              </summary>
              <div className="mt-4"><DiscountForm d={d} products={products} /></div>
            </details>
          ) : (
            <Link key={d.id} href={`/admin/marketing/discounts?${new URLSearchParams({ ...(page > 1 ? { page: String(page) } : {}), edit: d.id })}#edit`} className="admin-card flex min-h-14 items-center justify-between">
              <span className="text-[17px] font-semibold text-fg">Edit {d.code} <span className="mono !text-body ml-2">{label(d)}</span></span>
              <span aria-hidden className="display accent text-[28px]">+</span>
            </Link>
          ),
        )}
      </div>
    </>
  );
}
