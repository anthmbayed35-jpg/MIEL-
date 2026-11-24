import Link from "next/link";
import { requireAmbassador } from "@/lib/ambassador/auth";
import { payoutsFor } from "@/lib/ambassador/portal";
import { ActionButton } from "@/components/ambassador/PortalForm";
import { Card, PageTitle, Pill, Stat, day, usd } from "@/components/ambassador/ui";
import { requestPayoutAction } from "../../actions";

export const metadata = { title: "Payouts" };

export default async function PayoutsPage() {
  const me = await requireAmbassador();
  const p = payoutsFor(me);
  const noDetails = !me.payout_method.trim() || !me.payout_details.trim();
  return (
    <>
      <PageTitle kicker="MONEY" title="Payouts." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Stat label="PENDING" value={usd(p.pendingCents)} sub={`approved ${p.holdDays} days after delivery`} />
        <Stat label="APPROVED" value={usd(p.approvedCents + p.bonusCents)} sub={p.bonusCents ? `incl. ${usd(p.bonusCents)} mission bonus` : undefined} />
        <Stat label="AVAILABLE" value={usd(p.availableCents)} accent />
        <Stat label="PAID" value={usd(p.paidCents)} />
      </div>
      {p.correctionsCents > 0 && <p className="body-lg mt-4">{usd(p.correctionsCents)} will be taken off your next payout (returned orders that were already paid).</p>}

      <Card className="mt-6">
        <p className="mono mb-2">REQUEST A PAYOUT</p>
        {p.open ? (
          <p className="body-lg">Your request for {usd(p.open.amount_cents)} is waiting ({day(p.open.created_at)}). We will pay it and mark it here.</p>
        ) : noDetails ? (
          <p className="body-lg">Add your payout method and details first. <Link href="/ambassador/profile#payout" className="accent underline underline-offset-4">Open profile</Link></p>
        ) : p.availableCents < p.minPayoutCents ? (
          <p className="body-lg">You can request a payout once your available balance reaches {usd(p.minPayoutCents)}. You are at {usd(p.availableCents)}.</p>
        ) : (
          <>
            <p className="body-lg mb-4">You can ask for {usd(p.availableCents)} now.</p>
            <ActionButton action={requestPayoutAction}>REQUEST {usd(p.availableCents)}</ActionButton>
          </>
        )}
      </Card>

      <h2 className="display mt-10 text-[26px]">History</h2>
      {p.history.length === 0 && p.requests.length === 0 ? (
        <p className="body-lg mt-3">Nothing yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {p.requests.map((r) => (
            <li key={`r${r.created_at}`} className="glass-flat flex items-center justify-between gap-3 rounded-[20px] p-4">
              <div><p className="mono">REQUEST · {day(r.created_at).toUpperCase()}</p><p className="mt-1 text-[18px] text-fg">{usd(r.amount_cents)}</p></div>
              <Pill value={r.status} />
            </li>
          ))}
          {p.history.map((h) => (
            <li key={h.paid_at + h.amount_cents} className="glass-flat flex items-center justify-between gap-3 rounded-[20px] p-4">
              <div><p className="mono">PAID · {day(h.paid_at).toUpperCase()}</p><p className="mt-1 text-[18px] text-fg">{usd(h.amount_cents)} via {h.method || "transfer"}</p></div>
              <Pill value="paid" />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
