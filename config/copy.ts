/**
 * ALL storefront copy lives here (home page, product pages, page titles). Review it in docs/COPY.md (generated from this file:
 * `UPDATE_COPY_DOC=1 npx vitest run tests/unit/copy.test.ts`).
 *
 * OVERALL PURPOSE: a visitor must understand within 10 seconds that this is honey fuel for their next session, that it is easier than
 * what they do now, and tap Shop. Every block below has ONE job, written next to it ("JOB:") and in the Purpose column of docs/COPY.md.
 * Keep the job in mind when editing the words.
 *
 * TWO MODES. COPY_CLAIMS (environment variable, read per request) defaults to ON. COPY_CLAIMS=off switches every product line to the
 * facts-only fallback (what is printed on the pack, nothing about what it does for you). Both modes are complete pages.
 *
 * HARD LIMITS (tests/unit/copy.test.ts fails the build on these words in ANY copy string): burn (except the product name RED BURN),
 * fat loss, lose weight, muscle gain, cure, treat, prevent, guarantee, boost, transform. No competitor names, no fake reviews, ratings or
 * sales numbers, no scarcity, no offers. Anything unconfirmed (serving timing, allergens, shelf life, delivery promises, warnings) is TBC.
 */
export const TBC = "TBC";
/** Text shown where an answer is not confirmed yet. Contains the TBC marker, so tests and the doc can find every one. */
export const TBC_NOTE = "TBC. We are confirming this and will update it here.";

export type Step = { title: string; text: string };
export type Qa = { q: string; a: string };

/** Copy for one product. Fields marked JOB say what the block is for. */
export type ProductCopy = {
  /** JOB: say in four words what moment this is for. Mono label above the headline. Long form may wrap to two lines. */
  tagline: string;
  /** Short form of the tagline for tight spaces. */
  taglineShort: string;
  /** JOB: create desire by saying what the product does for them. */
  headline: string;
  /** JOB: the one paragraph that explains it, in plain words. */
  body: string;
  /** JOB: a reason to act now without pressure. Shown beside the price and the add-to-cart button. */
  whyToday: string;
  /** JOB: make them picture the exact moment of use. Three suggestions, never instructions. */
  takeWhen: string[];
  /** JOB: three reasons to believe it. */
  benefits: [Step, Step, Step];
  /** JOB: show what they gain by switching. No brand names. */
  compare: { old: string; now: string };
  /** One line for cards, share text and search snippets. */
  description: string;
  /** JOB: let the visitor spot themselves on the home page and route them to this flavour. */
  moment: { label: string; category: string; line: string };
  /** Glass chips in "What you get". */
  chips: string[];
  /** Short key spec line for cards. */
  spec: string;
  /** Warning block next to the buy box (null = none). */
  warning: string | null;
  /** JOB: remove the last doubts. */
  faqs: Qa[];
};

const SAFE_FAQ = "If you have a medical condition, are pregnant or breastfeeding, or are under 18, check with your doctor first.";
const common = (): Qa[] => [
  { q: "Is it halal certified?", a: "Every pack carries the HALAL CERTIFIED mark." },
  { q: "How many sachets are in a pouch?", a: "12 sachets in every pouch." },
  { q: "Do I need water with it?", a: TBC_NOTE },
  { q: "How do I store it?", a: TBC_NOTE },
  { q: "Who should check with a doctor first?", a: SAFE_FAQ },
];

