import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COPY, PRODUCT_COPY, TBC } from "../../config/copy";
import { applyCopy } from "../../config/apply-copy";
import { products } from "../../config/products";

const ROOT = path.resolve(__dirname, "../..");
const DOC = path.join(ROOT, "docs/COPY.md");

/** Every string in the copy file, with where it is. */
function strings(v: unknown, at: string, out: { at: string; text: string }[] = []) {
  if (typeof v === "string") out.push({ at, text: v });
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${at}[${i}]`, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) strings(x, at ? `${at}.${k}` : k, out);
  return out;
}
const all = [...strings(COPY, "home"), ...strings(PRODUCT_COPY, "product")];

// words that would be a health, medical, weight-loss or performance claim, or a comparison (the product classification is not confirmed)
const BANNED = /\b(boost\w*|improv\w*|cure\w*|heal\w*|health\w*|medic\w*|clinical\w*|proven|prove[sn]?|burns? fat|fat[- ]?burn\w*|weight|lose|loss|slim|detox\w*|immun\w*|recover\w*|perform\w*|gains?|muscle|stronger|faster|better|best|guarantee\w*|results?|treat\w*|prevent\w*|energi[sz]\w*|endurance|stamina|focus|alert\w*|vs|versus|than)\b/i;

describe("storefront copy rules", () => {
  it("has no health, medical, weight-loss, performance or comparison wording", () => {
    for (const s of all) expect(s.text, `${s.at}: ${s.text}`).not.toMatch(BANNED);
  });

  it("only states facts that are printed on the packs: caffeine and creatine amounts match, and nothing else numeric is invented", () => {
    const nums = all.flatMap((s) => [...s.text.matchAll(/\d+(?:\.\d+)?\s*(?:mg|g)\b/gi)].map((m) => m[0].toLowerCase().replace(/\s+/g, "")));
    for (const n of nums) expect(["150mg", "5g", "22g", "21g", "20g"]).toContain(n);
    expect(all.some((s) => /150 mg/.test(s.text))).toBe(true);
    expect(all.some((s) => /5 g/.test(s.text))).toBe(true);
  });

  it("the hero keeps the agreed headline and chips, and each product has exactly three benefits and a three-step how-to", () => {
    expect(`${COPY.hero.headline1} ${COPY.hero.headline2}`.toLowerCase()).toBe("fuel the grind.");
    expect(COPY.hero.chips).toEqual(["12 SACHETS", "REAL HONEY", "HALAL CERTIFIED"]);
    expect(COPY.howTo.steps.map((s) => s.title)).toEqual(["Rip", "Sip", "Go"]);
    for (const [slug, c] of Object.entries(PRODUCT_COPY)) {
      expect(c.benefits, slug).toHaveLength(3);
      expect(c.benefits.map((b) => b.title), slug).toEqual(["Grab and go", "Real honey taste", "Pre-measured sachets"]);
      for (const q of ["Do I need water with it?", "Is it halal certified?", "How many sachets are in a pouch?", "How do I store it?"]) expect(c.faqs.map((f) => f.q), slug).toContain(q);
    }
  });

  it("applies to the three launch products (also on rows read from an older database) and leaves unknown products alone", () => {
    for (const slug of ["red-burn", "gold", "creatine"]) {
      const p = products.find((x) => x.slug === slug)!;
      expect(p.headline).toBe(PRODUCT_COPY[slug].headline);
      expect(p.description).not.toMatch(/PLACEHOLDER/);
      expect(p.facts.find((f) => f.label === "Carbs per sachet")?.value).toBeNull();
    }
    const stale = { ...products[0], slug: "red-burn", description: "old placeholder wording [PLACEHOLDER]", faqs: [] };
    expect(applyCopy(stale).description).toBe(PRODUCT_COPY["red-burn"].description);
    const other = { ...products[0], slug: "new-flavour", description: "kept" };
    expect(applyCopy(other).description).toBe("kept");
  });

  it("docs/COPY.md matches this file (regenerate with UPDATE_COPY_DOC=1) and lists every TBC", () => {
    const tbcs = all.filter((s) => s.text.includes(TBC));
    const productFacts = products.flatMap((p) => [
      ...p.facts.filter((f) => f.value === null).map((f) => `${p.name}: ${f.label}`),
      ...(p.ingredients === null ? [`${p.name}: Ingredients`] : []),
      ...(p.allergens === null ? [`${p.name}: Allergens`] : []),
    ]);
    const md: string[] = ["# Storefront copy", "", "Generated from `config/copy.ts` (do not edit here). Review the wording there. Regenerate: `UPDATE_COPY_DOC=1 npx vitest run tests/unit/copy.test.ts`.", ""];
    md.push("## Rules followed", "", "- Benefit-led: convenience, taste, ritual, ease.", "- No health, medical, weight-loss or performance claims, no comparisons with other brands (the Ministry of Public Health has not confirmed the product classification).", "- Only facts printed on the packs: 150 mg caffeine, 5 g creatine, stim-free, halal certified, sachet sizes, 12 sachets per pouch.", "- Anything not provided is marked TBC, never invented.", "");
    md.push("## Home page", "", `- Headline: **${COPY.hero.headline1} ${COPY.hero.headline2}**`, `- Subline: ${COPY.hero.sub}`, `- Chips: ${COPY.hero.chips.join(" · ")}`, `- Button: ${COPY.hero.cta}`, `- Facts strip: ${COPY.proofStrip.join(" · ")}`, `- Lineup heading: ${COPY.lineup.title1} ${COPY.lineup.title2}`, `- How to: ${COPY.howTo.title} ${COPY.howTo.steps.map((s) => `${s.title}: ${s.text}`).join(" | ")}`, `- "${COPY.whyHoney.title1} ${COPY.whyHoney.title2}": ${COPY.whyHoney.items.map((i) => `${i.title}: ${i.text}`).join(" | ")}`, `- Price block: ${COPY.value.line}`, `- Final call to action: ${COPY.finalCta.title1} ${COPY.finalCta.title2} ${COPY.finalCta.text}`, "");
    md.push("### Home FAQ", "", ...COPY.homeFaq.flatMap((f) => [`**${f.q}**`, f.a, ""]));
    for (const [slug, c] of Object.entries(PRODUCT_COPY)) {
      const p = products.find((x) => x.slug === slug);
      md.push(`## ${p?.name ?? slug} (${p?.descriptor ?? ""}, ${p?.flavor ?? ""})`, "", `- Headline: **${c.headline}**`, `- Description: ${c.description}`, `- Chips: ${c.chips.join(" · ")}`, `- Spec line: ${c.spec}`, ...c.benefits.map((b) => `- Benefit: **${b.title}.** ${b.text}`), ...(c.warning ? [`- Notice: ${c.warning}`] : []), "", "FAQ:", "", ...c.faqs.flatMap((f) => [`**${f.q}**`, f.a, ""]));
    }
    md.push("## Every TBC left", "", "Copy answers marked TBC (shown on the site as a clearly marked placeholder):", "", ...tbcs.map((s) => `- \`${s.at}\`: ${s.text}`), "", "Product facts not provided (shown as a TBC chip in What's inside):", "", ...productFacts.map((f) => `- ${f}`), "", "Other things not provided and NOT written: timing and serving advice, storage, whether water is needed, allergens, shelf life, the full caffeine advice, nutrition values.", "");
    const text = md.join("\n");
    if (process.env.UPDATE_COPY_DOC) fs.writeFileSync(DOC, text);
    expect(fs.existsSync(DOC), "run UPDATE_COPY_DOC=1 once to create docs/COPY.md").toBe(true);
    expect(fs.readFileSync(DOC, "utf8").split("\r\n").join("\n")).toBe(text);
    expect(tbcs.length).toBeGreaterThan(0);
  });
});
