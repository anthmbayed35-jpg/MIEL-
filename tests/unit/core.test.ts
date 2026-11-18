import { describe, expect, it } from "vitest";
import { can, PERMS, type Perm, type Role } from "@/lib/roles";
import { validateEnv, isStrict } from "@/lib/env";
import { normalizeLebanesePhone } from "@/lib/phone";
import { safeNext, hardenCookie } from "@/lib/cookies";
import { buildSeries } from "@/lib/stats";
import { passwordProblem } from "@/lib/security";
import { perSachet } from "@/lib/format";

describe("role permissions", () => {
  const all = Object.keys(PERMS) as Perm[];
  const allowed = (r: Role) => all.filter((p) => can(r, p));

  it("owner can do everything", () => expect(allowed("owner")).toEqual(all));

  it("staff cannot see or change settings, team, discounts, shipping, marketing, analytics or exports", () => {
    for (const p of ["settings.read", "settings.write", "team.manage", "discounts.manage", "shipping.manage", "marketing.manage", "analytics.read", "content.manage", "exports.run", "audit.read", "products.write", "data.delete", "customers.block"] as Perm[])
      expect(can("staff", p), `staff should NOT have ${p}`).toBe(false);
  });
  it("staff keeps day-to-day access", () => {
    for (const p of ["orders.read", "orders.write", "customers.read", "inventory.write", "products.read"] as Perm[]) expect(can("staff", p)).toBe(true);
  });
  it("manager cannot change the team or settings, and cannot delete data", () => {
    for (const p of ["team.manage", "settings.write", "data.delete"] as Perm[]) expect(can("manager", p), `manager should NOT have ${p}`).toBe(false);
  });
  it("manager runs the business", () => {
    for (const p of ["products.write", "discounts.manage", "shipping.manage", "exports.run", "analytics.read", "orders.write"] as Perm[]) expect(can("manager", p)).toBe(true);
  });
  it("an unknown or missing role has nothing", () => {
    expect(allowed(undefined as unknown as Role)).toEqual([]);
    expect(allowed("hacker" as Role)).toEqual([]);
  });
});

describe("environment rules", () => {
  const PROD = "https://prodref.supabase.co";
  const STAGING = "https://stagingref.supabase.co";
  const base = { NEXT_PUBLIC_SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", NEXT_PUBLIC_SITE_URL: "https://miel.example", MIEL_PRODUCTION_SUPABASE_URL: PROD };

  it("local development without any config is allowed", () => expect(validateEnv({ NODE_ENV: "development" })).toEqual([]));
  it("is strict only on hosted or MIEL_ENV deployments", () => {
    expect(isStrict({})).toBe(false);
    expect(isStrict({ VERCEL_ENV: "production" })).toBe(true);
    expect(isStrict({ MIEL_ENV: "staging" })).toBe(true);
  });
  it("production with everything set passes", () => expect(validateEnv({ ...base, VERCEL_ENV: "production", MIEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: PROD })).toEqual([]));
  it("production fails clearly when a variable is missing (names only, no values)", () => {
    const e = validateEnv({ VERCEL_ENV: "production", MIEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: PROD, NEXT_PUBLIC_SITE_URL: "https://x.example", MIEL_PRODUCTION_SUPABASE_URL: PROD });
    expect(e.join("\n")).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(e.join("\n")).toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });
  it("partly configured Supabase is an error", () => expect(validateEnv({ NEXT_PUBLIC_SUPABASE_URL: STAGING }).join()).toMatch(/partly configured/));
  it("a PREVIEW deployment may not use the production database", () => {
    const e = validateEnv({ ...base, VERCEL_ENV: "preview", MIEL_ENV: "staging", NEXT_PUBLIC_SUPABASE_URL: PROD });
    expect(e.join("\n")).toMatch(/PRODUCTION Supabase project/);
  });
  it("a preview deployment on the staging project passes", () => expect(validateEnv({ ...base, VERCEL_ENV: "preview", MIEL_ENV: "staging", NEXT_PUBLIC_SUPABASE_URL: STAGING })).toEqual([]));
  it("production must use the production project", () => {
    const e = validateEnv({ ...base, VERCEL_ENV: "production", MIEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: STAGING });
    expect(e.join("\n")).toMatch(/must use the production Supabase project/);
  });
  it("MIEL_ENV=production is refused outside the production deployment", () => {
    expect(validateEnv({ ...base, VERCEL_ENV: "preview", MIEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: PROD }).join("\n")).toMatch(/only allowed on the production deployment/);
  });
  it("a laptop pointing at the production project is refused", () => {
    expect(validateEnv({ MIEL_PRODUCTION_SUPABASE_URL: PROD, NEXT_PUBLIC_SUPABASE_URL: PROD, NEXT_PUBLIC_SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s" }).join()).toMatch(/PRODUCTION Supabase/);
  });
  it("never leaks secret values into messages", () => {
    const e = validateEnv({ VERCEL_ENV: "production", SUPABASE_SERVICE_ROLE_KEY: "SUPER-SECRET-VALUE-123", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" }).join("\n");
    expect(e).not.toContain("SUPER-SECRET-VALUE-123");
  });
});

describe("Lebanese phone numbers", () => {
  it.each([["03 123 456", "+9613123456"], ["+961 70 123 456", "+96170123456"], ["0096171123456", "+96171123456"], ["81-234-567", "+96181234567"], ["01 234 567", "+9611234567"]])("accepts %s", (i, o) => expect(normalizeLebanesePhone(i)).toBe(o));
  it.each(["12345678", "abc", "", "+1 202 555 0143", "03 12", "070 12345678"])("rejects %s", (i) => expect(normalizeLebanesePhone(i)).toBeNull());
});

describe("redirect and cookie safety", () => {
  it("only same-site /admin paths are accepted after login", () => {
    expect(safeNext("/admin/orders")).toBe("/admin/orders");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil", "/store", "javascript:alert(1)", "/admin/../x://y", null, undefined, ""]) expect(safeNext(bad as string)).toBe("/admin");
  });
  it("auth cookies are hardened", () => {
    const c = hardenCookie({ maxAge: 10 });
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe("lax");
    expect(c.path).toBe("/");
    expect(c.maxAge).toBe(10);
  });
});

describe("password rules", () => {
  it("requires 12+ characters with letters and numbers", () => {
    expect(passwordProblem("short1")).toMatch(/12/);
    expect(passwordProblem("onlylettersonlyletters")).toMatch(/numbers/);
    expect(passwordProblem("correct horse battery 7")).toBeNull();
  });
});

describe("pricing", () => {
  it("per-sachet price is pouch / 12 rounded to 2 decimals", () => {
    expect(perSachet(30)).toBe(2.5);
    expect(perSachet(25)).toBe(2.08);
    expect(perSachet(35)).toBe(2.92);
  });
});

describe("store timezone (Asia/Beirut)", () => {
  it("day buckets follow Beirut time, not UTC", () => {
    process.env.TZ = "Asia/Beirut";
    // 2026-11-17 22:30 UTC is already 18 Nov 00:30 in Beirut (UTC+2 in November)
    const now = new Date("2026-11-17T22:30:00Z");
    const order = { id: "o", status: "new", total: 50, created_at: "2026-11-17T22:10:00Z", customer_id: "c" };
    const series = buildSeries([order], now);
    const last = series.week[series.week.length - 1];
    expect(last.tip).toMatch(/18 November 2026/);
    expect(last.value).toBe(50); // the 22:10Z order falls in Beirut's 18 Nov, the same bucket as "now"
  });
});
