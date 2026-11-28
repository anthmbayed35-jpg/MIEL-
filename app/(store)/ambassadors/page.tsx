import { getCatalog } from "@/lib/catalog";
import { ApplyForm } from "@/components/ApplyForm";
import { Blobs } from "@/components/Blobs";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Sections";

export const dynamic = "force-dynamic";

// Deliberately nothing here about how the program works: the team explains it on WhatsApp after the application.
export const metadata = {
  title: "Become a Miel+ Ambassador",
  description: "Athletes and creators who train: apply to become a MIEL+ ambassador.",
  alternates: { canonical: "/ambassadors" },
};

export default async function AmbassadorsPage() {
  const cat = await getCatalog();
  return (
    <>
      <Header products={cat.products} />
      <main>
        <section id="apply" className="relative isolate overflow-x-clip">
          <Blobs spots={[{ x: "-10%", y: "0%" }, { x: "62%", y: "35%", delay: -9 }]} />
          <div className="mx-auto max-w-3xl px-5 pb-20 pt-[calc(var(--header-h,72px)+32px)] md:px-8 md:pb-28 md:pt-[calc(var(--header-h,88px)+48px)]">
            <p className="mono mb-3">AMBASSADORS</p>
            <h1 className="display h-hero">
              Become a <span className="accent">Miel+</span> Ambassador.
            </h1>
            <p className="body-lg mt-5 max-w-xl">
              We&apos;re looking for athletes and creators who train and share it. Tell us about you and we&apos;ll contact you on WhatsApp.
            </p>
            <div className="mt-8">
              <ApplyForm />
            </div>
          </div>
        </section>
      </main>
      <Footer store={cat.store} policies={cat.policies} />
    </>
  );
}
