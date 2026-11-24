import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { getEngine } from "../../lib/db/core";
import { createAffiliate, createApplication } from "@/lib/affiliates";
import { placeOrder, setOrderStatus } from "@/lib/orders";
import { CartProvider } from "@/components/CartProvider";
import { applyAction } from "@/app/actions/ambassadors";
import { approveApplicationAction, recordPayoutAction, rejectApplicationAction, saveAffiliate, suggestCode, upgradeTierAction } from "@/app/admin/(app)/affiliates/actions";
import { h, ID, resetState } from "../support/state";
import { seedStore } from "../support/seed";

let S: Awaited<ReturnType<typeof seedStore>>;
const sql = () => getEngine().sqlite;
const sp = (o: Record<string, string> = {}) => Promise.resolve(o);
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
const owner = () => (h.user = { id: ID.owner, email: "owner@t.test" });
const html = async (load: () => Promise<any>, props: any = {}) => renderToStaticMarkup(createElement(CartProvider, { products: [], zones: [] } as never, await (await load()).default({ searchParams: sp(), ...props })));

beforeEach(async () => {
  resetState();
  S = await seedStore();
  owner();
});

describe("admin affiliate actions", () => {
  it("create validates on the server, refuses duplicate codes, and redirects to the new affiliate", async () => {
    const good = { name: "Rami Khoury", code: "rami10", instagram_handle: "@rami", commission_percent: "15", customer_discount_percent: "10" };
    await expect(saveAffiliate(null, form(good))).rejects.toThrow(/NEXT_REDIRECT:\/admin\/affiliates\//);
    expect(sql().prepare("SELECT code FROM affiliates").all()).toEqual([{ code: "RAMI10" }]);
    expect(await saveAffiliate(null, form({ ...good, code: "Rami10" }))).toMatchObject({ error: expect.stringMatching(/already used/) });
    expect(await saveAffiliate(null, form({ ...good, code: "x y" }))).toMatchObject({ error: expect.stringMatching(/3 to 20/) });
    expect(await saveAffiliate(null, form({ ...good, code: "OTHER1", commission_percent: "400" }))).toMatchObject({ error: expect.stringMatching(/between 0 and 100/) });
    expect(sql().prepare("SELECT COUNT(*) n FROM affiliates").get()).toEqual({ n: 1 });
    expect(sql().prepare("SELECT 1 FROM audit_log WHERE action = 'affiliate_create'").all()).toHaveLength(1);
  });

  it("two admins editing at once: the stale save is refused", async () => {
    const a = createAffiliate({ name: "Rami", code: "RAMI10" });
    const base = { id: a.id, version: String(a.version), name: "Rami", code: "RAMI10", commission_percent: "15", customer_discount_percent: "10", tier: "seed", status: "active" };
    expect(await saveAffiliate(null, form({ ...base, name: "First" }))).toMatchObject({ ok: "Saved." });
    expect(await saveAffiliate(null, form({ ...base, name: "Second" }))).toMatchObject({ error: expect.stringMatching(/Someone else changed/) });
    expect(sql().prepare("SELECT name FROM affiliates").get()).toEqual({ name: "First" });
  });

  it("generates a random free code from the name", async () => {
    expect(await suggestCode(null, form({ name: "Nour Haddad" }))).toMatchObject({ code: expect.stringMatching(/^NOUR\d{2}$/) });
    expect(await suggestCode(null, form({ name: "" }))).toMatchObject({ error: expect.any(String) });
  });

  it("payout and tier upgrade actions", async () => {
    const a = createAffiliate({ name: "Rami", code: "RAMI10", phone: "03 999 888" });
    expect(await recordPayoutAction(null, form({ id: a.id }))).toMatchObject({ error: expect.stringMatching(/Nothing approved/) });
    expect(await upgradeTierAction(null, form({ id: a.id, to: "athlete" }))).toMatchObject({ error: expect.stringMatching(/not reached/) });
    expect(await upgradeTierAction(null, form({ id: a.id, to: "legend" }))).toMatchObject({ error: "Unknown tier." });
    const { order } = placeOrder({ customer: { name: "Cara", phone: "03 111 222", address: "Hamra, Bldg 5" }, items: [{ productId: S.red.id, qty: 1 }], region: "Beirut", source: "web", actor: "c", code: "rami10" });
    for (const s of ["confirmed", "delivered"] as const) await setOrderStatus(order.id, s, "t");
    sql().prepare("UPDATE orders SET delivered_at = ? WHERE id = ?").run(new Date(Date.now() - 15 * 86_400_000).toISOString(), order.id);
    const done = await recordPayoutAction(null, form({ id: a.id, method: "Whish", note: "first" }));
    expect(done).toMatchObject({ ok: "Payout of $4.05 recorded for 1 order." });
    expect(sql().prepare("SELECT 1 FROM audit_log WHERE action = 'affiliate_payout'").all()).toHaveLength(1);
  });

  it("applications: approve creates an affiliate once, reject closes it", async () => {
    const id = createApplication({ name: "Hadi Saad", instagram_handle: "hadi.fit" });
    expect(await approveApplicationAction(null, form({ id }))).toMatchObject({ ok: expect.stringMatching(/Code HADI\d\d created/) });
    expect(await approveApplicationAction(null, form({ id }))).toMatchObject({ error: expect.stringMatching(/already approved/) });
    const id2 = createApplication({ name: "Zed Zed", instagram_handle: "zed" });
    expect(await rejectApplicationAction(null, form({ id: id2 }))).toMatchObject({ ok: "Application rejected." });
    expect(await rejectApplicationAction(null, form({ id: "nope" }))).toMatchObject({ error: expect.any(String) });
  });
});

describe("admin pages, roles and export", () => {
  const PAGES: [string, () => Promise<any>][] = [
    ["overview", () => import("@/app/admin/(app)/affiliates/page")],
    ["list", () => import("@/app/admin/(app)/affiliates/list/page")],
    ["payouts", () => import("@/app/admin/(app)/affiliates/payouts/page")],
    ["new", () => import("@/app/admin/(app)/affiliates/new/page")],
    ["applications", () => import("@/app/admin/(app)/affiliates/applications/page")],
  ];

  it("render empty and with data, with no junk values", async () => {
    for (const [name, load] of PAGES) expect(await html(load), name).not.toMatch(/NaN|undefined|\[object Object\]|Invalid Date/);
    const a = createAffiliate({ name: "Rami Khoury", code: "RAMI10", instagram_handle: "rami.runs" });
    createApplication({ name: "Hadi Saad", instagram_handle: "hadi.fit", message: "hello" });
    placeOrder({ customer: { name: "Cara", phone: "03 111 222", address: "Hamra, Bldg 5" }, items: [{ productId: S.red.id, qty: 2 }], region: "Beirut", source: "web", actor: "c", code: "RAMI10" });
    const overview = await html(PAGES[0][1]);
    expect(overview).toContain("1 new application");
    expect(overview).toContain("Top 5 this month");
    for (const card of ["Affiliate sales", "Commission pending", "Commission approved", "Commission paid"]) expect(overview, card).toContain(card);
    expect(overview).toContain("RAMI10"); // the order was placed this month
    const list = await html(PAGES[1][1]);
    expect(list).toContain("RAMI10");
    expect(list).toContain("@rami.runs");
    expect(list).toContain("Commission owed");
    expect(list).toContain("Add affiliate");
    expect(list).toContain("Applications"); // the section tabs, with the badge for the new application
    expect(list).toMatch(/aria-label="1 new"/);
    const detail = await html(() => import("@/app/admin/(app)/affiliates/[id]/page"), { params: Promise.resolve({ id: a.id }) });
    expect(detail).toContain("Record payout");
    expect(detail).toContain(`/partner/${a.private_token}`);
    expect(detail).toContain("/?ref=RAMI10"); // the personal link
    expect(detail).toContain("Copy code");
    expect(detail).not.toMatch(/NaN|undefined|\[object Object\]/);
    await expect(html(() => import("@/app/admin/(app)/affiliates/[id]/page"), { params: Promise.resolve({ id: "missing" }) })).rejects.toThrow("HTTP_404");
    expect(await html(PAGES[4][1])).toContain("Hadi Saad");
  });

  it("staff can't open any of it, and every action refuses staff", async () => {
    h.user = { id: ID.staff, email: "staff@t.test" };
    for (const [name, load] of PAGES) await expect(html(load), name).rejects.toThrow("HTTP_403");
    await expect(saveAffiliate(null, form({ name: "X Y", code: "XYZ" }))).rejects.toThrow("HTTP_403");
    await expect(recordPayoutAction(null, form({ id: "x" }))).rejects.toThrow("HTTP_403");
    h.user = null;
    await expect(saveAffiliate(null, form({ name: "X Y", code: "XYZ" }))).rejects.toThrow("HTTP_401");
  });

  it("the monthly CSV: 401 without a session, 403 for staff, correct rows for the owner and the month", async () => {
    const { GET } = await import("@/app/admin/(app)/affiliates/export/route");
    createAffiliate({ name: "Rami Khoury", code: "RAMI10" });
    placeOrder({ customer: { name: "Cara", phone: "03 111 222", address: "Hamra, Bldg 5" }, items: [{ productId: S.red.id, qty: 2 }], region: "Beirut", source: "web", actor: "c", code: "RAMI10" });
    const month = new Date().toISOString().slice(0, 7);
    h.user = null;
    expect((await GET(new Request(`http://x/e?month=${month}`))).status).toBe(401);
    h.user = { id: ID.staff, email: "staff@t.test" };
    expect((await GET(new Request(`http://x/e?month=${month}`))).status).toBe(403);
    owner();
    const res = await GET(new Request(`http://x/e?month=${month}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain(`affiliates-${month}.csv`);
    const csv = await res.text();
    expect(csv).toContain("commission_status");
    expect(csv).toContain('"RAMI10","60.00","6.00","54.00","8.10","pending"');
    expect((await (await GET(new Request("http://x/e?month=2001-01"))).text()).trim().split("\n")).toHaveLength(1); // header only
    expect((await GET(new Request("http://x/e?month=garbage"))).status).toBe(400);
  });
});

describe("public pages and the application form", () => {
  it("the private stats page works only for the right token and never shows customer data", async () => {
    const a = createAffiliate({ name: "Rami Khoury", code: "RAMI10" });
    placeOrder({ customer: { name: "Secret Customer", phone: "03 777 666", address: "Private Street 9" }, items: [{ productId: S.red.id, qty: 1 }], region: "Beirut", source: "web", actor: "c", code: "RAMI10" });
    h.user = null; // no admin session needed
    const page = () => import("@/app/(store)/partner/[token]/page");
    const out = await html(page, { params: Promise.resolve({ token: a.private_token }) });
    expect(out).toContain("RAMI10");
    expect(out).toContain("$27.00");
    expect(out).toContain("$4.05");
    for (const secret of ["Secret Customer", "777", "Private Street", "03 777 666", a.id]) expect(out).not.toContain(secret);
    for (const bad of ["x".repeat(32), "short", a.code, "../admin"]) await expect(html(page, { params: Promise.resolve({ token: bad }) }), bad).rejects.toThrow("HTTP_404");
    const meta = (await page()).metadata;
    expect(meta.robots).toMatchObject({ index: false });
  });

  const good = () => form({ name: "Hadi Saad", instagram_handle: "@hadi.fit", followers: "12k", city: "Jounieh", sport: "Running", started: String(Date.now() - 10_000), website: "" });

  it("saves a valid application", async () => {
    h.user = null;
    expect(await applyAction(null, good())).toEqual({ ok: true });
    expect(sql().prepare("SELECT name, instagram_handle, status FROM affiliate_applications").all()).toEqual([{ name: "Hadi Saad", instagram_handle: "hadi.fit", status: "new" }]);
  });

  it("spam protection: honeypot, instant posts, duplicates, rate limit; and clear validation messages", async () => {
    h.user = null;
    const bot = good();
    bot.set("website", "http://spam.example");
    expect(await applyAction(null, bot)).toEqual({ ok: true });
    expect(sql().prepare("SELECT COUNT(*) n FROM affiliate_applications").get()).toEqual({ n: 0 }); // pretended, stored nothing
    const fast = good();
    fast.set("started", String(Date.now()));
    expect(await applyAction(null, fast)).toMatchObject({ ok: false, error: expect.stringMatching(/quick/) });
    const noTime = good();
    noTime.delete("started");
    expect(await applyAction(null, noTime)).toMatchObject({ ok: false });
    expect(await applyAction(null, form({ name: "A", instagram_handle: "x", started: String(Date.now() - 9000) }))).toMatchObject({ ok: false, error: expect.stringMatching(/name/) });
    expect(await applyAction(null, form({ name: "Hadi", started: String(Date.now() - 9000) }))).toMatchObject({ ok: false, error: expect.stringMatching(/Instagram or TikTok/) });
    sql().prepare("DELETE FROM rate_limits").run(); // the attempts above all counted against the limit, as they should
    expect(await applyAction(null, good())).toEqual({ ok: true });
    expect(await applyAction(null, good())).toMatchObject({ ok: false, error: expect.stringMatching(/already have your application/) });
    expect(sql().prepare("SELECT COUNT(*) n FROM affiliate_applications").get()).toEqual({ n: 1 });
    let blocked = 0;
    for (let i = 0; i < 6; i++) {
      const fd = good();
      fd.set("instagram_handle", `person${i}`);
      const r = await applyAction(null, fd);
      if (!r.ok && /Too many/.test(r.error)) blocked++;
    }
    expect(blocked).toBeGreaterThan(0); // 3 per hour per connection
  });

  it("the ambassadors page renders with the form, the program and the levels", async () => {
    h.user = null;
    const out = await html(() => import("@/app/(store)/ambassadors/page"));
    expect(out).toContain("Train with");
    expect(out).toContain("SEND APPLICATION");
    expect(out).toContain("Athlete");
    expect(out).not.toMatch(/health|cure|immune|medical/i);
  });
});