/** Shared by both modes. */
const SHARED = {
  /** JOB (delivery lines): say the one delivery fact once, with the live flat fee. */
  deliveryFact: (fee: string) => `${fee} DELIVERY ACROSS LEBANON`,
  deliveryNote: (fee: string) => `+ ${fee} delivery across Lebanon`,
  /** JOB (proof strip): the facts that make it feel safe to tap, in one line. */
  proofStrip: ["REAL HONEY", "12 SACHETS PER POUCH", "HALAL CERTIFIED"],
  /** JOB (hero chips): the three facts that matter before scrolling. */
  heroChips: ["12 SACHETS", "HALAL CERTIFIED", "REAL HONEY"],
  /** JOB (hero): say what it is and who it is for in 3 seconds, then one button. */
  hero: { headline1: "Fuel the", headline2: "grind.", cta: "SHOP THE LINEUP" },
  /** JOB (pick your moment): let the visitor spot themselves and route them to the right flavour. */
  moments: { kicker: "PICK YOUR MOMENT", title1: "What are you", title2: "training for?", cta: "SHOP" },
  /** JOB (why a sachet): attack the old routine: scoop, shaker, mixing. */
  whySachet: {
    kicker: "SKIP THE SHAKER",
    title1: "Why a",
    title2: "sachet.",
    lines: ["No mixing. No scoop.", "Pocket-size, tear open and go.", "The dose is decided for you: 150 mg or 5 g, every time.", "Raw honey as the base."],
  },
  /** JOB (closing section): one last clear action. */
  finalCta: { title1: "Pick your moment.", title2: "Rip. Sip. Go.", cta: "SHOP THE LINEUP" },
  /** JOB (rip sip go): make it feel effortless: three verbs, one line each. Water guidance is TBC. */
  howTo: {
    kicker: "HOW TO USE",
    title: "Rip. Sip. Go.",
    steps: [
      { title: "Rip", text: "Tear the notch." },
      { title: "Sip", text: "Squeeze or sip straight." },
      { title: "Go", text: "Get on with it." },
    ] as Step[],
    timingNote: `Water guidance: ${TBC}.`,
  },
  product: {
    /** JOB: make them picture the exact moment of use. */
    takeWhenLabel: "TAKE IT WHEN",
    /** JOB: three reasons to believe it. */
    benefitsKicker: "WHY THIS ONE",
    benefitsTitle: "Three reasons.",
    /** JOB: show what they gain by switching. */
    compareKicker: "OLD ROUTINE VS THE SACHET",
    compareTitle: "Skip the routine.",
    compareOld: "THE OLD WAY",
    compareNew: "THE SACHET",
    /** JOB: make the value clear and soften the price. */
    getKicker: "WHAT YOU GET",
    getTitle: "In every pouch.",
    getLine: "12 sachets in one stand-up pouch.",
    /** JOB: the facts table, honest about what is not confirmed. */
    insideKicker: "THE FACTS",
    insideTitle: "Full details.",
    faqKicker: "FAQ",
    faqTitle: "Questions.",
    trust: ["REAL HONEY", "HALAL CERTIFIED", "CASH ON DELIVERY"],
  },
  /** JOB (home FAQ): remove the last doubts about delivery and the basics. */
  homeFaq: [
    { q: "Is it halal certified?", a: "Every pack carries the HALAL CERTIFIED mark." },
    { q: "How many sachets are in a pouch?", a: "12 sachets in every pouch." },
    { q: "Do I need water with it?", a: TBC_NOTE },
    { q: "How do I store it?", a: TBC_NOTE },
    { q: "Do you deliver in Lebanon?", a: "Yes. We deliver across Lebanon for a flat {fee} delivery fee, cash on delivery. We confirm delivery details with you on WhatsApp." },
    { q: "Who should check with a doctor first?", a: SAFE_FAQ },
  ] as Qa[],
};

const ON = {
  ...SHARED,
  /** JOB (hero): the mono label under the logo, i.e. what this brand is. */
  brandTagline: "HONEY FOR PERFORMANCE",
  hero: {
    ...SHARED.hero,
    sub: "Honey fuel that does the work: quick carbs, the exact dose, nothing to mix. Rip. Sip. Go.",
  },
  /** JOB (site title and share text): the brand in one line. */
  site: { title: "MIEL+ | Honey for training", description: "Honey fuel for your next session. Real honey sachets with the exact dose and nothing to mix. Rip. Sip. Go. Delivered across Lebanon." },
};

const OFF = {
  ...SHARED,
  brandTagline: "HONEY FOR TRAINING",
  hero: {
    ...SHARED.hero,
    sub: "Real honey in a sachet with the dose already set. Nothing to mix. Rip. Sip. Go.",
  },
  site: { title: "MIEL+ | Honey for training", description: "Honey for training. Real honey sachets with the dose already set and nothing to mix. Delivered across Lebanon." },
};

export type Copy = typeof ON;

/** The default is ON. Only COPY_CLAIMS=off (any case) switches to the facts-only lines. Read per request, so a restart is enough. */
export const claimsOn = () => String(process.env.COPY_CLAIMS ?? "").trim().toLowerCase() !== "off";
export const copyFor = (claims: boolean): Copy => (claims ? ON : OFF);
export const copy = (): Copy => copyFor(claimsOn());

