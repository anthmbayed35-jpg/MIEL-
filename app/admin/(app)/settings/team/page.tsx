import { requirePerm } from "@/lib/auth";
import { getDb, must, type Row } from "@/lib/db";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { Card, Field, PageHeader, SectionTitle } from "@/components/admin/ui";
import { SETTINGS_TABS, SubNav } from "@/components/admin/SubNav";
import { pendingInvites } from "@/lib/invites";
import { cancelInvite, inviteMember, resetMfa, sendReset, setActive, setRole } from "./actions";

export const metadata = { title: "Team" };

const ROLE_HELP = [
  ["Owner", "Everything, including settings, team, exports and deleting."],
  ["Manager", "Orders, products, inventory, customers, discounts, shipping, marketing, content, analytics, exports. Cannot change team or settings, and cannot delete."],
  ["Staff", "Orders, customers, inventory and viewing products. No pricing, discounts, exports, settings or team."],
];

export default async function TeamPage() {
  const admin = await requirePerm("team.manage");
  const members = (must(await getDb().from("admin_users").select("*")) as Row[]).sort((a, b) => a.email.localeCompare(b.email));
  const invites = pendingInvites();
  return (
    <>
      <PageHeader eyebrow="Who can sign in" title="Team" />
      <SubNav items={SETTINGS_TABS} role={admin.role} />
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <SectionTitle>Members</SectionTitle>
          <ul className="space-y-3">
            {members.map((m) => (
              <li key={m.id} className="admin-card-flat flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-[16px] font-semibold text-fg">{m.name || m.email}{m.id === admin.id && <span className="mono !text-body ml-2">YOU</span>}{!m.active && <span className="status st-cancelled ml-2">Inactive</span>}</p>
                  <p className="text-[13px] text-body">{m.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ActionForm action={setRole} className="flex gap-2">
                    <input type="hidden" name="id" value={m.id} />
                    <select name="role" defaultValue={m.role} className="a-input !w-36" aria-label={`Role for ${m.email}`}><option>owner</option><option>manager</option><option>staff</option></select>
                    <SubmitButton variant="glass" className="!min-h-10">Set</SubmitButton>
                  </ActionForm>
                  {m.active && <ActionForm action={resetMfa}><input type="hidden" name="id" value={m.id} /><SubmitButton variant="glass" confirm={`Remove two-factor for ${m.email}? They set it up again at next sign-in.`} className="!min-h-10">Reset 2FA</SubmitButton></ActionForm>}
                  {m.active && <ActionForm action={sendReset}><input type="hidden" name="id" value={m.id} /><SubmitButton variant="glass" className="!min-h-10">Send reset link</SubmitButton></ActionForm>}
                  <ActionForm action={setActive}>
                    <input type="hidden" name="id" value={m.id} /><input type="hidden" name="active" value={m.active ? "0" : "1"} />
                    <SubmitButton variant={m.active ? "danger" : "lime"} confirm={m.active ? `Deactivate ${m.email}? They are locked out immediately.` : undefined} className="!min-h-10">{m.active ? "Deactivate" : "Reactivate"}</SubmitButton>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
          {invites.length > 0 && (
            <>
              <SectionTitle>Pending invites</SectionTitle>
              <ul className="space-y-2" aria-label="Pending invites">
                {invites.map((i) => (
                  <li key={i.id} className="admin-card-flat flex flex-wrap items-center justify-between gap-3 p-3 text-[14px]">
                    <span className="text-body"><b className="text-fg">{i.email}</b> · {i.role} · expires {new Date(i.expires_at).toLocaleString("en-GB", { timeZone: "Asia/Beirut" })}</span>
                    <ActionForm action={cancelInvite}><input type="hidden" name="id" value={i.id} /><SubmitButton variant="danger" className="!min-h-9">Cancel</SubmitButton></ActionForm>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
        <div className="space-y-5">
          <Card>
            <SectionTitle>Invite a team member</SectionTitle>
            <ActionForm action={inviteMember} resetOnSuccess className="space-y-4">
              <Field label="Name"><input name="name" className="a-input" /></Field>
              <Field label="Email"><input name="email" type="email" required className="a-input" /></Field>
              <Field label="Role"><select name="role" defaultValue="staff" className="a-input"><option>staff</option><option>manager</option><option>owner</option></select></Field>
              <SubmitButton variant="lime">Send invite</SubmitButton>
              <p className="text-[13px] text-muted">They get an email and choose their own password. There is no public sign-up.</p>
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
