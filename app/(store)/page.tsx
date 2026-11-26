import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { ProofStrip } from "@/components/ProofStrip";
import { Moments } from "@/components/Moments";
import { HOME_LINEUP_LIMIT } from "@/lib/lineup";
import { Faq, FinalCta, Footer, WhySachet } from "@/components/Sections";
import { getCatalog } from "@/lib/catalog";
import { SITE, CURRENCY } from "@/config/site";

export default async function Home() {
  const cat = await getCatalog();
  const { products } = cat;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: SITE.name, url: SITE.url, areaServed: "LB" },
      ...products.map((p) => ({
        "@type": "Product",
        name: `${p.name} ${p.descriptor}`,
        description: p.flavor,
        brand: { "@type": "Brand", name: SITE.name },
        offers: { "@type": "Offer", price: p.price, priceCurrency: CURRENCY, availability: p.soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock" },
      })),
    ],
  };
  return (
    <>
      <Header />
      <main>
        <Hero products={products} hero={cat.hero} />
        <ProofStrip deliveryFee={cat.deliveryFee} />
        <Moments products={products.slice(0, HOME_LINEUP_LIMIT)} total={products.length} />
        <WhySachet />
        <Faq items={cat.faq} />
        <FinalCta />
      </main>
      <Footer store={cat.store} policies={cat.policies} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
