import Link from "next/link";
import { AFFILIATE_TIERS } from "@/config/affiliates";
import { getCatalog } from "@/lib/catalog";
import { getProgram } from "@/lib/program";
import { ApplyForm } from "@/components/ApplyForm";
import { Blobs } from "@/components/Blobs";
import { Header } from "@/components/Header";
import { Reveal } from "@/components/Reveal";
import { Footer } from "@/components/Sections";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Ambassadors",
  description: "Train. Fuel. Earn. Join the MIEL+ ambassador program: your own code, a free kit, commission on every order.",
  alternates: { canonical: "/ambassadors" },
};

const KIT = ["A free starter kit of MIEL+", "A free pouch every month once you reach Athlete", "Early access to new flavours", "A featured spot on the MIEL+ site for top ambassadors"];
const LOOKING_FOR = ["People who really train: running, gym, CrossFit, football, cycling, padel, swimming, anything with sweat in it", "A real audience of any size: engagement beats follower count", "Honest, energetic content in your own voice", "Someone who follows the rules: say when it is an ad, make no health claims"];
const RULES = ["Say clearly that a post is an ad or a partnership (#ad)", "No medical or health claims. Never say MIEL+ treats, cures or prevents anything", "Use only your own code and link, never on your own order", "No spam, fake accounts or self-orders"];
const FAQ: [string, string][] = [
  ["Is it free to join?", "Yes. There is no fee and no stock to buy. Apply, get approved, get your kit."],
  ["Who can apply?", "Anyone 18 or older who trains and shares it. We look at fit and content, not only followers."],
  ["How much do I earn?", "A percentage of every order placed with your code or link, on the products total after the discount, delivery excluded. The rate depends on your level."],
  ["When do I get paid?", "A commission is approved after the hold period once the order is delivered, and can be paid out when your approved balance reaches the minimum. You request the payout in your portal."],
  ["What if an order is returned?", "Then its commission is void. If it was already paid, it is taken off your next payout."],
  ["How do I move up a level?", "By delivered orders. Your portal shows a progress bar to the next level."],
  ["What can I not say?", "No health or medical claims, and always mark posts as ads. The full rules are in the terms."],
];

