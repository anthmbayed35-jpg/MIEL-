import { editDistance, foldArabic, foldEnglish, skeleton } from "./search-text";

/**
 * Instant place search over ALL regions of Lebanon, in the browser (no server call per keystroke) and in tests.
 * Matches any name or alias in English or Arabic, ignoring case, accents and Arabic diacritics, and tolerates spelling variants
 * (Antelias / Antilias, Zahle / Zahleh) and small typos. Exact and prefix matches rank first; among equal matches the bigger place wins
 * over a hamlet with the same name. Pure and dependency free.
 */

/** The compact index the checkout downloads (see /api/locations/index). Arrays keep it small: it is gzipped on the wire. */
export type IndexData = {
  /** version string: changes whenever the team edits a location (used as the cache key) */
  v: string;
  /** governorates: [id, english, arabic] */
  g: [string, string, string][];
  /** districts: [id, governorate index, english, arabic] */
  d: [string, number, string, string][];
  /** regions: [id, district index, english, arabic, weight 1-5, aliases joined with "|"] */
  r: [string, number, string, string, number, string][];
};

export type PlaceHit = {
  id: string;
  en: string;
  ar: string;
  districtId: string;
  district: string;
  districtAr: string;
  governorateId: string;
  governorate: string;
  /** "Dbayeh, El Meten, Mount Lebanon" */
  label: string;
  score: number;
  /** the alias that matched, when it is not the display name */
  via?: string;
};

type Prepared = {
  i: number;
  en: string;
  ar: string;
  w: number;
  di: number;
  /** english names (display name first), folded and skeletonised */
  names: { raw: string; f: string; s: string; words: string[] }[];
  /** arabic names folded */
  arNames: { raw: string; f: string; words: string[] }[];
};
export type SearchIndex = { data: IndexData; regions: Prepared[] };

const isArabicText = (s: string) => /[؀-ۿ]/.test(s);

const LEADING_ARTICLES = new Set(["el", "al", "ech", "ed", "es", "ez", "er", "en", "et", "eth", "ad", "an", "ar", "as", "at", "az", "ash"]);

export function buildSearchIndex(data: IndexData): SearchIndex {
  const regions: Prepared[] = data.r.map((r, i) => {
    const aliases = r[5] ? r[5].split("|") : [];
    const names = [r[2], ...aliases.filter((a) => !isArabicText(a))].flatMap((raw) => {
      const f = foldEnglish(raw);
      const one = { raw, f, s: skeleton(raw), words: f.split(" ") };
      // "El Hamra" is also found as "Hamra": the same name without its article is a second spelling of it
      const bare = one.words.length > 1 && LEADING_ARTICLES.has(one.words[0]) ? one.words.slice(1).join(" ") : "";
      return bare ? [one, { raw, f: bare, s: skeleton(bare), words: bare.split(" ") }] : [one];
    });
    const arNames = [r[3], ...aliases.filter(isArabicText)]
      .filter(Boolean)
      .map((raw) => {
        const f = foldArabic(raw);
        return { raw, f, words: f.split(" ") };
      });
    return { i, en: r[2], ar: r[3], w: r[4], di: r[1], names, arNames };
  });
  return { data, regions };
}

const PREFIX = 90;
const EXACT = 100;
const WORD_PREFIX = 75;
const SKELETON_EQUAL = 62;
const SKELETON_PREFIX = 52;
const CONTAINS = 55;

/** Score of one (folded) name against the folded query, or 0. `fuzzy` switches on typo tolerance. */
function scoreEnglish(n: { f: string; s: string; words: string[] }, q: string, qs: string, fuzzy: boolean): number {
  if (n.f === q) return EXACT;
  if (n.f.startsWith(q)) return PREFIX;
  if (q.length >= 2 && n.words.some((w, i) => i > 0 && w.startsWith(q))) return WORD_PREFIX;
  if (q.length >= 3 && n.f.includes(q)) return CONTAINS;
  if (q.length >= 3 && qs.length >= 2 && q.length <= qs.length * 2 + 2) {
    // (the length guard keeps a mash of consonants such as "qqqqzzzz" from collapsing to a 2-letter skeleton that matches many names)
    if (n.s === qs) return SKELETON_EQUAL;
    if (qs.length >= 3 && n.s.startsWith(qs)) return SKELETON_PREFIX;
  }
  if (fuzzy && q.length >= 4) {
    const k = q.length >= 8 ? 2 : 1;
    // a typo anywhere: compare with the whole name, with the same-length start of the name, and with each word
    let best = editDistance(q, n.f, k);
    if (best > k) best = Math.min(best, editDistance(q, n.f.slice(0, q.length), k), editDistance(q, n.f.slice(0, q.length + 1), k));
    if (best > k) for (const w of n.words) if (w.length >= 4) best = Math.min(best, editDistance(q, w, k));
    if (best <= k) return 46 - best * 8;
  }
  return 0;
}

