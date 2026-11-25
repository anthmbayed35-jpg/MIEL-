/**
 * Text normalisation for searching place names in English and Arabic (used by the checkout selectors and the admin Locations search).
 * English: accents and punctuation are ignored ("Zahlé" finds "Zahle"). Arabic: diacritics, tatweel and letter variants are ignored
 * (alef forms, ya/alef maqsura, ta marbuta), so "عاليه" finds "عالية" and "بعلبك" finds "بعلبك - الهرمل".
 * Pure and dependency free: it runs in the browser and on the server.
 */
export function foldEnglish(s: string): string {
  return String(s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function foldArabic(s: string): string {
  return String(s ?? "")
    .replace(/[ً-ٰٟـ]/g, "") // tashkeel and tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^؀-ۿ0-9]+/g, " ")
    .trim();
}

const hasArabic = (s: string) => /[؀-ۿ]/.test(s);

/** Does a place (English + Arabic name) match what the person typed? An empty query matches everything. */
export function placeMatches(place: { en: string; ar?: string }, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  if (hasArabic(q)) return foldArabic(place.ar ?? "").includes(foldArabic(q));
  const f = foldEnglish(q);
  return !f || foldEnglish(place.en).includes(f);
}

/** Matches that START with the query first, then the rest (each group in the given order). */
export function rankPlaces<T extends { en: string; ar?: string }>(places: T[], query: string): T[] {
  const q = query.trim();
  const hits = places.filter((p) => placeMatches(p, q));
  if (!q) return hits;
  const starts = (p: T) => (hasArabic(q) ? foldArabic(p.ar ?? "").startsWith(foldArabic(q)) : foldEnglish(p.en).startsWith(foldEnglish(q)));
  return [...hits.filter(starts), ...hits.filter((p) => !starts(p))];
}

// ---------------------------------------------------------------- spelling-tolerant matching (transliteration variants, typos)
const ARTICLES = new Set(["el", "al", "ech", "ej", "ed", "es", "ez", "er", "en", "et", "eth", "ad", "an", "ar", "as", "at", "az", "ash", "ed", "ej", "il", "l"]);

/**
 * A consonant "skeleton" of an English place name, so different transliterations of the same name collapse together:
 * Antelias / Antilias / Antélias -> "ntls", Zahle / Zahleh / Zahlé -> "shl", Jal el Dib / Jal ed Dib -> "jldb".
 * Articles (el, al, ech...) and vowels are dropped, doubled letters merge. Used only as a fuzzy tier: exact and prefix matches rank first.
 */
export function skeleton(s: string): string {
  const words = foldEnglish(s)
    .split(" ")
    .filter((w) => w && !ARTICLES.has(w));
  return words
    .map((w) =>
      w
        .replace(/ph/g, "f")
        .replace(/kh/g, "k")
        .replace(/gh/g, "g")
        .replace(/sh|ch/g, "s")
        .replace(/th/g, "t")
        .replace(/dh/g, "d")
        .replace(/[qc]/g, "k")
        .replace(/z/g, "s")
        .replace(/p/g, "b")
        .replace(/v/g, "f")
        .replace(/[aeiouyw]/g, "")
        .replace(/h+$/, "")
        .replace(/(.)\1+/g, "$1"),
    )
    .join("");
}

/** Edit distance (insert, delete, replace, swap of neighbours) between a and b, giving up (returning max + 1) as soon as it must exceed `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length] <= max ? prev[b.length] : max + 1;
}
