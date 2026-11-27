import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCatalog } from "@/lib/catalog";
import { CURRENCY, SITE } from "@/config/site";
import { sentence } from "@/config/copy";
import { Header } from "@/components/Header";
import { Blobs } from "@/components/Blobs";
import { Footer } from "@/components/Sections";
import { ClosingCta } from "@/components/HomeBlocks";
import { closingMedia, lifestyleFor } from "@/lib/media";
import { Gallery } from "@/components/product/Gallery";
import { AddOneButton, BuyBox } from "@/components/product/BuyBox";
import {
  Breadcrumb,
  BenefitBlocks,
  FlavorSwitcher,
  HeadlineBlock,
  IngredientBanner,
  Inside,
  Notice,
  OldVsSachet,
  PriceBlock,
  ProductFaq,
  ProductHowTo,
  TakeWhen,
  TrustRow,
  WhatYouGet,
  WhyToday,
} from "@/components/product/Sections";

type Props = { params: Promise<{ slug: string }> };

// Rendered per request from the database; unknown slugs 404.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = (await getCatalog()).products.find((x) => x.slug === slug);
  if (!p) return {};
  const tag = p.pageCopy?.tagline;
  const title = p.seoTitle || (tag ? `${p.name} | ${tag}` : `${p.name} ${p.descriptor}`);
  const description = p.seoDescription || `${tag ? `${sentence(tag)}. ` : ""}${p.description} ${p.sachetCount ?? 12} sachets per pouch. Delivered across Lebanon.`;
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

  // richer gallery: the supplied lifestyle pictures (4:5) follow the product photos; none are added while the files are missing
  const shots = lifestyleFor(p).flatMap((x, i) => (x.tall.kind === "file" ? [{ kind: "extra" as const, src: x.tall.slot.path, alt: `${p.name} lifestyle image ${i + 1}`, label: "LIFESTYLE" }] : []));
  const gallery = shots.length ? { ...p, images: [...p.images, ...shots] } : p;

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
      availability: p.soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
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
          <div className="mx-auto max-w-7xl px-5 pb-14 pt-[calc(var(--header-h,72px)+32px)] md:px-8 md:pt-[calc(var(--header-h,88px)+40px)]">
            <Breadcrumb product={p} />
            <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
              <div className="lg:sticky lg:top-[calc(var(--header-h,88px)+var(--preview-h,0px)+28px)] lg:self-start"><Gallery product={gallery} /></div>
              <div>
                <h1 className="display text-[clamp(2.25rem,1.4rem+4vw,4.5rem)]">{p.name}</h1>
                <HeadlineBlock product={p} />
                <Notice product={p} />
                <div className="mt-6">
                  <PriceBlock product={p} deliveryFee={cat.deliveryFee} />
                </div>
                <WhyToday product={p} />
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
        <TakeWhen product={p} />
        <BenefitBlocks product={p} />
        <OldVsSachet product={p} />
        <IngredientBanner product={p} />
        <ProductHowTo product={p} />
        <WhatYouGet product={p} />
        <Inside product={p} />
        <ProductFaq product={p} />
        <ClosingCta media={closingMedia(cat.products)} action={<AddOneButton product={p} />} />
      </main>
      <Footer store={cat.store} policies={cat.policies} products={cat.products} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
