import { expect, test, type Browser, type Page } from "@playwright/test";
import { newContext, one, signIn, sql, VIEWPORTS, writeResults } from "./qa-lib";

/**
 * STEP 3 and 4 in the browser, against the production build: live updates without a refresh (dashboard, bell, SSE and the polling
 * fallback), two tabs at once (payout, edit conflict) and the application double click.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(600_000);

type Item = { name: string; ok: boolean; note: string };
const items: Item[] = [];
async function record(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    items.push({ name, ok: true, note: "" });
  } catch (e) {
    items.push({ name, ok: false, note: String((e as Error).message).split("\n")[0].slice(0, 240) });
  }
}

const desktop = VIEWPORTS[0];
const phone = VIEWPORTS[1];

async function apply(browser: Browser, handle: string) {
  const ctx = await newContext(browser, phone);
  const p = await ctx.newPage();
  await p.goto("/ambassadors");
  await p.locator("#ap-name").fill(`Live ${handle}`);
  await p.locator("#ap-ig").fill(handle);
  await p.waitForTimeout(3300); // the minimum fill time of the spam check
  await p.getByRole("button", { name: "SEND APPLICATION" }).click();
  await expect(p.getByText("You're on the list.")).toBeVisible({ timeout: 15_000 });
  await ctx.close();
}
const newApps = () => one<Record<string, number>>("SELECT COUNT(*) n FROM affiliate_applications WHERE status = 'new'")!.n;

test("a new application reaches the dashboard and the bell without a refresh (SSE), then via polling when the stream is cut", async ({ browser }) => {
  test.setTimeout(240_000);
  const a = await (await newContext(browser, desktop)).newPage();
  await signIn(a);
  await a.addInitScript(() => localStorage.setItem("miel_admin_seen", new Date(Date.now() + 3_600_000).toISOString()));
  await a.goto("/admin");
  await record("dashboard banner counts a new application live (no reload)", async () => {
    const before = newApps();
    await expect(a.getByText(new RegExp(`^${before} new ambassador application`))).toBeVisible();
    await apply(browser, `live.sse.${Date.now() % 100000}`);
    await expect(a.getByText(new RegExp(`^${before + 1} new ambassador application`))).toBeVisible({ timeout: 20_000 });
  });
  await record("the bell shows the toast for a new application (SSE)", async () => {
    const c = await (await newContext(browser, desktop)).newPage();
    await signIn(c);
    await c.addInitScript(() => localStorage.setItem("miel_admin_seen", new Date(Date.now() + 3_600_000).toISOString()));
    await c.goto("/admin/settings/team"); // an edit page: only the bell can notice
    await c.waitForTimeout(1500);
    await apply(browser, `live.toast.${Date.now() % 100000}`);
    await expect(c.getByText("NEW APPLICATION")).toBeVisible({ timeout: 20_000 });
    await c.getByRole("button", { name: /^Notifications/ }).click();
    await expect(c.getByRole("list", { name: "New applications" })).toBeVisible();
    await c.context().close();
  });
  await record("polling fallback: with the stream blocked, the bell still counts a new application (30 s poll)", async () => {
    const ctx = await newContext(browser, phone);
    const p = await ctx.newPage();
    await signIn(p);
    await p.route("**/admin/api/events", (r) => r.abort());
    await p.addInitScript(() => localStorage.setItem("miel_admin_seen", new Date(Date.now() + 3_600_000).toISOString()));
    await p.goto("/admin/settings/team");
    const bell = p.getByRole("button", { name: /^Notifications/ });
    await expect(bell).toHaveAttribute("aria-label", "Notifications");
    await apply(browser, `live.poll.${Date.now() % 100000}`);
    await p.evaluate(() => localStorage.setItem("miel_admin_seen", new Date(Date.now() - 600_000).toISOString()));
    await expect(bell).toHaveAttribute("aria-label", /\d+ new/, { timeout: 70_000 });
    await ctx.close();
  });
});

