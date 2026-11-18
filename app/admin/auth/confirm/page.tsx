import { safeNext } from "@/lib/cookies";
import { confirmLink } from "./actions";

export const metadata = { title: "Confirm" };

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string; next?: string }> }) {
  const sp = await searchParams;
  const valid = !!sp.token_hash && ["invite", "recovery", "email"].includes(sp.type ?? "");
  const invite = sp.type === "invite";
  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden px-5 py-10">
      <div className="admin-band" aria-hidden />
      <div className="admin-card w-full max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/miel-m-plus.png" alt="MIEL+" width={358} height={228} className="mb-8 h-11 w-auto" />
        <h1 className="display text-[28px]">{invite ? "Welcome to the team" : "Reset your password"}</h1>
        {valid ? (
          <form action={confirmLink} className="mt-6 space-y-4">
            <p className="text-[16px] text-body">{invite ? "Continue to choose your password." : "Continue to choose a new password."}</p>
            <input type="hidden" name="token_hash" value={sp.token_hash} />
            <input type="hidden" name="type" value={sp.type} />
            <input type="hidden" name="next" value={safeNext(sp.next, "/admin/set-password")} />
            <button className="pill-btn pill-lime w-full">Continue</button>
          </form>
        ) : (
          <p role="alert" className="mt-6 text-[16px] text-body">This link is incomplete or has expired. Ask for a new invite or reset.</p>
        )}
      </div>
    </main>
  );
}
