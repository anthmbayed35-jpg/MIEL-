import Image from "next/image";
import { INSTAGRAM_HANDLE, INSTAGRAM_URL, POUCH_PRICE, SACHETS_PER_POUCH, WHATSAPP_NUMBER, SITE } from "@/config/site";
import { money } from "@/lib/format";
import { Blobs } from "./Blobs";
import { Reveal } from "./Reveal";

const wrap = "mx-auto max-w-7xl px-5 md:px-8";

const steps = [
  { n: "01", t: "Take one before", d: "Tear a sachet 15 minutes before you start. Straight from the pouch." },
  { n: "02", t: "Take one during", d: "Long session? Take another mid-run or mid-set. Keep moving." },
  { n: "03", t: "Repeat", d: "Every hour or so on long efforts. Carry a few. Simple." },
];

export function HowTo() {
  return (
    <section className="relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "-10%", y: "10%" }, { x: "60%", y: "55%", delay: -8 }]} />
      <div className={`${wrap} py-16 md:py-24`}>
      <Reveal>
        <p className="mono mb-3">HOW TO USE</p>
        <h2 className="display h-section mb-10 md:mb-14">Rip. Sip. Repeat.</h2>
      </Reveal>
      <ol className="grid gap-4 lg:grid-cols-3">
        {steps.map((s, i) => (
          <Reveal as="li" key={s.n} delay={i * 80} className="glass p-5 md:p-8">
            <span className="display accent block text-[96px] leading-none md:text-[128px]" aria-hidden>
              {s.n}
            </span>
            <h3 className="display mt-4 text-[26px]">
              <span className="sr-only">Step {i + 1}: </span>
              {s.t}
            </h3>
            <p className="body-lg mt-3">{s.d}</p>
          </Reveal>
        ))}
      </ol>
      </div>
    </section>
  );
}

const benefits = [
  { t: "Natural carbs", d: "Real honey. Simple sugars your body knows what to do with." },
  { t: "Easy on the stomach", d: "No gels that feel like a chemistry set. Just honey and what the flavour needs." },
  { t: "No crash", d: "Steady fuel for the long haul. Built to keep you going, not spike and drop." },
];

