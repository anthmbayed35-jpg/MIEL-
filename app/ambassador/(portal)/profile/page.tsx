import Link from "next/link";
import { requireAmbassador } from "@/lib/ambassador/auth";
import { getProgram } from "@/lib/program";
import { PortalForm, field, label } from "@/components/ambassador/PortalForm";
import { Card, PageTitle, day } from "@/components/ambassador/ui";
import { acceptTermsAction, changePasswordAction, profileAction } from "../../actions";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const me = await requireAmbassador();
  const program = getProgram();
  return (
    <>
      <PageTitle kicker="ACCOUNT" title="Profile." />
      <div className="space-y-6">
        <Card>
          <p id="details" className="mono mb-4">YOUR DETAILS</p>
          <PortalForm action={profileAction} submit="SAVE">
            <div>
              <label className={label}>Name</label>
              <p className="text-[18px] text-fg">{me.name} · {me.email}</p>
              <p className="mt-1 text-[14px] text-muted">To change your name or email, message the team.</p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label htmlFor="ph" className={label}>Phone / WhatsApp</label>
                <input id="ph" name="phone" defaultValue={me.phone} inputMode="tel" maxLength={30} className={field} />
              </div>
              <div>
                <label htmlFor="ig" className={label}>Instagram</label>
                <input id="ig" name="instagram" defaultValue={me.instagram_handle} maxLength={40} autoCapitalize="none" placeholder="yourhandle" className={field} />
              </div>
            </div>
            <div id="payout" className="grid gap-5 md:grid-cols-2">
              <div>
                <label htmlFor="pm" className={label}>Payout method</label>
                <input id="pm" name="payout_method" defaultValue={me.payout_method} maxLength={80} placeholder="Whish, OMT, bank, cash…" className={field} />
              </div>
              <div>
                <label htmlFor="pd" className={label}>Payout details</label>
                <input id="pd" name="payout_details" defaultValue={me.payout_details} maxLength={300} placeholder="Number or account to pay" className={field} />
              </div>
            </div>
            <label className="flex min-h-12 items-start gap-3 text-[17px] text-fg">
              <input type="checkbox" name="optout" defaultChecked={!!me.leaderboard_optout} className="mt-1 size-6 accent-[#DAFC69]" />
              <span>Hide me from the Top 10</span>
            </label>
          </PortalForm>
        </Card>

        <Card>
          <p id="terms" className="mono mb-3">TERMS</p>
          {me.terms_version === program.termsVersion ? (
            <p className="body-lg">You accepted version {me.terms_version} on {me.terms_accepted_at ? day(me.terms_accepted_at) : "–"}. <Link href="/ambassadors/terms" target="_blank" className="accent underline underline-offset-4">Read the terms</Link></p>
          ) : (
            <PortalForm action={acceptTermsAction} submit="ACCEPT">
              <label className="flex min-h-12 items-start gap-3 text-[17px] text-fg">
                <input type="checkbox" name="terms" className="mt-1 size-6 accent-[#DAFC69]" />
                <span>I accept the <Link href="/ambassadors/terms" target="_blank" className="accent underline underline-offset-4">ambassador terms</Link> (version {program.termsVersion}).</span>
              </label>
            </PortalForm>
          )}
        </Card>

        <Card>
          <p className="mono mb-4">CHANGE PASSWORD</p>
          <PortalForm action={changePasswordAction} submit="CHANGE PASSWORD">
            <div>
              <label htmlFor="cp" className={label}>Current password</label>
              <input id="cp" name="current" type="password" required autoComplete="current-password" maxLength={200} className={field} />
            </div>
            <div>
              <label htmlFor="np" className={label}>New password (12+ characters)</label>
              <input id="np" name="next" type="password" required minLength={12} autoComplete="new-password" maxLength={200} className={field} />
            </div>
            <div>
              <label htmlFor="nc" className={label}>Repeat new password</label>
              <input id="nc" name="confirm" type="password" required minLength={12} autoComplete="new-password" maxLength={200} className={field} />
            </div>
          </PortalForm>
        </Card>
      </div>
    </>
  );
}
