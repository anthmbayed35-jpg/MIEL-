import { POUCH_PRICE } from "./site";

/**
 * SINGLE SOURCE OF TRUTH for products. New products are added ONLY here:
 * the home lineup, /products/[slug] pages, compare strip, sitemap, metadata,
 * JSON-LD and the cart all read from this list.
 *
 * Any value that is `null` renders as a clean "TBC" on the product page. Never invent values.
 */

export type GalleryItem = { label: string; alt: string; src: string | null };
export type Fact = { label: string; value: string | null };
export type Step = { title: string; text: string };
export type Block = { title: string; text: string };
export type Faq = { q: string; a: string };

export type Product = {
  id: string;
  /** URL slug: /products/[slug]. */
  slug: string;
  name: string;
  descriptor: string;
  flavor: string;
  /** Space Mono spec line used on cards. TODO: confirm every figure before launch. */
  spec: string;
  /** Price of one 12-sachet pouch, in config currency. */
  price: number;
  /** Soft glow colour behind cards / gallery (rgba). */
  glow: string;
  /** Home card image, path under /public (e.g. "/products/red-burn.png"). null = placeholder. */
  image: string | null;
  imageAlt: string;

  // ---- product page ----
  /** Two-line description (placeholder copy, edit freely). */
  description: string;
  /** Glass chip row under the name. */
  chips: string[];
  /** Short key spec for the compare strip. */
  compareSpec: string;
  /** Gallery slots: pouch front, single sachet, pouch back/nutrition, lifestyle. */
  gallery: GalleryItem[];
  /** Spec table. null value = TBC. */
  facts: Fact[];
  ingredients: string | null;
  allergens: string | null;
  /** Caffeine / creatine notice, shown as a warning block on the page. null = TBC. */
  warning: string | null;
  howTo: Step[];
  why: Block[];
  faqs: Faq[];
};

const gallery = (name: string): GalleryItem[] => [
  { label: "POUCH FRONT", alt: `${name} pouch, front`, src: null },
  { label: "SINGLE SACHET", alt: `${name} single sachet`, src: null },
  { label: "POUCH BACK / NUTRITION", alt: `${name} pouch, back with nutrition panel`, src: null },
  { label: "LIFESTYLE PHOTO", alt: `${name} in training`, src: null },
];

// TODO: all copy below is placeholder wording. No medical claims.
const commonFaqs = (name: string): Faq[] => [
  { q: "How many sachets in a pouch?", a: "12 sachets in every stand-up pouch. [PLACEHOLDER]" },
  { q: "Does it need refrigeration?", a: "No. Keep it in a cool, dry place and toss a few in your gym bag. [PLACEHOLDER]" },
  { q: "Do you deliver in Lebanon?", a: "Yes. We deliver across Lebanon, cash on delivery. We confirm details with you on WhatsApp. [PLACEHOLDER]" },
  { q: `Can I mix ${name} with other MIEL+ flavours?`, a: "Yes. Mix and match your pouches. [PLACEHOLDER]" },
];

