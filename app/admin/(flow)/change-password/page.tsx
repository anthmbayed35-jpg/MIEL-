import { redirect } from "next/navigation";
import { getAdminState } from "@/lib/auth";
import { PASSWORD_MIN } from "@/lib/security";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { logout } from "../../login/actions";
import { forceChangePassword } from "./actions";

export const metadata = { title: "Choose your password" };
export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const st = await getAdminState();
  if (!st) redirect("/admin/login");
  if (!st.mustChangePassword) redirect("/admin");
  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden px-5 py-10">
      <div className="admin-band" aria-hidden />
      <div className="admin-card w-full max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/miel-m-plus.png" alt="MIEL+" width={358} height={228} className="mb-8 h-11 w-auto" />
        <h1 className="display text-[28px]">Choose your own password</h1>
        <p className="mt-2 mb-6 text-[16px] text-body">
          You signed in with a temporary password. Replace it now: at least {PASSWORD_MIN} characters with letters and numbers (a passphrase of several words is ideal). Next you will set up two-factor authentication.
        </p>
        <ActionForm action={forceChangePassword} className="space-y-4">
          <label className="block"><span className="a-label">New password</span><input name="password" type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" className="a-input" /></label>
          <label className="block"><span className="a-label">Repeat it</span><input name="confirm" type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" className="a-input" /></label>
          <SubmitButton variant="lime" className="w-full">Save and continue</SubmitButton>
        </ActionForm>
        <form action={logout} className="mt-6 text-center"><button className="link inline-flex min-h-12 items-center px-3 text-[15px]">Sign out</button></form>
      </div>
    </main>
  );
}
