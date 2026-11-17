import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { ProofStrip } from "@/components/ProofStrip";
import { Lineup } from "@/components/Lineup";
import { HowTo, WhyHoney, Value, Faq, FinalCta, Footer } from "@/components/Sections";
import { products } from "@/config/products";
import { SITE, CURRENCY } from "@/config/site";

export default function Home() {
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
        <Hero />
        <ProofStrip />
        <Lineup />
        <HowTo />
        <WhyHoney />
        <Value />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
