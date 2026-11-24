import Link from "next/link";
import { redirect } from "next/navigation";
import { getAmbassador } from "@/lib/ambassador/auth";
import { loginAction } from "../../actions";
import { Blobs } from "@/components/Blobs";
import { PortalForm, field, label } from "@/components/ambassador/PortalForm";

export const metadata = { title: "Log in" };

export default async function LoginPage() {
  if (await getAmbassador()) redirect("/ambassador");
  return (
    <main className="relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "-10%", y: "0%" }, { x: "65%", y: "40%", delay: -9 }]} />
      <div className="mx-auto max-w-md px-5 pb-20 pt-10 md:pt-20">
        <Link href="/ambassadors" className="mono">← MIEL+ AMBASSADORS</Link>
        <p className="mono mb-3 mt-10">AMBASSADOR PORTAL</p>
        <h1 className="display h-section">Log in.</h1>
        <PortalForm action={loginAction} submit="LOG IN" className="glass mt-8 p-5 md:p-8">
          <div>
            <label htmlFor="em" className={label}>Email</label>
            <input id="em" name="email" type="email" required autoComplete="email" maxLength={120} className={field} />
          </div>
          <div>
            <label htmlFor="pw" className={label}>Password</label>
            <input id="pw" name="password" type="password" required autoComplete="current-password" maxLength={200} className={field} />
          </div>
        </PortalForm>
        <p className="body-lg mt-6 text-[16px]">Forgot your password? Message the MIEL+ team and we will send you a reset link. Not an ambassador yet? <Link href="/ambassadors#apply" className="accent underline underline-offset-4">Apply here</Link>.</p>
      </div>
    </main>
  );
}
