import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const ROOT = path.resolve(__dirname, "../..");
const UUID = "00000000-0000-4000-8000-000000000001";

/** Every admin route that exists on disk, turned into a URL. */
function adminRoutes() {
  const pages: string[] = [];
  const apis: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "page.tsx" || e.name === "route.ts") {
        const url =
          "/" +
          path
            .relative(path.join(ROOT, "app"), dir)
            .split(path.sep)
            .filter((s) => !/^\(.*\)$/.test(s))
            .map((s) => (s.startsWith("[") ? UUID : s))
            .join("/");
        (e.name === "page.tsx" ? pages : apis).push(url);
      }
    }
  };
  walk(path.join(ROOT, "app/admin"));
  return { pages, apis };
}
const PUBLIC = new Set(["/admin/login", "/admin/forgot", "/admin/auth/confirm"]);
const { pages, apis } = adminRoutes();

test.describe("unauthenticated requests to the admin", () => {
  test("we found the routes", () => {
    expect(pages.length).toBeGreaterThan(20);
    expect(apis.length).toBeGreaterThanOrEqual(5);
  });

  for (const url of pages.filter((u) => !PUBLIC.has(u))) {
    test(`page ${url} redirects to login (never renders)`, async ({ request }) => {
      const r = await request.get(url, { maxRedirects: 0 });
      expect(r.status()).toBe(307);
      expect(r.headers()["location"]).toContain("/admin/login");
    });
  }

  for (const url of apis) {
    test(`route ${url} answers 401`, async ({ request }) => {
      const r = await request.get(url, { maxRedirects: 0 });
      expect(r.status()).toBe(401);
      expect(await r.json()).toMatchObject({ error: expect.any(String) });
    });
  }

  test("server actions answer 401 without a session", async ({ request }) => {
    for (const p of ["/admin/orders", "/admin/products/new", "/admin/settings", "/admin/settings/team", "/admin/marketing/discounts"]) {
      const r = await request.post(p, { headers: { "next-action": "0123456789abcdef0123456789abcdef01234567" }, data: "[]", maxRedirects: 0 });
      expect(r.status(), p).toBe(401);
    }
  });

  test("tampered IDs and injection strings still do not get in", async ({ request }) => {
    for (const p of ["/admin/orders/1%27%20OR%201=1--", "/admin/orders/..%2f..%2fetc%2fpasswd", "/admin/customers/%00", "/admin/products/%3Cscript%3E"]) {
      const r = await request.get(p, { maxRedirects: 0 });
      expect([307, 401, 404], p).toContain(r.status());
      expect(await r.text()).not.toMatch(/customer|order #|stack|at \w+ \(/i);
    }
  });

  test("the sign-in pages are reachable and contain no demo or bypass controls", async ({ page }) => {
    for (const p of ["/admin/login", "/admin/forgot"]) {
      const r = await page.goto(p);
      expect(r?.status()).toBe(200);
      const text = (await page.locator("body").innerText()).toLowerCase();
      for (const bad of ["enter as owner", "enter as manager", "enter as staff", "preview mode", "demo", "load demo"]) expect(text, `${p} shows "${bad}"`).not.toContain(bad);
    }
    await page.goto("/admin/login");
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test("wrong credentials give the generic message (nothing about whether the email exists)", async ({ page }) => {
    await page.goto("/admin/login");
    await page.fill('input[name="email"]', "nobody@example.com");
    await page.fill('input[name="password"]', "not-a-real-password-1");
    await page.click('button:has-text("Sign in")');
    await expect(page.getByText("Wrong email or password.")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("body")).not.toContainText(/does not exist|no account|not found|unknown user/i);
  });

  test("an invalid invite/reset link is refused", async ({ page }) => {
    await page.goto("/admin/auth/confirm?token_hash=forged&type=invite&next=https://evil.example");
    await page.click('button:has-text("Continue")');
    await expect(page).toHaveURL(/\/admin\/login\?error=link/, { timeout: 15000 });
    await expect(page.getByText(/invalid or has expired/i)).toBeVisible();
  });
});

test.describe("sign-up is impossible", () => {
  for (const url of ["/signup", "/sign-up", "/register", "/admin/signup", "/admin/register", "/auth/sign-up", "/admin/auth/signup", "/join"]) {
    test(`${url} does not exist`, async ({ request }) => {
      const r = await request.get(url, { maxRedirects: 0 });
      expect([404, 307]).toContain(r.status());
      if (r.status() === 307) expect(r.headers()["location"]).toContain("/admin/login");
    });
  }
  test("the login form offers no create-account path", async ({ page }) => {
    await page.goto("/admin/login");
    const text = (await page.locator("body").innerText()).toLowerCase();
    expect(text).not.toMatch(/sign up|create account|register|join us/);
  });
});