export const products: Product[] = [
  {
    id: "red-burn",
    slug: "red-burn",
    name: "RED BURN",
    descriptor: "Endurance Honey",
    flavor: "Pomegranate + beet",
    spec: "22G · CARBS 17G · STIM-FREE",
    price: POUCH_PRICE,
    glow: "rgba(190, 30, 60, 0.45)",
    image: null,
    imageAlt: "RED BURN Endurance Honey pouch, pomegranate and beet",
    description: "Pomegranate and beet in real honey. Built for the long run, the long ride, the long grind.",
    chips: ["12 SACHETS", "22G EACH", "STIM-FREE"],
    compareSpec: "22G · STIM-FREE",
    gallery: gallery("RED BURN"),
    facts: [
      { label: "Flavor", value: "POMEGRANATE + BEET" },
      { label: "Sachet size", value: "22G" },
      { label: "Sachets per pouch", value: "12" },
      { label: "Carbs per sachet", value: "17G" }, // from brief example; confirm
      { label: "Caffeine", value: "STIM-FREE" },
      { label: "Energy", value: null },
      { label: "Sodium", value: null },
      { label: "Shelf life", value: null },
    ],
    ingredients: null,
    allergens: null,
    warning: null,
    howTo: [
      { title: "Before", text: "Take one sachet before a long effort." },
      { title: "During", text: "Take another during, as the effort drags on." },
      { title: "Repeat", text: "Carry a few. Repeat as needed on long days." },
    ],
    why: [
      { title: "Built for distance", text: "Honey carbs made for efforts that go long." },
      { title: "Stim-free", text: "No caffeine. Use it any time of day." },
      { title: "Easy to carry", text: "One tear-open sachet. No chewing, no mixing." },
    ],
    faqs: [
      { q: "What's in it?", a: "Honey with pomegranate and beet. Full ingredient list in the section above. [PLACEHOLDER]" },
      { q: "When should I take it?", a: "Before and during long efforts like runs and rides. [PLACEHOLDER]" },
      { q: "Is it stim-free?", a: "Yes. RED BURN has no caffeine. [PLACEHOLDER]" },
      ...commonFaqs("RED BURN"),
    ],
  },
  {
    id: "gold",
    slug: "gold",
    name: "GOLD",
    descriptor: "Energy Honey",
    flavor: "Vanilla + 150mg caffeine",
    spec: "~21G · 150MG CAFFEINE",
    price: POUCH_PRICE,
    glow: "rgba(236, 178, 60, 0.4)",
    image: null,
    imageAlt: "GOLD Energy Honey pouch, vanilla with caffeine",
    description: "Smooth vanilla honey with 150mg of caffeine per sachet. Take it before you train and go.",
    chips: ["12 SACHETS", "~21G EACH", "150MG CAFFEINE"],
    compareSpec: "~21G · 150MG CAFFEINE",
    gallery: gallery("GOLD"),
    facts: [
      { label: "Flavor", value: "VANILLA" },
      { label: "Sachet size", value: "~21G" },
      { label: "Sachets per pouch", value: "12" },
      { label: "Caffeine per sachet", value: "150MG" },
      { label: "Carbs per sachet", value: null },
      { label: "Energy", value: null },
      { label: "Sodium", value: null },
      { label: "Shelf life", value: null },
    ],
    ingredients: null,
    allergens: null,
    // TODO: replace with final, approved wording.
    warning:
      "Contains caffeine. Not recommended for children, pregnant or breastfeeding women, or people sensitive to caffeine.",
    howTo: [
      { title: "20 to 30 min before", text: "Take one sachet 20 to 30 minutes before training." },
      { title: "Train", text: "Warm up, then go. That's the plan." },
      { title: "Mind your total", text: "Keep an eye on your caffeine across the day." },
    ],
    why: [
      { title: "Pre-workout punch", text: "150mg of caffeine in a honey sachet." },
      { title: "Smooth vanilla", text: "Easy to take, easy to like." },
      { title: "Pocket-sized", text: "Tear, take, train." },
    ],
    faqs: [
      { q: "What's in it?", a: "Honey with vanilla and 150mg of caffeine per sachet. Full ingredient list in the section above. [PLACEHOLDER]" },
      { q: "When should I take it?", a: "20 to 30 minutes before training. [PLACEHOLDER]" },
      { q: "Is it stim-free?", a: "No. GOLD contains 150mg of caffeine per sachet. RED BURN and CREATINE are stim-free. [PLACEHOLDER]" },
      ...commonFaqs("GOLD"),
    ],
  },
  {
    id: "creatine",
    slug: "creatine",
    name: "CREATINE",
    descriptor: "Strength Honey",
    flavor: "5g creatine",
    spec: "20G · 5G CREATINE · STIM-FREE",
    price: POUCH_PRICE,
    glow: "rgba(205, 212, 224, 0.32)",
    image: null,
    imageAlt: "CREATINE Strength Honey pouch",
    description: "5g of creatine in every honey sachet. No scoops, no powder, no mess. Built for strength days.",
    chips: ["12 SACHETS", "20G EACH", "5G CREATINE"],
    compareSpec: "20G · 5G CREATINE",
    gallery: gallery("CREATINE"),
    facts: [
      { label: "Flavor", value: null },
      { label: "Sachet size", value: "20G" },
      { label: "Sachets per pouch", value: "12" },
      { label: "Creatine per sachet", value: "5G" },
      { label: "Caffeine", value: "STIM-FREE" },
      { label: "Carbs per sachet", value: null },
      { label: "Energy", value: null },
      { label: "Shelf life", value: null },
    ],
    ingredients: null,
    allergens: null,
    warning: null, // TBC: creatine notice
    howTo: [
      { title: "Daily", text: "Take one sachet a day." },
      { title: "Any time", text: "Before, after, or on rest days. Your call." },
      { title: "Stay consistent", text: "Make it part of your routine." },
    ],
    why: [
      { title: "5g per sachet", text: "A full serving of creatine in one tear-open sachet." },
      { title: "No scoops", text: "No powder, no shaker, no mess." },
      { title: "Stim-free", text: "No caffeine. Take it any time." },
    ],
    faqs: [
      { q: "What's in it?", a: "Honey with 5g of creatine per sachet. Full ingredient list in the section above. [PLACEHOLDER]" },
      { q: "When should I take it?", a: "Once a day, any time that suits you. [PLACEHOLDER]" },
      { q: "Is it stim-free?", a: "Yes. CREATINE has no caffeine. [PLACEHOLDER]" },
      ...commonFaqs("CREATINE"),
    ],
  },
];

export const getProduct = (slug: string) => products.find((p) => p.slug === slug);

export const heroImage: { src: string | null; alt: string } = {
  src: null, // TODO: hero pouch image
  alt: "MIEL+ honey sachet pouches",
};
