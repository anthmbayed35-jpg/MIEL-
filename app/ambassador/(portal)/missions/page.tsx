import { requireAmbassador } from "@/lib/ambassador/auth";
import { missionsFor } from "@/lib/ambassador/portal";
import { PortalForm, field, label } from "@/components/ambassador/PortalForm";
import { Card, PageTitle, Pill, usd } from "@/components/ambassador/ui";
import { submitProofAction } from "../../actions";

export const metadata = { title: "Missions" };

export default async function MissionsPage() {
  const me = await requireAmbassador();
  const missions = missionsFor(me.id);
  return (
    <>
      <PageTitle kicker="EARN MORE" title="Missions.">Do the task, send proof, get the reward. Rewards in dollars are added to your balance and paid with your next payout.</PageTitle>
      {missions.length === 0 && <Card><p className="body-lg">No missions right now. New ones appear here every month.</p></Card>}
      <div className="space-y-5">
        {missions.map((m) => {
          const open = m.status === "active" && (!m.mine || m.mine.status === "rejected");
          return (
            <Card key={m.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="mono mb-1">{m.month || "OPEN"}{m.status === "ended" ? " · ENDED" : ""}</p>
                  <h2 className="display text-[24px] md:text-[28px]">{m.title}</h2>
                </div>
                {m.mine && <Pill value={m.mine.status} />}
              </div>
              <p className="body-lg mt-3 whitespace-pre-line">{m.description}</p>
              <p className="mono mt-4">REWARD: {[m.reward_cents ? usd(m.reward_cents) : "", m.reward_text].filter(Boolean).join(" + ") || "—"}</p>
              {m.mine?.status === "rejected" && m.mine.admin_note && <p className="mt-3 rounded-2xl border border-[#FF5C7A]/50 bg-[#FF5C7A]/10 px-4 py-3 text-[17px] text-fg">Team note: {m.mine.admin_note}</p>}
              {m.mine?.status === "approved" && <p className="mt-3 text-[17px] text-fg">Approved. Nice work.</p>}
              {m.mine?.status === "submitted" && <p className="mt-3 text-[17px] text-fg">Proof received. We are reviewing it.</p>}
              {open && (
                <PortalForm action={submitProofAction} submit="SEND PROOF" className="mt-5">
                  <input type="hidden" name="mission_id" value={m.id} />
                  <div>
                    <label htmlFor={`u${m.id}`} className={label}>Link to your post</label>
                    <input id={`u${m.id}`} name="proof_url" type="url" maxLength={300} placeholder="https://instagram.com/p/…" className={field} />
                  </div>
                  <div>
                    <label htmlFor={`f${m.id}`} className={label}>Or a screenshot</label>
                    <input id={`f${m.id}`} name="screenshot" type="file" accept="image/jpeg,image/png,image/webp" className={`${field} py-3`} />
                  </div>
                </PortalForm>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
