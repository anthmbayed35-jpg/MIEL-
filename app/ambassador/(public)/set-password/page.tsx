import Link from "next/link";
import { tokenInfo } from "@/lib/ambassador/auth";
import { getProgram } from "@/lib/program";
import { setPasswordAction } from "../../actions";
import { Blobs } from "@/components/Blobs";
import { PortalForm, field, label } from "@/components/ambassador/PortalForm";

export const metadata = { title: "Set your password" };

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const info = tokenInfo(token);
  const program = getProgram();
  return (
    <main className="relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "-10%", y: "0%" }, { x: "65%", y: "40%", delay: -9 }]} />
      <div className="mx-auto max-w-md px-5 pb-20 pt-10 md:pt-20">
        <p className="mono mb-3">AMBASSADOR PORTAL</p>
        {info.state === "ok" ? (
          <>
            <h1 className="display h-section">{info.kind === "invite" ? "Welcome." : "New password."}</h1>
            <p className="body-lg mt-3">{info.kind === "invite" ? `Hi ${info.name.split(" ")[0]}, choose a password to open your portal.` : "Choose a new password."} At least 12 characters.</p>
            <PortalForm action={setPasswordAction} submit={info.kind === "invite" ? "OPEN MY PORTAL" : "SAVE PASSWORD"} className="glass mt-8 p-5 md:p-8">
              <input type="hidden" name="token" value={token} />
              <div>
                <label htmlFor="pw" className={label}>Password</label>
                <input id="pw" name="password" type="password" required minLength={12} maxLength={200} autoComplete="new-password" className={field} />
              </div>
              <div>
                <label htmlFor="cf" className={label}>Repeat password</label>
                <input id="cf" name="confirm" type="password" required minLength={12} maxLength={200} autoComplete="new-password" className={field} />
              </div>
              {info.kind === "invite" && (
                <label className="flex min-h-12 items-start gap-3 text-[17px] text-fg">
                  <input type="checkbox" name="terms" required className="mt-1 size-6 accent-[#DAFC69]" />
                  <span>I agree to the <Link href="/ambassadors/terms" target="_blank" className="accent underline underline-offset-4">ambassador terms</Link> (version {program.termsVersion}).</span>
                </label>
              )}
            </PortalForm>
          </>
        ) : (
          <>
            <h1 className="display h-section">{info.state === "used" ? "Link used." : "Link expired."}</h1>
            <p className="body-lg mt-3">{info.state === "used" ? "This link was already used. Log in, or ask the team for a new one." : "This link is not valid any more. Ask the MIEL+ team for a new one."}</p>
            <Link href="/ambassador/login" className="btn mt-8">GO TO LOG IN</Link>
          </>
        )}
      </div>
    </main>
  );
}
