import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { TIER_RULES } from "@/config/affiliates";
import { affiliateOrders, affiliateStats, getAffiliateByToken } from "@/lib/affiliates";
import { getCatalog } from "@/lib/catalog";
import { ipFromHeaders } from "@/lib/client-ip";
import { rateCount, rateHit, rateLimit } from "@/lib/rate-limit";
import { Blobs } from "@/components/Blobs";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Sections";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your stats", robots: { index: false, follow: false, nocache: true } };

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Beirut", day: "numeric", month: "short" });
const ORDER_LABEL: Record<string, string> = { new: "Placed", confirmed: "Confirmed", packed: "Packed", out_for_delivery: "On the way", delivered: "Delivered", cancelled: "Cancelled", returned: "Returned" };
const COMMISSION_LABEL: Record<string, string> = { pending: "Pending", approved: "Approved", paid: "Paid", void: "Void" };
const COMMISSION_STYLE: Record<string, string> = { pending: "st-packed", approved: "st-confirmed", paid: "st-delivered", void: "st-cancelled" };

/**
 * Private, read-only stats for one affiliate. The link IS the credential (a random 192-bit token), so an unknown token is a plain
 * 404, the page is never indexed or cached, and it shows no customer names, phones or addresses, only the affiliate's own numbers.
 */
export default async function PartnerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // rate limited per connection: 20 wrong links a minute lock guessing out, 120 views a minute cap everything else
  const ip = ipFromHeaders(await headers());
  if (rateCount(`partner:miss:${ip}`) >= 20) notFound();
  const aff = getAffiliateByToken(token);
  if (!aff) {
    rateHit(`partner:miss:${ip}`, 60_000);
    notFound();
  }
  if (!rateLimit(`partner:view:${ip}`, 120, 60_000)) notFound();
  const s = affiliateStats(aff.id)!;
  const orders = affiliateOrders(aff.id, 50);
  const cat = await getCatalog();
  const stat = "glass-flat rounded-[20px] p-5";
  return (
    <>
      <Header />
      <main className="relative isolate overflow-x-clip">
        <Blobs spots={[{ x: "-10%", y: "0%" }, { x: "65%", y: "30%", delay: -9 }]} />
        <div className="mx-auto max-w-3xl px-5 pb-24 pt-[130px] md:px-8 md:pt-[150px]">
          <p className="mono mb-3">{TIER_RULES[s.tier].label.toUpperCase()} · {s.commission_rate_x100 / 100}% COMMISSION</p>
          <h1 className="display h-section">{s.name}</h1>

          <div className="glass mt-8 p-6 text-center md:p-8">
            <p className="mono mb-2">YOUR CODE</p>
            <p className="display accent text-[clamp(2.5rem,10vw,4.5rem)] leading-none">{s.code}</p>
            <p className="body-lg mt-4">{s.status === "active" ? `Your followers get ${s.customer_discount_percent_x100 / 100}% off at checkout.` : `Your code is ${s.status} right now.`}</p>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-3 md:gap-4">
            <div className={stat}><dt className="mono mb-2">ORDERS</dt><dd className="display text-[32px] leading-none">{s.orders}</dd></div>
            <div className={stat}><dt className="mono mb-2">SALES</dt><dd className="display text-[32px] leading-none">{usd(s.sales_cents)}</dd></div>
            <div className={stat}><dt className="mono mb-2">PENDING</dt><dd className="display text-[32px] leading-none">{usd(s.pending_cents)}</dd></div>
            <div className={stat}><dt className="mono mb-2">APPROVED</dt><dd className="display accent text-[32px] leading-none">{usd(s.approved_cents)}</dd></div>
            <div className={`${stat} col-span-2`}><dt className="mono mb-2">PAID OUT</dt><dd className="display text-[32px] leading-none">{usd(s.paid_cents)}</dd></div>
            {s.corrections_cents > 0 && <div className={`${stat} col-span-2`}><dt className="mono mb-2">ADJUSTMENT</dt><dd className="display text-[32px] leading-none">−{usd(s.corrections_cents)}</dd><dd className="mt-2 text-[15px] text-body">Orders returned or cancelled after being paid. Taken off your next payout.</dd></div>}
          </dl>
          <p className="mt-4 text-[16px] text-body">Commission is pending until the order is delivered, approved 14 days later, then paid with your next payout. Cancelled or returned orders earn nothing.</p>

          <h2 className="display mt-12 text-[26px]">Your orders</h2>
          {orders.length === 0 ? (
            <p className="body-lg mt-4">No orders yet. Share your code and they will show up here.</p>
          ) : (
            <ul className="mt-5 space-y-3">
              {orders.map((o) => (
                <li key={o.id} className="glass-flat flex items-center justify-between gap-3 rounded-[20px] p-4">
                  <div>
                    <p className="text-[18px] text-fg">{usd(o.subtotal_cents - o.discount_amount_cents)}</p>
                    <p className="text-[15px] text-body">{day(o.created_at)} · {ORDER_LABEL[o.status] ?? o.status}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[18px] text-fg">{usd(o.commission_amount_cents)}</p>
                    {o.commission_status && <span className={`status ${COMMISSION_STYLE[o.commission_status]}`}>{COMMISSION_LABEL[o.commission_status]}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <Footer store={cat.store} policies={cat.policies} />
    </>
  );
}
