import { requirePerm } from "@/lib/auth";
import { dbMode, getDb, must, type Row } from "@/lib/db";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { Card, Field, PageHeader, SectionTitle } from "@/components/admin/ui";
import { SETTINGS_TABS, SubNav } from "@/components/admin/SubNav";
import { addMember, setActive, setRole } from "./actions";

export const metadata = { title: "Team" };

const ROLE_HELP = [
  ["Owner", "Everything, including settings, team and demo data."],
  ["Manager", "Orders, products, inventory, customers, discounts, shipping, marketing, content, analytics."],
  ["Staff", "Orders, customers, inventory and viewing products. No pricing, discounts or settings."],
];

export default async function TeamPage() {
  const admin = await requirePerm("team.manage");
  const members = (must(await getDb().from("admin_users").select("*")) as Row[]).sort((a, b) => a.email.localeCompare(b.email));
  return (
    <>
      <PageHeader eyebrow="Who can sign in" title="Team" />
      <SubNav items={SETTINGS_TABS} role={admin.role} />
      {dbMode() === "local" && <p className="mb-5 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-[14px] text-body">Local demo mode: team rows are stored locally and nobody can sign in with a password. On Supabase, adding a member also creates their login.</p>}
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <SectionTitle>Members</SectionTitle>
          {members.length === 0 && <p className="text-[15px] text-body">No team members listed yet (the demo owner isn&apos;t stored here).</p>}
          <ul className="space-y-3">
            {members.map((m) => (
              <li key={m.id} className="admin-card-flat flex flex-wrap items-center justify-between gap-3 p-4">
                <div><p className="text-[16px] font-semibold text-fg">{m.name || m.email}{m.id === admin.id && <span className="mono !text-body ml-2">YOU</span>}</p><p className="text-[13px] text-body">{m.email}</p></div>
                <div className="flex flex-wrap items-center gap-2">
                  <ActionForm action={setRole} className="flex gap-2">
                    <input type="hidden" name="id" value={m.id} />
                    <select name="role" defaultValue={m.role} className="a-input !w-36" aria-label={`Role for ${m.email}`}><option>owner</option><option>manager</option><option>staff</option></select>
                    <SubmitButton variant="glass" className="!min-h-10">Set</SubmitButton>
                  </ActionForm>
                  <ActionForm action={setActive}>
                    <input type="hidden" name="id" value={m.id} /><input type="hidden" name="active" value={m.active ? "0" : "1"} />
                    <SubmitButton variant={m.active ? "danger" : "lime"} confirm={m.active ? `Deactivate ${m.email}? They will no longer be able to sign in.` : undefined} className="!min-h-10">{m.active ? "Deactivate" : "Reactivate"}</SubmitButton>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-5">
          <Card>
            <SectionTitle>Add a team member</SectionTitle>
            <ActionForm action={addMember} resetOnSuccess className="space-y-4">
              <Field label="Name"><input name="name" className="a-input" /></Field>
              <Field label="Email"><input name="email" type="email" required className="a-input" /></Field>
              <Field label="Role"><select name="role" defaultValue="staff" className="a-input"><option>staff</option><option>manager</option><option>owner</option></select></Field>
              <SubmitButton variant="lime">Add member</SubmitButton>
            </ActionForm>
          </Card>
          <Card flat>
            <p className="display text-[15px]">Roles</p>
            <ul className="mt-3 space-y-2 text-[14px] text-body">{ROLE_HELP.map(([r, t]) => <li key={r}><b className="text-fg">{r}:</b> {t}</li>)}</ul>
          </Card>
        </div>
      </div>
    </>
  );
}
