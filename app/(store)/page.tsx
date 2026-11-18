import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { ProofStrip } from "@/components/ProofStrip";
import { Lineup } from "@/components/Lineup";
import { FeatureBand } from "@/components/FeatureBand";
import { HowTo, WhyHoney, Value, Faq, FinalCta, Footer } from "@/components/Sections";
import { getCatalog } from "@/lib/catalog";
import { FEATURED_SLUG, SITE, CURRENCY } from "@/config/site";

export default async function Home() {
  const cat = await getCatalog();
  const { products } = cat;
  const featured = products.find((p) => p.slug === FEATURED_SLUG) ?? products[0];
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: SITE.name, url: SITE.url, areaServed: "LB" },
      ...products.map((p) => ({
        "@type": "Product",
        name: `${p.name} ${p.descriptor}`,
        description: p.flavor,
        brand: { "@type": "Brand", name: SITE.name },
        offers: { "@type": "Offer", price: p.price, priceCurrency: CURRENCY, availability: "https://schema.org/InStock" },
      })),
    ],
  };
  return (
    <>
      <Header />
      <main>
        <Hero products={products} hero={cat.hero} />
        <ProofStrip />
        <Lineup products={products} />
        <FeatureBand products={products} />
        <HowTo />
        <WhyHoney />
        <Value price={featured?.price ?? 0} />
        <Faq items={cat.faq} />
        <FinalCta />
      </main>
      <Footer store={cat.store} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
