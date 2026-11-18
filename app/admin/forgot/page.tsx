import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { requestReset } from "../login/actions";

export const metadata = { title: "Reset password" };

export default function ForgotPage() {
  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden px-5 py-10">
      <div className="admin-band" aria-hidden />
      <div className="admin-card w-full max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/miel-m-plus.png" alt="MIEL+" width={358} height={228} className="mb-8 h-11 w-auto" />
        <h1 className="display text-[28px]">Reset password</h1>
        <p className="mt-2 mb-6 text-[16px] text-body">Enter your work email and we&apos;ll send a reset link.</p>
        <ActionForm action={requestReset} className="space-y-4">
          <label className="block">
            <span className="a-label">Email</span>
            <input name="email" type="email" required autoComplete="username" className="a-input" />
          </label>
          <SubmitButton variant="lime" className="w-full">Send reset link</SubmitButton>
          <p className="text-center text-[14px]"><Link href="/admin/login" className="link">Back to sign in</Link></p>
        </ActionForm>
      </div>
    </main>
  );
}
