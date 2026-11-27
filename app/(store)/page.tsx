import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { Ticker } from "@/components/Ticker";
import { Moments } from "@/components/Moments";
import { StatRow } from "@/components/StatRow";
import { Lineup } from "@/components/Lineup";
import { FlavorExplorer } from "@/components/FlavorExplorer";
import { ClosingCta, OldVsNew, Reviews, TypoBand, UsageGuide } from "@/components/HomeBlocks";
import { HOME_LINEUP_LIMIT } from "@/lib/lineup";
import { Faq, Footer } from "@/components/Sections";
import { getCatalog } from "@/lib/catalog";
import { closingMedia, heroMedia } from "@/lib/media";
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
        {/* 1. Hero: say what it is in 3 seconds (video or still behind, pouch, label, headline, subline, flavour switcher) */}
        <Hero products={products} hero={cat.hero} media={heroMedia(products)} />
        {/* 2. Facts ticker: the true facts, always moving */}
        <Ticker />
        {/* 3. Pick your moment: three full-bleed cards */}
        <Moments products={products.slice(0, HOME_LINEUP_LIMIT)} total={products.length} />
        {/* 4. Stat numerals: only true facts */}
        <StatRow />
        {/* 5. Lineup cards: pouch and sachet pair, chips, when-to-use pills, prices, quick add */}
        <Lineup id="flavours" products={products.slice(0, HOME_LINEUP_LIMIT)} total={products.length} />
        {/* 6. Flavour explorer: tap a flavour to switch glow, image and details */}
        <FlavorExplorer products={products} />
        {/* 7. Old routine vs the sachet */}
        <OldVsNew products={products} />
        {/* 8. Usage guide: before / during / every day / on the go */}
        <UsageGuide />
        {/* 9. Big typographic band */}
        <TypoBand />
        {/* 10. Athletes and reviews: only when real approved entries exist */}
        <Reviews items={cat.testimonials} />
        {/* 11. FAQ */}
        <Faq items={cat.faq} />
        {/* 12. Closing CTA over a full-bleed image */}
        <ClosingCta media={closingMedia(products)} />
      </main>
      <Footer store={cat.store} policies={cat.policies} products={products} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
