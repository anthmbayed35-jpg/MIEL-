import Link from "next/link";
import { requireAmbassador } from "@/lib/ambassador/auth";
import { dashboardFor, onboardingFor, announcementsList } from "@/lib/ambassador/portal";
import { Card, PageTitle, Stat, day, usd } from "@/components/ambassador/ui";

export const metadata = { title: "Home" };

export default async function PortalHome() {
  const me = await requireAmbassador();
  const d = dashboardFor(me);
  const ob = onboardingFor(me);
  const news = announcementsList(1)[0];
  return (
    <>
      <PageTitle kicker={`${d.tier.toUpperCase()} · ${d.commissionPercent}% COMMISSION`} title={`Hey ${me.name.split(" ")[0]}.`} />

      {!ob.done && (
        <Card className="mb-6">
          <p className="mono mb-3">GET STARTED</p>
          <ul className="space-y-1">
            {ob.items.map((i) => (
              <li key={i.key}>
                <Link href={i.href} className="flex min-h-12 items-center gap-3 text-[18px] text-fg">
                  <span aria-hidden className={`grid size-7 shrink-0 place-items-center rounded-full border ${i.done ? "border-acid bg-acid text-black" : "border-white/30"}`}>{i.done ? "✓" : ""}</span>
                  <span className={i.done ? "text-muted line-through" : ""}>{i.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mb-6 text-center">
        <p className="mono mb-2">YOUR CODE</p>
        <p className="display accent text-[clamp(2.5rem,10vw,4.5rem)] leading-none">{me.code}</p>
        <p className="body-lg mt-3">Your followers get {d.discountPercent}% off. <Link href="/ambassador/link" className="accent underline underline-offset-4">Get your link and QR</Link></p>
      </Card>

      {d.progress && (
        <Card className="mb-6">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <p className="mono">NEXT LEVEL: {d.progress.next.toUpperCase()}</p>
            <p className="mono">{d.progress.have} / {d.progress.target} DELIVERED</p>
          </div>
          <div className="h-4 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={d.progress.percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-acid" style={{ width: `${Math.max(3, d.progress.percent)}%` }} />
          </div>
          <p className="body-lg mt-3">{d.progress.need} more delivered {d.progress.need === 1 ? "order" : "orders"} to level up.</p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Stat label="SALES" value={usd(d.salesCents)} sub={`${usd(d.monthSalesCents)} this month`} />
        <Stat label="ORDERS" value={d.orders} sub={`${d.monthOrders} this month`} />
        <Stat label="CLICKS" value={d.clicks} sub={`${d.clicksMonth} this month`} />
        <Stat label="CONVERSION" value={d.conversion === null ? "–" : `${d.conversion}%`} sub="orders per click" />
        <Stat label="PENDING" value={usd(d.pendingCents)} sub={`approved ${d.holdDays} days after delivery`} />
        <Stat label="APPROVED" value={usd(d.approvedCents + d.bonusCents)} />
        <Stat label="PAID" value={usd(d.paidCents)} />
        <Stat label="AVAILABLE" value={usd(d.availableCents)} accent sub={`payout from ${usd(d.minPayoutCents)}`} />
      </div>
      <div className="mt-6"><Link href="/ambassador/payouts" className="btn">REQUEST A PAYOUT</Link></div>

      {news && (
        <Card className="mt-8">
          <p className="mono mb-2">LATEST NEWS · {day(news.created_at).toUpperCase()}</p>
          <p className="display text-[24px]">{news.title}</p>
          <p className="body-lg mt-2 whitespace-pre-line">{news.body}</p>
        </Card>
      )}
    </>
  );
}
