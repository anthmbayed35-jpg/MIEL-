import Link from "next/link";
import { getCatalog } from "@/lib/catalog";
import { getProgram } from "@/lib/program";
import { Blobs } from "@/components/Blobs";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Sections";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ambassador terms", alternates: { canonical: "/ambassadors/terms" } };

/** The current ambassador terms, exactly as the team wrote them in the admin (with their version number). */
export default async function TermsPage() {
  const cat = await getCatalog();
  const p = getProgram();
  return (
    <>
      <Header />
      <main className="relative isolate overflow-x-clip">
        <Blobs spots={[{ x: "-10%", y: "0%" }, { x: "65%", y: "30%", delay: -9 }]} />
        <div className="mx-auto max-w-3xl px-5 pb-24 pt-[130px] md:px-8 md:pt-[150px]">
          <Link href="/ambassadors" className="mono !text-body">← AMBASSADORS</Link>
          <h1 className="display h-section mt-4">Ambassador terms</h1>
          <p className="mono mt-3">VERSION {p.termsVersion}</p>
          <div className="mt-8 space-y-5">
            {p.termsText.split(/\n\s*\n/).map((para, i) => (
              <p key={i} className="body-lg whitespace-pre-line">{para}</p>
            ))}
          </div>
        </div>
      </main>
      <Footer store={cat.store} policies={cat.policies} />
    </>
  );
}
