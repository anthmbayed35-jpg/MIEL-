import Link from "next/link";
import { redirect } from "next/navigation";
import { getAmbassador, tokenInfo } from "@/lib/ambassador/auth";
import { getProgram } from "@/lib/program";
import { Blobs } from "@/components/Blobs";

export const metadata = { title: "Ambassador terms" };

/** The ambassador terms. Private: only for a signed-in ambassador or someone holding a valid invite or reset link. */
export default async function PortalTermsPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const me = await getAmbassador();
  if (!me && tokenInfo(token).state !== "ok") redirect("/ambassador/login");
  const p = getProgram();
  return (
    <main className="relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "-10%", y: "0%" }, { x: "65%", y: "30%", delay: -9 }]} />
      <div className="mx-auto max-w-3xl px-5 pb-24 pt-10 md:px-8 md:pt-16">
        <Link href={me ? "/ambassador/profile" : "/ambassador/login"} className="mono !text-body">← BACK</Link>
        <h1 className="display h-section mt-4">Ambassador terms</h1>
        <p className="mono mt-3">VERSION {p.termsVersion}</p>
        <div className="mt-8 space-y-5">
          {p.termsText.split(/\n\s*\n/).map((para, i) => (
            <p key={i} className="body-lg whitespace-pre-line">{para}</p>
          ))}
        </div>
      </div>
    </main>
  );
}
