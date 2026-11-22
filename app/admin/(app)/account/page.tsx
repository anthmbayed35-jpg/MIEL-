import { getAdminState, requireAdmin, sessionToken } from "@/lib/auth";
import { listSessions } from "@/lib/session";
import { PASSWORD_MIN } from "@/lib/security";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { MfaEnroll } from "@/components/admin/MfaEnroll";
import { RecoveryCodes } from "@/components/admin/RecoveryCodes";
import { Card, Field, PageHeader, SectionTitle } from "@/components/admin/ui";
import { logoutEverywhere } from "../../login/actions";
import { disableMfa } from "../../(flow)/mfa/actions";
import { changePassword, revokeSession } from "./actions";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const admin = await requireAdmin();
  const enabled = !!(await getAdminState())?.totpEnabled;
  const sessions = listSessions(admin.id, await sessionToken());
  return (
    <>
      <PageHeader eyebrow={`${admin.email} · ${admin.role}`} title="My account" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle>Change password</SectionTitle>
          <ActionForm action={changePassword} resetOnSuccess className="space-y-4">
            <Field label="Current password"><input name="current" type="password" required autoComplete="current-password" className="a-input" /></Field>
            <Field label="New password" hint={`At least ${PASSWORD_MIN} characters`}><input name="password" type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" className="a-input" /></Field>
            <Field label="Repeat new password"><input name="confirm" type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" className="a-input" /></Field>
            <SubmitButton variant="lime">Change password</SubmitButton>
          </ActionForm>
        </Card>
        <div className="space-y-5">
          <Card>
            <SectionTitle>Two-factor authentication</SectionTitle>
            {enabled ? (
              <>
              <ActionForm action={disableMfa} className="space-y-3">
                <p className="text-[15px] text-body"><span className="status st-delivered">On</span> You enter a code from your authenticator app at every sign-in.</p>
                <SubmitButton variant="danger" confirm="Turn off two-factor authentication for your account?">Turn off</SubmitButton>
              </ActionForm>
              <div className="mt-4 border-t border-white/10 pt-4"><RecoveryCodes /></div>
              </>
            ) : (
              <>
                <p className="mb-4 text-[15px] text-body">Adds a 6-digit code from your phone to every sign-in. Strongly recommended for owners.</p>
                <MfaEnroll />
              </>
            )}
          </Card>
          <Card>
            <SectionTitle>Sessions</SectionTitle>
            <p className="mb-3 text-[15px] text-body">You are signed out automatically after 12 hours without activity.</p>
            <ul className="mb-4 space-y-2" aria-label="Active sessions">
              {sessions.map((s) => (
                <li key={s.id} className="admin-card-flat flex flex-wrap items-center justify-between gap-2 p-3 text-[14px]">
                  <span className="text-body">
                    <b className="text-fg">{s.current ? "This browser" : "Other device"}</b> · {s.ip || "unknown IP"} · last active {new Date(s.lastSeenAt).toLocaleString("en-GB", { timeZone: "Asia/Beirut" })}
                    <br /><span className="text-[12px] text-muted">{s.userAgent.slice(0, 90)}</span>
                  </span>
                  {!s.current && (
                    <ActionForm action={revokeSession}><input type="hidden" name="id" value={s.id} /><SubmitButton variant="glass" className="!min-h-12 md:!min-h-9">Sign out</SubmitButton></ActionForm>
                  )}
                </li>
              ))}
            </ul>
            <form action={logoutEverywhere}><button className="pill-btn pill-danger">Sign out everywhere</button></form>
          </Card>
        </div>
      </div>
    </>
  );
}
