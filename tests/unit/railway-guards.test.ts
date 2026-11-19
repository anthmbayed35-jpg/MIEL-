import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (["node_modules", ".next", ".git", "backups", "test-results"].includes(e.name)) continue;
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}
const code = [...walk("app"), ...walk("components"), ...walk("lib"), ...walk("config"), ...walk("scripts"), "proxy.ts", "next.config.ts", "instrumentation.ts", "package.json", "railway.json", ".env.example"].filter((f) =>
  /\.(ts|tsx|mjs|json|example)$/.test(f) && !f.endsWith("photos.generated.ts"),
);

describe("nothing depends on Vercel any more", () => {
  it.each([
    ["Vercel packages", /@vercel\//],
    ["Vercel env variables", /\bVERCEL(_[A-Z_]+)?\b/],
    ["vercel.app URLs", /vercel\.app/i],
    ["edge runtime exports", /export\s+const\s+runtime\s*=\s*["']edge["']/],
    ["serverless duration settings", /export\s+const\s+maxDuration/],
  ])("no %s in source, config or scripts", (_name, re) => {
    const hits = code.filter((f) => re.test(read(f)));
    expect(hits).toEqual([]);
  });
  it("no vercel.json and no Vercel cron", () => {
    expect(fs.existsSync(path.join(ROOT, "vercel.json"))).toBe(false);
  });
});

describe("absolute URLs come from NEXT_PUBLIC_SITE_URL only", () => {
  const allowed = new Set(["lib/site-url.ts", "lib/env.ts", "scripts/create-owner.ts", "scripts/check-env.ts"]);
  it("only lib/site-url.ts reads NEXT_PUBLIC_SITE_URL for building links", () => {
    const hits = code.filter((f) => /NEXT_PUBLIC_SITE_URL/.test(read(f)) && !allowed.has(f) && f !== ".env.example" && f !== "next.config.ts");
    expect(hits).toEqual([]);
  });
  it("no URL is derived from the request host or forwarded headers", () => {
    const hits = code.filter((f) => /x-forwarded-host|headers\(\)\.get\(["']host["']\)|req(uest)?\.nextUrl\.origin/.test(read(f)));
    expect(hits).toEqual([]);
  });
  it("invite and reset links are built with inviteUrl() / resetUrl() only", () => {
    expect(read("lib/invites.ts")).toContain("inviteUrl(token)");
    expect(read("lib/invites.ts")).toContain("resetUrl(token)");
  });
  it("siteUrl() trims trailing slashes", async () => {
    const { siteUrl, absoluteUrl, inviteUrl, resetUrl } = await import("../../lib/site-url");
    const before = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://miel.example///";
    try {
      expect(siteUrl()).toBe("https://miel.example");
      expect(absoluteUrl("/products/gold")).toBe("https://miel.example/products/gold");
      expect(inviteUrl("a b")).toBe("https://miel.example/admin/set-password?type=invite&token=a%20b");
      expect(resetUrl("t")).toBe("https://miel.example/admin/set-password?type=reset&token=t");
    } finally {
      if (before === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = before;
    }
  });
});

describe("Railway deployment files", () => {
  const rw = JSON.parse(read("railway.json"));
  const pkg = JSON.parse(read("package.json"));

  it("runs exactly one replica (SQLite file on one volume, in-process live-alert bus)", () => expect(rw.deploy.numReplicas).toBe(1));
  it("health check path is /api/health with a restart policy", () => {
    expect(rw.deploy.healthcheckPath).toBe("/api/health");
    expect(rw.deploy.restartPolicyType).toBe("ON_FAILURE");
    expect(rw.deploy.restartPolicyMaxRetries).toBeGreaterThan(0);
  });
  it("build and start commands are the npm scripts", () => {
    expect(rw.build.buildCommand).toBe("npm run build");
    expect(rw.deploy.startCommand).toBe("npm start");
  });
  it("next.config builds a standalone server", () => expect(read("next.config.ts")).toMatch(/output:\s*"standalone"/));
  it("the build prepares the standalone folder and the start script binds 0.0.0.0 on $PORT", () => {
    expect(pkg.scripts.build).toContain("prepare-standalone.mjs");
    expect(pkg.scripts.start).toBe("node scripts/start.mjs");
    const start = read("scripts/start.mjs");
    expect(start).toContain('HOSTNAME: "0.0.0.0"');
    expect(start).toContain("process.env.PORT");
  });
  it("sharp is a runtime dependency (image upload re-encoding)", () => {
    expect(pkg.dependencies.sharp).toBeTruthy();
    expect(pkg.devDependencies.sharp).toBeUndefined();
  });
  it("declares a Node version", () => expect(pkg.engines.node).toBeTruthy());
  it("native modules are runtime dependencies and kept external so the standalone build ships them", () => {
    for (const d of ["better-sqlite3", "argon2", "sharp"]) {
      expect(pkg.dependencies[d], d).toBeTruthy();
      expect(read("next.config.ts"), d).toContain(`"${d}"`);
    }
  });
  it("SQL migrations are copied next to the standalone server and applied at boot", () => {
    expect(read("scripts/prepare-standalone.mjs")).toContain("migrations");
    expect(read("instrumentation.ts")).toContain("getEngine");
    expect(fs.readdirSync(path.join(ROOT, "migrations")).some((f) => f.startsWith("0001_"))).toBe(true);
  });
  it("the storefront is rendered per request, so a deploy never serves pre-rendered stale data", () => {
    expect(read("app/(store)/layout.tsx")).toContain('export const dynamic = "force-dynamic"');
  });
});

describe("environment documentation lists every variable the app reads", () => {
  const ref = new Set<string>();
  for (const f of code.filter((x) => /\.(ts|tsx|mjs)$/.test(x))) for (const m of read(f).matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) ref.add(m[1]);
  // set by Node, Next.js, Railway or the shell, not something an operator configures for this app
  const platform = new Set(["NODE_ENV", "NEXT_RUNTIME", "NEXT_PHASE", "PORT", "HOSTNAME", "CI", "TZ", "RAILWAY_ENVIRONMENT_NAME", "RAILWAY_ENVIRONMENT", "KEEP_ALIVE_TIMEOUT", "E2E_BROWSER_CHANNEL", "MAIL_OUTBOX"]);
  const ops = read("docs/OPERATIONS.md");
  it("OPERATIONS.md and .env.example mention each one", () => {
    const missing = [...ref].filter((v) => !platform.has(v) && (!ops.includes(v) || (!read(".env.example").includes(v) && !/^(SKIP_ENV_CHECK)$/.test(v))));
    expect(missing).toEqual([]);
  });
});
