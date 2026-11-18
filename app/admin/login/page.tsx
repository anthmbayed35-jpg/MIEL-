import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/auth";
import { dbMode } from "@/lib/db";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { login } from "./actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getAdmin()) redirect("/admin");
  const mode = dbMode();
  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden px-5 py-10">
      <div className="admin-band" aria-hidden />
      <div className="admin-card w-full max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/miel-m-plus.png" alt="MIEL+" width={358} height={228} className="mb-8 h-11 w-auto" />
        <h1 className="display text-[30px]">Admin</h1>
        <p className="mt-2 mb-6 text-[16px] text-body">Sign in to run the store. Team members only.</p>

        {mode === "none" ? (
          <p role="alert" className="rounded-2xl border border-[#FF5C7A]/40 bg-[#FF5C7A]/10 p-4 text-[15px]">
            Admin isn&apos;t configured on this deployment. Add the Supabase environment variables (see <span className="mono">.env.example</span>) and redeploy.
          </p>
        ) : mode === "local" ? (
          <ActionForm action={login} className="space-y-3">
            <p className="mono !text-body">LOCAL DEMO MODE · no database connected</p>
            <p className="text-[15px] text-body">You&apos;re running without Supabase, so data is stored in a local file. Pick a role to try the admin.</p>
            <div className="grid gap-2 pt-1">
              <SubmitButton name="role" value="owner" variant="lime" className="w-full">Enter as owner</SubmitButton>
              <SubmitButton name="role" value="manager" variant="glass" className="w-full">Enter as manager</SubmitButton>
              <SubmitButton name="role" value="staff" variant="glass" className="w-full">Enter as staff</SubmitButton>
            </div>
          </ActionForm>
        ) : (
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
          </ActionForm>
        )}
      </div>
    </main>
  );
}
