import Link from "next/link";
import type { Metadata } from "next";
import { getCatalog } from "@/lib/catalog";
import { Header } from "@/components/Header";
import { Lineup } from "@/components/Lineup";
import { Footer } from "@/components/Sections";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "All products", alternates: { canonical: "/products" } };

const PAGE = 24;

/** Every active product, paginated (the home page shows only the first few). */
export default async function AllProducts({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const cat = await getCatalog();
  const sp = await searchParams;
  const pages = Math.max(1, Math.ceil(cat.products.length / PAGE));
  const page = Math.min(Math.max(1, Number(sp.page) || 1), pages);
  const slice = cat.products.slice((page - 1) * PAGE, page * PAGE);
  return (
    <>
      <Header products={cat.products} />
      <main className="pt-[104px] md:pt-[120px]">
        <Lineup
          id="lineup"
          products={slice}
          title={false}
          heading={
            <h1 className="display h-section mb-8">
              All products<span className="accent">.</span>
            </h1>
          }
        >
          {pages > 1 && (
            <nav className="mt-12 flex flex-wrap items-center justify-between gap-3" aria-label="Pagination">
              {page > 1 ? <Link href={`/products${page - 1 > 1 ? `?page=${page - 1}` : ""}`} className="btn btn-ghost">← PREVIOUS</Link> : <span />}
              <span className="mono">PAGE {page} / {pages}</span>
              {page < pages ? <Link href={`/products?page=${page + 1}`} className="btn btn-ghost">NEXT →</Link> : <span />}
            </nav>
          )}
        </Lineup>
      </main>
      <Footer store={cat.store} policies={cat.policies} />
    </>
  );
}
