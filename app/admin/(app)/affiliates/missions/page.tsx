import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { newApplicationCount } from "@/lib/affiliates";
import { listMissions, listSubmissions } from "@/lib/ambassador/admin";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { SubNav } from "@/components/admin/SubNav";
import { affiliateTabs } from "@/lib/admin-tabs";
import { Card, Empty, Field, PageHeader, SectionTitle } from "@/components/admin/ui";
import { reviewSubmissionAction, saveMissionAction, setMissionStatusAction } from "../program/actions";

export const metadata = { title: "Ambassador missions" };
export const dynamic = "force-dynamic";

const month = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" }).slice(0, 7);

export default async function MissionsAdminPage() {
  const admin = await requirePerm("affiliates.read");
  const missions = listMissions();
  const proofs = listSubmissions("submitted");
  return (
    <>
      <PageHeader eyebrow="Ambassador program" title="Missions" />
      <SubNav items={affiliateTabs(newApplicationCount())} role={admin.role} />

      <Card className="mb-5">
        <SectionTitle>Proofs to review ({proofs.length})</SectionTitle>
        {proofs.length === 0 ? (
          <Empty title="No proofs waiting." />
        ) : (
          <ul className="space-y-4">
            {proofs.map((s) => (
              <li key={s.id} className="rounded-2xl bg-white/5 p-4">
                <p className="text-[17px] text-fg"><Link href={`/admin/affiliates/${s.affiliate_id}`} className="inline-flex min-h-12 items-center underline underline-offset-4">{s.name}</Link> <span className="mono !text-[13px]">{s.code}</span> · {s.mission_title}</p>
                <p className="mt-1 text-[15px] text-body">
                  {s.proof_url && <a href={s.proof_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-12 items-center text-fg underline underline-offset-4">Open post</a>}
                  {s.proof_url && s.proof_file && " · "}
                  {s.proof_file && <a href={`/ambassador/files/proofs/${s.proof_file}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center text-fg underline underline-offset-4">Open screenshot</a>}
                </p>
                <ActionForm action={reviewSubmissionAction} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <input type="hidden" name="id" value={s.id} />
                  <input name="note" maxLength={300} placeholder="Note (required to reject)" className="a-input" aria-label="Note" />
                  <button name="decision" value="approve" className="pill-btn pill-lime">Approve</button>
                  <button name="decision" value="reject" className="pill-btn pill-glass">Reject</button>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mb-5">
        <SectionTitle>New mission</SectionTitle>
        <ActionForm action={saveMissionAction} resetOnSuccess className="grid gap-4 lg:grid-cols-2">
          <Field label="Title"><input name="title" required minLength={3} maxLength={100} className="a-input" /></Field>
          <Field label="Month" hint="Optional, like 2026-12"><input name="month" defaultValue={month()} pattern="\d{4}-(0[1-9]|1[0-2])" className="a-input" /></Field>
          <Field label="What to do" className="lg:col-span-2"><textarea name="description" rows={3} maxLength={800} className="a-input" /></Field>
          <Field label="Reward ($)" hint="Added to their balance when you approve"><input name="reward" type="number" min={0} max={1000} step="0.5" defaultValue={0} className="a-input" /></Field>
          <Field label="Extra reward (text)" hint="e.g. a free pouch"><input name="reward_text" maxLength={120} className="a-input" /></Field>
          <div className="lg:col-span-2"><SubmitButton variant="lime">Create mission</SubmitButton></div>
        </ActionForm>
      </Card>

      <Card>
        <SectionTitle>All missions</SectionTitle>
        {missions.length === 0 ? (
          <Empty title="No missions yet." />
        ) : (
          <ul className="space-y-3">
            {missions.map((m) => (
              <li key={m.id} className="rounded-2xl bg-white/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[18px] font-semibold text-fg">{m.title}</p>
                    <p className="text-[15px] text-body">{m.month || "open"} · ${(m.reward_cents / 100).toFixed(2)}{m.reward_text ? ` + ${m.reward_text}` : ""} · {m.submitted} waiting · {m.approved} approved</p>
                  </div>
                  <span className={`status ${m.status === "active" ? "st-delivered" : "st-cancelled"}`}>{m.status}</span>
                </div>
                <ActionForm action={setMissionStatusAction} className="mt-3">
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="status" value={m.status === "active" ? "ended" : "active"} />
                  <SubmitButton variant="glass" confirm={m.status === "active" ? `End "${m.title}"? Ambassadors can no longer send proof.` : undefined}>{m.status === "active" ? "End mission" : "Reopen"}</SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
