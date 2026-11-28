import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { Ticker } from "@/components/Ticker";
import { Moments } from "@/components/Moments";
import { Lineup } from "@/components/Lineup";
import { MiniCartBar } from "@/components/MiniCartBar";
import { AmbassadorBand, ClosingCta, Community, CompareMatrix, FeaturePanels, FlavorExplorer, StorySection, UsageGuide, WhyHoney } from "@/components/HomeSections";
import { HOME_LINEUP_LIMIT } from "@/lib/lineup";
import { Faq, Footer } from "@/components/Sections";
import { getCatalog } from "@/lib/catalog";
import { closingMedia, heroMedia, storyMedia } from "@/lib/media";
import { enabledSections, HOME_SECTIONS } from "@/config/homepage";
import { SITE, CURRENCY } from "@/config/site";

export default async function Home() {
  const cat = await getCatalog();
  const { products } = cat;
  const story = storyMedia();
  const faqs = cat.faq.filter((f) => !/\bTBC\b/.test(f.a));
  const shown = products.slice(0, HOME_LINEUP_LIMIT);

  /**
   * Each section by id (config/homepage.ts decides the order and the enabled flags). A section with nothing real to show is null here,
   * whatever its flag says: no story film, no approved reviews or photos, no confirmed answers -> not on the page at all.
   */
  const sections: Record<string, React.ReactNode> = {
    // 2. Hero: what it is in 3 seconds (video or poster behind, pouch first, eyebrow, H1, line, two buttons, confirmed facts)
    hero: <Hero products={products} hero={cat.hero} media={heroMedia(products)} />,
    // 3. Facts ticker: confirmed facts, always moving
    ticker: <Ticker />,
    // 4. Pick your moment: three tall photo cards
    moments: <Moments products={shown} total={products.length} />,
    // 5. The lineup: three equal product cards
    lineup: <Lineup products={shown} total={products.length} />,
    // 6. Product feature panels: one confirmed number each
    features: <FeaturePanels products={shown} />,
    // 7. Flavour explorer: tabs
    explorer: <FlavorExplorer products={shown} />,
    // 8. Why honey: four numbered pillars
    "why-honey": <WhyHoney />,
    // 9. Comparison matrix (every row needs owner approval before launch: docs/COPY.md)
    compare: <CompareMatrix />,
    // 10. How to use
    usage: <UsageGuide />,
    // 11. Brand story film: hidden until a story video exists
    story: story ? <StorySection story={story} /> : null,
    // 12. Athletes / reviews / "Fueled by you": hidden until real approved entries exist
    community: cat.testimonials.length || cat.gallery.length ? <Community reviews={cat.testimonials} gallery={cat.gallery} /> : null,
    // 13. FAQ (unconfirmed answers are hidden) with the WhatsApp ASK US button
    faq: faqs.length ? <Faq items={faqs} whatsapp={cat.store.whatsapp} /> : null,
    // 14. Closing band over the closing image
    closing: <ClosingCta home media={closingMedia(products)} />,
    // 15. Ambassador band
    ambassador: <AmbassadorBand />,
  };

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
      <Header products={cat.products} />
      <main>
        {enabledSections(HOME_SECTIONS).map((id) => {
          const node = sections[id];
          // a hidden section leaves nothing behind, not even an empty wrapper
          return node ? (
            <div key={id} data-section={id} className="contents">
              {node}
            </div>
          ) : null;
        })}
      </main>
      <MiniCartBar />
      <Footer store={cat.store} policies={cat.policies} products={products} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
