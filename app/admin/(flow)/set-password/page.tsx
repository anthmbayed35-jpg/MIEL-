import { redirect } from "next/navigation";
import { getAdminState } from "@/lib/auth";
import { PASSWORD_MIN } from "@/lib/security";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { setPassword } from "./actions";

export const metadata = { title: "Choose your password" };

export default async function SetPasswordPage() {
  const st = await getAdminState();
  if (!st) redirect("/admin/login?error=link");
  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden px-5 py-10">
      <div className="admin-band" aria-hidden />
      <div className="admin-card w-full max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/miel-m-plus.png" alt="MIEL+" width={358} height={228} className="mb-8 h-11 w-auto" />
        <h1 className="display text-[28px]">Choose your password</h1>
        <p className="mt-2 mb-6 text-[16px] text-body">At least {PASSWORD_MIN} characters. A passphrase of several words is ideal. Nobody else ever sees it.</p>
        <ActionForm action={setPassword} className="space-y-4">
          <label className="block"><span className="a-label">New password</span><input name="password" type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" className="a-input" /></label>
          <label className="block"><span className="a-label">Repeat it</span><input name="confirm" type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" className="a-input" /></label>
          <SubmitButton variant="lime" className="w-full">Save and continue</SubmitButton>
        </ActionForm>
      </div>
    </main>
  );
}
