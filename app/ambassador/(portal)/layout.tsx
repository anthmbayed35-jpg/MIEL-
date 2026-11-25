import Image from "next/image";
import Link from "next/link";
import { requireAmbassador } from "@/lib/ambassador/auth";
import { unreadCount } from "@/lib/ambassador/portal";
import { getProgram } from "@/lib/program";
import { acceptTermsAction, logoutAction } from "../actions";
import { Blobs } from "@/components/Blobs";
import { PortalNav } from "@/components/ambassador/PortalNav";
import { PortalForm } from "@/components/ambassador/PortalForm";

/** Every portal page starts here: no session, no page. Pages then read data only through the ambassador id this returns. */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAmbassador();
  const unread = unreadCount(me.id);
  const program = getProgram();
  const termsStale = me.terms_version !== program.termsVersion;
  return (
    <div className="relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "-10%", y: "0%" }, { x: "70%", y: "35%", delay: -9 }]} />
      <header className="glass-strong sticky top-3 z-40 mx-3 mt-3 flex items-center gap-3 rounded-[22px] px-3 py-2 md:mx-auto md:max-w-5xl">
        <Link href="/ambassador" aria-label="Portal home" className="shrink-0">
          <Image src="/brand/miel-m-plus.png" alt="MIEL+" width={44} height={44} className="h-9 w-auto md:h-11" />
        </Link>
        <p className="mono min-w-0 flex-1 truncate">{me.name.split(" ")[0]} · {me.code}</p>
        <Link href="/ambassador/news" className="icon-btn relative" aria-label={`Notifications${unread ? `, ${unread} new` : ""}`}>
          <span aria-hidden>🔔</span>
          {unread > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-acid px-1 text-[12px] font-bold text-black">{unread > 9 ? "9+" : unread}</span>}
        </Link>
        <form action={logoutAction}>
          <button className="btn-ghost !min-h-12 !w-auto px-4">LOG OUT</button>
        </form>
      </header>
      <PortalNav />
      <main className="mx-auto max-w-5xl px-5 pb-24 pt-6 md:px-8">
        {termsStale && (
          <section className="glass-accent mb-6 p-5">
            <p className="mono mb-2">TERMS UPDATED</p>
            <p className="body-lg mb-4">The ambassador terms changed (version {program.termsVersion}). Read them and accept to keep going.</p>
            <PortalForm action={acceptTermsAction} submit="ACCEPT">
              <label className="flex min-h-12 items-start gap-3 text-[17px] text-fg">
                <input type="checkbox" name="terms" className="mt-1 size-6 accent-[#DAFC69]" />
                <span>I accept the <Link href="/ambassador/terms" target="_blank" className="accent underline underline-offset-4">ambassador terms</Link>.</span>
              </label>
            </PortalForm>
          </section>
        )}
        {children}
      </main>
    </div>
  );
}
