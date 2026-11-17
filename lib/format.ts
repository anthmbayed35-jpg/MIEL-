import { CURRENCY_SYMBOL, SACHETS_PER_POUCH } from "@/config/site";

export function money(n: number, decimals?: number): string {
  const d = decimals ?? (Number.isInteger(n) ? 0 : 2);
  return `${CURRENCY_SYMBOL}${n.toFixed(d)}`;
}

/** Per-sachet price: pouch price / sachets per pouch, rounded to 2 decimals. */
export function perSachet(pouchPrice: number): number {
  return Math.round((pouchPrice / SACHETS_PER_POUCH) * 100) / 100;
}
