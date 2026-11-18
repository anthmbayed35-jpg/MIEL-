import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { E2E_ENV } from "../../playwright.config";

const ROOT = path.resolve(__dirname, "../..");
const NEXT = path.join(ROOT, ".next");
const SERVICE_KEY = E2E_ENV.SUPABASE_SERVICE_ROLE_KEY;

function files(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, out);
    else out.push(p);
  }
  return out;
}
const read = (f: string) => fs.readFileSync(f, "utf8");

test.describe("what the browser can download", () => {
  test("the service-role key is in NO browser-visible file", () => {
    const browserFiles = [...files(path.join(NEXT, "static")), ...files(path.join(ROOT, "public"))].filter((f) => /\.(js|css|html|json|txt|map|svg)$/.test(f));
    expect(browserFiles.length).toBeGreaterThan(10);
    for (const f of browserFiles) expect(read(f), `${path.relative(ROOT, f)} contains the service key`).not.toContain(SERVICE_KEY);
    // the static HTML that pages are served from
    for (const f of files(path.join(NEXT, "server/app")).filter((x) => x.endsWith(".html"))) expect(read(f), path.relative(ROOT, f)).not.toContain(SERVICE_KEY);
  });

  test("no page or API response contains the service-role key", async ({ request }) => {
    for (const p of ["/", "/products/red-burn", "/products/gold", "/admin/login", "/admin/forgot", "/sitemap.xml", "/robots.txt", "/api/track"]) {
      const r = await request.get(p, { maxRedirects: 0 });
      expect(await r.text(), p).not.toContain(SERVICE_KEY);
      expect(JSON.stringify(r.headers()), p).not.toContain(SERVICE_KEY);
    }
  });

  test("the variable NAME of the service key never appears in browser bundles", () => {
    for (const f of files(path.join(NEXT, "static")).filter((x) => x.endsWith(".js"))) expect(read(f), path.relative(ROOT, f)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  test("source maps are not shipped", async ({ request }) => {
    expect(files(path.join(NEXT, "static")).filter((f) => f.endsWith(".map"))).toEqual([]);
    const chunk = files(path.join(NEXT, "static/chunks")).find((f) => f.endsWith(".js"))!;
    const r = await request.get(`/_next/static/chunks/${path.basename(chunk)}.map`);
    expect(r.status()).toBe(404);
    expect(await (await request.get("/_next/static/chunks/" + path.basename(chunk))).text()).not.toContain("sourceMappingURL");
  });
});

test.describe("demo / preview code is absent from the production build", () => {
  const MARKERS = ["ADMIN_DEMO", "PREVIEW MODE", "miel_local_admin", "miel-preview-db", "demo-snapshot", "Enter as owner", "Enter as manager", "Load demo data", "Wipe demo data", "createLocalClient", "MIEL_LOCAL_DB", "seedDemo", "wipeDemo", "preview.local", "demo.local"];
  test("none of the markers appear anywhere in the build output", () => {
    const all = files(NEXT).filter((f) => /\.(js|html|json|rsc|txt|css)$/.test(f) && !f.includes(path.join(".next", "cache")) && !f.includes(path.join(".next", "dev")));
    expect(all.length).toBeGreaterThan(50);
    const hits: string[] = [];
    for (const f of all) {
      const src = read(f);
      for (const m of MARKERS) if (src.includes(m)) hits.push(`${path.relative(ROOT, f)} → ${m}`);
    }
    expect(hits).toEqual([]);
  });
});

test.describe("headers and indexing", () => {
  test("security headers on the storefront and the admin", async ({ request }) => {
    for (const p of ["/", "/admin/login"]) {
      const h = (await request.get(p)).headers();
      expect(h["content-security-policy"], p).toMatch(/frame-ancestors 'none'/);
      expect(h["content-security-policy"], p).toMatch(/object-src 'none'/);
      expect(h["x-frame-options"], p).toBe("DENY");
      expect(h["x-content-type-options"], p).toBe("nosniff");
      expect(h["referrer-policy"], p).toBe("strict-origin-when-cross-origin");
      expect(h["strict-transport-security"], p).toMatch(/max-age=\d{7,}/);
      expect(h["permissions-policy"], p).toMatch(/camera=\(\)/);
      expect(h["x-powered-by"], p).toBeUndefined();
    }
  });
  test("the admin is noindex, uncached, out of the sitemap and disallowed in robots", async ({ request }) => {
    const h = (await request.get("/admin/login")).headers();
    expect(h["x-robots-tag"]).toMatch(/noindex/);
    expect(h["cache-control"]).toMatch(/no-store/);
    expect(await (await request.get("/sitemap.xml")).text()).not.toContain("/admin");
    expect(await (await request.get("/robots.txt")).text()).toMatch(/Disallow: \/admin/);
    expect(await (await request.get("/admin/login")).text()).toMatch(/<meta name="robots" content="noindex/);
  });
  test("the public storefront still works", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    for (const p of ["/", "/products/red-burn"]) {
      expect((await page.goto(p))?.status(), p).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
});
