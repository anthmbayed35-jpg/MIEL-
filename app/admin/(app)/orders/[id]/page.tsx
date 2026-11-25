import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerm } from "@/lib/auth";
import { mapUrl, orderDetail } from "@/lib/queries";
import { customerStatusMessage } from "@/lib/messages";
import { waLink } from "@/lib/phone";
import { NEXT_STATUS, ORDER_STATUSES, STATUS_LABEL, type OrderStatus } from "@/lib/status";
import { Card, KV, Money, PageHeader, PayBadge, PillLink, SectionTitle, StatusBadge } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { getEngine } from "@/lib/db";
import { addComment, cancelOrder, changeStatus, returnOrder, saveDelivery, toggleCod } from "../actions";

export const metadata = { title: "Order" };

const dot: Record<string, string> = { created: "#DAFC69", status: "#7db8ff", comment: "#fcd34d", payment: "#4ade80", delivery: "#c4b5fd", refund: "#ff8aa0" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePerm("orders.read");
  const { id } = await params;
  const d = await orderDetail(id);
  if (!d) notFound();
  const { order: o, items, events, customer, partner, partners, orderCount } = d;
  const affiliate = o.affiliate_id ? (getEngine().sqlite.prepare("SELECT id, name FROM affiliates WHERE id = ?").get(o.affiliate_id) as { id: string; name: string } | undefined) : undefined;
  const status = o.status as OrderStatus;
  const next = NEXT_STATUS[status];
  const closed = ["cancelled", "returned", "refused"].includes(status);
  const msg = customerStatusMessage({ number: o.order_number, status, total: Number(o.cod_amount_due), customerName: customer?.name ?? "there", tracking: o.tracking_number, cod: !o.cod_collected });

  return (
    <>
      <PageHeader
        eyebrow={`Placed ${new Date(o.created_at).toLocaleString("en-GB", { timeZone: "Asia/Beirut", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })} · ${o.source}`}
        title={`Order #${o.order_number}`}
        actions={
          <>
            {customer && <a href={waLink(customer.phone, msg)} target="_blank" rel="noopener noreferrer" className="pill-btn pill-glass">Message on WhatsApp</a>}
            <PillLink href={`/admin/print?type=packing&ids=${o.id}`} variant="glass">Packing slip</PillLink>
            <PillLink href={`/admin/print?type=invoice&ids=${o.id}`} variant="glass">Invoice</PillLink>
          </>
        }
      >
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusBadge status={status} />
          {o.is_test && <span className="status st-cancelled">TEST ORDER: not counted in sales</span>}
          {!["draft", "cancelled"].includes(status) && <PayBadge collected={o.cod_collected} refunded={status === "returned" && o.cod_collected} />}
          {o.discount_code && <span className="status st-new">Code {o.discount_code}</span>}
        </div>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          {/* one-tap status */}
          {!closed && (
            <Card flat className="flex flex-wrap items-center gap-3">
              {next && (
                <ActionForm action={changeStatus} className="contents">
                  <input type="hidden" name="id" value={o.id} /><input type="hidden" name="version" value={o.version} />
                  <input type="hidden" name="to" value={next} />
                  <SubmitButton variant="lime">{status === "draft" ? "Confirm draft (deducts stock)" : `Mark as ${STATUS_LABEL[next].toLowerCase()}`}</SubmitButton>
                </ActionForm>
              )}
              <ActionForm action={changeStatus} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={o.id} /><input type="hidden" name="version" value={o.version} />
                <select name="to" defaultValue={status} className="a-input !w-auto" aria-label="Set status">
                  {ORDER_STATUSES.filter((s) => !["cancelled", "returned", "refused", "draft"].includes(s)).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
                <SubmitButton variant="glass">Set status</SubmitButton>
              </ActionForm>
            </Card>
          )}

          <Card>
            <SectionTitle>Items</SectionTitle>
            <ul className="divide-y divide-white/8">
              {items.map((i) => (
                <li key={i.id} className="flex min-h-14 items-center justify-between gap-3 py-2">
                  <span><span className="display text-[16px]">{i.name}</span><span className="mono !text-body ml-3">{i.qty} × ${Number(i.unit_price).toFixed(2)}</span></span>
                  <Money value={i.qty * Number(i.unit_price)} className="text-[20px]" />
                </li>
              ))}
            </ul>
            <dl className="mt-3 border-t border-white/10 pt-3">
              <KV k="Subtotal"><Money value={Number(o.subtotal)} className="text-[16px]" /></KV>
              {Number(o.discount_total) > 0 && <KV k={`Discount ${o.discount_code ?? ""}`}><span className="text-acid">−${Number(o.discount_total).toFixed(2)}</span></KV>}
              {affiliate && (
                <KV k="Ambassador">
                  <Link href={`/admin/affiliates/${affiliate.id}`} className="inline-flex min-h-12 items-center text-fg underline underline-offset-4">{affiliate.name} · {o.code_used}</Link>
                  <span className="block text-[14px] text-body">Commission ${Number(o.commission_amount).toFixed(2)} · {o.commission_status} · via {o.attribution === "link" ? "personal link" : "code"}</span>
                </KV>
              )}
              {o.heard_from && <KV k="Heard about us from">{String(o.heard_from)}</KV>}
              <KV k={`Delivery ${o.region ? `(${o.region})` : ""}`}>{Number(o.shipping_fee) ? `$${Number(o.shipping_fee).toFixed(2)}` : "Free"}</KV>
              <div className="flex items-center justify-between border-t border-white/10 pt-3">
                <span className="mono !text-fg">TOTAL · CASH ON DELIVERY</span>
                <Money value={Number(o.total)} className="text-[30px] leading-none" />
              </div>
            </dl>
            {!["draft", "cancelled"].includes(status) && (
              <ActionForm action={toggleCod} className="mt-4 flex flex-wrap items-center gap-3">
                <input type="hidden" name="id" value={o.id} /><input type="hidden" name="version" value={o.version} />
                <input type="hidden" name="collected" value={o.cod_collected ? "0" : "1"} />
                <SubmitButton variant={o.cod_collected ? "glass" : "lime"}>{o.cod_collected ? "Undo: mark as not collected" : `Mark $${Number(o.cod_amount_due).toFixed(2)} COD as collected`}</SubmitButton>
                {o.cod_settled_at && <span className="text-[13px] text-muted">Settled {new Date(o.cod_settled_at).toLocaleDateString("en-GB")}</span>}
              </ActionForm>
            )}
          </Card>

          <Card>
            <SectionTitle>Timeline & comments</SectionTitle>
            <ol className="relative space-y-4 border-l border-white/12 pl-6">
              {events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full" style={{ background: dot[e.type] ?? "#8a857d" }} aria-hidden />
                  <p className={`text-[15px] ${e.type === "comment" ? "rounded-2xl bg-[#fcd34d]/10 px-3 py-2 text-fg" : "text-fg"}`}>{e.message}</p>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {e.actor || "system"} · {new Date(e.created_at).toLocaleString("en-GB", { timeZone: "Asia/Beirut", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </li>
              ))}
            </ol>
            <ActionForm action={addComment} resetOnSuccess className="mt-5 flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="id" value={o.id} /><input type="hidden" name="version" value={o.version} />
              <input name="text" required placeholder="Add an internal comment (customers can't see this)" className="a-input" aria-label="Comment" />
              <SubmitButton variant="light">Add</SubmitButton>
            </ActionForm>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <SectionTitle>Customer</SectionTitle>
            {customer ? (
              <>
                <Link href={`/admin/customers/${customer.id}`} className="display inline-flex min-h-12 items-center text-[18px] underline-offset-4 hover:underline">{customer.name}</Link>
                <p className="mt-1 text-[15px] text-body">{customer.phone}</p>
                <p className="mt-1 text-[13px] text-muted">{orderCount} order{orderCount === 1 ? "" : "s"}{customer.blocked ? " · BLOCKED" : ""}</p>
                {Array.isArray(customer.tags) && customer.tags.length > 0 && <p className="mt-2 flex flex-wrap gap-1.5">{customer.tags.map((t: string) => <span key={t} className="status st-draft">{t}</span>)}</p>}
              </>
            ) : <p className="text-body">No customer attached.</p>}
          </Card>

          <Card>
            <SectionTitle>Delivery</SectionTitle>
            <p className="text-[16px] text-fg">{o.address}</p>
            <p className="mt-1 text-[14px] text-body">{o.region}</p>
            <a href={mapUrl(o.address, o.region)} target="_blank" rel="noopener noreferrer" className="link inline-flex min-h-12 items-center text-[15px]">Open in Google Maps ↗</a>
            {o.customer_notes && <p className="mt-3 rounded-2xl bg-white/6 p-3 text-[15px]"><span className="mono block !text-[13px]">CUSTOMER NOTE</span>{o.customer_notes}</p>}
            <ActionForm action={saveDelivery} className="mt-4 space-y-3">
              <input type="hidden" name="id" value={o.id} /><input type="hidden" name="version" value={o.version} />
              <label className="block"><span className="a-label">Delivery partner</span>
                <select name="partner" defaultValue={o.delivery_partner_id ?? ""} className="a-input">
                  <option value="">Not assigned</option>
                  {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="block"><span className="a-label">Tracking number</span>
                <input name="tracking" defaultValue={o.tracking_number} className="a-input" placeholder="Optional" />
              </label>
              <SubmitButton variant="glass">Save delivery</SubmitButton>
              {partner && <p className="text-[13px] text-muted">Current: {partner.name}</p>}
            </ActionForm>
          </Card>

          {!["cancelled", "returned", "refused"].includes(status) && (
            <Card>
              <SectionTitle>{status === "delivered" ? "Return" : "Cancel order"}</SectionTitle>
              {status === "delivered" ? (
                <ActionForm action={returnOrder} className="space-y-3">
                  <input type="hidden" name="id" value={o.id} /><input type="hidden" name="version" value={o.version} />
                  <input name="note" placeholder="Reason / note (optional)" className="a-input" />
                  <SubmitButton variant="danger" confirm="Mark this order as returned? Stock will be restored.">Mark as returned</SubmitButton>
                  <p className="text-[13px] text-muted">Restores stock. If the COD was collected, a refund is noted on the order.</p>
                </ActionForm>
              ) : (
                <ActionForm action={cancelOrder} className="space-y-3">
                  <input type="hidden" name="id" value={o.id} /><input type="hidden" name="version" value={o.version} />
                  <input name="reason" required placeholder="Reason for cancelling" className="a-input" />
                  <SubmitButton variant="danger" confirm="Cancel this order? Stock will be restored.">Cancel order</SubmitButton>
                  <p className="text-[13px] text-muted">Stock is restored automatically.</p>
                </ActionForm>
              )}
            </Card>
          )}
          {status === "cancelled" && o.cancel_reason && <Card flat><p className="mono">CANCELLED</p><p className="mt-1 text-[15px] text-fg">{o.cancel_reason}</p></Card>}
        </div>
      </div>
    </>
  );
}
