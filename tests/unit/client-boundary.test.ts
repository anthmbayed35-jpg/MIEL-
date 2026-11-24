import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A server component cannot CALL a function that lives in a "use client" file: Next.js turns that export into a reference, and the
 * page answers 500 in the production build (it twice slipped past the other tests, which do not enforce the boundary).
 * This scans every server file for imports of lower-case functions from a client file.
 */
const ROOT = path.resolve(__dirname, "../..");
const files: string[] = [];
(function walk(dir: string) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git", "tests", "scripts", ".data-e2e"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
  }
})(ROOT);

const text = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const isClient = (f: string) => /^\s*(\/\*[\s\S]*?\*\/\s*)?["']use client["']/.test(text.get(f) ?? "");
const resolve = (from: string, spec: string): string | null => {
  const base = spec.startsWith("@/") ? path.join(ROOT, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  return [base + ".tsx", base + ".ts", path.join(base, "index.tsx"), path.join(base, "index.ts")].find((c) => text.has(c)) ?? null;
};

describe("server files never import a plain function from a client file", () => {
  it("(React components, constants and types are fine; a lower-case function is not)", () => {
    const bad: string[] = [];
    for (const f of files) {
      if (isClient(f) || /\/(route|proxy|instrumentation)\.ts$|actions\.ts$/.test(f.replace(/\\/g, "/"))) continue;
      const src = text.get(f)!;
      for (const m of src.matchAll(/import\s+(?!type\b)\{([^}]+)\}\s+from\s+["']([^"']+)["']/g)) {
        const target = resolve(f, m[2]);
        if (!target || !isClient(target)) continue;
        const targetSrc = text.get(target)!;
        for (const raw of m[1].split(",")) {
          const name = raw.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, "");
          if (!name || raw.trim().startsWith("type ")) continue;
          if (/^[a-z]/.test(name) && new RegExp(`export\\s+(async\\s+)?function\\s+${name}\\b|export\\s+const\\s+${name}\\s*=\\s*(async\\s*)?\\(`).test(targetSrc))
            bad.push(`${path.relative(ROOT, f)} imports ${name}() from the client file ${path.relative(ROOT, target)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
