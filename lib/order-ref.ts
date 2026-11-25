/** The order number as customers see it: MP-1001. The database keeps the plain number (1001) as its counter and sort key. */
export const ORDER_PREFIX = "MP-";

export const orderRef = (n: number | string): string => `${ORDER_PREFIX}${n}`;

/** "MP-1001", "mp1001", "#1001" or "1001" -> 1001, else null. Used by the admin search. */
export function parseOrderRef(input: string): number | null {
  const m = /^\s*(?:mp[-\s]?|#)?(\d{1,9})\s*$/i.exec(input);
  return m ? Number(m[1]) : null;
}