export function WhyHoney() {
  return (
    <section className="relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "65%", y: "-10%" }, { x: "-15%", y: "60%", delay: -11 }]} />
      <div className={`${wrap} py-16 md:py-24`}>
        <Reveal>
          <p className="mono mb-3">WHY HONEY</p>
          <h2 className="display h-section mb-10 md:mb-14">
            Nature already <span className="accent">figured it out.</span>
          </h2>
        </Reveal>
        <div className="grid gap-10 lg:grid-cols-3 lg:gap-8">
          {benefits.map((b, i) => (
            <Reveal key={b.t} delay={i * 80} className="border-t-2 border-acid pt-5">
              <h3 className="display text-[26px]">{b.t}</h3>
              <p className="body-lg mt-3">{b.d}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Value() {
  const per = POUCH_PRICE / SACHETS_PER_POUCH;
  return (
    <section className="relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "30%", y: "-20%" }, { x: "75%", y: "40%", delay: -6 }, { x: "-10%", y: "50%", delay: -13 }]} />
      <div className={`${wrap} py-16 md:py-24`}>
      <Reveal className="glass p-5 md:p-12">
        <p className="mono mb-6">PER-SACHET VALUE</p>
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-end">
          <div>
            <p className="mono !text-body">1 POUCH · {SACHETS_PER_POUCH} SACHETS</p>
            <p className="display mt-1 text-[64px] leading-none md:text-[96px]">{money(POUCH_PRICE)}</p>
          </div>
          <div>
            <p className="display accent text-[48px] leading-none md:text-[80px]">{money(per, 2)}</p>
            <p className="display mt-2 text-[22px] md:text-[28px]">/ sachet</p>
          </div>
        </div>
        <p className="body-lg mt-8 max-w-xl">Real fuel for less than a coffee. Every sachet, every session.</p>
        <div className="mt-8">
          <a href="#lineup" className="btn">
            GET YOUR POUCH
          </a>
        </div>
      </Reveal>
      </div>
    </section>
  );
}

// TODO: replace placeholder answers with the real ones.
const faqs = [
  {
    q: "What's in it?",
    a: "Honey-based sachets, flavoured with real ingredients. RED BURN is pomegranate + beet, GOLD is vanilla + 150mg caffeine, CREATINE has 5g creatine. Full ingredient lists are on every pouch. [PLACEHOLDER]",
  },
  {
    q: "When should I take it?",
    a: "Take one before your workout or run, and another during longer sessions. Start with what feels right for you. [PLACEHOLDER]",
  },
  {
    q: "Is it stim-free?",
    a: "RED BURN and CREATINE are stim-free. GOLD contains 150mg of caffeine per sachet. [PLACEHOLDER]",
  },
  {
    q: "Does it need refrigeration?",
    a: "No. Keep it in a cool, dry place. Toss a few in your gym bag. [PLACEHOLDER]",
  },
  {
    q: "Do you deliver in Lebanon?",
    a: "Yes. We deliver across Lebanon, cash on delivery. Order on the site and we confirm delivery details with you on WhatsApp. [PLACEHOLDER]",
  },
  {
    q: "How many sachets in a pouch?",
    a: `${SACHETS_PER_POUCH} sachets in every pouch.`,
  },
];

export function Faq() {
  return (
    <section id="faq" className="relative isolate overflow-x-clip">
      <Blobs spots={[{ x: "-12%", y: "20%" }, { x: "70%", y: "60%", delay: -9 }]} />
      <div className={`${wrap} pb-16 md:pb-24`}>
      <Reveal>
        <p className="mono mb-3">FAQ</p>
        <h2 className="display h-section mb-8 md:mb-12">Questions.</h2>
      </Reveal>
      <Reveal className="space-y-3">
        {faqs.map((f) => (
          <details key={f.q} className="glass group px-5">
            <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 [&::-webkit-details-marker]:hidden">
              <span className="display text-[18px] md:text-[22px]">{f.q}</span>
              <span aria-hidden className="display accent text-[32px] leading-none transition-transform duration-150 group-open:rotate-45 motion-reduce:transition-none">
                +
              </span>
            </summary>
            <p className="body-lg max-w-3xl pb-6">{f.a}</p>
          </details>
        ))}
      </Reveal>
      </div>
    </section>
  );
}

export function FinalCta({ action }: { action?: React.ReactNode }) {
  return (
    <section className="relative isolate overflow-x-clip bg-black">
      <Blobs spots={[{ x: "50%", y: "-30%" }, { x: "-10%", y: "30%", delay: -8 }]} />
      <div className={`${wrap} py-20 md:py-32`}>
        <Reveal>
          <h2 className="display h-hero">
            No <span className="accent">excuses.</span>
          </h2>
          <p className="body-lg mt-5 max-w-xl">Pick your fuel. Get it delivered. Go train.</p>
          <div className="mt-8">
            {action ?? (
              <a href="#lineup" className="btn">
                SHOP THE LINEUP
              </a>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="relative isolate overflow-x-clip border-t border-white/10">
      <Blobs spots={[{ x: "65%", y: "-40%" }]} />
      <div className={`${wrap} py-12 md:py-16`}>
        {/* 220px wide logo is ~48px tall, so 24px padding keeps the half-height clear zone. */}
        <div className="w-[220px] py-6">
          <Image src="/brand/miel-full.png" alt="MIEL+" width={1051} height={228} className="block h-auto w-full" />
        </div>
        <ul className="mt-6 flex flex-col md:flex-row md:gap-10">
          <li>
            <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="link text-[18px]">
              Instagram {INSTAGRAM_HANDLE}
            </a>
          </li>
          <li>
            <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer" className="link text-[18px]">
              WhatsApp us
            </a>
          </li>
        </ul>
        <p className="mt-8 text-[16px] !text-body">
          © {new Date().getFullYear()} {SITE.name}. Made for Lebanon.
        </p>
      </div>
    </footer>
  );
}
