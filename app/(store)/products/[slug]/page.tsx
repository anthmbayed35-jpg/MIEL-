import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCatalog } from "@/lib/catalog";
import { CURRENCY, SITE } from "@/config/site";
import { Header } from "@/components/Header";
import { Blobs } from "@/components/Blobs";
import { FinalCta, Footer } from "@/components/Sections";
import { Gallery } from "@/components/product/Gallery";
import { AddOneButton, BuyBox } from "@/components/product/BuyBox";
import {
  Breadcrumb,
  Chips,
  Compare,
  FlavorSwitcher,
  Inside,
  Notice,
  PouchBlock,
  PriceBlock,
  ProductFaq,
  ProductHowTo,
  TrustRow,
  Why,
} from "@/components/product/Sections";

type Props = { params: Promise<{ slug: string }> };

// Products added in the admin render on first request (then are cached); unknown slugs 404.
export const dynamicParams = true;
export const revalidate = 300;

export async function generateStaticParams() {
  return (await getCatalog()).products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = (await getCatalog()).products.find((x) => x.slug === slug);
  if (!p) return {};
  const title = p.seoTitle || `${p.name} ${p.descriptor}`;
  const description = p.seoDescription || `${p.description} ${p.sachetCount ?? 12} sachets per pouch. Delivered across Lebanon.`;
  return {
    title,
    description,
    alternates: { canonical: `/products/${p.slug}` },
    // og:image comes from ./opengraph-image.tsx
    openGraph: { title: `${title} | MIEL+`, description, type: "website", url: `/products/${p.slug}` },
    twitter: { card: "summary_large_image", title: `${title} | MIEL+`, description },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const cat = await getCatalog();
  const p = cat.products.find((x) => x.slug === slug);
  if (!p) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${p.name} ${p.descriptor}`,
    description: p.description,
    brand: { "@type": "Brand", name: SITE.name },
    image: p.images.length
      ? p.images.map((i) => `${SITE.url}${i.src}-1080.webp`)
      : `${SITE.url}/products/${p.slug}/opengraph-image`,
    url: `${SITE.url}/products/${p.slug}`,
    offers: {
      "@type": "Offer",
      price: p.price,
      priceCurrency: CURRENCY,
      availability: "https://schema.org/InStock",
      url: `${SITE.url}/products/${p.slug}`,
    },
  };

  return (
    <>
      <Header />
      {/* Bottom padding on mobile so the sticky bar never covers content */}
      <main className="pb-24 md:pb-0">
        <section className="relative isolate overflow-x-clip">
          <Blobs spots={[{ x: "-12%", y: "0%" }, { x: "60%", y: "50%", delay: -9 }]} />
          <div className="mx-auto max-w-7xl px-5 pb-14 pt-[112px] md:px-8 md:pt-[136px]">
            <Breadcrumb product={p} />
            <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
              <Gallery product={p} />
              <div>
                <h1 className="display text-[clamp(2.25rem,1.4rem+4vw,4.5rem)]">{p.name}</h1>
                <p className="mono mt-3 !text-[15px]">{p.descriptor}</p>
                <div className="mt-5">
                  <Chips product={p} />
                </div>
                <p className="body-lg mt-5 max-w-xl">{p.description}</p>
                <Notice product={p} />
                <div className="mt-6">
                  <PriceBlock product={p} />
                </div>
                <div className="mt-7">
                  <FlavorSwitcher current={p.slug} products={cat.products} />
                </div>
                <div className="mt-7">
                  <BuyBox product={p} />
                </div>
                <TrustRow />
              </div>
            </div>
          </div>
        </section>
        <PouchBlock product={p} />
        <Inside product={p} />
        <ProductHowTo product={p} />
        <Why product={p} />
        <Compare current={p.slug} products={cat.products} />
        <ProductFaq product={p} />
        <FinalCta action={<AddOneButton product={p} />} />
      </main>
      <Footer store={cat.store} policies={cat.policies} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