function scoreArabic(n: { f: string; words: string[] }, q: string, fuzzy: boolean): number {
  if (!n.f) return 0;
  if (n.f === q) return EXACT;
  if (n.f.startsWith(q)) return PREFIX;
  if (q.length >= 2 && n.words.some((w, i) => i > 0 && w.startsWith(q))) return WORD_PREFIX;
  if (q.length >= 3 && n.f.includes(q)) return CONTAINS;
  if (fuzzy && q.length >= 4 && editDistance(q, n.f, 1) <= 1) return 40;
  return 0;
}

/**
 * Suggestions for what the customer typed. Returns at most `limit` regions, best first. An empty or one-letter query still returns prefix
 * matches. Never throws.
 */
export function searchPlaces(index: SearchIndex, query: string, limit = 8): PlaceHit[] {
  const raw = String(query ?? "").trim();
  if (!raw) return [];
  const arabic = isArabicText(raw);
  const q = arabic ? foldArabic(raw) : foldEnglish(raw);
  if (!q) return [];
  const qs = arabic ? "" : skeleton(raw);
  const scored: { r: Prepared; score: number; via?: string }[] = [];
  const pass = (fuzzy: boolean, skip: Set<number>) => {
    for (const r of index.regions) {
      if (skip.has(r.i)) continue;
      let best = 0;
      let via: string | undefined;
      if (arabic) {
        for (const n of r.arNames) {
          const s = scoreArabic(n, q, fuzzy);
          if (s > best) {
            best = s;
            via = n.raw === r.ar ? undefined : n.raw;
          }
        }
      } else {
        for (let k = 0; k < r.names.length; k++) {
          const s = scoreEnglish(r.names[k], q, qs, fuzzy);
          if (s > best) {
            best = s;
            via = k === 0 || r.names[k].raw === r.en ? undefined : r.names[k].raw;
          }
        }
      }
      if (best > 0) scored.push({ r, score: best, via });
    }
  };
  pass(false, new Set());
  // typo tolerance only when the plain matches are few (keeps the common case fast)
  if (scored.filter((s) => s.score >= CONTAINS).length < limit && q.length >= 4) pass(true, new Set(scored.map((s) => s.r.i)));
  // rank: match quality first, then bigger places above tiny hamlets, then name
  scored.sort((a, b) => b.score * 10 + b.r.w * 8 - (a.score * 10 + a.r.w * 8) || a.r.en.localeCompare(b.r.en));
  return scored.slice(0, limit).map(({ r, score, via }) => {
    const d = index.data.d[r.di];
    const g = index.data.g[d[1]];
    return {
      id: index.data.r[r.i][0], en: r.en, ar: r.ar, districtId: d[0], district: d[2], districtAr: d[3], governorateId: g[0], governorate: g[1],
      label: `${r.en}, ${d[2]}${d[2] === g[1] ? "" : `, ${g[1]}`}`, score, via,
    };
  });
}

/** The district a region id belongs to, from the index (used to keep the selectors in sync). */
export function regionById(index: SearchIndex, id: string): PlaceHit | null {
  const i = index.data.r.findIndex((r) => r[0] === id);
  if (i < 0) return null;
  const r = index.regions[i];
  const d = index.data.d[r.di];
  const g = index.data.g[d[1]];
  return { id, en: r.en, ar: r.ar, districtId: d[0], district: d[2], districtAr: d[3], governorateId: g[0], governorate: g[1], label: `${r.en}, ${d[2]}`, score: 0 };
}
