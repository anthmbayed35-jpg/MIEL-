/**
 * Influencer affiliate programme rules. The money rules live here, in one place.
 *  - New affiliates start on the "seed" tier at the defaults below (15% commission, 10% off for their followers).
 *  - The admin suggests an upgrade once an affiliate has this many DELIVERED orders; one tap applies the tier's commission rate.
 *    An upgrade only affects orders placed afterwards (an order keeps the commission it was created with).
 *  - A commission is approved this many days after the order was delivered, and is voided if the order is cancelled or returned.
 * The athlete and ambassador rates are business decisions: change them here (percent, e.g. 20 = 20%).
 */
export const AFFILIATE_TIERS = ["seed", "athlete", "ambassador"] as const;
export type AffiliateTier = (typeof AFFILIATE_TIERS)[number];

export const TIER_RULES: Record<AffiliateTier, { label: string; minDelivered: number; commissionPercent: number }> = {
  seed: { label: "Seed", minDelivered: 0, commissionPercent: 15 },
  athlete: { label: "Athlete", minDelivered: 10, commissionPercent: 20 },
  ambassador: { label: "Ambassador", minDelivered: 30, commissionPercent: 25 },
};

export const DEFAULT_COMMISSION_PERCENT = 15;
export const DEFAULT_CUSTOMER_DISCOUNT_PERCENT = 10;
export const COMMISSION_APPROVAL_DAYS = 14;
export const AFFILIATE_STATUSES = ["active", "paused", "ended"] as const;