const PRODUCTS_ON: Record<string, ProductCopy> = {
  gold: {
    tagline: "HONEY FOR ENERGY AND FOCUS",
    taglineShort: "ENERGY AND FOCUS",
    headline: "Take it before the work.",
    body: "150 mg of caffeine to help you feel alert and focused, with L-theanine and honey's quick-digesting carbohydrates, in smooth vanilla honey. Rip it open in the car park. Nothing to mix.",
    whyToday: "Your next session is the reason.",
    takeWhen: ["Car park", "Desk", "Pre-session"],
    benefits: [
      { title: "Alert and focused, before you start", text: "150 mg of caffeine with L-theanine." },
      { title: "Quick carbs in every sachet", text: "Honey's fast-digesting carbohydrates in the same sachet." },
      { title: "Nothing to mix", text: "No powder, no shaker, no waiting: tear, sip, go." },
    ],
    compare: { old: "Measure, mix, wait", now: "Rip, sip, go" },
    description: "150 mg of caffeine with L-theanine in vanilla honey. Take it before the work.",
    moment: { label: "BEFORE THE WORK", category: "ENERGY AND FOCUS", line: "150 mg of caffeine with L-theanine in vanilla honey. Rip it open in the car park." },
    chips: ["12 SACHETS", "~21 G EACH", "150 MG CAFFEINE"],
    spec: "~21G · 150 MG CAFFEINE",
    warning: `Contains 150 mg of caffeine per sachet. Full caffeine advice: ${TBC}.`,
    faqs: [...common(), { q: "How much caffeine is in a sachet?", a: "150 mg of caffeine per sachet." }],
  },
  "red-burn": {
    tagline: "HONEY FOR ENDURANCE",
    taglineShort: "ENDURANCE",
    headline: "Built for the long push.",
    body: "Honey is fast-digesting carbohydrate your muscles can use while you move, past the hour mark when the tank runs low. Pomegranate and beet. No caffeine, so it fits any time of day.",
    whyToday: "Try it on a training day, not on race day.",
    takeWhen: ["Long run", "Long ride", "Hour two"],
    benefits: [
      { title: "Carbs that keep moving with you", text: "Fast-digesting carbohydrate you can use while you move." },
      { title: "Stim-free", text: "No caffeine, so it fits any time of day." },
      { title: "Nothing to mix, nothing to carry but the sachet", text: "Tear it, take it, keep going." },
    ],
    compare: { old: "Bottle, powder, mixing", now: "A sachet in your pocket" },
    description: "Fast-digesting honey carbs in pomegranate and beet. Stim-free.",
    moment: { label: "THE LONG PUSH", category: "ENDURANCE", line: "Fast-digesting honey carbs for past the hour mark. Stim-free." },
    chips: ["12 SACHETS", "22 G EACH", "STIM-FREE"],
    spec: "22G · STIM-FREE",
    warning: null,
    faqs: [...common(), { q: "Is it stim-free?", a: "Yes. RED BURN has no caffeine." }],
  },
  creatine: {
    tagline: "HONEY FOR STRENGTH",
    taglineShort: "STRENGTH",
    headline: "One sachet. Every day.",
    body: "Creatine helps your muscles make quick energy for short, hard efforts: heavy sets, sprints, jumps. Taken daily, it supports strength and power over time. 5 g per sachet. No scoop, no shaker, no clumps.",
    whyToday: "Creatine builds up in your muscles over a few weeks of daily use, so the best day to start is today.",
    takeWhen: ["Same time daily", "Training days", "Rest days"],
    benefits: [
      { title: "Fuel for short, hard efforts", text: "Heavy sets, sprints, jumps." },
      { title: "Daily is the whole point", text: "It builds up in your muscles over weeks, so the habit counts: 5 g, one sachet, every day." },
      { title: "No scoop. No shaker. No clumps.", text: "The dose is already measured." },
    ],
    compare: { old: "Scoop, shaker, water, washing up", now: "Rip, sip, go" },
    description: "5 g of creatine in every honey sachet. No scoop. No shaker. No clumps.",
    moment: { label: "EVERY DAY", category: "STRENGTH", line: "5 g of creatine in every sachet. No scoop. No shaker. No clumps." },
    chips: ["12 SACHETS", "20 G EACH", "5 G CREATINE", "STIM-FREE"],
    spec: "20G · 5 G CREATINE · STIM-FREE",
    warning: null,
    faqs: [...common(), { q: "Is it stim-free?", a: "Yes. CREATINE is stim-free." }],
  },
};

