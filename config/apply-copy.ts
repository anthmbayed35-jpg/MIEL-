import { COPY, PRODUCT_COPY } from "./copy";
import type { Product } from "./products";

/**
 * Puts the reviewed marketing copy (config/copy.ts) on a product, by slug, whether it came from config or from the database
 * (older databases still hold the previous placeholder wording). Products with no entry in PRODUCT_COPY (new ones added later)
 * are left exactly as they are. Facts the team has not confirmed stay TBC: the carbs figure that came from a brief is cleared.
 */
export function applyCopy<T extends Product>(p: T): T {
  const c = PRODUCT_COPY[p.slug];
  if (!c) return p;
  return {
    ...p,
    headline: c.headline,
    description: c.description,
    chips: c.chips,
    spec: c.spec,
    compareSpec: c.spec,
    howTo: [...COPY.howTo.steps],
    why: [...c.benefits],
    faqs: c.faqs,
    warning: c.warning ?? p.warning,
    facts: p.facts.map((f) => (f.label === "Carbs per sachet" ? { ...f, value: null } : f)),
  };
}
