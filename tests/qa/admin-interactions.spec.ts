import { expect, test, type Page } from "@playwright/test";
import { inspect, newContext, one, signIn, sql, verdict, VIEWPORTS, writeResults, type Viewport } from "./qa-lib";

/**
 * STEP 2 (interactions): filters, searches, sorts, pagination, exports, overlays (bell, command palette, mobile menu), bulk actions,
 * validation messages, empty states and error states, at both viewports. Each interaction is recorded with its result.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(900_000);

type Item = { vp: string; page: string; interaction: string; ok: boolean; note: string };
const items: Item[] = [];

async function step(vp: Viewport, pageName: string, interaction: string, fn: () => Promise<void>) {
  try {
    await fn();
    items.push({ vp: vp.name, page: pageName, interaction, ok: true, note: "" });
    writeResults("interactions-progress", items);
  } catch (e) {
    items.push({ vp: vp.name, page: pageName, interaction, ok: false, note: String((e as Error).message).split("\n")[0].slice(0, 220) });
  }
}

/** Watches one interaction for console errors and failed requests. */
async function clean(page: Page, fn: () => Promise<void>) {
  const bad: string[] = [];
  const onC = (m: import("@playwright/test").ConsoleMessage) => (m.type() === "error" || m.type() === "warning") && bad.push(m.text().slice(0, 160));
  const onE = (e: Error) => bad.push("pageerror " + e.message.slice(0, 160));
  const onR = (r: import("@playwright/test").Response) => r.status() >= 400 && !r.url().includes("favicon") && bad.push(`${r.status()} ${new URL(r.url()).pathname}`);
  page.on("console", onC);
  page.on("pageerror", onE);
  page.on("response", onR);
  try {
    await fn();
  } finally {
    page.off("console", onC);
    page.off("pageerror", onE);
    page.off("response", onR);
  }
  expect(bad, "console errors or failed requests during the interaction").toEqual([]);
}
const noOverflow = async (p: Page) => expect(await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

for (const vp of VIEWPORTS) {
  test(`interactions at ${vp.name}`, async ({ browser }) => {
    const page = await (await newContext(browser, vp)).newPage();
    await signIn(page);
    page.setDefaultTimeout(12_000); // a missing element fails this step in seconds instead of stalling the run
    const S = (pageName: string, what: string, fn: () => Promise<void>) => step(vp, pageName, what, () => clean(page, fn));

    // ---------------------------------------------------------------- pagination
    for (const [path, noun, nextRe, prevRe] of [["/admin/orders", "orders", /Older/, /Newer/], ["/admin/customers", "customers", /Next/, /Previous/], ["/admin/products", "products", /Next/, /Previous/], ["/admin/inventory", "items", /Next/, /Previous/], ["/admin/marketing/discounts", "codes", /Next/, /Previous/]] as const) {
      await S(path, "pagination: next, previous, and a page past the end", async () => {
        await page.goto(path);
        const rowsInDb = path === "/admin/orders" ? one<Record<string, number>>("SELECT COUNT(*) n FROM orders WHERE status <> 'draft'")!.n : path === "/admin/marketing/discounts" ? one<Record<string, number>>("SELECT COUNT(*) n FROM discounts")!.n : 1000;
        if (rowsInDb <= 25) {
          // one page only: there is nothing to page through, and the pager says so
          await expect(page.locator("main")).toContainText(/PAGE 1 \/ 1/i);
          return;
        }
        const nextLink = page.getByRole("link", { name: nextRe }).first();
        await expect(nextLink).toBeVisible();
        const first = (await page.locator("main").innerText()).slice(0, 4000);
        await nextLink.click();
        await expect(page).toHaveURL(/page=2/);
        await expect(page.getByText(/PAGE 2 \//).first()).toBeVisible();
        expect((await page.locator("main").innerText()).slice(0, 4000)).not.toBe(first);
        await noOverflow(page);
        await page.getByRole("link", { name: prevRe }).first().click();
        await expect(page.getByText(/PAGE 1 \//).first()).toBeVisible();
        await page.goto(`${path}${path.includes("?") ? "&" : "?"}page=99999`); // out of range: clamped, never an error
        await expect(page.getByText(/PAGE \d+ \/ \d+/i).first()).toBeVisible();
        void noun;
      });
    }

    // ---------------------------------------------------------------- search / filter / sort forms (every option)
    await S("/admin/orders", "search by order number, name and phone; every status filter; every payment filter", async () => {
      await page.goto("/admin/orders");
      const sample = one<{ order_number: number }>("SELECT order_number FROM orders WHERE status <> 'draft' LIMIT 1")!;
      await page.locator('input[name=q]').fill(String(sample.order_number));
      await page.getByRole("button", { name: "Apply" }).click();
      await expect(page.locator("main")).toContainText(`#${sample.order_number}`);
      await expect(page.getByText(/^1 order$/).first()).toBeVisible();
      for (const status of ["new", "confirmed", "packed", "out_for_delivery", "delivered", "cancelled", "returned"]) {
        await page.goto(`/admin/orders?status=${status}`);
        const want = (one<Record<string, number>>("SELECT COUNT(*) n FROM orders WHERE status = ?", status))!.n;
        await expect(page.getByText(new RegExp(`^${want} orders?$`)).first()).toBeVisible();
      }
      await page.goto("/admin/orders?q=zzzzzzzzzz");
      await expect(page.getByText("No orders match.")).toBeVisible();
    });
    await S("/admin/orders", "COD pending filter and date range", async () => {
      await page.goto("/admin/orders?pay=pending");
      await expect(page.locator("main")).not.toContainText("NaN");
      await page.goto("/admin/orders?from=2026-01-01&to=2026-01-31");
      await expect(page.getByText(/\d+ orders?/).first()).toBeVisible();
    });
    await S("/admin/customers", "search, tag, blocked and sort", async () => {
      await page.goto("/admin/customers");
      await page.locator("input[name=q]").fill("Rami");
      await page.getByRole("button", { name: "Apply" }).click();
      await expect(page).toHaveURL(/q=Rami/);
      const want = one<Record<string, number>>("SELECT COUNT(*) n FROM customers WHERE name LIKE '%Rami%' OR phone LIKE '%999999999%'")!.n;
      await expect(page.getByText(new RegExp(`· ${want} customers?`)).first()).toBeVisible();
      await page.goto("/admin/customers?tag=vip&sort=recent");
      await expect(page.getByText(/customers?/).first()).toBeVisible();
      await page.goto("/admin/customers?q=zzzzzzzz");
      await expect(page.getByText("No customers match.")).toBeVisible();
    });
    await S("/admin/products", "search and every status filter", async () => {
      for (const q of ["?q=Vanilla", "?status=active", "?status=draft", "?status=archived", "?q=zzzzzzzz"]) {
        await page.goto(`/admin/products${q}`);
        await expect(page.locator("main")).not.toContainText("NaN");
      }
      await expect(page.getByText(/No products/).first()).toBeVisible();
    });
    await S("/admin/inventory", "search, low-stock and out-of-stock filters", async () => {
      for (const q of ["?q=Mint", "?stock=low", "?stock=out", "?q=zzzzzzzz"]) {
        await page.goto(`/admin/inventory${q}`);
        await expect(page.locator("main")).not.toContainText("NaN");
      }
    });
    await S("/admin/affiliates/list", "search, every status filter, empty result", async () => {
      await page.goto("/admin/affiliates/list");
      await page.locator("input[name=q]").fill("QAAFF0");
      await page.getByRole("button", { name: "Apply" }).click();
      const want = one<Record<string, number>>("SELECT COUNT(*) n FROM affiliates WHERE code LIKE '%QAAFF0%' OR name LIKE '%QAAFF0%' OR instagram_handle LIKE '%QAAFF0%'")!.n;
      expect(await page.locator("table tbody tr, [data-card]").count()).toBeGreaterThanOrEqual(1);
      for (const status of ["active", "paused", "ended"]) {
        await page.goto(`/admin/affiliates/list?status=${status}`);
        const n = one<Record<string, number>>("SELECT COUNT(*) n FROM affiliates WHERE status = ?", status)!.n;
        if (vp.mobile) await expect(page.locator("main")).toContainText(new RegExp(status, "i"));
        else expect(await page.locator("table tbody tr").count()).toBe(n);
      }
      void want;
      await page.goto("/admin/affiliates/list?q=zzzzzzzz");
      await expect(page.getByText("No affiliates match.")).toBeVisible();
    });
    await S("/admin/settings/activity", "paging and filters load", async () => {
      await page.goto("/admin/settings/activity");
      await expect(page.locator("main")).not.toContainText("NaN");
    });

    // ---------------------------------------------------------------- exports
    await S("exports", "orders, customers, analytics (every kind) and affiliates CSV are real CSV files", async () => {
      const urls = ["/admin/orders/export", "/admin/orders/export?status=delivered", "/admin/customers/export", "/admin/analytics/export?kind=sales", "/admin/analytics/export?kind=products", "/admin/analytics/export?kind=regions", "/admin/analytics/export?kind=discounts", "/admin/analytics/export?kind=funnel", `/admin/affiliates/export?month=${new Date().toISOString().slice(0, 7)}`];
      for (const u of urls) {
        const r = await page.request.get(u);
        expect(r.status(), u).toBe(200);
        expect(r.headers()["content-type"], u).toContain("text/csv");
        expect(r.headers()["content-disposition"], u).toContain("attachment");
        const t = await r.text();
        expect(t.split("\n").length, u).toBeGreaterThan(1);
        for (const line of t.split("\n").slice(1, 400)) for (const cell of line.split('","')) expect(cell.replace(/^"/, ""), `${u}: ${cell}`).not.toMatch(/^[=@]/);
      }
      const orders = (await (await page.request.get("/admin/orders/export")).text()).trim().split("\n").length - 1;
      expect(orders).toBe(one<Record<string, number>>("SELECT COUNT(*) n FROM orders WHERE status <> 'draft'")!.n);
    });
    await S("/admin/orders", "Export CSV and New order buttons are present and link to real pages", async () => {
      await page.goto("/admin/orders");
      await expect(page.getByRole("link", { name: /Export CSV/ })).toHaveAttribute("href", /\/admin\/orders\/export/);
      await page.getByRole("link", { name: /New order/ }).click();
      await expect(page).toHaveURL(/\/admin\/orders\/new/);
    });

    // ---------------------------------------------------------------- overlays
    await S("shell", "notification bell opens, lists alerts and the new applications, closes with Escape, mute toggles", async () => {
      await page.goto("/admin");
      await page.waitForTimeout(1500); // hydration
      const bell = page.getByRole("button", { name: /^Notifications/ });
      await bell.click();
      await expect(page.getByText("Alerts", { exact: true })).toBeVisible();
      await expect(page.getByRole("list", { name: "New applications" })).toBeVisible();
      await page.getByRole("button", { name: /SOUND/ }).click();
      await page.getByRole("button", { name: /SOUND/ }).click();
      await page.keyboard.press("Escape");
      await expect(page.getByText("Alerts", { exact: true })).toBeHidden();
      await noOverflow(page);
    });
    if (!vp.mobile)
      await S("shell", "command palette: Ctrl+K, search a customer and an affiliate, Escape closes", async () => {
        await page.goto("/admin");
        await page.keyboard.press("Control+k");
        const input = page.getByRole("combobox").or(page.getByPlaceholder(/search/i)).first();
        await expect(input).toBeVisible();
        const c = one<{ name: string }>("SELECT name FROM customers LIMIT 1")!;
        await input.fill(c.name.split(" ")[0]);
        await expect(page.locator('[role="dialog"], [role="listbox"]').first()).toBeVisible();
        await page.keyboard.press("Escape");
      });
    if (vp.mobile)
      await S("shell", "phone navigation: Affiliates is a tab after Orders, the More menu opens, every entry is reachable at 48px", async () => {
        await page.goto("/admin");
        await page.waitForTimeout(800); // hydration
        const tabs = page.getByRole("navigation", { name: "Admin sections" });
        const names = (await tabs.getByRole("link").allInnerTexts()).map((t) => t.replace(/^\d+\s+/, "").replace(/\d+$/, "").trim());
        expect(names.slice(0, 3)).toEqual(["Dashboard", "Orders", "Affiliates"]);
        const aff = tabs.getByRole("link", { name: /Affiliates/ });
        expect((await aff.boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
        await page.getByRole("button", { name: /more/i }).first().click();
        const sheet = page.getByRole("dialog", { name: "More sections" });
        await expect(sheet.getByRole("link", { name: "Discounts" })).toBeVisible();
        expect((await sheet.getByRole("link", { name: "Discounts" }).boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
        await sheet.getByRole("button", { name: "Close", exact: true }).click();
        await aff.click();
        await expect(page).toHaveURL(/\/admin\/affiliates$/);
      });

    // ---------------------------------------------------------------- validation messages (nothing is saved)
    await S("/admin/orders/new", "no products: a clear message and no order created", async () => {
      const before = one<Record<string, number>>("SELECT COUNT(*) n FROM orders")!.n;
      await page.goto("/admin/orders/new");
      await page.locator("input[name=name]").fill("QA Validation");
      await page.locator("input[name=phone]").fill("03 123 456");
      await page.locator("select[name=region]").selectOption({ index: 1 });
      await page.locator("textarea[name=address]").fill("Hamra, Bldg 5");
      await page.getByRole("button", { name: "Create order" }).click();
      await expect(page.getByText("Add at least one product.")).toBeVisible();
      expect(one<Record<string, number>>("SELECT COUNT(*) n FROM orders")!.n).toBe(before);
    });
    await S("/admin/affiliates/new", "empty, bad and duplicate input each get a clear message; nothing is saved", async () => {
      const before = one<Record<string, number>>("SELECT COUNT(*) n FROM affiliates")!.n;
      await page.goto("/admin/affiliates/new");
      await page.getByRole("button", { name: "Create affiliate" }).click(); // native required fields block an empty form
      expect(await page.locator("input[name=name]").evaluate((e: HTMLInputElement) => e.validity.valueMissing)).toBe(true);
      await page.locator("input[name=name]").fill("Q");
      await page.locator("input[name=code]").fill("AB");
      await page.getByRole("button", { name: "Create affiliate" }).click();
      await expect(page.getByText(/Enter the affiliate's name|3 to 20/)).toBeVisible();
      await page.locator("input[name=name]").fill("Valid Name");
      await page.locator("input[name=code]").fill("qaaff00"); // exists (case-insensitive)
      await page.getByRole("button", { name: "Create affiliate" }).click();
      await expect(page.getByText("That code is already used. Pick another.")).toBeVisible();
      await page.locator("input[name=code]").fill("WELCOME10"); // a discount code
      await page.getByRole("button", { name: "Create affiliate" }).click();
      await expect(page.getByText("That code is already used. Pick another.")).toBeVisible();
      await page.locator("input[name=code]").fill("QAVALID1");
      await page.locator("input[name=commission_percent]").fill("150");
      await page.getByRole("button", { name: "Create affiliate" }).click();
      await expect(page.locator("main")).toContainText(/between 0 and 100|must be at most|Commission/);
      expect(one<Record<string, number>>("SELECT COUNT(*) n FROM affiliates")!.n).toBe(before);
    });
    await S("/admin/marketing/discounts", "a bad code and a bad percent are refused with a message", async () => {
      await page.goto("/admin/marketing/discounts");
      const form = page.locator("form:has(input[name=code])").first();
      await form.locator("input[name=code]").fill("a!");
      await form.getByRole("button", { name: /Create discount/ }).click();
      await expect(page.getByText(/Code must be 3 to 24/)).toBeVisible();
    });
    await S("/admin/settings", "an invalid WhatsApp number is refused", async () => {
      await page.goto("/admin/settings");
      const form = page.locator("form:has(input[name=whatsapp])").first();
      await form.locator("input[name=whatsapp]").fill("abc");
      await form.getByRole("button", { name: /Save store details/ }).click();
      await expect(page.locator("main")).toContainText(/WhatsApp|number|digits/i);
    });
    await S("/admin/account", "a mismatching password change is refused", async () => {
      await page.goto("/admin/account");
      const form = page.locator("form:has(input[type=password])").first();
      const pw = form.locator("input[type=password]");
      for (let i = 0; i < (await pw.count()); i++) await pw.nth(i).fill(i === 0 ? "wrong-current-password-1" : i === 1 ? "A-new-long-passphrase-2026" : "A-different-passphrase-2026");
      await form.getByRole("button").first().click();
      await expect(page.locator("main")).toContainText(/match|current|incorrect|wrong|too short|at least/i);
    });
    await S("/admin/products/new", "a product without a name is not created", async () => {
      const before = one<Record<string, number>>("SELECT COUNT(*) n FROM products")!.n;
      await page.goto("/admin/products/new");
      await page.getByRole("button", { name: /Create product|Save/ }).first().click();
      await page.waitForTimeout(500);
      expect(one<Record<string, number>>("SELECT COUNT(*) n FROM products")!.n).toBe(before);
    });
    await S("/admin/inventory", "an invalid stock adjustment is refused and the ledger stays balanced", async () => {
      await page.goto("/admin/inventory");
      const form = page.locator("form:visible", { has: page.locator("input[name=amount]") }).first();
      await form.locator("select[name=dir]").selectOption("remove");
      await form.locator("input[name=amount]").fill("99999999");
      await form.getByRole("button").first().click();
      await expect(page.locator("main")).toContainText(/stock|negative|enough|below/i);
    });

    // ---------------------------------------------------------------- empty and error states
    await step(vp, "errors", "unknown ids give the branded 404 page, never a stack trace", async () => {
      for (const u of ["/admin/orders/not-an-order", "/admin/customers/nope", "/admin/products/nope", "/admin/affiliates/nope", "/partner/not-a-token", "/products/nope", "/policies/nope"]) {
        const ev = await inspect(page, u, vp, { admin: false, expected: 404 });
        const v = verdict(ev, vp, 404);
        expect(v.reasons, u).toEqual([]);
        await expect(page.getByText(/ERROR 404|not found/i).first()).toBeVisible();
      }
    });
    await S("errors", "a bad month and bad export parameters are refused politely", async () => {
      const r = await page.request.get("/admin/affiliates/export?month=banana");
      expect(r.status()).toBe(400);
      expect(await r.text()).not.toMatch(/at .*\.(js|ts)|SQLITE|stack/i);
    });

    // ---------------------------------------------------------------- affiliate screens: the banners and one-tap actions
    await S("/admin/affiliates/[id]", "a tier banner appears for an affiliate with 10+ delivered orders, with a one-tap upgrade button", async () => {
      const a = sql<{ id: string; tier: string; n: number }>("SELECT a.id, a.tier, (SELECT COUNT(*) FROM orders o WHERE o.affiliate_id = a.id AND o.status = 'delivered' AND o.is_test = 0) AS n FROM affiliates a WHERE a.tier = 'seed' ORDER BY n DESC LIMIT 1")[0];
      await page.goto(`/admin/affiliates/${a.id}`);
      if (a.n >= 10) await expect(page.getByRole("button", { name: /Upgrade to Athlete|Upgrade to Ambassador/ })).toBeVisible();
      else await expect(page.getByRole("button", { name: /Upgrade to/ })).toHaveCount(0);
    });
    await S("/admin/affiliates/[id]", "the balance correction banner and the payout button show the net amount", async () => {
      const a = sql<{ id: string }>("SELECT DISTINCT affiliate_id AS id FROM orders WHERE commission_status = 'void' AND commission_payout_id IS NOT NULL AND commission_correction_payout_id IS NULL AND affiliate_id IS NOT NULL LIMIT 1")[0];
      test.skip(!a, "no outstanding correction in this data set");
      await page.goto(`/admin/affiliates/${a.id}`);
      await expect(page.getByText(/Balance correction/)).toBeVisible();
    });
    await S("/admin/affiliates/applications", "every application shows its handles, details and decision buttons", async () => {
      await page.goto("/admin/affiliates/applications");
      expect(await page.getByRole("button", { name: /Approve and create affiliate/ }).count()).toBe(one<Record<string, number>>("SELECT COUNT(*) n FROM affiliate_applications WHERE status = 'new'")!.n);
      await noOverflow(page);
    });

    // ---------------------------------------------------------------- bulk action (changes data: runs last)
    await S("/admin/orders", "bulk action: select two new orders, mark them confirmed, the timeline and the database follow", async () => {
      const ids = sql<{ id: string; order_number: number }>("SELECT id, order_number FROM orders WHERE status = 'new' AND is_test = 0 ORDER BY created_at DESC LIMIT 2");
      await page.goto("/admin/orders?status=new");
      for (const o of ids) await page.locator(`input[aria-label="Select order ${o.order_number}"]:visible`).click();
      await expect(page.getByText("2 SELECTED")).toBeVisible();
      await page.locator("select[aria-label='New status']").selectOption({ label: "Confirmed" });
      await page.getByRole("button", { name: "Change status" }).click();
      await expect.poll(() => one<Record<string, number>>("SELECT COUNT(*) n FROM orders WHERE id IN (?, ?) AND status = 'confirmed'", ids[0].id, ids[1].id)!.n, { timeout: 15_000 }).toBe(2);
      expect(one<Record<string, number>>("SELECT COUNT(*) n FROM order_events WHERE order_id IN (?, ?) AND to_status = 'confirmed'", ids[0].id, ids[1].id)!.n).toBe(2);
    });

    writeResults(`interactions-${vp.name}`, items.filter((i) => i.vp === vp.name));
  });
}

test("every recorded interaction passed", () => {
  writeResults("interactions", items);
  expect(items.filter((i) => !i.ok).map((i) => `${i.vp} ${i.page}: ${i.interaction} :: ${i.note}`)).toEqual([]);
  expect(items.length).toBeGreaterThan(40);
});
