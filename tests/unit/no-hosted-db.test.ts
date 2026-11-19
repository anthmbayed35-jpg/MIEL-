import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: the previous hosted database and auth service must not come back. Scans every text file of the repository
 * (code, config, docs, tests, lockfile, env example) for its name. The word is assembled from pieces so this file
 * does not trip its own check.
 */
const ROOT = path.resolve(__dirname, "../..");
const NAME = new RegExp(["supa", "base"].join(""), "i");
const SKIP = new Set(["node_modules", ".next", ".git", ".data", "test-results", "backups", "playwright-report"]);
const TEXT = /\.(ts|tsx|js|mjs|cjs|json|md|sql|css|yml|yaml|toml|txt|example|gitignore)$|^\.env/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out);
    else if (TEXT.test(e.name)) out.push(rel);
  }
  return out;
}

describe("no hosted-database / hosted-auth references remain", () => {
  const files = walk(".").filter((f) => f !== "tests/unit/no-hosted-db.test.ts");
  it("scans the whole repository", () => expect(files.length).toBeGreaterThan(150));
  it("no file mentions it (code, config, docs, tests, lockfile)", () => {
    const hits = files.filter((f) => NAME.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
    expect(hits).toEqual([]);
  });
  it("no folder or file is named after it", () => {
    const all = (function names(dir: string, out: string[] = []): string[] {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        if (SKIP.has(e.name)) continue;
        out.push(e.name);
        if (e.isDirectory()) names(path.posix.join(dir, e.name), out);
      }
      return out;
    })(".");
    expect(all.filter((n) => NAME.test(n))).toEqual([]);
  });
  it("the installed dependency tree has none of its packages", () => {
    const nm = path.join(ROOT, "node_modules");
    expect(fs.readdirSync(nm).filter((n) => NAME.test(n))).toEqual([]);
    expect(fs.readdirSync(path.join(nm, "@types")).filter((n) => NAME.test(n))).toEqual([]);
  });
  it("the environment example lists the new variables and none of the old ones", () => {
    const env = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
    for (const v of ["DATABASE_PATH", "AUTH_SECRET", "NEXT_PUBLIC_SITE_URL", "MAIL_FROM", "BREVO_API_KEY"]) expect(env).toContain(v);
    expect(env).not.toMatch(/SERVICE_ROLE|ANON_KEY|PRODUCTION_[A-Z_]*URL/);
  });
});
