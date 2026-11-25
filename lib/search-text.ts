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
