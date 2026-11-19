import { expect, test, type Page } from "@playwright/test";
import { E2E_PASSWORD, MAINT_URL, USERS } from "../support/e2e-env";
import { one, query } from "../support/e2e-db";

/**
 * SITE_MODE=maintenance with NO email configured, on a second server started from the SAME build (so the mode is read at
 * request time). It shares the database with the main server. Everything public is the "under development" page with
 * HTTP 503; no order can be placed; the admin, sign-in and health check keep working; invites and resets hand the owner
 * a link instead of emailing.
 */
test.use({ baseURL: MAINT_URL });
test.describe.configure({ mode: "default" });

async function signIn(page: Page, who: keyof typeof USERS = "owner") {
  await page.goto("/admin/login");
  await page.locator("input[name=email]").fill(USERS[who].email);
  await page.locator("input[name=password]").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin(\?.*)?$/);
}

test.describe("the public site", () => {
  for (const url of ["/", "/products/red-burn", "/products/gold", "/products/creatine", "/policies/shipping", "/cart", "/checkout", "/anything-else", "/maintenance"]) {
    test(`${url} is the branded under-development page, HTTP 503, not indexable`, async ({ page }) => {
      const res = await page.goto(url);
      expect(res?.status()).toBe(503);
      expect(res?.headers()["retry-after"]).toBe("3600");
      expect(res?.headers()["x-robots-tag"]).toContain("noindex");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("MIEL+ is under development");
      await expect(page.getByText("Something new is coming. Stay tuned.")).toBeVisible();
      await expect(page.getByRole("img", { name: "MIEL+" })).toBeVisible();
      const robotsMeta = await page.locator('meta[name="robots"]').evaluateAll((els) => els.map((e) => e.getAttribute("content") ?? ""));
      expect(robotsMeta.length).toBeGreaterThan(0);
      for (const c of robotsMeta) expect(c).toMatch(/noindex/); // every robots tag says noindex
      // nothing to sign up for, nothing to buy
      await expect(page.locator("form, input, textarea, select")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /add to cart|checkout|place order|subscribe|notify/i })).toHaveCount(0);
      const text = (await page.locator("body").innerText()).toLowerCase();
      expect(text).not.toMatch(/health|cure|treat|prevent|medical|immune|detox|newsletter|subscribe|email me/);
      expect(text).not.toContain("$"); // no prices either
    });
  }

  test("uses the design system: dark base, acid accent, Archivo display type, big type on a phone, no horizontal scroll", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto("/");
    const h1 = page.getByRole("heading", { level: 1 });
    const css = await h1.evaluate((el) => {
      const s = getComputedStyle(el);
      return { size: parseFloat(s.fontSize), upper: s.textTransform, weight: s.fontWeight, family: s.fontFamily, color: s.color };
    });
    expect(css.size).toBeGreaterThanOrEqual(30);
    expect(css.upper).toBe("uppercase");
    expect(Number(css.weight)).toBeGreaterThanOrEqual(800);
    expect(css.family.toLowerCase()).toContain("archivo");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toMatch(/rgb\(35, 32, 28\)/); // #23201C
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await ctx.close();
  });

  test("robots.txt disallows everything and the sitemap is hidden", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/Disallow: \//);
    expect(robots).not.toMatch(/Allow: \/\s|Sitemap:/);
    expect((await request.get("/sitemap.xml")).status()).toBe(503);
  });
});

test.describe("no order can be placed", () => {
  test("cart, checkout and tracking calls are refused with 503 and nothing is written", async ({ request }) => {
    const before = one<{ o: number; c: number; a: number; e: number }>("SELECT (SELECT COUNT(*) FROM orders) o, (SELECT COUNT(*) FROM customers) c, (SELECT COUNT(*) FROM abandoned_checkouts) a, (SELECT COUNT(*) FROM events) e")!;
    const calls = [
      request.post("/", { headers: { "next-action": "0123456789abcdef0123456789abcdef01234567", "content-type": "text/plain" }, data: "[]" }),
      request.post("/products/red-burn", { headers: { "next-action": "0123456789abcdef0123456789abcdef01234567", "content-type": "text/plain" }, data: "[]" }),
      request.post("/api/track", { data: { type: "visit", path: "/" } }),
      request.get("/api/track"),
      request.post("/api/orders", { data: { items: [] } }),
    ];
    for (const r of await Promise.all(calls)) {
      expect(r.status()).toBe(503);
      expect(r.headers()["retry-after"]).toBe("3600");
      expect(await r.json()).toMatchObject({ ok: false });
    }
    expect(one("SELECT (SELECT COUNT(*) FROM orders) o, (SELECT COUNT(*) FROM customers) c, (SELECT COUNT(*) FROM abandoned_checkouts) a, (SELECT COUNT(*) FROM events) e")).toEqual(before);
  });
});

test.describe("what stays reachable", () => {
  test("/api/health is 200 and says mail is not configured", async ({ request }) => {
    const r = await request.get("/api/health");
    expect(r.status()).toBe(200);
    expect(await r.json()).toMatchObject({ status: "ok", db: "ok", volume: "writable", mail: "not_configured" });
  });

  test("static assets and uploaded images are served (a missing upload is a 404 from the images route, not the maintenance page)", async ({ request }) => {
    expect((await request.get("/brand/miel-m-plus.png")).status()).toBe(200);
    expect((await request.get("/icon.png")).status()).toBe(200);
    const miss = await request.get("/uploads/11111111-1111-4111-8111-111111111111-480.webp");
    expect(miss.status()).toBe(404);
    expect(await miss.text()).not.toContain("under development");
    expect((await request.get("/uploads/..%2fmiel.db")).status()).toBe(404);
  });

  test("the admin login page and the admin API gate behave exactly as in live mode", async ({ request, page }) => {
    expect((await page.goto("/admin/login"))?.status()).toBe(200);
    await expect(page.locator("input[name=password]")).toBeVisible();
    expect((await request.get("/admin/api/notifications", { maxRedirects: 0 })).status()).toBe(401);
    expect((await request.get("/admin/orders", { maxRedirects: 0 })).status()).toBe(307);
    expect((await request.get("/admin/api/events", { maxRedirects: 0 })).status()).toBe(401);
  });
});

