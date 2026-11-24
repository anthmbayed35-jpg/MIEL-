import { requireAmbassador } from "@/lib/ambassador/auth";
import { leaderboard } from "@/lib/ambassador/portal";
import { Card, PageTitle } from "@/components/ambassador/ui";

export const metadata = { title: "Top 10" };

export default async function LeaderboardPage() {
  const me = await requireAmbassador();
  const rows = leaderboard(me);
  return (
    <>
      <PageTitle kicker="THIS MONTH" title="Top 10.">Ranked by orders this month. You can hide yourself in Profile.</PageTitle>
      {rows.length === 0 ? (
        <Card><p className="body-lg">No orders yet this month. Be the first on the board.</p></Card>
      ) : (
        <ol className="space-y-3">
          {rows.map((r) => (
            <li key={r.rank} className={`${r.mine ? "glass-accent" : "glass-flat"} flex items-center gap-4 rounded-[20px] p-4`}>
              <span className="display w-10 text-[28px] accent">{r.rank}</span>
              <span className="min-w-0 flex-1 truncate text-[20px] text-fg">{r.handle}{r.mine ? " (you)" : ""}</span>
              <span className="mono">{r.orders} ORDERS</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