test("a new storefront order shows on the dashboard (today's orders) without a refresh", async ({ browser }) => {
  const a = await (await newContext(browser, desktop)).newPage();
  await signIn(a);
  await a.goto("/admin");
  await record("dashboard: today's orders and sales move when a customer orders", async () => {
    const body = async () => (await a.locator("main").innerText()).replace(/\n+/g, " | ");
    const before = Number((await body()).match(/TODAY'S SALES \| [^|]*\| \$[\d,.]+ \| (\d+) ORDERS?/)?.[1]);
    const ctx = await newContext(browser, phone);
    const s = await ctx.newPage();
    await s.goto("/products/red-burn");
    await s.getByRole("button", { name: /ADD TO CART/ }).first().click();
    await s.getByRole("button", { name: "CHECKOUT" }).click();
    await s.locator("#name").fill("Live Orderer");
    await s.locator("#phone").fill(`03 ${Math.floor(100000 + Math.random() * 899999)}`);
    await s.locator("#region").selectOption({ index: 1 });
    await s.locator("#address").fill("Beirut, Hamra, test building, floor 2");
    await s.getByRole("button", { name: "PLACE ORDER" }).click();
    await expect(s.getByText(/Order placed/)).toBeVisible({ timeout: 20_000 });
    await ctx.close();
    await expect.poll(async () => Number((await body()).match(/TODAY'S SALES \| [^|]*\| \$[\d,.]+ \| (\d+) ORDERS?/)?.[1]), { timeout: 20_000 }).toBe(before + 1);
  });
});

test("two tabs: one payout only, and a stale edit is refused", async ({ browser }) => {
  const a = sql<{ id: string; code: string }>("SELECT a.id, a.code FROM affiliates a WHERE (SELECT COALESCE(SUM(commission_amount_cents),0) FROM orders o WHERE o.affiliate_id = a.id AND o.commission_status = 'approved') > (SELECT COALESCE(SUM(commission_amount_cents),0) FROM orders o WHERE o.affiliate_id = a.id AND o.commission_status = 'void' AND o.commission_payout_id IS NOT NULL AND o.commission_correction_payout_id IS NULL) LIMIT 1")[0];
  const open = async () => {
    const ctx = await newContext(browser, desktop);
    const p = await ctx.newPage();
    p.on("dialog", (d) => void d.accept());
    await signIn(p);
    await p.goto(`/admin/affiliates/${a.id}`);
    return p;
  };
  await record("Record payout clicked in two tabs at the same moment pays once", async () => {
    const [t1, t2] = [await open(), await open()];
    const before = one<Record<string, number>>("SELECT COUNT(*) n FROM affiliate_payouts WHERE affiliate_id = ?", a.id)!.n;
    const btn = (p: Page) => p.getByRole("button", { name: /Record payout of/ });
    await expect(btn(t1)).toBeVisible();
    await expect(btn(t2)).toBeVisible();
    await Promise.all([btn(t1).click(), btn(t2).click()]);
    await expect.poll(() => one<Record<string, number>>("SELECT COUNT(*) n FROM affiliate_payouts WHERE affiliate_id = ?", a.id)!.n, { timeout: 20_000 }).toBe(before + 1);
    await t1.waitForTimeout(1500);
    expect(one<Record<string, number>>("SELECT COUNT(*) n FROM affiliate_payouts WHERE affiliate_id = ?", a.id)!.n).toBe(before + 1);
    const books = one<Record<string, number>>(
      "SELECT COALESCE((SELECT SUM(amount_cents) FROM affiliate_payouts WHERE affiliate_id = ?),0) AS paid, COALESCE((SELECT SUM(commission_amount_cents) FROM orders WHERE affiliate_id = ? AND commission_payout_id IS NOT NULL),0) - COALESCE((SELECT SUM(commission_amount_cents) FROM orders WHERE affiliate_id = ? AND commission_correction_payout_id IS NOT NULL),0) AS expected",
      a.id, a.id, a.id,
    )!;
    expect(books.paid).toBe(books.expected);
    const msgs = [await t1.locator("main").innerText(), await t2.locator("main").innerText()].join(" ");
    expect(msgs).toMatch(/Payout of \$/); // one tab was told it worked
    expect(msgs).toMatch(/Nothing approved|Nothing to pay/); // the other was refused, not paid twice
    await t1.context().close();
    await t2.context().close();
  });
  await record("two tabs editing the same affiliate: the second save is refused, nothing is overwritten", async () => {
    const [t1, t2] = [await open(), await open()];
    await t1.locator("input[name=notes], textarea[name=notes]").first().fill("first tab");
    await t2.locator("input[name=notes], textarea[name=notes]").first().fill("second tab");
    await t1.getByRole("button", { name: "Save affiliate" }).click();
    await expect(t1.getByText("Saved.")).toBeVisible();
    await t2.getByRole("button", { name: "Save affiliate" }).click();
    await expect(t2.getByText(/Someone else changed/)).toBeVisible();
    expect(one<{ notes: string }>("SELECT notes FROM affiliates WHERE id = ?", a.id)!.notes).toBe("first tab");
    await t1.context().close();
    await t2.context().close();
  });
});

test("double click on Approve creates exactly one affiliate", async ({ browser }) => {
  await record("approve application: a double click makes one affiliate, not two", async () => {
    const app = sql<{ id: string; name: string }>("SELECT id, name FROM affiliate_applications WHERE status = 'new' ORDER BY created_at LIMIT 1")[0];
    const before = one<Record<string, number>>("SELECT COUNT(*) n FROM affiliates")!.n;
    const p = await (await newContext(browser, desktop)).newPage();
    p.on("dialog", (d) => void d.accept());
    await signIn(p);
    await p.goto("/admin/affiliates/applications");
    const card = p.locator("li", { hasText: app.name });
    await card.getByRole("button", { name: /Approve and create affiliate/ }).dblclick();
    await expect(p.getByText(/Approved\. Code/).first()).toBeVisible({ timeout: 15_000 });
    await p.waitForTimeout(1000);
    expect(one<Record<string, number>>("SELECT COUNT(*) n FROM affiliates")!.n).toBe(before + 1);
    expect(one<{ status: string }>("SELECT status FROM affiliate_applications WHERE id = ?", app.id)!.status).toBe("approved");
  });
});

test("live results recorded", () => {
  writeResults("live", items);
  expect(items.filter((i) => !i.ok).map((i) => `${i.name} :: ${i.note}`)).toEqual([]);
  expect(items.length).toBeGreaterThanOrEqual(7);
});