test.describe("the admin in maintenance mode, with no email configured", () => {
  test("signs in and shows both banners on every admin page", async ({ page }) => {
    await signIn(page);
    for (const url of ["/admin", "/admin/orders", "/admin/products", "/admin/settings/team", "/admin/inventory"]) {
      expect((await page.goto(url))?.status(), url).toBe(200);
      await expect(page.locator('[data-banner="maintenance"]'), url).toContainText("Storefront is hidden from the public. Set SITE_MODE=live to launch.");
      await expect(page.locator('[data-banner="mail"]'), url).toContainText("Email is not configured yet");
    }
  });

  test("the live alert stream and the notifications API work for the admin", async ({ page }) => {
    await signIn(page);
    expect((await page.request.get("/admin/api/notifications")).status()).toBe(200);
    const connected = await page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const es = new EventSource("/admin/api/events");
          es.addEventListener("hello", () => {
            es.close();
            resolve(true);
          });
          setTimeout(() => resolve(false), 8000);
        }),
    );
    expect(connected).toBe(true);
  });

  test("the team can still enter an order by hand", async ({ page }) => {
    await signIn(page);
    const before = one<{ n: number }>("SELECT COUNT(*) n FROM orders")!.n;
    await page.goto("/admin/orders/new");
    await page.getByRole("button", { name: "More RED BURN" }).click();
    await page.locator("input[name=name]").fill("Maintenance Phone Customer");
    await page.locator("input[name=phone]").fill("71 765 432");
    await page.locator("select[name=region]").selectOption({ index: 1 });
    await page.locator("textarea[name=address]").fill("Jounieh, Main Rd, Bldg 3");
    await page.getByRole("button", { name: "Create order" }).click();
    await page.waitForURL(/\/admin\/orders\/[0-9a-f-]{36}/, { timeout: 20_000 });
    expect(one<{ n: number }>("SELECT COUNT(*) n FROM orders")!.n).toBe(before + 1);
  });

  test("an invite shows a copyable one-time link (nothing is emailed); the person can use it exactly once", async ({ browser }) => {
    const octx = await browser.newContext();
    const owner = await octx.newPage();
    await signIn(owner);
    await owner.goto("/admin/settings/team");
    await owner.locator("form:has(input[name=email]) input[name=email]").last().fill("handover@e2e.test");
    await owner.locator("form:has(input[name=email]) select[name=role]").last().selectOption("staff");
    await owner.getByRole("button", { name: "Send invite" }).click();
    await expect(owner.getByText(/Email isn.t configured yet, so copy the link below/)).toBeVisible();
    const box = owner.getByRole("group", { name: /One-time invite link/ });
    await expect(box).toBeVisible();
    await expect(box.getByRole("button", { name: /Copy link/ })).toBeVisible();
    const link = await box.locator("input").inputValue();
    expect(link).toContain("/admin/set-password?type=invite&token=");
    expect(JSON.stringify(query("SELECT * FROM invites"))).not.toContain(new URL(link).searchParams.get("token")!); // only a hash is stored
    expect(query("SELECT 1 FROM audit_log WHERE action = 'email_not_sent'").length).toBeGreaterThanOrEqual(1);
    await octx.close();

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(link.replace(/^https?:\/\/[^/]+/, MAINT_URL)); // the link is built on NEXT_PUBLIC_SITE_URL; open it on this server
    await page.locator("input[name=password]").fill("handed over passphrase 42");
    await page.locator("input[name=confirm]").fill("handed over passphrase 42");
    await page.getByRole("button", { name: "Save and sign in" }).click();
    await page.waitForURL(/\/admin(\?.*)?$/);
    expect(one<{ role: string }>("SELECT role FROM admin_users WHERE email = 'handover@e2e.test'")!.role).toBe("staff");
    const again = await browser.newContext();
    const p2 = await again.newPage();
    await p2.goto(link.replace(/^https?:\/\/[^/]+/, MAINT_URL));
    await expect(p2.getByText(/invalid, was already used, or has expired/i)).toBeVisible();
    await again.close();
    await ctx.close();
  });

  test("a password reset for a teammate is a copyable link too, and 'Forgot password' sends people to the owner", async ({ browser }) => {
    const ctx = await browser.newContext();
    const owner = await ctx.newPage();
    await signIn(owner);
    await owner.goto("/admin/settings/team");
    const row = owner.locator("li", { hasText: USERS.manager.email });
    await row.getByRole("button", { name: "Send reset link" }).click();
    const box = owner.getByRole("group", { name: /One-time reset link/ });
    await expect(box).toBeVisible();
    expect(await box.locator("input").inputValue()).toContain("/admin/set-password?type=reset&token=");
    await ctx.close();

    const anon = await browser.newContext();
    const page = await anon.newPage();
    await page.goto("/admin/forgot");
    await page.locator("input[name=email]").fill(USERS.manager.email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/isn.t available yet. Ask the owner for a reset link/)).toBeVisible();
    await anon.close();
  });
});