/** The facts-only fallback (COPY_CLAIMS=off): what is on the pack and how it is used, nothing about what it does for you. */
const PRODUCTS_OFF: Record<string, ProductCopy> = {
  gold: {
    ...PRODUCTS_ON.gold,
    tagline: "HONEY FOR THE WORK",
    taglineShort: "HONEY FOR THE WORK",
    body: "150 mg caffeine and L-theanine in vanilla honey. Rip it open in the car park.",
    benefits: [
      { title: "150 mg caffeine with L-theanine", text: "In every sachet, in vanilla honey." },
      { title: "Real honey base", text: "Smooth vanilla, made with real honey." },
      { title: "Nothing to mix", text: "No powder, no shaker, no waiting: tear, sip, go." },
    ],
    description: "150 mg caffeine and L-theanine in vanilla honey.",
    moment: { label: "BEFORE THE WORK", category: "HONEY FOR THE WORK", line: "150 mg caffeine and L-theanine in vanilla honey. Rip it open in the car park." },
  },
  "red-burn": {
    ...PRODUCTS_ON["red-burn"],
    tagline: "HONEY FOR DISTANCE",
    taglineShort: "HONEY FOR DISTANCE",
    body: "Stim-free pomegranate-and-beet honey. No caffeine. No mixing.",
    benefits: [
      { title: "Pomegranate and beet honey", text: "Made with real honey, 22 g in every sachet." },
      { title: "Stim-free", text: "No caffeine, so it fits any time of day." },
      { title: "Nothing to mix, nothing to carry but the sachet", text: "Tear it, take it, keep going." },
    ],
    description: "Stim-free pomegranate-and-beet honey.",
    moment: { label: "THE LONG PUSH", category: "HONEY FOR DISTANCE", line: "Stim-free pomegranate-and-beet honey. No caffeine. No mixing." },
  },
  creatine: {
    ...PRODUCTS_ON.creatine,
    tagline: "CREATINE NO SCOOP",
    taglineShort: "CREATINE NO SCOOP",
    body: "5 g of creatine per sachet. No scoop. No shaker. No clumps.",
    whyToday: "One sachet. Every day. Start today.",
    benefits: [
      { title: "5 g of creatine per sachet", text: "In real honey." },
      { title: "One sachet, every day", text: "The same simple routine each day." },
      { title: "No scoop. No shaker. No clumps.", text: "The dose is already measured." },
    ],
    description: "5 g of creatine per sachet. No scoop. No shaker. No clumps.",
    moment: { label: "EVERY DAY", category: "CREATINE NO SCOOP", line: "5 g of creatine per sachet. No scoop. No shaker. No clumps." },
  },
};

/** "HONEY FOR ENERGY AND FOCUS" -> "Honey for energy and focus" (for titles and descriptions). */
export const sentence = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export const PRODUCT_COPY_ON = PRODUCTS_ON;
export const PRODUCT_COPY_OFF = PRODUCTS_OFF;
/** The copy of one product in the current (or the given) mode; undefined for products added later (they keep what they have). */
export const productCopy = (slug: string, claims: boolean = claimsOn()): ProductCopy | undefined => (claims ? PRODUCTS_ON : PRODUCTS_OFF)[slug];

/** The previous placeholder wording stored in older databases: matched exactly so edited content is never overwritten. */
export const LEGACY_HERO_SUBS = [
  "Honey-powered sachets for people who train. Rip. Sip. Go.",
  "Real honey energy in a sachet. Rip. Sip. Go. No mixing, no bottle, no mess.",
];
/** True for the FAQ seeded by earlier versions of this file (never for one the team has edited). */
export const isLegacyFaq = (items: Qa[] | undefined): boolean =>
  !!items?.length && (items[0].q === "What's in it?" || (items[0].q === "Do I need water with it?" && items[1]?.a === "Yes. MIEL+ is halal certified."));

/** The ONE JOB of each block (the Purpose column of docs/COPY.md). Keep the intent when editing the words. */
export const JOBS = {
  hero: "Say what it is and who it is for in 3 seconds, then one button.",
  heroChips: "The three facts that matter before scrolling.",
  proofStrip: "The facts that make it feel safe to tap, in one line.",
  moments: "Let the visitor spot themselves and route them to the right flavour.",
  whySachet: "Attack the old routine: scoop, shaker, mixing.",
  finalCta: "One last clear action.",
  homeFaq: "Remove the last doubts about delivery and the basics.",
  headline: "Create desire by saying what the product does for them.",
  whyToday: "A reason to act now without pressure (beside the price and the add-to-cart button).",
  takeWhen: "Make them picture the exact moment of use.",
  benefits: "Three reasons to believe it.",
  compare: "Show what they gain by switching (no brand names).",
  howTo: "Make it feel effortless: three verbs, one line each.",
  getIt: "Make the value clear and soften the price.",
  faq: "Remove the last doubts.",
  stickyBar: "Make buying one tap on a phone (shows the price).",
} as const;

/** Hero sublines the app itself wrote (earlier versions and both modes): a stored hero with one of these is not an edit by the team, so the current mode's wording is used. */
export const isDefaultHeroSub = (sub: unknown): boolean => typeof sub === "string" && [...LEGACY_HERO_SUBS, ON.hero.sub, OFF.hero.sub].includes(sub);
