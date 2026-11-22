import { describe, expect, it } from "vitest";
import { affiliateDiscountCents, commissionCents, isValidCode, nextCommissionStatus, normalizeCode } from "@/lib/affiliate-math";
import { suggestedTier } from "@/lib/affiliates";

describe("affiliate discount maths (cents, percent x100)", () => {
  it("10% of the products subtotal", () => {
    expect(affiliateDiscountCents(6000, 1000)).toBe(600);
    expect(affiliateDiscountCents(3000, 1000)).toBe(300);
  });
  it("rounds to the nearest cent and never exceeds the subtotal", () => {
    expect(affiliateDiscountCents(3333, 1000)).toBe(333);
    expect(affiliateDiscountCents(3335, 1000)).toBe(334);
    expect(affiliateDiscountCents(1999, 12_50)).toBe(250); // 12.5% of 19.99
    expect(affiliateDiscountCents(5000, 10000)).toBe(5000);
    expect(affiliateDiscountCents(5000, 0)).toBe(0);
    expect(affiliateDiscountCents(0, 1000)).toBe(0);
  });
});

describe("affiliate commission maths", () => {
  it("is a percentage of the DISCOUNTED products subtotal", () => {
    expect(commissionCents(6000, 600, 1500)).toBe(810); // 15% of 54.00
    expect(commissionCents(3000, 300, 1500)).toBe(405);
    expect(commissionCents(3000, 0, 2000)).toBe(600);
  });
  it("rounds to the nearest cent, never negative, zero rate earns nothing", () => {
    expect(commissionCents(3333, 333, 1500)).toBe(450);
    expect(commissionCents(1000, 5000, 1500)).toBe(0);
    expect(commissionCents(6000, 600, 0)).toBe(0);
  });
});

describe("codes", () => {
  it("are case-insensitive and 3 to 20 letters or numbers", () => {
    expect(normalizeCode("  rami10 ")).toBe("RAMI10");
    for (const ok of ["abc", "RAMI10", "a1b2c3d4e5f6g7h8i9j0"]) expect(isValidCode(ok), ok).toBe(true);
    for (const bad of ["ab", "", "RAMI 10", "RAMI-10", "a1b2c3d4e5f6g7h8i9j01", "ÉCLAIR", "<script>"]) expect(isValidCode(bad), bad).toBe(false);
  });
});

describe("commission status over time", () => {
  const now = new Date("2026-12-01T12:00:00Z");
  const delivered = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString();
  it("stays pending until the order is delivered, then 14 days", () => {
    expect(nextCommissionStatus({ status: "new", commission_status: "pending", delivered_at: null }, now, 14)).toBe("pending");
    expect(nextCommissionStatus({ status: "delivered", commission_status: "pending", delivered_at: delivered(13) }, now, 14)).toBe("pending");
    expect(nextCommissionStatus({ status: "delivered", commission_status: "pending", delivered_at: delivered(14) }, now, 14)).toBe("approved");
  });
  it("is void for cancelled or returned orders; paid and void are final", () => {
    expect(nextCommissionStatus({ status: "cancelled", commission_status: "pending", delivered_at: null }, now, 14)).toBe("void");
    expect(nextCommissionStatus({ status: "returned", commission_status: "approved", delivered_at: delivered(30) }, now, 14)).toBe("void");
    expect(nextCommissionStatus({ status: "delivered", commission_status: "paid", delivered_at: delivered(30) }, now, 14)).toBe("paid");
    expect(nextCommissionStatus({ status: "delivered", commission_status: "void", delivered_at: delivered(30) }, now, 14)).toBe("void");
    expect(nextCommissionStatus({ status: "delivered", commission_status: null, delivered_at: delivered(30) }, now, 14)).toBeNull();
  });
});

describe("tier suggestion", () => {
  it("athlete at 10 delivered orders, ambassador at 30, only upwards", () => {
    expect(suggestedTier(9, "seed")).toBeNull();
    expect(suggestedTier(10, "seed")).toBe("athlete");
    expect(suggestedTier(29, "seed")).toBe("athlete");
    expect(suggestedTier(30, "seed")).toBe("ambassador");
    expect(suggestedTier(30, "athlete")).toBe("ambassador");
    expect(suggestedTier(12, "athlete")).toBeNull();
    expect(suggestedTier(99, "ambassador")).toBeNull();
  });
});
