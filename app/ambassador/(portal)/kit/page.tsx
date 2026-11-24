import { requireAmbassador } from "@/lib/ambassador/auth";
import { kitsFor } from "@/lib/ambassador/portal";
import { getProgram } from "@/lib/program";
import { ActionButton } from "@/components/ambassador/PortalForm";
import { Card, PageTitle, Pill, day } from "@/components/ambassador/ui";
import { monthlyKitAction } from "../../actions";

export const metadata = { title: "Kit" };

export default async function KitPage() {
  const me = await requireAmbassador();
  const k = kitsFor(me);
  const program = getProgram();
  return (
    <>
      <PageTitle kicker="FREE PRODUCT" title="Your kit." />
      <Card className="mb-6">
        <p className="mono mb-2">MONTHLY FREE POUCH</p>
        {k.needsAthlete ? (
          <p className="body-lg">A free pouch every month unlocks at {program.tiers.athlete.label}. Keep delivering orders to get there.</p>
        ) : k.monthlyThisMonth ? (
          <p className="body-lg">You already asked for this month&apos;s pouch. Next one opens next month.</p>
        ) : (
          <>
            <p className="body-lg mb-4">Your free pouch for this month is waiting. We deliver it like any order.</p>
            <ActionButton action={monthlyKitAction} disabled={!k.canRequestMonthly}>REQUEST MY POUCH</ActionButton>
          </>
        )}
      </Card>
      <h2 className="display text-[26px]">Status</h2>
      {k.rows.length === 0 ? (
        <p className="body-lg mt-3">No kit requests yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {k.rows.map((r) => (
            <li key={r.created_at + r.kind} className="glass-flat flex items-center justify-between gap-3 rounded-[20px] p-4">
              <div>
                <p className="mono">{r.kind === "starter" ? "STARTER KIT" : "MONTHLY POUCH"} · {day(r.created_at).toUpperCase()}</p>
                {r.note && <p className="mt-1 text-[16px] text-body">{r.note}</p>}
              </div>
              <Pill value={r.status} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
