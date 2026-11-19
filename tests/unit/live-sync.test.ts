import { describe, expect, it, vi } from "vitest";
import { isLivePage } from "@/lib/live-pages";

describe("live refresh scope", () => {
  it("dashboards and lists refresh live; edit and detail pages do not", () => {
    for (const p of ["/admin", "/admin/orders", "/admin/inventory", "/admin/products", "/admin/customers", "/admin/analytics", "/admin/marketing/discounts", "/admin/settings/shipping"]) expect(isLivePage(p), p).toBe(true);
    for (const p of ["/admin/orders/abc", "/admin/products/abc", "/admin/products/new", "/admin/customers/abc", "/admin/settings/team", "/admin/account", "/admin/login"]) expect(isLivePage(p), p).toBe(false);
  });
});
