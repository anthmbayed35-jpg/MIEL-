import { redirect } from "next/navigation";
import { getAdminState } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { MfaEnroll } from "@/components/admin/MfaEnroll";
import { logout } from "../../login/actions";
import { verifyLogin } from "./actions";

export const metadata = { title: "Two-factor authentication" };

export default async function MfaPage() {
  const st = await getAdminState();
  if (!st) redirect("/admin/login");
  if (st.mustChangePassword) redirect("/admin/change-password"); // password first, then two-factor
  if (st.mfa === "ok") redirect("/admin");
  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden px-5 py-10">
      <div className="admin-band" aria-hidden />
      <div className="admin-card w-full max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/miel-m-plus.png" alt="MIEL+" width={358} height={228} className="mb-8 h-11 w-auto" />
        {st.mfa === "verify" ? (
          <>
            <h1 className="display text-[28px]">Enter your code</h1>
            <p className="mt-2 mb-6 text-[16px] text-body">Open your authenticator app and type the 6-digit code for MIEL+. Lost your phone? Use one of your recovery codes instead.</p>
            <ActionForm action={verifyLogin} className="space-y-4">
              <input name="code" autoComplete="one-time-code" required autoFocus placeholder="123456" className="a-input text-center !text-[24px] tracking-[0.3em]" aria-label="6-digit code or recovery code" />
              <SubmitButton variant="lime" className="w-full">Verify</SubmitButton>
            </ActionForm>
          </>
        ) : (
          <>
            <h1 className="display text-[28px]">Turn on two-factor</h1>
            <p className="mt-2 mb-6 text-[16px] text-body">The store owner requires two-factor authentication for everyone on the team. Set it up once to continue.</p>
            <MfaEnroll />
          </>
        )}
        <form action={logout} className="mt-6 text-center"><button className="link inline-flex min-h-12 items-center px-3 text-[15px]">Sign out</button></form>
      </div>
    </main>
  );
}
