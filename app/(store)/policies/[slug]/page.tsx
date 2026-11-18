import Link from "next/link";
import { notFound } from "next/navigation";
import { getCatalog } from "@/lib/catalog";
import { Header } from "@/components/Header";
import { Blobs } from "@/components/Blobs";
import { Footer } from "@/components/Sections";

const TITLES: Record<string, string> = { shipping: "Shipping policy", returns: "Returns & refunds", privacy: "Privacy policy", terms: "Terms of service" };

export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams() {
  return Object.keys(TITLES).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: TITLES[slug] ?? "Policy" };
}

export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cat = await getCatalog();
  const text = cat.policies[slug as keyof typeof cat.policies]?.trim();
  if (!TITLES[slug] || !text) notFound();
  return (
    <>
      <Header />
      <main className="relative isolate overflow-x-clip">
        <Blobs spots={[{ x: "-10%", y: "0%" }, { x: "65%", y: "30%", delay: -9 }]} />
        <div className="mx-auto max-w-3xl px-5 pb-24 pt-[130px] md:px-8 md:pt-[150px]">
          <Link href="/" className="mono !text-body">← HOME</Link>
          <h1 className="display h-section mt-4">{TITLES[slug]}</h1>
          <div className="mt-8 space-y-5">
            {text.split(/\n\s*\n/).map((para, i) => (
              <p key={i} className="body-lg whitespace-pre-line">{para}</p>
            ))}
          </div>
        </div>
      </main>
      <Footer store={cat.store} policies={cat.policies} />
    </>
  );
}
