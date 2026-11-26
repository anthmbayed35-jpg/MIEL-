import { claimsOn, copyFor, productCopy } from "./copy";
import type { Product } from "./products";

/**
 * Puts the reviewed marketing copy (config/copy.ts) on a product, by slug, whether it came from config or from the database
 * (older databases still hold earlier wording). Products with no entry in the copy file (new ones added later) are left exactly as they
 * are. Which wording is used depends on COPY_CLAIMS (default ON; "off" = facts-only lines). Facts the team has not confirmed stay TBC:
 * the carbs figure that came from a brief is cleared.
 */
export function applyCopy<T extends Product>(p: T, claims?: boolean): T {
  const c = productCopy(p.slug, claims);
  if (!c) return p;
  return {
    ...p,
    headline: c.headline,
    description: c.description,
    chips: c.chips,
    spec: c.spec,
    compareSpec: c.spec,
    howTo: [...copyFor(claims ?? claimsOn()).howTo.steps],
    why: [...c.benefits],
    faqs: c.faqs,
    warning: c.warning ?? p.warning,
    pageCopy: { tagline: c.tagline, taglineShort: c.taglineShort, body: c.body, whyToday: c.whyToday, takeWhen: c.takeWhen, compare: c.compare, moment: c.moment },
    facts: p.facts.map((f) => (f.label === "Carbs per sachet" ? { ...f, value: null } : f)),
  };
}
