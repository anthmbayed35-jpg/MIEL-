/**
 * ALL storefront marketing copy lives here (home page, product pages). Review it in docs/COPY.md (generated from this file:
 * `UPDATE_COPY_DOC=1 npx vitest run tests/unit/copy.test.ts`).
 *
 * RULES (the Ministry of Public Health has not confirmed the product classification yet):
 * - Lead with what the customer gets: convenience, taste, ritual, ease.
 * - No health, medical, weight-loss or performance claims or guarantees. No "burns fat", "boosts", "improves", "cures",
 *   "clinically proven", no comparison with other brands. tests/unit/copy.test.ts fails on these words.
 * - Only facts printed on the packs: 150 mg caffeine, 5 g creatine, stim-free, halal certified, sachet sizes, 12 per pouch.
 * - Anything not given is NOT invented: it is written as TBC (use `TBC` below) and listed in docs/COPY.md.
 */
export const TBC = "TBC";
/** Text shown where an answer is not confirmed yet. Contains the TBC marker, so tests and the doc can find every one. */
export const TBC_NOTE = "TBC. We are confirming this and will update it here.";

export type Step = { title: string; text: string };
export type Qa = { q: string; a: string };
export type ProductCopy = {
  /** One benefit headline, shown under the product name. */
  headline: string;
  /** Short description (cards, feature band, search snippets). */
  description: string;
  /** Glass chips under the name. */
  chips: string[];
  /** Short key spec line for cards and the compare strip. */
  spec: string;
  /** Exactly three benefit bullets. */
  benefits: [Step, Step, Step];
  /** Warning block next to the buy box (null = none). */
  warning: string | null;
  faqs: Qa[];
};

export const COPY = {
  hero: {
    headline1: "Fuel the",
    headline2: "grind.",
    sub: "Real honey energy in a sachet. Rip. Sip. Go. No mixing, no bottle, no mess.",
    chips: ["12 SACHETS", "REAL HONEY", "HALAL CERTIFIED"],
    cta: "SHOP THE LINEUP",
  },
  proofStrip: ["REAL HONEY", "12 SACHETS PER POUCH", "HALAL CERTIFIED", "DELIVERED IN LEBANON"],
  lineup: { kicker: "THE LINEUP", title1: "Pick your", title2: "flavour." },
  howTo: {
    kicker: "HOW TO USE",
    title: "Rip. Sip. Go.",
    steps: [
      { title: "Rip", text: "Tear open a sachet. No tools, no scoop." },
      { title: "Sip", text: "Take it straight from the sachet. No mixing, no bottle." },
      { title: "Go", text: "Toss the sachet and get on with your day." },
    ] as Step[],
    timingNote: `Timing and serving advice: ${TBC}.`,
  },
  whyHoney: {
    kicker: "WHY HONEY",
    title1: "Real honey.",
    title2: "Real easy.",
    items: [
      { title: "Real honey taste", text: "Made with real honey. Sweet, smooth and easy to like." },
      { title: "Grab and go", text: "One sachet fits any pocket or gym bag." },
      { title: "Zero mess", text: "No powder, no shaker, no sticky fingers." },
    ] as Step[],
  },
  value: {
    kicker: "PRICE PER SACHET",
    pouchLabel: "1 POUCH",
    perSachetUnit: "/ sachet",
    line: "12 pre-measured sachets in every pouch.",
    cta: "GET YOUR POUCH",
  },
  finalCta: { title1: "No", title2: "excuses.", text: "Pick your flavour. Get it delivered. Rip. Sip. Go.", cta: "SHOP THE LINEUP" },
  homeFaq: [
    { q: "Do I need water with it?", a: TBC_NOTE },
    { q: "Is it halal certified?", a: "Yes. MIEL+ is halal certified." },
    { q: "How many sachets are in a pouch?", a: "12 sachets in every pouch." },
    { q: "How do I store it?", a: TBC_NOTE },
    { q: "Is it stim-free?", a: "RED BURN and CREATINE are stim-free. GOLD contains 150 mg of caffeine per sachet." },
    { q: "Do you deliver in Lebanon?", a: "Yes. We deliver across Lebanon, cash on delivery. We confirm delivery details with you on WhatsApp." },
  ] as Qa[],
  product: {
    inside: { kicker: "WHAT'S INSIDE", title: "The facts." },
    pouch: { kicker: "IN THE POUCH", text: "One stand-up pouch with tear-open sachets. Throw a few in your bag and go." },
    trust: ["REAL HONEY", "HALAL CERTIFIED", "CASH ON DELIVERY"],
    faqKicker: "FAQ",
    faqTitle: "Questions.",
    priceNote: "per pouch",
  },
} as const;

const common = (name: string): Qa[] => [
  { q: "Do I need water with it?", a: TBC_NOTE },
  { q: "Is it halal certified?", a: `Yes. ${name} is halal certified.` },
  { q: "How many sachets are in a pouch?", a: "12 sachets in every pouch." },
  { q: "How do I store it?", a: TBC_NOTE },
];

/** Per product, by slug. */
export const PRODUCT_COPY: Record<string, ProductCopy> = {
  "red-burn": {
    headline: "Steady honey fuel for the long push.",
    description: "Pomegranate and beet honey in a sachet. Stim-free.",
    chips: ["12 SACHETS", "REAL HONEY", "STIM-FREE"],
    spec: "22G · STIM-FREE",
    benefits: [
      { title: "Grab and go", text: "Tear it open and take it. No bottle, no mixing." },
      { title: "Real honey taste", text: "Pomegranate and beet, made with real honey." },
      { title: "Pre-measured sachets", text: "22 g in every sachet. Nothing to scoop." },
    ],
    warning: null,
    faqs: [...common("RED BURN"), { q: "Is it stim-free?", a: "Yes. RED BURN is stim-free." }],
  },
  gold: {
    headline: "Get moving before the work starts.",
    description: "Smooth vanilla honey with 150 mg of caffeine. Take it before the work.",
    chips: ["12 SACHETS", "REAL HONEY", "150 MG CAFFEINE"],
    spec: "~21G · 150 MG CAFFEINE",
    benefits: [
      { title: "Grab and go", text: "Tear it open and take it. No bottle, no mixing." },
      { title: "Real honey taste", text: "Smooth vanilla, made with real honey." },
      { title: "Pre-measured sachets", text: "About 21 g and 150 mg of caffeine in every sachet." },
    ],
    warning: `Contains 150 mg of caffeine per sachet. Full caffeine advice: ${TBC}.`,
    faqs: [...common("GOLD"), { q: "How much caffeine is in a sachet?", a: "150 mg of caffeine per sachet." }],
  },
  creatine: {
    headline: "Your daily 5 g of creatine. No scoop, no shaker.",
    description: "5 g of creatine in a honey sachet. One sachet, every day.",
    chips: ["12 SACHETS", "REAL HONEY", "5 G CREATINE"],
    spec: "20G · 5G CREATINE · STIM-FREE",
    benefits: [
      { title: "Grab and go", text: "Tear it open and take it. No scoop, no shaker." },
      { title: "Real honey taste", text: "Made with real honey." },
      { title: "Pre-measured sachets", text: "5 g of creatine in every sachet. Nothing to measure." },
    ],
    warning: null,
    faqs: [...common("CREATINE"), { q: "Is it stim-free?", a: "Yes. CREATINE is stim-free." }],
  },
};

/** The previous placeholder wording stored in older databases: matched exactly so edited content is never overwritten. */
export const LEGACY_HERO_SUB = "Honey-powered sachets for people who train. Rip. Sip. Go.";
export const LEGACY_FAQ_FIRST_Q = "What's in it?";
