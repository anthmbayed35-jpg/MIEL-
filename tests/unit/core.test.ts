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
  const PROD_MAIL = { MAIL_FROM: "MIEL+ <orders@miel.example>", BREVO_API_KEY: "k" };
  const base = { NEXT_PUBLIC_SITE_URL: "https://miel.example", DATABASE_PATH: "/data/miel.db", AUTH_SECRET: "x".repeat(40) };
  const prod = { ...base, ...PROD_MAIL, RAILWAY_ENVIRONMENT_NAME: "production", MIEL_ENV: "production" };

  it("local development without any config is allowed", () => expect(validateEnv({ NODE_ENV: "development" })).toEqual([]));
  it("is strict only on hosted or MIEL_ENV deployments", () => {
    expect(isStrict({})).toBe(false);
    expect(isStrict({ RAILWAY_ENVIRONMENT_NAME: "production" })).toBe(true);
    expect(isStrict({ MIEL_ENV: "staging" })).toBe(true);
  });
  it("production with everything set passes", () => expect(validateEnv(prod)).toEqual([]));
  it("production fails clearly when a variable is missing (names only, no values)", () => {
    const e = validateEnv({ RAILWAY_ENVIRONMENT_NAME: "production", MIEL_ENV: "production" }).join(" ");
    for (const k of ["NEXT_PUBLIC_SITE_URL", "DATABASE_PATH", "AUTH_SECRET", "MAIL_FROM", "BREVO_API_KEY"]) expect(e).toMatch(new RegExp(k));
  });
  it("missing mail configuration fails loudly in production, but not in staging", () => {
    const noMail = { ...prod, MAIL_FROM: undefined, BREVO_API_KEY: undefined };
    expect(validateEnv(noMail).join(" ")).toMatch(/MAIL_FROM/);
    expect(validateEnv({ ...prod, BREVO_API_KEY: undefined }).join(" ")).toMatch(/BREVO_API_KEY/);
    expect(validateEnv({ ...prod, BREVO_API_KEY: undefined, MAIL_PROVIDER: "smtp" }).join(" ")).toMatch(/SMTP_URL/);
    expect(validateEnv({ ...prod, BREVO_API_KEY: undefined, MAIL_PROVIDER: "smtp", SMTP_URL: "smtp://u:p@h:587" })).toEqual([]);
    expect(validateEnv({ ...base, RAILWAY_ENVIRONMENT_NAME: "staging", MIEL_ENV: "staging" })).toEqual([]);
  });
  it("the test-only file mailer is refused in production", () => expect(validateEnv({ ...prod, MAIL_PROVIDER: "file" }).join(" ")).toMatch(/not allowed in production/));
  it("AUTH_SECRET must be long, DATABASE_PATH absolute and never in a public folder", () => {
    expect(validateEnv({ ...prod, AUTH_SECRET: "short" }).join(" ")).toMatch(/at least 32/);
    expect(validateEnv({ ...prod, DATABASE_PATH: "data/miel.db" }).join(" ")).toMatch(/absolute path/);
    expect(validateEnv({ ...prod, DATABASE_PATH: "/app/public/miel.db" }).join(" ")).toMatch(/public folder/);
    expect(validateEnv({ ...prod, DATABASE_PATH: "C:/data/miel.db" })).toEqual([]);
  });
  it("off-site backups need their credentials and an encryption key", () => {
    const e = validateEnv({ ...prod, BACKUP_S3_BUCKET: "b" }).join(" ");
    expect(e).toMatch(/BACKUP_S3_ACCESS_KEY_ID/);
    expect(e).toMatch(/BACKUP_ENCRYPTION_KEY/);
    expect(validateEnv({ ...prod, BACKUP_S3_BUCKET: "b", BACKUP_S3_ACCESS_KEY_ID: "a", BACKUP_S3_SECRET_ACCESS_KEY: "s", BACKUP_ENCRYPTION_KEY: "k" })).toEqual([]);
  });
  it("MIEL_ENV=production is refused outside the Railway environment named production", () => {
    expect(validateEnv({ ...prod, RAILWAY_ENVIRONMENT_NAME: "staging" }).join(" ")).toMatch(/only allowed in the Railway environment named "production"/);
  });
  it("the Railway environment named production must declare MIEL_ENV=production", () => {
    expect(validateEnv({ ...base, RAILWAY_ENVIRONMENT_NAME: "production", MIEL_ENV: "staging" }).join(" ")).toMatch(/MIEL_ENV must be production/);
  });
  it("production requires an https site URL", () => {
    expect(validateEnv({ ...prod, NEXT_PUBLIC_SITE_URL: "http://miel.example" }).join(" ")).toMatch(/https/);
  });
  it("MIEL_ENV must be one of the three values", () => expect(validateEnv({ ...base, MIEL_ENV: "prod" }).join(" ")).toMatch(/MIEL_ENV must be set/));
  it("never leaks secret values into messages", () => {
    const e = validateEnv({ RAILWAY_ENVIRONMENT_NAME: "production", MIEL_ENV: "production", AUTH_SECRET: "SUPER-SECRET-VALUE-123", BREVO_API_KEY: "SECRET-BREVO-KEY" }).join(" ");
    expect(e).not.toContain("SUPER-SECRET-VALUE-123");
    expect(e).not.toContain("SECRET-BREVO-KEY");
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

describe("client IP behind the one trusted proxy", () => {
  const h = (v: string | null, real: string | null = null) => ({ get: (n: string) => (n === "x-forwarded-for" ? v : n === "x-real-ip" ? real : null) });
  it("uses the rightmost X-Forwarded-For entry (the one the proxy appended), so a forged header can't dodge rate limits", async () => {
    const { ipFromHeaders } = await import("../../lib/client-ip");
    expect(ipFromHeaders(h("6.6.6.6, 7.7.7.7, 203.0.113.9"))).toBe("203.0.113.9");
    expect(ipFromHeaders(h("203.0.113.9"))).toBe("203.0.113.9");
    expect(ipFromHeaders(h(null, "10.0.0.1"))).toBe("10.0.0.1");
    expect(ipFromHeaders(h(null))).toBe("unknown");
    expect(ipFromHeaders(h("x".repeat(200))).length).toBe(64);
  });
});
