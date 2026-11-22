import Link from "next/link";
import { peekToken } from "@/lib/invites";
import { PASSWORD_MIN } from "@/lib/security";
import { ActionForm, SubmitButton } from "@/components/admin/ActionForm";
import { setPassword } from "./actions";

export const metadata = { title: "Choose your password" };
export const dynamic = "force-dynamic";

/** Public page: its only credential is the single-use token in the link. Opening the page does not use the token up. */
export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; type?: string }> }) {
  const sp = await searchParams;
  const kind = sp.type === "invite" ? "invite" : "reset";
  const peek = peekToken(kind, sp.token);
  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden px-5 py-10">
      <div className="admin-band" aria-hidden />
      <div className="admin-card w-full max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/miel-m-plus.png" alt="MIEL+" width={358} height={228} className="mb-8 h-11 w-auto" />
        {peek ? (
          <>
            <h1 className="display text-[28px]">{kind === "invite" ? "Welcome to the team" : "Choose a new password"}</h1>
            <p className="mt-2 mb-6 text-[16px] text-body">{peek.email}. At least {PASSWORD_MIN} characters. A passphrase of several words is ideal. Nobody else ever sees it.</p>
            <ActionForm action={setPassword} className="space-y-4">
              <input type="hidden" name="token" value={sp.token} />
              <input type="hidden" name="type" value={kind} />
              <label className="block"><span className="a-label">New password</span><input name="password" type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" className="a-input" /></label>
              <label className="block"><span className="a-label">Repeat it</span><input name="confirm" type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" className="a-input" /></label>
              <SubmitButton variant="lime" className="w-full">Save and sign in</SubmitButton>
            </ActionForm>
          </>
        ) : (
          <>
            <h1 className="display text-[28px]">Link expired</h1>
            <p role="alert" className="mt-4 text-[16px] text-body">This link is invalid, was already used, or has expired. Ask for a new invite or password reset.</p>
            <p className="mt-6 text-[14px]"><Link href="/admin/login" className="link inline-flex min-h-12 items-center px-2 text-[15px]">Back to sign in</Link></p>
          </>
        )}
      </div>
    </main>
  );
}
