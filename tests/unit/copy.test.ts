import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { copyFor, claimsOn, JOBS, PRODUCT_COPY_OFF, PRODUCT_COPY_ON, TBC, isLegacyFaq } from "../../config/copy";
import { applyCopy } from "../../config/apply-copy";
import { products } from "../../config/products";

const ROOT = path.resolve(__dirname, "../..");
const DOC = path.join(ROOT, "docs/COPY.md");
const MODES = [
  { name: "COPY_CLAIMS on", claims: true, products: PRODUCT_COPY_ON },
  { name: "COPY_CLAIMS=off", claims: false, products: PRODUCT_COPY_OFF },
] as const;

/** Every string in a copy tree, with where it is. */
function strings(v: unknown, at: string, out: { at: string; text: string }[] = []) {
  if (typeof v === "string") out.push({ at, text: v });
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${at}[${i}]`, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) strings(x, at ? `${at}.${k}` : k, out);
  return out;
}
const allFor = (m: (typeof MODES)[number]) => [...strings(copyFor(m.claims), "home"), ...strings(m.products, "product")];

// HARD LIMITS: the product name RED BURN is the only allowed "burn". Everything else here must never appear in any copy string.
const BANNED = /\b(burn\w*|fat loss|lose weight|weight loss|muscle gain|cure[sd]?|curing|treat\w*|prevent\w*|guarantee\w*|boost\w*|transform\w*)\b/i;
const SCARCITY = /\b(left|limited|hurry|last chance|countdown|only \d+|selling fast|sold out|offer|% off|discount)\b/i;

afterEach(() => {
  delete process.env.COPY_CLAIMS;
});

describe("storefront copy rules (both modes)", () => {
  for (const m of MODES) {
    it(`${m.name}: no banned claim words, no scarcity, no competitor names`, () => {
      for (const s of allFor(m)) {
        const text = s.text.split("RED BURN").join("RED ");
        expect(text, `${s.at}: ${s.text}`).not.toMatch(BANNED);
        expect(s.text, `${s.at}: ${s.text}`).not.toMatch(SCARCITY);
        expect(s.text, `${s.at}: ${s.text}`).not.toMatch(/\b(myprotein|optimum nutrition|gu energy|maurten|science in sport|clif|gatorade|red bull|monster)\b/i);
      }
    });

    it(`${m.name}: only the printed facts are numeric (150 mg, 5 g, sachet sizes, 12)`, () => {
      const nums = allFor(m).flatMap((s) => [...s.text.matchAll(/\d+(?:\.\d+)?\s*(?:mg|g)\b/gi)].map((x) => x[0].toLowerCase().replace(/\s+/g, "")));
      for (const n of nums) expect(["150mg", "5g", "22g", "21g", "20g"]).toContain(n);
    });

    it(`${m.name}: every product has every block (no blank gaps)`, () => {
      for (const slug of ["gold", "red-burn", "creatine"]) {
        const c = m.products[slug];
        for (const [k, v] of Object.entries(c)) if (typeof v === "string") expect(v.trim().length, `${slug}.${k}`).toBeGreaterThan(0);
        expect(c.takeWhen, slug).toHaveLength(3);
        expect(c.benefits, slug).toHaveLength(3);
        for (const b of c.benefits) expect(b.title && b.text, slug).toBeTruthy();
        expect(c.compare.old && c.compare.now, slug).toBeTruthy();
        expect(c.moment.label && c.moment.category && c.moment.line, slug).toBeTruthy();
        expect(c.chips.length, slug).toBeGreaterThan(2);
        for (const q of ["Is it halal certified?", "How many sachets are in a pouch?", "Do I need water with it?", "How do I store it?"]) expect(c.faqs.map((f) => f.q), slug).toContain(q);
        expect(c.faqs.some((f) => /medical condition, are pregnant or breastfeeding, or are under 18, check with your doctor first/.test(f.a)), slug).toBe(true);
      }
    });
  }
});

describe("the agreed wording", () => {
  it("hero, moments, the three-step how-to, closing line and chips", () => {
    const on = copyFor(true);
    expect(`${on.hero.headline1} ${on.hero.headline2}`.toLowerCase()).toBe("fuel the grind.");
    expect(on.brandTagline).toBe("HONEY FOR PERFORMANCE");
    expect(on.hero.sub).toBe("Honey fuel that does the work: quick carbs, the exact dose, nothing to mix. Rip. Sip. Go.");
    expect(on.heroChips).toEqual(["12 SACHETS", "HALAL CERTIFIED", "REAL HONEY"]);
    expect(on.hero.cta).toBe("SHOP");
    expect(on.howTo.steps.map((s) => `${s.title}: ${s.text}`)).toEqual(["Rip: Tear the notch.", "Sip: Squeeze or sip straight.", "Go: Get on with it."]);
    expect(on.finalCta).toMatchObject({ title1: "Pick your moment.", title2: "Rip. Sip. Go." });
    expect(on.ticker).toEqual(["HALAL CERTIFIED", "STIM-FREE (RED BURN)", "RAW HONEY", "NO MIXING", "NO SCOOP", "12 SACHETS PER POUCH"]);
    expect(on.heroFacts).toEqual(["HALAL CERTIFIED", "12 SACHETS PER POUCH", "NO SCOOP", "NO MIXING"]);
    expect(on.announcement).toBe("FUEL THE GRIND · DELIVERY ACROSS LEBANON · HALAL CERTIFIED");
    expect(on.hero).toMatchObject({ cta: "SHOP", cta2: "FIND YOUR MOMENT" });
    expect(PRODUCT_COPY_ON.gold.stat).toEqual({ value: "150", unit: "mg", caption: "caffeine + L-theanine" });
    expect(PRODUCT_COPY_ON["red-burn"].stat).toMatchObject({ value: "22", unit: "g" });
    expect(PRODUCT_COPY_ON.creatine.stat).toMatchObject({ value: "5", unit: "g" });
    for (const m of MODES) for (const c of Object.values(m.products)) expect(c.descriptor3.split(/[\s,]+/).filter(Boolean), c.descriptor3).toHaveLength(3); // three-word descriptors
    expect(on.usage.cards.map((c) => c.label)).toEqual(["BEFORE", "DURING", "EVERY DAY", "ON THE GO"]);
    expect(PRODUCT_COPY_ON.gold.moment).toEqual({ label: "BEFORE THE WORK", category: "ENERGY AND FOCUS", line: "150 mg of caffeine with L-theanine in vanilla honey. Rip it open in the car park." });
    expect(PRODUCT_COPY_ON["red-burn"].headline).toBe("Built for the long push.");
    expect(PRODUCT_COPY_ON.creatine.tagline).toBe("HONEY FOR STRENGTH");
  });

  it("the facts-only fallback uses the agreed lines and taglines", () => {
    const off = copyFor(false);
    expect(off.brandTagline).toBe("HONEY FOR TRAINING");
    expect(PRODUCT_COPY_OFF.gold.body).toBe("150 mg caffeine and L-theanine in vanilla honey. Rip it open in the car park.");
    expect(PRODUCT_COPY_OFF["red-burn"].body).toBe("Stim-free pomegranate-and-beet honey. No caffeine. No mixing.");
    expect(PRODUCT_COPY_OFF.creatine.body).toBe("5 g of creatine per sachet. No scoop. No shaker. No clumps.");
    expect([PRODUCT_COPY_OFF["red-burn"].tagline, PRODUCT_COPY_OFF.gold.tagline, PRODUCT_COPY_OFF.creatine.tagline]).toEqual(["HONEY FOR DISTANCE", "HONEY FOR THE WORK", "CREATINE NO SCOOP"]);
  });

  it("COPY_CLAIMS defaults ON and only 'off' switches the fallback", () => {
    expect(claimsOn()).toBe(true);
    process.env.COPY_CLAIMS = "on";
    expect(claimsOn()).toBe(true);
    process.env.COPY_CLAIMS = "OFF";
    expect(claimsOn()).toBe(false);
    const gold = products.find((p) => p.slug === "gold")!;
    expect(applyCopy(gold).pageCopy?.tagline).toBe("HONEY FOR THE WORK");
    delete process.env.COPY_CLAIMS;
    expect(applyCopy(gold).pageCopy?.tagline).toBe("HONEY FOR ENERGY AND FOCUS");
  });

  it("applies to the three launch products (also on rows read from an older database) and leaves unknown products alone", () => {
    for (const slug of ["red-burn", "gold", "creatine"]) {
      const p = products.find((x) => x.slug === slug)!;
      expect(p.headline).toBe(PRODUCT_COPY_ON[slug].headline);
      expect(p.description).not.toMatch(/PLACEHOLDER/);
      expect(p.howTo.map((s) => s.title)).toEqual(["Rip", "Sip", "Go"]);
      expect(p.facts.find((f) => f.label === "Carbs per sachet")?.value).toBeNull();
    }
    const stale = { ...products[0], slug: "red-burn", description: "old placeholder wording [PLACEHOLDER]", faqs: [] };
    expect(applyCopy(stale).description).toBe(PRODUCT_COPY_ON["red-burn"].description);
    const other = { ...products[0], slug: "new-flavour", description: "kept", pageCopy: undefined };
    expect(applyCopy(other).description).toBe("kept");
    expect(applyCopy(other).pageCopy).toBeUndefined();
  });

  it("recognises only the FAQ seeded by earlier versions as legacy", () => {
    expect(isLegacyFaq([{ q: "What's in it?", a: "x" }])).toBe(true);
    expect(isLegacyFaq([{ q: "Do I need water with it?", a: "x" }, { q: "Is it halal certified?", a: "Yes. MIEL+ is halal certified." }])).toBe(true);
    expect(isLegacyFaq([{ q: "Our own question", a: "x" }])).toBe(false);
  });
});

describe("docs/COPY.md", () => {
  it("matches config/copy.ts (regenerate with UPDATE_COPY_DOC=1) and lists every TBC", () => {
    const on = copyFor(true);
    const off = copyFor(false);
    const tbcs = [...allFor(MODES[0])].filter((s) => s.text.includes(TBC));
    const productFacts = products.flatMap((p) => [
      ...p.facts.filter((f) => f.value === null).map((f) => `${p.name}: ${f.label}`),
      ...(p.ingredients === null ? [`${p.name}: Ingredients`] : []),
      ...(p.allergens === null ? [`${p.name}: Allergens`] : []),
    ]);
    const row = (where: string, a: string, b: string, job: string) => `| ${where} | ${a.replace(/\|/g, "/")} | ${b.replace(/\|/g, "/")} | ${job} |`;
    const md: string[] = [
      "# Storefront copy (final)",
      "",
      "Generated from `config/copy.ts` (do not edit here; edit the file, then `UPDATE_COPY_DOC=1 npx vitest run tests/unit/copy.test.ts`).",
      "",
      "**Purpose of the whole site:** a visitor must understand within 10 seconds that this is honey fuel for their next session, that it is easier than what they do now, and tap Shop. Every block has one job (the Purpose column).",
      "",
      "**Modes:** `COPY_CLAIMS` defaults ON. Only `COPY_CLAIMS=off` switches to the facts-only fallback shown in the third column. Both modes are complete pages.",
      "",
      "**Hard limits (a test fails the build):** no `burn` (except the product name RED BURN), `fat loss`, `lose weight`, `muscle gain`, `cure`, `treat`, `prevent`, `guarantee`, `boost`, `transform`; no competitor names, fake reviews, ratings or sales numbers; no scarcity or offers on the storefront. Anything unconfirmed is TBC.",
      "",
      "## Home page",
      "",
      "| Block | Copy (default) | Copy (COPY_CLAIMS=off) | Purpose |",
      "|---|---|---|---|",
      row("Hero label", on.brandTagline, off.brandTagline, JOBS.hero),
      row("Hero headline", `${on.hero.headline1} ${on.hero.headline2}`, `${off.hero.headline1} ${off.hero.headline2}`, JOBS.hero),
      row("Hero subline", on.hero.sub, off.hero.sub, JOBS.hero),
      row("Hero chips", on.heroChips.join(" / "), off.heroChips.join(" / "), JOBS.heroChips),
      row("Hero button", on.hero.cta, off.hero.cta, JOBS.hero),
      row("Facts ticker", on.ticker.join(" / "), off.ticker.join(" / "), JOBS.ticker),
      row("Pick your moment: heading", `${on.moments.kicker}: ${on.moments.title1} ${on.moments.title2}`, `${off.moments.kicker}: ${off.moments.title1} ${off.moments.title2}`, JOBS.moments),
      ...(["gold", "red-burn", "creatine"] as const).map((s) =>
        row(`Moment card: ${s.toUpperCase().replace("-", " ")}`, `${PRODUCT_COPY_ON[s].moment.label} / ${PRODUCT_COPY_ON[s].moment.category} / ${PRODUCT_COPY_ON[s].moment.line}`, `${PRODUCT_COPY_OFF[s].moment.label} / ${PRODUCT_COPY_OFF[s].moment.category} / ${PRODUCT_COPY_OFF[s].moment.line}`, JOBS.moments),
      ),
      row("Announcement strip", on.announcement, off.announcement, JOBS.announcement),
      row("Header", `${on.nav.shop} / ${on.nav.moments} / ${on.nav.how} / ${on.nav.faq}; panel: ${on.nav.panelTitle}`, "Same", JOBS.nav),
      row("Hero facts row", on.heroFacts.join(" / "), off.heroFacts.join(" / "), JOBS.hero),
      row("Lineup cards", `${on.lineup.kicker}: ${on.lineup.title1} ${on.lineup.title2} (${on.lineup.perPouch}, ${on.lineup.perSachet}, ${on.lineup.add})`, "Same", JOBS.lineup),
      ...(["gold", "red-burn", "creatine"] as const).map((s) => row(`Feature panel: ${s.toUpperCase().replace("-", " ")}`, `${PRODUCT_COPY_ON[s].stat.value} ${PRODUCT_COPY_ON[s].stat.unit} ${PRODUCT_COPY_ON[s].stat.caption} / ${PRODUCT_COPY_ON[s].descriptor3}`, `${PRODUCT_COPY_OFF[s].stat.value} ${PRODUCT_COPY_OFF[s].stat.unit} ${PRODUCT_COPY_OFF[s].stat.caption} / ${PRODUCT_COPY_OFF[s].descriptor3}`, JOBS.features)),
      row("Flavour explorer", `${on.explorer.kicker}: ${on.explorer.title1} ${on.explorer.title2} (${on.explorer.benefits}, ${on.explorer.usage}, ${on.explorer.facts}; TBC facts are hidden)`, "Same", JOBS.explorer),
      row("Why honey", on.whyHoney.cards.map((c) => `${c.title} ${c.text}`).join(" / "), off.whyHoney.cards.map((c) => `${c.title} ${c.text}`).join(" / "), JOBS.whyHoney),
      row("Comparison matrix (NEEDS OWNER APPROVAL)", `${on.compare.cols.join(" / ")}: ${on.compare.rows.map((r) => `${r.label} = ${r.cells.join(" | ")}`).join("; ")}`, "Same", JOBS.homeCompare),
      row("Usage guide", on.usage.cards.map((c) => `${c.label}: ${c.text}`).join(" / ") + " " + on.usage.note, "Same", JOBS.usage),
      row("Brand story (hidden until a story film exists)", `${on.story.kicker}: ${on.story.title1} ${on.story.title2}`, "Same", JOBS.story),
      row("Reviews and gallery (hidden until approved entries exist)", `${on.community.reviewsKicker}: ${on.community.reviewsTitle1} ${on.community.reviewsTitle2} / ${on.community.galleryKicker}`, "Same", JOBS.community),
      row("Ambassador band", `${on.ambassador.kicker}: ${on.ambassador.title1} ${on.ambassador.title2} ${on.ambassador.line} [${on.ambassador.cta}]`, "Same", JOBS.ambassador),
      row("Footer", `${on.footer.slogan} / ${on.footer.halal} / ${on.footer.payments} / ${on.footer.disclaimer}`, "Same", JOBS.footer),
      row("Closing band", `${on.closing.title1} ${on.closing.title2} [${on.closing.cta}]`, `${off.closing.title1} ${off.closing.title2} [${off.closing.cta}]`, JOBS.closing),
      row("Mini add-to-cart bar (phones)", `${on.miniBar.add}; ${on.miniBar.choose}`, "Same", JOBS.miniBar),
      row("Product-page closing section", `${on.finalCta.title1} ${on.finalCta.title2} [${on.finalCta.cta}]`, `${off.finalCta.title1} ${off.finalCta.title2} [${off.finalCta.cta}]`, JOBS.finalCta),
      "",
      "### Home FAQ",
      "",
      "| Question | Answer | Purpose |",
      "|---|---|---|",
      ...on.homeFaq.map((f) => `| ${f.q} | ${f.a} | ${JOBS.homeFaq} |`),
      "",
    ];
    for (const slug of ["gold", "creatine", "red-burn"] as const) {
      const a = PRODUCT_COPY_ON[slug];
      const b = PRODUCT_COPY_OFF[slug];
      const p = products.find((x) => x.slug === slug);
      md.push(
        `## ${p?.name ?? slug}`,
        "",
        "| Block | Copy (default) | Copy (COPY_CLAIMS=off) | Purpose |",
        "|---|---|---|---|",
        row("Tagline label", `${a.tagline} (short: ${a.taglineShort})`, `${b.tagline} (short: ${b.taglineShort})`, JOBS.headline),
        row("Headline", a.headline, b.headline, JOBS.headline),
        row("Body", a.body, b.body, JOBS.headline),
        row("Why today (near price and button)", a.whyToday, b.whyToday, JOBS.whyToday),
        row("Take it when", a.takeWhen.join(" / "), b.takeWhen.join(" / "), JOBS.takeWhen),
        ...a.benefits.map((x, i) => row(`Benefit ${i + 1}`, `${x.title}: ${x.text}`, `${b.benefits[i].title}: ${b.benefits[i].text}`, JOBS.benefits)),
        row("Old routine vs the sachet", `${a.compare.old} vs ${a.compare.now}`, `${b.compare.old} vs ${b.compare.now}`, JOBS.compare),
        row("Rip. Sip. Go.", on.howTo.steps.map((s) => `${s.title}: ${s.text}`).join(" / "), off.howTo.steps.map((s) => `${s.title}: ${s.text}`).join(" / "), JOBS.howTo),
        row("What you get (chips)", `${a.chips.join(" / ")}; price per pouch and per sachet from the price config`, `${b.chips.join(" / ")}`, JOBS.getIt),
        ...(a.warning ? [row("Notice", a.warning, b.warning ?? "", "A caffeine notice next to the buy box (full advice TBC).")] : []),
        row("Card / search line", a.description, b.description, JOBS.moments),
        row("Sticky add-to-cart bar (phone)", "Product name, quantity, price, ADD TO CART", "Same", JOBS.stickyBar),
        "",
        `FAQ (${JOBS.faq})`,
        "",
        ...a.faqs.flatMap((f) => [`**${f.q}** ${f.a}`, ""]),
      );
    }
    md.push(
      "## Page titles and sharing",
      "",
      `- Site title: ${on.site.title}. Description: ${on.site.description}`,
      "- Product pages: `<NAME> | <TAGLINE>`; description starts with the tagline. Open Graph and Twitter text reuse them. noindex stays while `SITE_MODE=maintenance`.",
      "- Alt text describes only what is visible in the image.",
      "",
      "## Needs owner approval before launch",
      "",
      "The comparison matrix on the home page (`compare` in `config/copy.ts`). It compares product TYPES, names no brand and is meant to be factual and non-disparaging, but each row and each cell is a statement about other products, so the owner must approve every one:",
      "",
      ...on.compare.rows.map((r) => `- **${r.label}**: ${on.compare.cols.map((c, i) => `${c} = ${r.cells[i]}`).join("; ")}`),
      "",
      "Also new in this pass and awaiting approval: the three-word descriptors (`descriptor3`), the four Why honey card bodies, and the usage-guide lines. The row \"No water needed\" was left out because the water answer is TBC.",
      "",
      "## Every TBC left",
      "",
      "Copy answers marked TBC (shown on the site as a clearly marked placeholder):",
      "",
      ...tbcs.map((s) => `- \`${s.at}\`: ${s.text}`),
      "",
      "Product facts not provided (shown as a TBC chip in the facts table):",
      "",
      ...productFacts.map((f) => `- ${f}`),
      "",
      "Other things not provided and NOT written: serving timing, water guidance, storage, allergens, shelf life, the full caffeine advice, nutrition values, delivery promises.",
      "",
    );
    const text = md.join("\n");
    if (process.env.UPDATE_COPY_DOC) fs.writeFileSync(DOC, text);
    expect(fs.existsSync(DOC), "run UPDATE_COPY_DOC=1 once to create docs/COPY.md").toBe(true);
    expect(fs.readFileSync(DOC, "utf8").split("\r\n").join("\n")).toBe(text);
    expect(tbcs.length).toBeGreaterThan(0);
  });
});
