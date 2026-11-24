import { AFFILIATE_TIERS, COMMISSION_APPROVAL_DAYS, DEFAULT_CUSTOMER_DISCOUNT_PERCENT, TIER_RULES, type AffiliateTier } from "@/config/affiliates";
import { getEngine } from "./db/core";

/**
 * The ambassador program settings the team edits in the admin (Ambassadors > Settings): tier names, the delivered-order thresholds,
 * commission rates, perks, the follower discount, the hold period, the minimum payout, the terms (with a version number) and the
 * home page banner. They live in the `settings` table (key "ambassador_program") and every field falls back to config/affiliates.ts,
 * so a fresh database already has a complete program. No "server-only": the proxy-free pure parts are used by tests too.
 */
export type TierSetting = { label: string; minDelivered: number; commissionPercent: number; perks: string[] };
export type Program = {
  tiers: Record<AffiliateTier, TierSetting>;
  customerDiscountPercent: number;
  holdDays: number;
  minPayoutCents: number;
  autoUpgrade: boolean;
  termsVersion: number;
  termsText: string;
  banner: { enabled: boolean; text: string };
};

export const DEFAULT_PERKS: Record<AffiliateTier, string[]> = {
  seed: ["Your own code and personal link", "Your own page with live sales", "Monthly missions with bonuses", "A starter kit of MIEL+"],
  athlete: ["Everything in Seed", "A free pouch every month", "Early access to new flavours", "A higher commission on every order"],
  ambassador: ["Everything in Athlete", "Featured on the MIEL+ site", "The highest commission", "A direct line to the team"],
};

export const DEFAULT_TERMS = `MIEL+ AMBASSADOR TERMS

1. Who can join. You are at least 18, you train in public and you are happy to be approved by the MIEL+ team. We can pause or end any account.
2. Your code and link. Your code and personal link are yours alone. You may not use your own code on your own order. Codes and links must not be sold, bought or posted on coupon sites.
3. Say it is an ad. Every post, story or video that promotes MIEL+ must say clearly that it is an ad or a partnership (#ad, #MIELplus), as the law and the platforms require.
4. No health or medical claims. MIEL+ is honey sports nutrition. Never say that it treats, cures or prevents anything, never promise results or weight loss, and never compare it with medicines. Talk about taste, your training and how you use it.
5. Commission. You earn the commission rate of your tier on the discounted products subtotal of each order placed with your code or link, delivery excluded. A commission is pending until the order is delivered, becomes approved after the hold period, and is void if the order is cancelled, refused or returned. If a commission was already paid and the order is then returned, it is taken off your next payout.
6. Payouts. Approved commission and approved mission bonuses can be paid out once they reach the minimum payout, by the method and details you give us. You are responsible for the accuracy of those details and for any tax that applies to you.
7. Conduct. No spam, no fake accounts or self-orders, no misleading content, no content that harms the MIEL+ brand. Breaking these terms can cancel your commissions and your account.
8. Changes. We may change the program or these terms with notice in your portal. Keep using your account to accept the new version.`;

export function defaultProgram(): Program {
  const tiers = Object.fromEntries(AFFILIATE_TIERS.map((t) => [t, { label: TIER_RULES[t].label, minDelivered: TIER_RULES[t].minDelivered, commissionPercent: TIER_RULES[t].commissionPercent, perks: DEFAULT_PERKS[t] }])) as Record<AffiliateTier, TierSetting>;
  return { tiers, customerDiscountPercent: DEFAULT_CUSTOMER_DISCOUNT_PERCENT, holdDays: COMMISSION_APPROVAL_DAYS, minPayoutCents: 2000, autoUpgrade: false, termsVersion: 1, termsText: DEFAULT_TERMS, banner: { enabled: false, text: "Train with MIEL+. Become an ambassador." } };
}

const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

/** Merge what is stored over the defaults, field by field, and never trust the shape of the stored value. */
export function mergeProgram(stored: unknown): Program {
  const d = defaultProgram();
  const s = (stored && typeof stored === "object" ? stored : {}) as Record<string, any>;
  const tiers = { ...d.tiers };
  for (const t of AFFILIATE_TIERS) {
    const x = s.tiers?.[t];
    if (!x || typeof x !== "object") continue;
    tiers[t] = {
      label: typeof x.label === "string" && x.label.trim() ? x.label.trim().slice(0, 30) : d.tiers[t].label,
      minDelivered: Math.floor(num(x.minDelivered, 0, 100000, d.tiers[t].minDelivered)),
      commissionPercent: num(x.commissionPercent, 0, 100, d.tiers[t].commissionPercent),
      perks: Array.isArray(x.perks) ? x.perks.filter((p: unknown) => typeof p === "string" && p.trim()).map((p: string) => p.trim().slice(0, 120)).slice(0, 10) : d.tiers[t].perks,
    };
  }
  return {
    tiers,
    customerDiscountPercent: num(s.customerDiscountPercent, 0, 100, d.customerDiscountPercent),
    holdDays: Math.floor(num(s.holdDays, 0, 365, d.holdDays)),
    minPayoutCents: Math.floor(num(s.minPayoutCents, 100, 10_000_000, d.minPayoutCents)),
    autoUpgrade: s.autoUpgrade === true,
    termsVersion: Math.floor(num(s.termsVersion, 1, 100000, d.termsVersion)),
    termsText: typeof s.termsText === "string" && s.termsText.trim() ? s.termsText : d.termsText,
    banner: { enabled: s.banner?.enabled === true, text: typeof s.banner?.text === "string" && s.banner.text.trim() ? s.banner.text.trim().slice(0, 140) : d.banner.text },
  };
}

export function getProgram(): Program {
  const row = getEngine().sqlite.prepare("SELECT value FROM settings WHERE key = 'ambassador_program'").get() as { value: string } | undefined;
  let stored: unknown = null;
  try {
    stored = row ? JSON.parse(row.value) : null;
  } catch {
    stored = null;
  }
  return mergeProgram(stored);
}

export const programVersion = (): number => (getEngine().sqlite.prepare("SELECT version FROM settings WHERE key = 'ambassador_program'").get() as { version: number } | undefined)?.version ?? 0;
