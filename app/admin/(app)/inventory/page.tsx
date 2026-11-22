import Link from "next/link";
import { can, requirePerm } from "@/lib/auth";
import { getDb, must, type Row } from "@/lib/db";
import { inventoryList, inventoryNames } from "@/lib/lists";
import { Pager } from "@/components/admin/Pager";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { Card, DataTable, Empty, Num, PageHeader, SectionTitle } from "@/components/admin/ui";
import { addBatch, adjustStock, receiveBatch, setThreshold } from "./actions";

export const metadata = { title: "Inventory" };

const REASONS = [["receive", "Received stock"], ["adjustment", "Recount / correction"], ["damaged", "Damaged / expired"], ["sample", "Samples / giveaway"]];
const DAY = 86_400_000;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ item?: string; q?: string; stock?: string; page?: string }> }) {
  const admin = await requirePerm("inventory.read");
  const sp = await searchParams;
  const canWrite = can(admin.role, "inventory.write");
  const db = getDb();
  const list = inventoryList({ q: sp.q, stock: sp.stock, page: Number(sp.page) || 1 });
  const names = inventoryNames(); // every stock item, names only (batch form, history)
  const batches = (must(await db.from("batches").select("*").limit(500)) as Row[]).sort((a, b) => String(a.expiry_date ?? "9").localeCompare(String(b.expiry_date ?? "9")));
  let mq = db.from("stock_movements").select("*").order("created_at", { ascending: false }).limit(40);
  if (sp.item) mq = mq.eq("inventory_item_id", sp.item);
  const moves = must(await mq) as Row[];

  const name = (itemId: string) => names.get(itemId) ?? "—";
  const rows = list.rows;
  // Server Component: runs once per request, so reading the clock here is correct.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const expiring = batches.filter((b) => b.expiry_date && b.status === "received" && +new Date(b.expiry_date) - now < 60 * DAY);

  return (
    <>
      <PageHeader eyebrow="Stock on hand, batches and history" title="Inventory" />

      {expiring.length > 0 && (
        <Card flat className="mb-5">
          <p className="display text-[16px]">Expiry warning</p>
          <ul className="mt-2 space-y-1 text-[15px]">
            {expiring.map((b) => {
              const days = Math.round((+new Date(b.expiry_date) - now) / DAY);
              return <li key={b.id}>{name(b.inventory_item_id)} · lot {b.lot_number} · <span className={days < 0 ? "text-[#ff8aa0]" : "text-[#fcd34d]"}>{days < 0 ? `expired ${-days} days ago` : `expires in ${days} days`}</span></li>;
            })}
          </ul>
        </Card>
      )}

      <Card>
        <SectionTitle>Stock</SectionTitle>
        <form className="mb-5 grid gap-3 md:grid-cols-[2fr_1fr_auto]" role="search">
          <input name="q" defaultValue={sp.q} placeholder="Search product or SKU" className="a-input" aria-label="Search stock" />
          <select name="stock" defaultValue={sp.stock ?? ""} className="a-input" aria-label="Stock level"><option value="">All stock levels</option><option value="low">Low or out</option><option value="out">Out of stock</option></select>
          <div className="flex gap-2"><button className="pill-btn pill-light">Apply</button><Link href="/admin/inventory" className="pill-btn pill-glass">Reset</Link></div>
        </form>
        <div className="hidden md:block">
          <table className="a-table">
            <thead><tr><th>Product</th><th>SKU</th><th>On hand</th><th>Low-stock at</th><th>Status</th>{canWrite && <th>Adjust</th>}</tr></thead>
            <tbody>
              {rows.map(({ i, product }) => {
                const out = i.on_hand === 0, low = i.on_hand <= i.low_stock_threshold;
                return (
                  <tr key={i.id}>
                    <td><Link href={`/admin/inventory?item=${i.id}`} className="display text-[15px] underline-offset-4 hover:underline">{product!.name}</Link></td>
                    <td><span className="mono !text-body !text-[12px]">{i.sku}</span></td>
                    <td><Num value={i.on_hand} className="text-[28px] leading-none" /></td>
                    <td>
                      {canWrite ? (
                        <ActionForm action={setThreshold} className="flex items-center gap-2">
                          <input type="hidden" name="item" value={i.id} />
                          <input name="threshold" type="number" min="0" defaultValue={i.low_stock_threshold} className="a-input !w-20" aria-label={`Low-stock threshold for ${product!.name}`} />
                          <SubmitButton variant="glass" className="!min-h-12 md:!min-h-10 !px-3">Set</SubmitButton>
                        </ActionForm>
                      ) : i.low_stock_threshold}
                    </td>
                    <td><span className={`status ${out ? "st-returned" : low ? "st-packed" : "st-delivered"}`}>{out ? "Out of stock" : low ? "Low" : "OK"}</span></td>
                    {canWrite && (
                      <td>
                        <ActionForm action={adjustStock} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="item" value={i.id} />
                          <select name="dir" className="a-input !w-24" aria-label="Add or remove"><option value="add">Add</option><option value="remove">Remove</option></select>
                          <input name="amount" type="number" min="1" required placeholder="Qty" className="a-input !w-20" aria-label="Quantity" />
                          <select name="reason" className="a-input !w-44" aria-label="Reason">{REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                          <input name="note" placeholder="Note" className="a-input !w-32" aria-label="Note" />
                          <SubmitButton variant="lime" className="!min-h-12 md:!min-h-10">Apply</SubmitButton>
                        </ActionForm>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* mobile cards */}
        <ul className="space-y-3 md:hidden">
          {rows.map(({ i, product }) => (
            <li key={i.id} className="admin-card-flat space-y-3 p-4">
              <div className="flex items-center justify-between"><span className="display text-[16px]">{product!.name}</span><Num value={i.on_hand} className="text-[30px] leading-none" /></div>
              <p className="mono !text-muted !text-[11px]">{i.sku} · LOW AT {i.low_stock_threshold}</p>
              {canWrite && (
                <ActionForm action={adjustStock} className="grid grid-cols-2 gap-2">
                  <input type="hidden" name="item" value={i.id} />
                  <select name="dir" className="a-input" aria-label="Add or remove"><option value="add">Add</option><option value="remove">Remove</option></select>
                  <input name="amount" type="number" min="1" required placeholder="Qty" className="a-input" aria-label="Quantity" />
                  <select name="reason" className="a-input col-span-2" aria-label="Reason">{REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  <input name="note" placeholder="Note (optional)" className="a-input col-span-2" aria-label="Note" />
                  <SubmitButton variant="lime" className="col-span-2">Apply</SubmitButton>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
        {rows.length === 0 && <Empty title="No stock records." hint="Create a product and it gets a stock record automatically." />}
        <Pager basePath="/admin/inventory" params={{ q: sp.q, stock: sp.stock, item: sp.item }} page={list.page} pages={list.pages} total={list.total} noun="item" />
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle>Batches (lot & expiry)</SectionTitle>
          <DataTable
            rows={batches}
            empty={<p className="text-[15px] text-body">No batches yet. Add an incoming batch below.</p>}
            cols={[
              { key: "p", label: "Product", primary: true, render: (b) => <span className="text-fg">{name(b.inventory_item_id)}</span> },
              { key: "lot", label: "Lot", render: (b) => <span className="mono !text-[13px] !text-fg">{b.lot_number}</span> },
              { key: "qty", label: "Qty", render: (b) => b.quantity },
              { key: "exp", label: "Expiry", render: (b) => (b.expiry_date ? (() => { const d = Math.round((+new Date(b.expiry_date) - now) / DAY); return <span className={d < 0 ? "text-[#ff8aa0]" : d < 60 ? "text-[#fcd34d]" : ""}>{b.expiry_date}</span>; })() : "—") },
              {
                key: "st", label: "Status",
                render: (b) => b.status === "received" ? <span className="status st-delivered">Received</span> : canWrite ? (
                  <ActionForm action={receiveBatch}><input type="hidden" name="batch" value={b.id} /><SubmitButton variant="lime" className="!min-h-12 md:!min-h-10">Receive</SubmitButton></ActionForm>
                ) : <span className="status st-packed">Incoming</span>,
              },
            ]}
          />
          {canWrite && (
            <ActionForm action={addBatch} resetOnSuccess className="mt-5 grid gap-3 sm:grid-cols-2">
              <select name="item" required className="a-input" aria-label="Product">{[...names].map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
              <input name="lot" required placeholder="Lot number" className="a-input" />
              <input name="expiry" type="date" className="a-input" aria-label="Expiry date" />
              <input name="qty" type="number" min="1" required placeholder="Quantity" className="a-input" />
              <SubmitButton variant="glass" className="sm:col-span-2">Add incoming batch</SubmitButton>
            </ActionForm>
          )}
        </Card>

        <Card>
          <SectionTitle right={sp.item ? <Link href="/admin/inventory" className="text-[14px] text-body underline-offset-4 hover:underline">Show all</Link> : undefined}>
            Movement history{sp.item ? ` · ${name(sp.item)}` : ""}
          </SectionTitle>
          <DataTable
            rows={moves}
            empty={<p className="text-[15px] text-body">No movements yet.</p>}
            cols={[
              { key: "when", label: "When", primary: true, render: (m) => new Date(m.created_at).toLocaleString("en-GB", { timeZone: "Asia/Beirut", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) },
              { key: "p", label: "Product", render: (m) => name(m.inventory_item_id) },
              { key: "d", label: "Change", render: (m) => <span className={`mono ${m.delta > 0 ? "!text-[#4ade80]" : "!text-[#ff8aa0]"}`}>{m.delta > 0 ? "+" : ""}{m.delta}</span> },
              { key: "r", label: "Reason", render: (m) => <span className="text-[14px]">{String(m.reason).replace(/_/g, " ")}{m.note ? ` · ${m.note}` : ""}</span> },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
