import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (["node_modules", ".next", ".git", "backups"].includes(e.name)) continue;
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}
const sourceFiles = [...walk("app"), ...walk("components"), ...walk("lib"), ...walk("config"), "proxy.ts", "next.config.ts", "instrumentation.ts"].filter((f) => /\.(ts|tsx)$/.test(f));

const GUARD = /(requirePerm|requireAdmin|getAdminState|getAdmin)\(/;
// Public by design: the token in an invite/reset link IS the credential; login/reset requests are for signed-out people.
const PUBLIC_ACTIONS = new Set(["login", "requestReset", "setPassword"]); // setPassword: the single-use token in the link is the credential
const PUBLIC_PAGES = new Set(["app/admin/login/page.tsx", "app/admin/forgot/page.tsx", "app/admin/(flow)/set-password/page.tsx"]);

describe("every admin entry point checks who is calling (not just the proxy)", () => {
  const actionFiles = sourceFiles.filter((f) => f.startsWith("app/admin/") && /actions\.ts$/.test(f));

  it("finds the server-action files", () => expect(actionFiles.length).toBeGreaterThan(8));

  for (const f of actionFiles) {
    const src = read(f);
    const fns = [...src.matchAll(/export async function (\w+)\(/g)];
    it(`${f}: ${fns.length} exported action(s) start with an auth check`, () => {
      expect(src.startsWith('"use server"')).toBe(true);
      for (const m of fns) {
        if (PUBLIC_ACTIONS.has(m[1])) continue;
        const body = src.slice(m.index!, m.index! + 700).split("\n").slice(0, 9).join("\n");
        expect(GUARD.test(body), `${f} → ${m[1]}() has no auth check near its top`).toBe(true);
      }
    });
  }

  for (const f of sourceFiles.filter((x) => x.startsWith("app/admin/") && /\/page\.tsx$/.test(x))) {
    if (PUBLIC_PAGES.has(f)) continue;
    it(`${f} checks the session`, () => expect(GUARD.test(read(f)), f).toBe(true));
  }

  for (const f of sourceFiles.filter((x) => x.startsWith("app/admin/") && /\/route\.ts$/.test(x)))
    it(`${f} checks the session and answers 401/403`, () => {
      const src = read(f);
      expect(/getAdmin\(/.test(src)).toBe(true);
      expect(src).toMatch(/401/);
    });

  it("the admin app layout requires a signed-in admin", () => expect(GUARD.test(read("app/admin/(app)/layout.tsx"))).toBe(true));
});

describe("sign-up is impossible", () => {
  it("no code can create an account except accepting an invite or the owner adding a member", () => {
    // the only INSERTs into admin_users: lib/invites.ts (consumeToken, after a valid single-use invite token) and lib/members.ts (createMember, called only by the owner-only addMember action)
    const inserts = sourceFiles.filter((f) => /INSERT INTO admin_users|from\("admin_users"\)\.insert/.test(read(f)));
    expect(inserts).toEqual(["lib/invites.ts", "lib/members.ts"]);
    const callers = sourceFiles.filter((f) => /createMember\(/.test(read(f)) && f !== "lib/members.ts");
    expect(callers).toEqual(["app/admin/(app)/settings/team/actions.ts"]);
    expect(read("app/admin/(app)/settings/team/actions.ts")).toMatch(/export async function addMember[\s\S]{0,200}requirePerm\("team\.manage"\)/);
  });
  it("there is no sign-up route", () => {
    const routes = walk("app").filter((f) => /(sign-?up|register|join)/i.test(f));
    expect(routes).toEqual([]);
  });
  it("login uses only email + password and requires an active admin_users row", () => {
    const src = read("app/admin/login/actions.ts");
    expect(src).toMatch(/verifyPassword/);
    expect(src).toMatch(/admin_users/);
    expect(src).toMatch(/active/);
  });
});

describe("secrets stay on the server", () => {
  const clientFiles = sourceFiles.filter((f) => /^\s*["']use client["']/.test(read(f)));
  it("finds client components", () => expect(clientFiles.length).toBeGreaterThan(10));
  it("no client component can reach the service key, the DB client or auth admin", () => {
    for (const f of clientFiles) {
      const src = read(f);
      expect(src, f).not.toMatch(/AUTH_SECRET|DATABASE_PATH|lib\/db|lib\/security|lib\/auth"|lib\/session|lib\/crypto|lib\/passwords|lib\/invites|lib\/backup|better-sqlite3|argon2/);
    }
  });
  it("server-only modules are marked server-only", () => {
    for (const f of ["lib/db/index.ts", "lib/auth.ts", "lib/security.ts", "lib/orders.ts", "lib/storage.ts", "lib/audit.ts", "lib/invites.ts", "lib/mail.ts", "lib/notify.ts"])
      expect(read(f), f).toMatch(/^import "server-only";/);
  });
  it("secrets are read only in server modules, never in a client component", () => {
    const users = sourceFiles.filter((f) => /process\.env\.(AUTH_SECRET|DATABASE_PATH|BREVO_API_KEY|SMTP_URL|BACKUP_[A-Z_]+)/.test(read(f)));
    expect(users.length).toBeGreaterThan(3);
    for (const f of users) expect(/^\s*["']use client["']/.test(read(f)), f).toBe(false);
  });
  it("the database file is never inside a public folder and nothing serves it", () => {
    expect(walk("public").filter((f) => /\.(db|sqlite|sqlite3)(-wal|-shm)?$/.test(f))).toEqual([]);
    expect(read(".gitignore")).toMatch(/^\.data$/m);
  });
});

describe("no demo / preview / bypass code remains in the application", () => {
  const MARKERS = ["ADMIN_DEMO", "PREVIEW MODE", "miel_local_admin", "miel-preview-db", "demo-snapshot", "Enter as owner", "Load demo data", "createLocalClient", "MIEL_LOCAL_DB", "seedDemo", "wipeDemo", "preview.local", "demo.local"];
  it("source contains none of the preview markers", () => {
    for (const f of sourceFiles) for (const m of MARKERS) expect(read(f), `${f} contains "${m}"`).not.toContain(m);
  });
  it("the demo files are deleted", () => {
    for (const f of ["lib/demo.ts", "lib/demo-snapshot.json", "lib/db/local.ts", "scripts/create-admin.mjs"]) expect(fs.existsSync(path.join(ROOT, f)), f).toBe(false);
  });
  it("application code never imports from tests/ or scripts/", () => {
    for (const f of sourceFiles) expect(read(f), f).not.toMatch(/from ["'](\.\.\/)+(tests|scripts)\//);
  });
  it("no script creates a user with a password", () => {
    for (const f of walk("scripts").filter((x) => /\.(ts|mjs)$/.test(x))) expect(read(f), f).not.toMatch(/createUser\(|randomBytes\(.*password|password\s*[:=]\s*["'`]/);
    expect(read("app/admin/(app)/settings/team/actions.ts")).not.toMatch(/createUser|randomBytes/i); // passwords are generated only in lib/temp-password.ts
  });
});

describe("production configuration", () => {
  it("source maps are never shipped to browsers", () => expect(read("next.config.ts")).toMatch(/productionBrowserSourceMaps:\s*false/));
  it("security headers are configured", () => {
    const c = read("next.config.ts");
    for (const h of ["Content-Security-Policy", "X-Frame-Options", "Referrer-Policy", "Strict-Transport-Security", "X-Content-Type-Options"]) expect(c).toContain(h);
    expect(c).toMatch(/frame-ancestors 'none'/);
    expect(c).toMatch(/poweredByHeader:\s*false/);
  });
  it("the admin is not in the sitemap and is disallowed in robots", () => {
    expect(read("app/sitemap.ts")).not.toMatch(/\/admin/);
    expect(read("app/robots.ts")).toMatch(/disallow:\s*\["\/admin"/);
    expect(read("app/admin/layout.tsx")).toMatch(/index: false/);
  });
  it("auth cookies are httpOnly, Secure in production, SameSite lax", () => {
    const c = read("lib/cookies.ts");
    expect(c).toMatch(/httpOnly: true/);
    expect(c).toMatch(/secure: process\.env\.NODE_ENV === "production"/);
    expect(c).toMatch(/sameSite: "lax"/);
  });
  it("the environment is validated at build and at boot", () => {
    expect(read("next.config.ts")).toMatch(/assertEnv/);
    expect(read("instrumentation.ts")).toMatch(/assertEnv/);
    expect(read("instrumentation.ts")).toMatch(/Asia\/Beirut/);
  });
});
