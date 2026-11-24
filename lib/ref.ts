/**
 * The personal link of an affiliate is  https://<site>/?ref=CODE . Opening it remembers the code in the browser (30 days) and the
 * checkout fills the discount field with it. The code is only ever a suggestion: the server decides whether it is valid, active,
 * and what it is worth (see quoteSync), exactly as if the customer had typed it.
 */
export const REF_PARAM = "ref";
export const REF_KEY = "miel_ref";
export const REF_DAYS = 30;
const CODE = /^[A-Za-z0-9]{3,20}$/;

/** The code in a query string like "?ref=rami10&utm_source=x", uppercased, or null when it is missing or not shaped like a code. */
export function parseRef(search: string): string | null {
  const v = new URLSearchParams(search).get(REF_PARAM);
  return v && CODE.test(v.trim()) ? v.trim().toUpperCase() : null;
}

/** What is stored: the code and when it was saved. */
export const encodeRef = (code: string, now = Date.now()) => JSON.stringify({ code, at: now });

/** The stored code if it is well formed and younger than REF_DAYS, otherwise null. Garbage in storage never throws. */
export function decodeRef(raw: string | null, now = Date.now()): string | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { code?: unknown; at?: unknown };
    if (typeof v.code !== "string" || typeof v.at !== "number" || !CODE.test(v.code)) return null;
    if (now - v.at > REF_DAYS * 86_400_000 || v.at > now + 86_400_000) return null;
    return v.code.toUpperCase();
  } catch {
    return null;
  }
}
