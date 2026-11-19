import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminState } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { login } from "./actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string; error?: string }> }) {
  const st = await getAdminState();
  if (st) redirect(st.mustChangePassword ? "/admin/change-password" : st.mfa === "ok" ? "/admin" : "/admin/mfa");
  const sp = await searchParams;
  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden px-5 py-10">
      <div className="admin-band" aria-hidden />
      <div className="admin-card w-full max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/miel-m-plus.png" alt="MIEL+" width={358} height={228} className="mb-8 h-11 w-auto" />
        <h1 className="display text-[30px]">Admin</h1>
        <p className="mt-2 mb-6 text-[16px] text-body">Sign in to run the store. Team members only.</p>
        {sp.expired && <p role="status" className="mb-4 rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-[15px]">You were signed out after a long break. Sign in again.</p>}
        {sp.error && <p role="alert" className="mb-4 rounded-2xl border border-[#FF5C7A]/50 bg-[#FF5C7A]/10 px-4 py-3 text-[15px]">That link is invalid or has expired. Ask for a new one.</p>}

        <ActionForm action={login} className="space-y-4">
            <label className="block">
              <span className="a-label">Email</span>
              <input name="email" type="email" required autoComplete="username" className="a-input" />
            </label>
            <label className="block">
              <span className="a-label">Password</span>
              <input name="password" type="password" required autoComplete="current-password" className="a-input" />
            </label>
            <SubmitButton variant="lime" className="w-full">Sign in</SubmitButton>
            <p className="text-center text-[14px]"><Link href="/admin/forgot" className="link">Forgot your password?</Link></p>
          </ActionForm>
      </div>
    </main>
  );
}