export default async function AmbassadorsPage() {
  const cat = await getCatalog();
  const p = getProgram();
  const hold = p.holdDays;
  const STEPS = [
    { n: "01", t: "Apply", d: "Tell us who you are and where you train. It takes two minutes." },
    { n: "02", t: "Get your kit", d: "Once approved you get your portal, your starter kit and your code." },
    { n: "03", t: "Share your code and link", d: `Your followers get ${p.customerDiscountPercent}% off with your code or your personal link.` },
    { n: "04", t: "Earn commission", d: `Up to ${Math.max(...AFFILIATE_TIERS.map((t) => p.tiers[t].commissionPercent))}% on every delivered order. Track it live in your portal.` },
  ];
  return (
    <>
      <Header />
      <main>
        <section className="relative isolate overflow-x-clip">
          <Blobs spots={[{ x: "-10%", y: "0%" }, { x: "62%", y: "35%", delay: -9 }]} />
          <div className="mx-auto max-w-7xl px-5 pb-16 pt-[130px] md:px-8 md:pb-24 md:pt-[160px]">
            <Reveal>
              <p className="mono mb-3">AMBASSADOR PROGRAM</p>
              <h1 className="display h-hero">
                Train. Fuel. <span className="accent">Earn.</span>
              </h1>
              <p className="body-lg mt-5 max-w-2xl">Your own code and link. A free kit. Commission on every order. Honey fuel for people who put the work in.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href="#apply" className="btn">APPLY NOW</a>
                <Link href="/ambassador/login" className="btn btn-ghost">AMBASSADOR LOGIN</Link>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="relative isolate overflow-x-clip">
          <Blobs spots={[{ x: "70%", y: "10%" }]} />
          <div className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-24">
            <Reveal>
              <p className="mono mb-3">HOW IT WORKS</p>
              <h2 className="display h-section mb-10 md:mb-14">Four <span className="accent">steps.</span></h2>
            </Reveal>
            <ol className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
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
            <ul className="grid gap-5 lg:grid-cols-3">
              {AFFILIATE_TIERS.map((t, i) => (
                <Reveal as="li" key={t} delay={i * 80} className="glass-flat rounded-[20px] p-6">
                  <p className="mono mb-2">{p.tiers[t].minDelivered ? `${p.tiers[t].minDelivered} DELIVERED ORDERS` : "START HERE"}</p>
                  <h3 className="display text-[26px] leading-tight">{p.tiers[t].label}</h3>
                  <p className="display accent mt-3 text-[40px] leading-none">{p.tiers[t].commissionPercent}%</p>
                  <p className="mt-1 text-[16px] text-body">commission on every order</p>
                  <ul className="mt-4 space-y-2">
                    {p.tiers[t].perks.map((perk) => (
                      <li key={perk} className="flex gap-3 text-[17px] text-fg"><span aria-hidden className="accent">+</span>{perk}</li>
                    ))}
                  </ul>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        <section className="relative isolate overflow-x-clip">
          <Blobs spots={[{ x: "60%", y: "20%" }]} />
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 md:px-8 md:py-24 lg:grid-cols-2">
            <Reveal>
              <p className="mono mb-3">WHAT YOU GET</p>
              <h2 className="display h-section mb-6">The <span className="accent">kit.</span></h2>
              <ul className="space-y-3">
                {KIT.map((k) => <li key={k} className="glass-flat flex min-h-14 items-center rounded-2xl px-5 text-[18px] text-fg">{k}</li>)}
              </ul>
            </Reveal>
            <Reveal delay={80}>
              <p className="mono mb-3">WHO WE WANT</p>
              <h2 className="display h-section mb-6">Your <span className="accent">type.</span></h2>
              <ul className="space-y-3">
                {LOOKING_FOR.map((k) => <li key={k} className="text-[18px] text-body">{k}</li>)}
              </ul>
            </Reveal>
          </div>
        </section>

        <section className="relative isolate overflow-x-clip">
          <div className="mx-auto max-w-4xl px-5 py-16 md:px-8 md:py-24">
            <Reveal>
              <p className="mono mb-3">THE RULES</p>
              <h2 className="display h-section mb-6">Play it <span className="accent">straight.</span></h2>
              <ul className="space-y-3">
                {RULES.map((r) => <li key={r} className="glass-flat rounded-2xl px-5 py-4 text-[18px] text-fg">{r}</li>)}
              </ul>
              <p className="mt-5 text-[17px] text-body">Commission is approved {hold} days after delivery and is void if the order is cancelled, refused or returned. Read the full <Link href="/ambassadors/terms" className="underline underline-offset-4">ambassador terms</Link>.</p>
            </Reveal>
          </div>
        </section>

        <section className="relative isolate overflow-x-clip">
          <div className="mx-auto max-w-4xl px-5 py-16 md:px-8 md:py-24">
            <Reveal>
              <p className="mono mb-3">FAQ</p>
              <h2 className="display h-section mb-8">Questions.</h2>
            </Reveal>
            <div className="space-y-3">
              {FAQ.map(([q, a]) => (
                <details key={q} className="glass group rounded-[20px] px-5">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 text-[18px] font-semibold text-fg [&::-webkit-details-marker]:hidden">
                    {q}
                    <span aria-hidden className="display accent text-[26px] transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="pb-5 text-[17px] text-body">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="apply" className="relative isolate scroll-mt-24 overflow-x-clip">
          <Blobs spots={[{ x: "60%", y: "20%" }]} />
          <div className="mx-auto max-w-3xl px-5 py-16 md:px-8 md:py-24">
            <Reveal>
              <p className="mono mb-3">APPLY</p>
              <h2 className="display h-section mb-8">Join the <span className="accent">crew.</span></h2>
            </Reveal>
            <ApplyForm />
            <p className="mt-6 text-[17px] text-body">Already an ambassador? <Link href="/ambassador/login" className="text-fg underline underline-offset-4">Log in to your portal</Link>.</p>
          </div>
        </section>
      </main>
      <Footer store={cat.store} policies={cat.policies} />
    </>
  );
}
