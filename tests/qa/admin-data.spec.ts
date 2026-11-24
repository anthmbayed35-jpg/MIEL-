import { expect, test, type Page } from "@playwright/test";
import { zonedMidnight, zonedParts } from "../../lib/time";
import { cents, newContext, one, signIn, sql, VIEWPORTS, writeResults } from "./qa-lib";

/**
 * "The data shown matches the database exactly": every number below is read from the SCREEN and compared with an independent SQL
 * query on the database file. Nothing here changes data.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

type Check = { page: string; what: string; screen: unknown; sql: unknown; ok: boolean };
const checks: Check[] = [];
const eq = (pageName: string, what: string, screen: unknown, db: unknown) => {
  const ok = JSON.stringify(screen) === JSON.stringify(db);
  checks.push({ page: pageName, what, screen, sql: db, ok });
  return ok;
};

const desktop = VIEWPORTS[0];
let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await (await newContext(browser, desktop)).newPage();
  await signIn(page);
});
test.afterAll(() => writeResults("data", checks));

const text = (p: Page, sel: string) => p.locator(sel).first().innerText();
async function card(p: Page, section: string, label: string): Promise<string> {
  const c = p.locator(`section[aria-label="${section}"] > div`).filter({ has: p.locator(".a-label", { hasText: new RegExp(`^${label}$`, "i") }) });
  const t = (await c.first().innerText()).split("\n").map((s) => s.trim()).filter(Boolean);
  return t.find((x, i) => i > 0 && /\$|\d/.test(x)) ?? "";
}
const n = (v: unknown) => Number(Object.values(v as object)[0] ?? 0);

test("list totals: orders, customers, products, inventory, discounts", async () => {
  await page.goto("/admin/orders");
  eq("/admin/orders", "orders count", Number((await text(page, "main")).match(/(\d[\d,]*) orders?/i)?.[1].replace(/,/g, "")), n(one("SELECT COUNT(*) FROM orders WHERE status <> 'draft'")));
  const firstRowText = await page.locator("table tbody tr").first().innerText();
  const firstRow = firstRowText.replace(/\s+/g, " ");
  // columns: Order, Date, Customer, Region, Affiliate, Total, Payment, Status (the Affiliate cell also holds dollar amounts, so read the Total cell itself)
  const totalCell = firstRowText.split("\t")[5] ?? "";
  const latest = one<{ order_number: number; total_cents: number }>("SELECT order_number, total_cents FROM orders WHERE status <> 'draft' ORDER BY created_at DESC LIMIT 1")!;
  eq("/admin/orders", "newest order number is first", Number(firstRow.match(/#(\d+)/)?.[1]), latest.order_number);
  eq("/admin/orders", "newest order total", cents(totalCell), latest.total_cents);

  await page.goto("/admin/customers");
  const cust = (await text(page, "main")).match(/PAGE 1 \/ (\d+) · (\d[\d,]*) customers?/i);
  eq("/admin/customers", "customer count", Number(cust?.[2].replace(/,/g, "")), n(one("SELECT COUNT(*) FROM customers")));
  eq("/admin/customers", "page count (50 per page)", Number(cust?.[1]), Math.ceil(n(one("SELECT COUNT(*) FROM customers")) / 50));

  await page.goto("/admin/products");
  const prod = (await text(page, "main")).match(/PAGE 1 \/ \d+ · (\d+) products?/i);
  eq("/admin/products", "product count", Number(prod?.[1]), n(one("SELECT COUNT(*) FROM products")));

  await page.goto("/admin/inventory");
  const inv = (await text(page, "main")).match(/PAGE 1 \/ \d+ · (\d+) items?/i);
  eq("/admin/inventory", "inventory item count", Number(inv?.[1]), n(one("SELECT COUNT(*) FROM inventory_items")));

  await page.goto("/admin/marketing/discounts");
  const disc = (await text(page, "main")).match(/PAGE 1 \/ \d+ · (\d+) codes?/i);
  eq("/admin/marketing/discounts", "discount count", Number(disc?.[1]), n(one("SELECT COUNT(*) FROM discounts")));
  expect(checks.filter((c) => !c.ok)).toEqual([]);
});

test("dashboard: today's sales and the 30-day figures, in the store's time zone", async () => {
  await page.goto("/admin");
  const body = (await text(page, "main")).replace(/\n+/g, " | ");
  const sod = zonedMidnight(zonedParts(Date.now()).y, zonedParts(Date.now()).m, zonedParts(Date.now()).d).toISOString();
  const sale = "is_test = 0 AND status NOT IN ('draft','cancelled','returned')";
  const today = one<{ s: number; c: number }>(`SELECT COALESCE(SUM(total_cents),0) s, COUNT(*) c FROM orders WHERE ${sale} AND created_at >= ?`, sod)!;
  const todayText = body.match(/TODAY'S SALES \| [^|]*\| (\$[\d,]+\.\d\d) \| (\d+) ORDERS?/);
  eq("/admin", "today's sales", cents(todayText?.[1] ?? ""), today.s);
  eq("/admin", "today's orders", Number(todayText?.[2]), today.c);
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const month = one<{ s: number; c: number }>(`SELECT COALESCE(SUM(total_cents),0) s, COUNT(*) c FROM orders WHERE ${sale} AND created_at >= ?`, since)!;
  eq("/admin", "30-day revenue", cents(body.match(/Revenue \| (\$[\d,]+\.\d\d)/)?.[1] ?? ""), month.s);
  eq("/admin", "30-day orders", Number(body.match(/\| Orders \| (\d+)/)?.[1]), month.c);
  eq("/admin", "new applications banner", Number(body.match(/^(\d+) new ambassador application/)?.[1] ?? 0), n(one("SELECT COUNT(*) FROM affiliate_applications WHERE status = 'new'")));
  expect(checks.filter((c) => !c.ok)).toEqual([]);
});

const VALID = "o.status NOT IN ('cancelled','returned','draft') AND o.is_test = 0";
function affiliateSql(id: string) {
  return one<Record<string, number>>(
    `SELECT COUNT(CASE WHEN ${VALID} THEN 1 END) AS orders,
            COALESCE(SUM(CASE WHEN ${VALID} THEN o.subtotal_cents - o.discount_amount_cents END),0) AS sales,
            COALESCE(SUM(CASE WHEN o.commission_status='pending' THEN o.commission_amount_cents END),0) AS pending,
            COALESCE(SUM(CASE WHEN o.commission_status='approved' THEN o.commission_amount_cents END),0) AS approved,
            COALESCE(SUM(CASE WHEN o.commission_status='paid' THEN o.commission_amount_cents END),0) AS paid,
            COALESCE(SUM(CASE WHEN o.commission_status='void' AND o.commission_payout_id IS NOT NULL AND o.commission_correction_payout_id IS NULL THEN o.commission_amount_cents END),0) AS corrections
     FROM orders o WHERE o.affiliate_id = ?`,
    id,
  )!;
}

test("affiliates list, overview cards and top five match SQL to the cent", async () => {
  await page.goto("/admin/affiliates/list");
  const rows = await page.locator("table tbody tr").allInnerTexts();
  expect(rows).toHaveLength(20);
  let sumSales = 0, sumOwed = 0, sumPending = 0, sumApproved = 0, sumCorr = 0;
  for (const r of rows) {
    // columns: Affiliate, Instagram, Code, Tier, Orders, Sales, Commission owed, Status
    const cells = r.split("\t").map((c) => c.replace(/\s+/g, " ").trim());
    const code = cells[2];
    const a = one<{ id: string; instagram_handle: string }>("SELECT id, instagram_handle FROM affiliates WHERE code = ?", code)!;
    const s = affiliateSql(a.id);
    eq("/admin/affiliates/list", `${code} instagram`, cells[1], `@${a.instagram_handle}`);
    eq("/admin/affiliates/list", `${code} orders`, Number(cells[4]), s.orders);
    eq("/admin/affiliates/list", `${code} sales`, cents(cells[5]), s.sales);
    eq("/admin/affiliates/list", `${code} commission owed (pending + approved)`, cents(cells[6]), s.pending + s.approved);
    sumSales += cents(cells[5]); sumOwed += cents(cells[6]); sumPending += s.pending; sumApproved += s.approved; sumCorr += s.corrections;
  }
  await page.goto("/admin/affiliates");
  const ov = (l: string) => card(page, "Overview", l);
  eq("/admin/affiliates", "overview: affiliate sales", cents(await ov("Affiliate sales")), sumSales);
  eq("/admin/affiliates", "overview: commission pending", cents(await ov("Commission pending")), sumPending);
  eq("/admin/affiliates", "overview: commission approved", cents(await ov("Commission approved")), sumApproved);
  eq("/admin/affiliates", "overview: pending + approved = the list's commission owed", sumPending + sumApproved, sumOwed);
  eq("/admin/affiliates", "overview: corrections owed back", cents(await ov("Corrections owed back")), sumCorr);
  eq("/admin/affiliates", "overview: active affiliates", Number(await ov("Active affiliates")), n(one("SELECT COUNT(*) FROM affiliates WHERE status = 'active'")));
  // the same totals straight from SQL, independent of the rows above
  const t = one<Record<string, number>>(`SELECT COALESCE(SUM(CASE WHEN ${VALID} THEN o.subtotal_cents - o.discount_amount_cents END),0) AS sales, COALESCE(SUM(CASE WHEN o.commission_status='paid' THEN o.commission_amount_cents END),0) AS paid FROM orders o WHERE o.affiliate_id IS NOT NULL`)!;
  eq("/admin/affiliates", "sum of the list rows = SQL total sales", sumSales, t.sales);
  eq("/admin/affiliates", "overview: commission paid = SQL", cents(await ov("Commission paid")), t.paid);
  // top five THIS MONTH (Beirut): the seed spreads orders over 13 months, so this is a different set from "all time"
  const { monthRange } = await import("../../lib/time");
  const ym = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" }).slice(0, 7);
  const { from, to } = monthRange(ym);
  const topSql = sql<{ code: string; sales: number; orders: number }>(`SELECT a.code, SUM(o.subtotal_cents - o.discount_amount_cents) AS sales, COUNT(*) AS orders FROM affiliates a JOIN orders o ON o.affiliate_id = a.id AND ${VALID} AND o.created_at >= ? AND o.created_at < ? GROUP BY a.id ORDER BY sales DESC, a.name LIMIT 5`, from.toISOString(), to.toISOString());
  const top = (await page.locator("ol li").allInnerTexts()).slice(0, topSql.length).map((s) => s.replace(/\s+/g, " "));
  eq("/admin/affiliates", "top five this month (code, sales, orders)", top.map((s) => [s.match(/QAAFF\d\d/)?.[0], cents(s.match(/\$[\d,]+\.\d\d/)?.[0] ?? ""), Number(s.match(/(\d+) orders/)?.[1])]), topSql.map((r) => [r.code, r.sales, r.orders]));
  expect(checks.filter((c) => !c.ok)).toEqual([]);
});

test("payouts page: every payout and the month CSV match SQL", async () => {
  await page.goto("/admin/affiliates/payouts");
  const rows = await page.locator("table tbody tr").allInnerTexts();
  const payouts = sql<{ amount_cents: number; corrections_cents: number }>("SELECT amount_cents, corrections_cents FROM affiliate_payouts ORDER BY paid_at DESC, rowid DESC LIMIT 300");
  eq("/admin/affiliates/payouts", "payout rows", rows.length, payouts.length);
  // columns: Date, Affiliate, Amount, Of which corrections, Method, Note
  eq("/admin/affiliates/payouts", "sum of the amounts", rows.reduce((sum, r) => sum + cents(r.split("\t")[2] ?? ""), 0), payouts.reduce((sum, p) => sum + p.amount_cents, 0));
  const { monthRange } = await import("../../lib/time");
  const months = sql<{ m: string }>("SELECT DISTINCT substr(paid_at,1,7) m FROM affiliate_payouts ORDER BY m DESC LIMIT 3").map((r) => r.m);
  for (const m of months) {
    const { from, to } = monthRange(m);
    const want = sql<{ amount_cents: number }>("SELECT amount_cents FROM affiliate_payouts WHERE paid_at >= ? AND paid_at < ?", from.toISOString(), to.toISOString());
    const res = await page.request.get(`/admin/affiliates/payouts/export?month=${m}`);
    expect(res.status()).toBe(200);
    const lines = (await res.text()).replace(/^\uFEFF/, "").trim().split("\n");
    eq(`/admin/affiliates/payouts/export ${m}`, "rows", lines.length - 1, want.length);
    eq(`/admin/affiliates/payouts/export ${m}`, "paid total", lines.slice(1).reduce((sum, l) => sum + cents(l.split('","')[7] ?? ""), 0), want.reduce((sum, p) => sum + p.amount_cents, 0));
  }
  expect(checks.filter((c) => !c.ok)).toEqual([]);
});

test("every affiliate's page (all 20) matches SQL, and so does their private partner page", async ({ browser }) => {
  const affs = sql<{ id: string; code: string; token: string }>("SELECT id, code, private_token AS token FROM affiliates ORDER BY code");
  const anon = await (await newContext(browser, desktop)).newPage();
  for (const a of affs) {
    await page.goto(`/admin/affiliates/${a.id}`);
    const s = affiliateSql(a.id);
    const c = (l: string) => card(page, "Totals", l);
    eq(`/admin/affiliates/${a.code}`, "orders", Number(await c("Orders")), s.orders);
    eq(`/admin/affiliates/${a.code}`, "sales", cents(await c("Sales")), s.sales);
    eq(`/admin/affiliates/${a.code}`, "pending", cents(await c("Pending")), s.pending);
    eq(`/admin/affiliates/${a.code}`, "owed now (approved)", cents(await c("Owed now")), s.approved);
    eq(`/admin/affiliates/${a.code}`, "paid", cents(await c("Paid")), s.paid);
    // the order table lists exactly the valid and the voided orders of this affiliate (max 100 shown)
    const listed = await page.locator("table").nth(0).locator("tbody tr").count();
    eq(`/admin/affiliates/${a.code}`, "orders listed", listed, Math.min(100, n(one("SELECT COUNT(*) FROM orders WHERE affiliate_id = ? AND status <> 'draft' AND is_test = 0", a.id))));
    // payout history reconciles: net paid = gross - corrections, and the sum equals the payouts table
    const payouts = sql<{ amount_cents: number; gross_cents: number; corrections_cents: number }>("SELECT amount_cents, gross_cents, corrections_cents FROM affiliate_payouts WHERE affiliate_id = ?", a.id);
    eq(`/admin/affiliates/${a.code}`, "payout rows are net = gross - corrections", payouts.every((p) => p.amount_cents === p.gross_cents - p.corrections_cents), true);
    const payRows = await page.locator("table").nth(1).locator("tbody tr").allInnerTexts();
    eq(`/admin/affiliates/${a.code}`, "payout history rows", payouts.length ? payRows.length : 0, payouts.length);
    eq(`/admin/affiliates/${a.code}`, "payout history: total paid", payRows.reduce((sum, r) => sum + cents(r.split("	")[3] ?? ""), 0), payouts.reduce((sum, p) => sum + p.amount_cents, 0));
    eq(`/admin/affiliates/${a.code}`, "payout history: corrections", payRows.reduce((sum, r) => sum + ((r.split("	")[2] ?? "").includes("$") ? cents((r.split("	")[2] ?? "").replace("−", "")) : 0), 0), payouts.reduce((sum, p) => sum + p.corrections_cents, 0));
    // books: paid out = ever paid - corrections settled
    const books = one<Record<string, number>>(
      `SELECT COALESCE((SELECT SUM(amount_cents) FROM affiliate_payouts WHERE affiliate_id = ?),0) AS out,
              COALESCE((SELECT SUM(commission_amount_cents) FROM orders WHERE affiliate_id = ? AND commission_payout_id IS NOT NULL),0)
            - COALESCE((SELECT SUM(commission_amount_cents) FROM orders WHERE affiliate_id = ? AND commission_correction_payout_id IS NOT NULL),0) AS expected`,
      a.id, a.id, a.id,
    )!;
    eq(`/admin/affiliates/${a.code}`, "books balance (paid out = commissions paid - corrections deducted)", books.out, books.expected);

    // the affiliate's own page shows the same numbers, and ONLY theirs
    await anon.goto(`/partner/${a.token}`);
    const body = (await anon.locator("main").innerText()).replace(/\n+/g, " | ");
    const p = (l: string) => cents(body.match(new RegExp(`${l} \\| (-?\\$?[\\d,]+\\.\\d\\d)`))?.[1] ?? "");
    eq(`/partner/${a.code}`, "orders", Number(body.match(/ORDERS \| (\d+)/)?.[1]), s.orders);
    eq(`/partner/${a.code}`, "sales", p("SALES"), s.sales);
    eq(`/partner/${a.code}`, "pending", p("PENDING"), s.pending);
    eq(`/partner/${a.code}`, "approved", p("APPROVED"), s.approved);
    eq(`/partner/${a.code}`, "paid", p("PAID OUT"), s.paid);
    for (const other of affs.filter((o) => o.id !== a.id)) {
      expect(body, `${a.code} page shows ${other.code}`).not.toContain(other.code);
      expect(body).not.toContain(other.token);
    }
  }
  expect(checks.filter((c) => !c.ok)).toEqual([]);
});

test("the monthly CSV: rows, totals and month boundaries (Asia/Beirut) match SQL", async () => {
  const months = sql<{ m: string }>("SELECT DISTINCT substr(created_at,1,7) m FROM orders WHERE affiliate_id IS NOT NULL ORDER BY m DESC LIMIT 4").map((r) => r.m);
  const { monthRange } = await import("../../lib/time");
  for (const m of months) {
    const res = await page.request.get(`/admin/affiliates/export?month=${m}`);
    expect(res.status()).toBe(200);
    const lines = (await res.text()).replace(/^﻿/, "").trim().split("\n");
    const { from, to } = monthRange(m);
    const expected = sql<Record<string, any>>("SELECT order_number, commission_amount_cents c, subtotal_cents - discount_amount_cents AS sale FROM orders WHERE affiliate_id IS NOT NULL AND status <> 'draft' AND is_test = 0 AND created_at >= ? AND created_at < ?", from.toISOString(), to.toISOString());
    eq(`/admin/affiliates/export ${m}`, "rows", lines.length - 1, expected.length);
    const cols = lines.slice(1).map((l) => l.split('","').map((c) => c.replace(/"/g, "")));
    eq(`/admin/affiliates/export ${m}`, "commission total", cols.reduce((s, c) => s + cents(c[9]), 0), expected.reduce((s, r) => s + r.c, 0));
    eq(`/admin/affiliates/export ${m}`, "sale total", cols.reduce((s, c) => s + cents(c[8]), 0), expected.reduce((s, r) => s + r.sale, 0));
    eq(`/admin/affiliates/export ${m}`, "order numbers", cols.map((c) => Number(c[0])).sort(), expected.map((r) => r.order_number).sort());
  }
  expect(checks.filter((c) => !c.ok)).toEqual([]);
});
