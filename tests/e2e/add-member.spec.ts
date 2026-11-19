import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { E2E_PASSWORD, USERS } from "../support/e2e-env";
import { exec, one, query } from "../support/e2e-db";
import { totpNow } from "../../lib/totp";

/**
 * "Add member": the owner creates an active account with a generated temporary password shown once; the member must
 * choose their own password, then enrol two-factor, before anything else opens. Serial: each test builds on the last.
 * (The temporary passwords below only ever live in test variables, never in a log.)
 */
test.describe.configure({ mode: "serial" });

let ipCounter = 100;
const newCtx = (browser: Browser) => browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${ipCounter++}` } }); // each person from their own address (login limits are per IP)

async function signInAs(page: Page, email: string, password: string) {
  await page.goto("/admin/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
async function ownerOnTeamPage(browser: Browser): Promise<{ page: Page; ctx: BrowserContext }> {
  const ctx = await newCtx(browser);
  const page = await ctx.newPage();
  page.on("dialog", (d) => void d.accept());
  await signInAs(page, USERS.owner.email, E2E_PASSWORD);
  await page.waitForURL(/\/admin(\?.*)?$/);
  await page.goto("/admin/settings/team");
  return { page, ctx };
}
/** Owner adds a member through the real form and returns the temporary password shown on screen. */
async function addThroughUi(page: Page, name: string, email: string, role: "staff" | "manager" | "owner" = "staff", confirm?: string): Promise<string> {
  const panel = page.getByRole("button", { name: "Add member" });
  if (await panel.isVisible()) await panel.click();
  const form = page.locator("form:has(input[name=name]):has(button:has-text('Create member'))");
  await form.locator("input[name=name]").fill(name);
  await form.locator("input[name=email]").fill(email);
  await form.locator("select[name=role]").selectOption(role);
  if (confirm !== undefined) await form.locator("input[name=confirm_owner]").fill(confirm);
  await form.getByRole("button", { name: "Create member" }).click();
  const box = page.getByRole("group", { name: "Temporary password (shown once)" });
  await expect(box).toBeVisible({ timeout: 20_000 });
  return box.locator("input").inputValue();
}

test("the Add member button is for the owner; a manager or staff member never sees it and cannot reach the page", async ({ browser }) => {
  const { page, ctx } = await ownerOnTeamPage(browser);
  await expect(page.getByRole("button", { name: "Add member" })).toBeVisible();
  await ctx.close();
  for (const who of ["manager", "staff"] as const) {
    const c = await newCtx(browser);
    const p = await c.newPage();
    await signInAs(p, USERS[who].email, E2E_PASSWORD);
    await p.waitForURL(/\/admin(\?.*)?$/);
    const res = await p.goto("/admin/settings/team");
    expect(res?.status(), who).toBe(403);
    await expect(p.getByRole("button", { name: "Add member" })).toHaveCount(0);
    await c.close();
  }
});

test("the owner adds a member: password shown once with a copy button and a warning, never chosen by the owner", async ({ browser }) => {
  const { page, ctx } = await ownerOnTeamPage(browser);
  await page.getByRole("button", { name: "Add member" }).click();
  // the form offers the roles; a typed confirmation appears only for owner
  const form = page.locator("form:has(input[name=name]):has(button:has-text('Create member'))");
  await expect(form.locator("input[name=confirm_owner]")).toHaveCount(0);
  await form.locator("select[name=role]").selectOption("owner");
  await expect(form.locator("input[name=confirm_owner]")).toBeVisible();
  await form.locator("input[name=name]").fill("Nope Owner");
  await form.locator("input[name=email]").fill("nope.owner@e2e.test");
  await form.locator("input[name=confirm_owner]").fill("yes please");
  await form.getByRole("button", { name: "Create member" }).click();
  await expect(page.getByText(/Type CREATE OWNER to confirm/)).toBeVisible();
  expect(query("SELECT 1 FROM admin_users WHERE email = 'nope.owner@e2e.test'")).toHaveLength(0);
  await form.locator("select[name=role]").selectOption("staff");

  const password = await addThroughUi(page, "Added Member", "added.member@e2e.test", "staff");
  expect(password).toMatch(/^[A-Za-z2-9]{5}(-[A-Za-z2-9]{5}){3}$/);
  const box = page.getByRole("group", { name: "Temporary password (shown once)" });
  await expect(box.getByRole("button", { name: "Copy password" })).toBeVisible();
  await expect(box).toContainText("will NOT be shown again");
  await expect(box).toContainText("48 hours");
  const u = one<Record<string, any>>("SELECT * FROM admin_users WHERE email = 'added.member@e2e.test'")!;
  expect(u).toMatchObject({ role: "staff", active: 1, must_change_password: 1, must_enroll_mfa: 1 });
  expect(u.password_hash.startsWith("$argon2id$")).toBe(true);
  expect(u.password_hash).not.toContain(password);
  // the list shows the member as pending, with the regenerate button
  await page.goto("/admin/settings/team");
  const row = page.locator("li", { hasText: "added.member@e2e.test" });
  await expect(row).toContainText("Temporary password pending");
  await expect(row.getByRole("button", { name: "Regenerate temporary password" })).toBeVisible();
  // the password is gone from the page after a reload
  await expect(page.locator("body")).not.toContainText(password);
  // audit: who created whom, role, time; never the password
  const a = one<Record<string, string>>("SELECT actor_email, details, created_at FROM audit_log WHERE action = 'member_created' AND entity = 'admin_user'")!;
  expect(a.actor_email).toBe(USERS.owner.email);
  expect(JSON.parse(a.details)).toMatchObject({ email: "added.member@e2e.test", role: "staff", created_by: USERS.owner.email });
  expect(JSON.stringify(query("SELECT * FROM audit_log"))).not.toContain(password);
  test.info().annotations.push({ type: "member", description: "added.member@e2e.test" });
  await ctx.close();
  process.env.E2E_ADDED_PW = password; // handed to the next test in this serial file (a throwaway password of a throwaway database)
});

test("first login: forced new password, then forced two-factor, and nothing else opens in between", async ({ browser }) => {
  test.setTimeout(120_000);
  const temp = process.env.E2E_ADDED_PW!;
  const ctx = await newCtx(browser);
  const page = await ctx.newPage();
  await signInAs(page, "added.member@e2e.test", temp);
  await page.waitForURL(/\/admin\/change-password/);
  await expect(page.getByRole("heading", { name: "Choose your own password" })).toBeVisible();

  // nothing else is reachable
  for (const url of ["/admin", "/admin/orders", "/admin/products", "/admin/account", "/admin/mfa"]) {
    await page.goto(url);
    await expect(page, url).toHaveURL(/\/admin\/change-password/);
  }
  expect((await page.request.get("/admin/api/notifications")).status()).toBe(401);
  expect((await page.request.get("/admin/orders/export")).status()).toBe(401);

  // strength rules
  await page.locator("input[name=password]").fill("onlylettersnodigits"); // long enough for the form, weak for the server
  await page.locator("input[name=confirm]").fill("onlylettersnodigits");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText(/Mix letters and numbers/)).toBeVisible();
  await page.locator("input[name=password]").fill(temp);
  await page.locator("input[name=confirm]").fill(temp);
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText(/different password/)).toBeVisible();
  await page.locator("input[name=password]").fill("my very own passphrase 77");
  await page.locator("input[name=confirm]").fill("my very own passphrase 77");
  await page.getByRole("button", { name: "Save and continue" }).click();

  // second gate: two-factor, even though the owner never required it
  await page.waitForURL(/\/admin\/mfa/);
  await expect(page.getByRole("heading", { name: "Turn on two-factor" })).toBeVisible();
  for (const url of ["/admin", "/admin/orders", "/admin/inventory", "/admin/account"]) {
    await page.goto(url);
    await expect(page, url).toHaveURL(/\/admin\/mfa/);
  }
  expect((await page.request.get("/admin/api/notifications")).status()).toBe(401);
  expect((await page.request.get("/admin/api/events")).status()).toBe(401);

  await page.getByRole("button", { name: "Set up two-factor authentication" }).click();
  const secret = (await page.getByText(/Secret: /).innerText()).split(":").pop()!.trim();
  await page.locator("input[name=code]").fill(totpNow(secret));
  await page.getByRole("button", { name: "Verify and turn on" }).click();
  await page.getByRole("list", { name: "Recovery codes" }).waitFor();
  expect(await page.getByRole("list", { name: "Recovery codes" }).locator("li").count()).toBe(10);
  await page.getByRole("button", { name: "I saved them, continue" }).click();
  await page.waitForURL(/\/admin(\?.*)?$/);

  // now in, with exactly the staff role
  expect((await page.goto("/admin/orders"))?.status()).toBe(200);
  expect((await page.goto("/admin/settings/team"))?.status()).toBe(403);
  expect(one<Record<string, any>>("SELECT must_change_password, must_enroll_mfa, totp_enabled, temp_password_expires_at FROM admin_users WHERE email = 'added.member@e2e.test'")).toEqual({ must_change_password: 0, must_enroll_mfa: 0, totp_enabled: 1, temp_password_expires_at: null });
  // and from the next sign-in on, the normal rules apply (password, then the authenticator code)
  await ctx.clearCookies();
  await signInAs(page, "added.member@e2e.test", "my very own passphrase 77");
  await page.waitForURL(/\/admin\/mfa/);
  await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible();
  await ctx.close();
  delete process.env.E2E_ADDED_PW;
});

test("the temporary password expires after 48 hours; the owner regenerates it and the old one is dead", async ({ browser }) => {
  const { page, ctx } = await ownerOnTeamPage(browser);
  const first = await addThroughUi(page, "Late Member", "late.member@e2e.test", "manager");
  // 48 hours pass without use
  exec("UPDATE admin_users SET temp_password_expires_at = ? WHERE email = 'late.member@e2e.test'", new Date(Date.now() - 60_000).toISOString());
  const c1 = await newCtx(browser);
  const p1 = await c1.newPage();
  await signInAs(p1, "late.member@e2e.test", first);
  await expect(p1.getByText("Wrong email or password.")).toBeVisible(); // same generic message: nothing about expiry or existence
  await c1.close();

  // the owner regenerates it from the member's row
  await page.goto("/admin/settings/team");
  const row = page.locator("li", { hasText: "late.member@e2e.test" });
  await expect(row).toContainText(/expired/);
  await row.getByRole("button", { name: "Regenerate temporary password" }).click();
  const box = page.getByRole("group", { name: "Temporary password (shown once)" });
  await expect(box).toBeVisible({ timeout: 20_000 });
  const second = await box.locator("input").inputValue();
  expect(second).not.toBe(first);
  expect(JSON.stringify(query("SELECT * FROM audit_log"))).not.toMatch(new RegExp(`${first}|${second}`));
  expect(query("SELECT 1 FROM audit_log WHERE action = 'member_password_regenerated'").length).toBeGreaterThanOrEqual(1);

  const c2 = await newCtx(browser);
  const p2 = await c2.newPage();
  await signInAs(p2, "late.member@e2e.test", first);
  await expect(p2.getByText("Wrong email or password.")).toBeVisible(); // the old one is dead
  await signInAs(p2, "late.member@e2e.test", second);
  await p2.waitForURL(/\/admin\/change-password/);
  await c2.close();
  await ctx.close();
});

test("a second owner can be added only with the typed confirmation, and also goes through the forced steps", async ({ browser }) => {
  const { page, ctx } = await ownerOnTeamPage(browser);
  const pw = await addThroughUi(page, "Second Owner", "second.owner@e2e.test", "owner", "CREATE OWNER");
  expect(one<{ role: string }>("SELECT role FROM admin_users WHERE email = 'second.owner@e2e.test'")!.role).toBe("owner");
  const c = await newCtx(browser);
  const p = await c.newPage();
  await signInAs(p, "second.owner@e2e.test", pw);
  await p.waitForURL(/\/admin\/change-password/);
  expect((await p.goto("/admin/settings/team"))?.url()).toContain("/admin/change-password"); // an owner too: nothing until the steps are done
  await c.close();
  await ctx.close();
});

test("the Invite flow still sits next to it and still works", async ({ browser }) => {
  const { page, ctx } = await ownerOnTeamPage(browser);
  await expect(page.getByRole("button", { name: "Send invite" })).toBeVisible();
  await page.locator("form:has(button:has-text('Send invite')) input[name=email]").fill("invited.alongside@e2e.test");
  await page.locator("form:has(button:has-text('Send invite')) select[name=role]").selectOption("staff");
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText(/Invite sent to invited.alongside@e2e.test/)).toBeVisible();
  expect(query("SELECT 1 FROM invites WHERE email = 'invited.alongside@e2e.test'")).toHaveLength(1);
  await ctx.close();
});
