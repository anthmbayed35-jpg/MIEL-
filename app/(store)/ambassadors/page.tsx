import { DEFAULT_COMMISSION_PERCENT, DEFAULT_CUSTOMER_DISCOUNT_PERCENT, COMMISSION_APPROVAL_DAYS, TIER_RULES } from "@/config/affiliates";
import { getCatalog } from "@/lib/catalog";
import { ApplyForm } from "@/components/ApplyForm";
import { Blobs } from "@/components/Blobs";
import { Header } from "@/components/Header";
import { Reveal } from "@/components/Reveal";
import { Footer } from "@/components/Sections";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Ambassadors",
  description: "Train with MIEL+. Get your own code, give your followers a discount and earn on every delivered order.",
  alternates: { canonical: "/ambassadors" },
};

const STEPS = [
  { n: "01", t: "Apply", d: "Tell us who you are and where you train. Takes a minute." },
  { n: "02", t: "Get your code", d: `Your own code. Your followers get ${DEFAULT_CUSTOMER_DISCOUNT_PERCENT}% off their pouches.` },
  { n: "03", t: "Earn", d: `${DEFAULT_COMMISSION_PERCENT}% on every order that lands. Paid ${COMMISSION_APPROVAL_DAYS} days after delivery.` },
];

export default async function AmbassadorsPage() {
  const cat = await getCatalog();
  return (
    <>
      <Header />
      <main>
        <section className="relative isolate overflow-x-clip">
          <Blobs spots={[{ x: "-10%", y: "0%" }, { x: "62%", y: "35%", delay: -9 }]} />
          <div className="mx-auto max-w-7xl px-5 pb-16 pt-[130px] md:px-8 md:pb-24 md:pt-[160px]">
            <Reveal>
              <p className="mono mb-3">AMBASSADORS</p>
              <h1 className="display h-hero">
                Train with <span className="accent">MIEL+.</span>
              </h1>
              <p className="body-lg mt-5 max-w-2xl">Your code. Your crew gets {DEFAULT_CUSTOMER_DISCOUNT_PERCENT}% off. You earn on every delivered order. Real honey, real work, real reward.</p>
              <a href="#apply" className="btn mt-8">APPLY NOW</a>
            </Reveal>
          </div>
        </section>

        <section className="relative isolate overflow-x-clip">
          <Blobs spots={[{ x: "70%", y: "10%" }]} />
          <div className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-24">
            <Reveal>
              <p className="mono mb-3">HOW IT WORKS</p>
              <h2 className="display h-section mb-10 md:mb-14">Three <span className="accent">steps.</span></h2>
            </Reveal>
            <ol className="grid gap-5 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <Reveal as="li" key={s.n} delay={i * 80} className="glass p-6 md:p-7">
                  <p className="mono mb-3">{s.n}</p>
                  <h3 className="display text-[26px] leading-tight">{s.t}</h3>
                  <p className="body-lg mt-3 !text-[18px]">{s.d}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        <section className="relative isolate overflow-x-clip">
          <Blobs spots={[{ x: "-5%", y: "30%" }]} />
          <div className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-24">
            <Reveal>
              <p className="mono mb-3">LEVELS</p>
              <h2 className="display h-section mb-10 md:mb-14">Move <span className="accent">up.</span></h2>
            </Reveal>
            <ul className="grid gap-5 md:grid-cols-3">
              {(["seed", "athlete", "ambassador"] as const).map((t, i) => (
                <Reveal as="li" key={t} delay={i * 80} className="glass-flat rounded-[20px] p-6">
                  <p className="mono mb-2">{TIER_RULES[t].minDelivered ? `${TIER_RULES[t].minDelivered} DELIVERED ORDERS` : "START HERE"}</p>
                  <h3 className="display text-[26px] leading-tight">{TIER_RULES[t].label}</h3>
                  <p className="body-lg mt-3 !text-[18px]">{TIER_RULES[t].commissionPercent}% commission on every order.</p>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        <section id="apply" className="relative isolate overflow-x-clip scroll-mt-24">
          <Blobs spots={[{ x: "60%", y: "20%" }]} />
          <div className="mx-auto max-w-3xl px-5 py-16 md:px-8 md:py-24">
            <Reveal>
              <p className="mono mb-3">APPLY</p>
              <h2 className="display h-section mb-8">Join the <span className="accent">crew.</span></h2>
            </Reveal>
            <ApplyForm />
          </div>
        </section>
      </main>
      <Footer store={cat.store} policies={cat.policies} />
    </>
  );
}
