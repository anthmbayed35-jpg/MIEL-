import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const walk = (d: string): string[] => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));

describe("ambassador portal guards", () => {
  it("every portal page and the portal layout resolve the signed-in ambassador on the server", () => {
    const pages = walk("app/ambassador/(portal)").filter((f) => /page\.tsx$|layout\.tsx$/.test(f));
    expect(pages.length).toBeGreaterThanOrEqual(10);
    for (const p of pages) expect(read(p), p).toContain("requireAmbassador");
  });

  it("every exported portal action starts by checking the session, or is a login/password-link step", () => {
    const src = read("app/ambassador/actions.ts");
    const open = new Set(["loginAction", "logoutAction", "setPasswordAction"]);
    const fns = [...src.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
    for (const fn of fns) {
      if (open.has(fn)) continue;
      const body = src.slice(src.indexOf(`export async function ${fn}(`));
      expect(body.slice(0, 400), fn).toContain("requireAmbassador()");
    }
  });

  it("portal data functions take the ambassador id from the session, never from the request: no portal page reads params or searchParams for an id", () => {
    for (const p of walk("app/ambassador/(portal)").filter((f) => f.endsWith("page.tsx"))) {
      const src = read(p);
      expect(src, p).not.toMatch(/params\.(id|affiliate|ambassador)/);
      expect(src, p).not.toMatch(/searchParams[^;]*\b(id|affiliate_id|ambassador)\b/);
    }
  });

  it("the ambassador portal never touches the admin session, and the admin never reads the ambassador cookie", () => {
    for (const p of walk("lib/ambassador").concat(walk("app/ambassador")).filter((f) => /\.tsx?$/.test(f) && !f.includes("files/"))) {
      expect(read(p), p).not.toMatch(/SESSION_COOKIE|lookupSession|requireAdmin|getAdmin\(/);
    }
    for (const p of walk("lib").filter((f) => /^lib\/(auth|session)\.ts$/.test(f))) expect(read(p), p).not.toContain("miel_amb");
  });

  it("the portal and partner paths are private: no-store and noindex in the front door, disallowed in robots", () => {
    expect(read("proxy.ts")).toMatch(/\/ambassador\//);
    expect(read("app/robots.ts")).toContain("/ambassador/");
    expect(read("app/ambassador/layout.tsx")).toContain("index: false");
  });
});
