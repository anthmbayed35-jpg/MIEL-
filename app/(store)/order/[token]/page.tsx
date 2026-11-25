import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getCatalog } from "@/lib/catalog";
import { ipFromHeaders } from "@/lib/client-ip";
import { money } from "@/lib/format";
import { orderRef } from "@/lib/order-ref";
import { orderByToken } from "@/lib/order-view";
import { paymentMethod } from "@/lib/payments";
import { rateCount, rateHit } from "@/lib/rate-limit";
import { waLink } from "@/lib/phone";
import { STATUS_LABEL, type OrderStatus } from "@/lib/status";
import { Blobs } from "@/components/Blobs";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Sections";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your order", robots: { index: false, follow: false, nocache: true } };

/** The customer's confirmation page. Found only by an unguessable token; shows that one order and nothing else. */
export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = ipFromHeaders(await headers());
  if (rateCount(`order-view:miss:${ip}`) >= 30) notFound(); // guessing is locked out
  const o = orderByToken(token);
  if (!o) {
    rateHit(`order-view:miss:${ip}`, 60_000);
    notFound();
  }
  const cat = await getCatalog();
  const ref = orderRef(o.number);
  const cod = paymentMethod(o.paymentMethod)?.collectOnDelivery ?? o.paymentMethod === "cod";
  const first = o.name.split(" ")[0] || "a customer";
  const wa = waLink(cat.store.whatsapp, `Hi MIEL+, this is ${first}. About my order ${ref}.`);
  return (
    <>
      <Header />
      <main className="relative isolate overflow-x-clip">
        <Blobs spots={[{ x: "-10%", y: "0%" }, { x: "62%", y: "35%", delay: -9 }]} />
        <div className="mx-auto max-w-3xl px-5 pb-24 pt-[calc(var(--header-h,72px)+32px)] md:px-8 md:pt-[calc(var(--header-h,88px)+40px)]">
          <p className="mono mb-3">
            {o.isTest ? "TEST ORDER " : "ORDER "}
            {ref}
          </p>
          <h1 className="display h-section">
            Order placed<span className="accent">.</span>
          </h1>
          <p className="body-lg mt-4">
            {o.isTest
              ? "This was a TEST order. It is marked TEST in the admin and is not counted in sales."
              : `Thank you, ${first}. We received your order and will confirm delivery details with you on WhatsApp.`}
          </p>

          {cod && !o.isTest && (
            <div className="glass mt-6 p-5">
              <p className="mono">PAYMENT</p>
              <p className="display mt-1 text-[22px]">Pay cash on delivery</p>
              <p className="mt-1 text-[17px]">Please have {money(o.total)} ready when your order arrives.</p>
            </div>
          )}

          {!o.isTest && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="btn btn-block mt-6">
              CHAT WITH US ON WHATSAPP
            </a>
          )}

          <section className="glass mt-8 p-5 md:p-8" aria-label="Your order">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="display text-[22px]">Your order</h2>
              <span className="mono">{STATUS_LABEL[o.status as OrderStatus] ?? o.status}</span>
            </div>
            <ul className="mt-4 divide-y divide-white/10">
              {o.items.map((i) => (
                <li key={i.name} className="flex justify-between gap-3 py-3">
                  <span className="text-[18px] text-fg">
                    {i.qty} × {i.name}
                  </span>
                  <span className="text-[18px]">{money(i.unitPrice * i.qty)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-2 border-t border-white/10 pt-4 text-[17px]">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{money(o.subtotal)}</dd>
              </div>
              {o.discount > 0 && (
                <div className="flex justify-between text-acid">
                  <dt>Discount</dt>
                  <dd>−{money(o.discount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt>Delivery</dt>
                <dd>{o.shipping ? money(o.shipping) : "Free"}</dd>
              </div>
              <div className="flex items-baseline justify-between pt-1">
                <dt className="mono">TOTAL</dt>
                <dd className="display accent text-[30px]">{money(o.total)}</dd>
              </div>
            </dl>
          </section>

          <section className="glass mt-6 p-5 md:p-8" aria-label="Delivery address">
            <h2 className="display text-[22px]">Delivery address</h2>
            <p className="body-lg mt-3 !text-fg">{o.name}</p>
            <p className="body-lg">{o.address}</p>
            {o.notes && <p className="body-lg mt-2">Notes: {o.notes}</p>}
          </section>
        </div>
      </main>
      <Footer store={cat.store} policies={cat.policies} />
    </>
  );
}
