import { notFound } from "next/navigation";
import { requirePerm } from "@/lib/auth";
import { mapUrl, orderDetail } from "@/lib/queries";
import { PrintButton } from "@/components/admin/PrintButton";

export const metadata = { title: "Print" };

/** Printable packing slips / invoices (one page per order). Browser "Save as PDF" works too. */
export default async function PrintPage({ searchParams }: { searchParams: Promise<{ ids?: string; type?: string }> }) {
  await requirePerm("orders.read");
  const sp = await searchParams;
  const ids = (sp.ids ?? "").split(",").filter(Boolean).slice(0, 60);
  const invoice = sp.type === "invoice";
  const docs = (await Promise.all(ids.map((id) => orderDetail(id)))).filter((d): d is NonNullable<typeof d> => !!d);
  if (!docs.length) notFound();

  return (
    <div className="fixed inset-0 z-[100] overflow-auto bg-neutral-200 text-black">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between bg-black px-5 py-3 text-white">
        <span className="text-[15px]">{docs.length} {invoice ? "invoice" : "packing slip"}{docs.length === 1 ? "" : "s"}</span>
        <PrintButton />
      </div>
      <div className="print-area mx-auto max-w-[800px] space-y-6 p-4 print:space-y-0">
        {docs.map(({ order: o, items, customer }) => (
          <section key={o.id} className="break-after-page bg-white p-8 text-[14px] leading-relaxed shadow print:shadow-none">
            <div className="flex items-start justify-between border-b-2 border-black pb-4">
              <div>
                <p className="text-[28px] font-extrabold tracking-tight">MIEL+</p>
                <p className="text-[12px] uppercase tracking-widest">Honey sports nutrition · Lebanon</p>
              </div>
              <div className="text-right">
                <p className="text-[22px] font-bold">{invoice ? "INVOICE" : "PACKING SLIP"}</p>
                <p>Order #{o.order_number}</p>
                <p>{new Date(o.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-6">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest">Deliver to</p>
                <p className="text-[16px] font-semibold">{customer?.name}</p>
                <p>{customer?.phone}</p>
                <p>{o.address}</p>
                <p>{o.region}</p>
                <p className="text-[11px] text-neutral-600">{mapUrl(o.address, o.region)}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold uppercase tracking-widest">Payment</p>
                <p className="font-semibold">Cash on delivery</p>
                {!o.cod_collected && <p className="text-[18px] font-bold">Collect ${Number(o.cod_amount_due).toFixed(2)}</p>}
                {o.cod_collected && <p>Paid</p>}
                {o.tracking_number && <p>Tracking: {o.tracking_number}</p>}
              </div>
            </div>
            <table className="mt-6 w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-black text-left text-[11px] uppercase tracking-widest">
                  <th className="py-2">Item</th><th className="py-2 text-center">Qty</th>{invoice && <><th className="py-2 text-right">Price</th><th className="py-2 text-right">Total</th></>}
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-b border-neutral-300">
                    <td className="py-2 font-semibold">{i.name}<span className="font-normal text-neutral-600"> · 12 sachets</span></td>
                    <td className="py-2 text-center">{i.qty}</td>
                    {invoice && <><td className="py-2 text-right">${Number(i.unit_price).toFixed(2)}</td><td className="py-2 text-right">${(i.qty * Number(i.unit_price)).toFixed(2)}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
            {invoice && (
              <dl className="ml-auto mt-4 w-64 space-y-1">
                <div className="flex justify-between"><dt>Subtotal</dt><dd>${Number(o.subtotal).toFixed(2)}</dd></div>
                {Number(o.discount_total) > 0 && <div className="flex justify-between"><dt>Discount {o.discount_code}</dt><dd>−${Number(o.discount_total).toFixed(2)}</dd></div>}
                <div className="flex justify-between"><dt>Delivery</dt><dd>{Number(o.shipping_fee) ? `$${Number(o.shipping_fee).toFixed(2)}` : "Free"}</dd></div>
                <div className="flex justify-between border-t-2 border-black pt-1 text-[18px] font-bold"><dt>Total (USD)</dt><dd>${Number(o.total).toFixed(2)}</dd></div>
              </dl>
            )}
            {o.customer_notes && <p className="mt-6 border border-black p-3"><b>Customer note:</b> {o.customer_notes}</p>}
            <p className="mt-10 text-center text-[12px] uppercase tracking-widest">Fuel the grind. Thank you for ordering from MIEL+.</p>
          </section>
        ))}
      </div>
    </div>
  );
}
