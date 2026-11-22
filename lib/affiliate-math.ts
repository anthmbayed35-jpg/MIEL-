/**
 * Affiliate money maths, in integer cents and percent x100 (15% = 1500), so there is never floating point drift.
 * Pure functions: the checkout, the order transaction and the tests all use these.
 */
export const roundDiv = (n: number, d: number) => Math.round(n / d);

/** The follower discount: a percentage of the PRODUCTS subtotal (never delivery). */
export const affiliateDiscountCents = (productsSubtotalCents: number, discountPercentX100: number) =>
  Math.min(productsSubtotalCents, roundDiv(productsSubtotalCents * discountPercentX100, 10000));

/** The commission: a percentage of the DISCOUNTED products subtotal (never delivery). */
export const commissionCents = (productsSubtotalCents: number, discountCents: number, commissionPercentX100: number) =>
  roundDiv(Math.max(0, productsSubtotalCents - discountCents) * commissionPercentX100, 10000);

export const CODE_RE = /^[A-Z0-9]{3,20}$/;
export const normalizeCode = (raw: string) => String(raw ?? "").trim().toUpperCase();
export const isValidCode = (raw: string) => CODE_RE.test(normalizeCode(raw));

export type CommissionStatus = "pending" | "approved" | "paid" | "void";

/** Where a commission stands, given the order and today (the same rule the database job applies). */
export function nextCommissionStatus(
  o: { status: string; commission_status: CommissionStatus | null; delivered_at: string | null },
  now: Date,
  approvalDays: number,
): CommissionStatus | null {
  if (!o.commission_status || o.commission_status === "void") return o.commission_status;
  // cancelled or returned: void. If it was already paid it stays visible as a correction owed back (see recordPayout)
  if (o.status === "cancelled" || o.status === "returned") return "void";
  if (o.commission_status === "paid") return "paid";
  if (o.status === "delivered" && o.delivered_at && now.getTime() - new Date(o.delivered_at).getTime() >= approvalDays * 86_400_000) return "approved";
  return o.commission_status;
}
