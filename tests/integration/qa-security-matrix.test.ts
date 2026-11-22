import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { can, type Perm } from "@/lib/roles";
import { getEngine } from "../../lib/db/core";
import { h, ID, resetState } from "../support/state";
import { seedStore } from "../support/seed";
import { placeOrder } from "@/lib/orders";
import { createAffiliate } from "@/lib/affiliates";

const sp = (o: Record<string, string> = {}) => Promise.resolve(o);
const roles = [
  ["staff", ID.staff, "staff@t.test"],
  ["manager", ID.manager, "manager@t.test"],
  ["owner", ID.owner, "owner@t.test"],
] as const;

/** page loader, the permission it needs */
const PAGES: [string, () => Promise<any>, Perm][] = [
  ["orders", () => import("@/app/admin/(app)/orders/page"), "orders.read"],
  ["new order", () => import("@/app/admin/(app)/orders/new/page"), "orders.write"],
  ["products", () => import("@/app/admin/(app)/products/page"), "products.read"],
  ["new product", () => import("@/app/admin/(app)/products/new/page"), "products.write"],
  ["inventory", () => import("@/app/admin/(app)/inventory/page"), "inventory.read"],
  ["customers", () => import("@/app/admin/(app)/customers/page"), "customers.read"],
  ["analytics", () => import("@/app/admin/(app)/analytics/page"), "analytics.read"],
  ["marketing", () => import("@/app/admin/(app)/marketing/page"), "marketing.manage"],
  ["discounts", () => import("@/app/admin/(app)/marketing/discounts/page"), "discounts.manage"],
  ["content", () => import("@/app/admin/(app)/marketing/content/page"), "content.manage"],
  ["settings", () => import("@/app/admin/(app)/settings/page"), "settings.read"],
  ["shipping", () => import("@/app/admin/(app)/settings/shipping/page"), "shipping.manage"],
  ["team", () => import("@/app/admin/(app)/settings/team/page"), "team.manage"],
  ["activity", () => import("@/app/admin/(app)/settings/activity/page"), "audit.read"],
  ["affiliates", () => import("@/app/admin/(app)/affiliates/page"), "affiliates.read"],
  ["new affiliate", () => import("@/app/admin/(app)/affiliates/new/page"), "affiliates.manage"],
  ["affiliate applications", () => import("@/app/admin/(app)/affiliates/applications/page"), "affiliates.read"],
];

/** route handler, the permission it needs */
const ROUTES: [string, () => Promise<{ GET: (r: Request) => Promise<Response> }>, Perm | "any"][] = [
  ["orders export", () => import("@/app/admin/(app)/orders/export/route") as any, "exports.run"],
  ["customers export", () => import("@/app/admin/(app)/customers/export/route") as any, "exports.run"],
  ["analytics export", () => import("@/app/admin/(app)/analytics/export/route") as any, "analytics.read"],
  ["backup download", () => import("@/app/admin/backup/download/route") as any, "backup.download"],
  ["affiliates export", () => import("@/app/admin/(app)/affiliates/export/route") as any, "exports.run"],
  ["notifications", () => import("@/app/admin/api/notifications/route") as any, "any"],
  ["search", () => import("@/app/admin/api/search/route") as any, "any"],
];

const LEAKS = /password_hash|totp_secret|recovery_codes|\$argon2|temp_password|AUTH_SECRET|BACKUP_ENCRYPTION_KEY|BREVO_API_KEY|SMTP_PASS|sk_live|service_role/i;

let partnerToken = "";
beforeEach(async () => {
  resetState();
  const S = await seedStore();
  getEngine().sqlite.prepare("UPDATE inventory_items SET on_hand = 50").run();
  partnerToken = createAffiliate({ name: "Token Holder", code: "TOKEN10" }).private_token;
  placeOrder({ customer: { name: "Rami Test", phone: "03 123456", address: "Hamra, Bldg 5" }, items: [{ productId: S.gold.id, qty: 1 }], region: "Beirut", source: "web", actor: "customer" });
  // the three team accounts really carry secrets in the database
  getEngine().sqlite.prepare("UPDATE admin_users SET password_hash = '$argon2id$v=19$m=1,t=1,p=1$c2FsdA$aGFzaA', totp_secret = 'SECRETSECRETSECRET', recovery_codes = '[\"abc\"]'").run();
});

describe("permission matrix: every admin page, every role", () => {
  for (const [role, id, email] of roles)
    it(`${role}: allowed pages render, the rest answer 403`, async () => {
      h.user = { id, email };
      for (const [name, load, perm] of PAGES) {
        const mod = await load();
        const run = async () => renderToStaticMarkup(await mod.default({ searchParams: sp(), params: Promise.resolve({}) }));
        if (can(role, perm)) {
          const out = await run();
          expect(out.length, name).toBeGreaterThan(200);
          expect(out, `${name} as ${role}`).not.toMatch(LEAKS);
          expect(out, `${name} as ${role}: a private partner link must not appear in a list or form page`).not.toContain(partnerToken);
        } else await expect(run(), `${name} as ${role}`).rejects.toThrow("HTTP_403");
      }
    });
});

describe("permission matrix: every API route, direct calls", () => {
  it("no session: 401 on every route", async () => {
    h.user = null;
    for (const [name, load] of ROUTES) expect((await (await load()).GET(new Request("http://x/test"))).status, name).toBe(401);
  });

  for (const [role, id, email] of roles)
    it(`${role}: exactly what the matrix says`, async () => {
      h.user = { id, email };
      for (const [name, load, perm] of ROUTES) {
        const res = await (await load()).GET(new Request("http://x/test?q=a"));
        if (perm === "any" || can(role, perm)) {
          expect(res.status, `${name} as ${role}`).toBe(200);
          if ((res.headers.get("content-type") ?? "").includes("json") || (res.headers.get("content-type") ?? "").includes("csv")) expect(await res.text(), name).not.toMatch(LEAKS);
        } else expect(res.status, `${name} as ${role}`).toBe(403);
      }
    });

  it("search never returns team accounts or secrets, even when asked for them", async () => {
    h.user = { id: ID.owner, email: "owner@t.test" };
    const { GET } = await import("@/app/admin/api/search/route");
    for (const q of ["argon", "SECRET", "owner@t.test", "password"]) {
      const body = await (await GET(new Request(`http://x/s?q=${encodeURIComponent(q)}`))).text();
      expect(body, q).not.toMatch(LEAKS);
      expect(body, q).not.toContain("owner@t.test");
    }
  });
});
