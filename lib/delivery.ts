import { getEngine } from "./db/core";

/**
 * The delivery fee: ONE flat amount for every order in every region (USD), set in Admin > Settings > Shipping & delivery.
 * It lives in `settings` under the key "delivery" as { fee }. Until the team saves it, the default below applies. The server reads it
 * for every quote and order (never the browser); an order stores the fee it was created with, so changing this never touches old orders.
 * No "server-only": the proxy-free helpers are used by tests too.
 */
export const DEFAULT_DELIVERY_FEE = 5;

export function deliveryFee(): number {
  try {
    const row = getEngine().sqlite.prepare("SELECT value FROM settings WHERE key = 'delivery'").get() as { value: string } | undefined;
    const fee = row ? Number((JSON.parse(row.value) as { fee?: unknown }).fee) : NaN;
    return Number.isFinite(fee) && fee >= 0 && fee <= 1000 ? Math.round(fee * 100) / 100 : DEFAULT_DELIVERY_FEE;
  } catch {
    return DEFAULT_DELIVERY_FEE;
  }
}

export const deliveryFeeVersion = (): number =>
  (getEngine().sqlite.prepare("SELECT version FROM settings WHERE key = 'delivery'").get() as { version: number } | undefined)?.version ?? 0;
