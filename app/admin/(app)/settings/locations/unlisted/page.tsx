import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { listUnlisted, regionChoices, unlistedCount } from "@/lib/locations";
import { settingsTabs } from "@/lib/admin-tabs";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { SubNav } from "@/components/admin/SubNav";
import { Card, Empty, Field, PageHeader, SectionTitle } from "@/components/admin/ui";
import { approveUnlistedAction, dismissUnlistedAction, mergeUnlistedAction } from "./actions";

export const metadata = { title: "Unlisted areas" };
export const dynamic = "force-dynamic";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Beirut", day: "numeric", month: "short", year: "numeric" }) : "—");

/** Areas customers typed because theirs was not in the list. Orders are never blocked: approve it as a new region, or merge it into an existing one. */
export default async function UnlistedPage() {
  const admin = await requirePerm("shipping.manage");
  const pending = listUnlisted("pending");
  const decided = listUnlisted("done", 30);
  return (
    <>
      <PageHeader eyebrow="What customers typed" title="Unlisted areas" />
      <SubNav items={settingsTabs(unlistedCount())} role={admin.role} />
      <Card className="mb-5">
        <p className="text-[16px] text-body">
          When a customer cannot find their area, they type its name and choose the district; their order is placed normally with that text. Approve it as a new region (it appears for everyone at once) or merge it into an existing region (the spelling becomes an alias). Orders already placed are linked to the region you choose.
        </p>
      </Card>

      {pending.length === 0 ? (
        <Card><Empty title="Nothing waiting." hint="Areas customers add will appear here, with how many orders used them." /></Card>
      ) : (
        <div className="space-y-4">
          {pending.map((u) => (
            <Card key={u.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[22px] font-semibold text-fg" data-testid="unlisted-text">{u.text}</p>
                  <p className="mt-1 text-[15px] text-body">{u.district}, {u.governorate} · first seen {day(u.created_at)}</p>
                </div>
                <span className="status st-packed">{u.orders} order{u.orders === 1 ? "" : "s"}</span>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <ActionForm action={approveUnlistedAction} className="space-y-3 rounded-2xl bg-white/5 p-4">
                  <input type="hidden" name="id" value={u.id} />
                  <p className="a-label">Approve as a new region of {u.district}</p>
                  <Field label="Name (English)"><input name="name_en" required minLength={2} maxLength={80} defaultValue={u.text} className="a-input" /></Field>
                  <Field label="Arabic name (optional)"><input name="name_ar" maxLength={80} dir="rtl" lang="ar" className="a-input" /></Field>
                  <SubmitButton variant="lime">Approve as new region</SubmitButton>
                </ActionForm>
                <ActionForm action={mergeUnlistedAction} className="space-y-3 rounded-2xl bg-white/5 p-4">
                  <input type="hidden" name="id" value={u.id} />
                  <p className="a-label">Merge into an existing region of {u.district}</p>
                  <Field label="Region">
                    <select name="region" required defaultValue="" className="a-input">
                      <option value="" disabled>Choose a region</option>
                      {regionChoices(u.district_id).map((r) => <option key={r.id} value={r.id}>{r.name_en}</option>)}
                    </select>
                  </Field>
                  <SubmitButton variant="glass">Merge as an alias</SubmitButton>
                </ActionForm>
              </div>
              <ActionForm action={dismissUnlistedAction} className="mt-3">
                <input type="hidden" name="id" value={u.id} />
                <SubmitButton variant="glass" confirm={`Dismiss "${u.text}"? Its orders keep the text the customer typed.`}>Dismiss (not a real area)</SubmitButton>
              </ActionForm>
            </Card>
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <Card className="mt-6">
          <SectionTitle>Decided</SectionTitle>
          <ul className="space-y-2 text-[16px] text-body">
            {decided.map((u) => (
              <li key={u.id}>
                <span className="text-fg">{u.text}</span> · {u.district} · {u.status}
                {u.region_id ? <> → <Link className="link inline-flex min-h-12 min-w-12 items-center justify-center" href={`/admin/settings/locations?q=${encodeURIComponent(u.text)}`}>region</Link></> : null} · {u.orders} order{u.orders === 1 ? "" : "s"}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
