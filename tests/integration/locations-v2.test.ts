import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { getEngine } from "../../lib/db/core";
import { placeOrder } from "@/app/actions/checkout";
import { approveUnlistedAction, dismissUnlistedAction, mergeUnlistedAction } from "@/app/admin/(app)/settings/locations/unlisted/actions";
import { GET as indexRoute } from "@/app/api/locations/index/route";
import { listUnlisted, regionsOf, searchIndex, searchIndexVersion, unlistedCount } from "@/lib/locations";
import { buildSearchIndex, searchPlaces } from "@/lib/place-search";
import { h, ID, reqHeaders, resetState } from "../support/state";
import { seedStore } from "../support/seed";
import { checkoutInput, D, deliveryTo } from "../support/checkout";
import { CHECKLIST } from "../../scripts/data/manual-places.mjs";

let S: Awaited<ReturnType<typeof seedStore>>;
const sql = () => getEngine().sqlite;
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
let ip = 1;
beforeEach(async () => {
  resetState();
  S = await seedStore();
  h.user = null;
  reqHeaders["x-forwarded-for"] = `10.9.9.${ip++}`;
});
const idx = () => buildSearchIndex(searchIndex());
const names = (q: string, n = 8) => searchPlaces(idx(), q, n).map((x) => x.en);

describe("the 50-place checklist is complete", () => {
  it("every place is found by typing its name, in its right governorate family", () => {
    const index = idx();
    const missing = (CHECKLIST as string[]).filter((p) => searchPlaces(index, p, 5).length === 0);
    expect(missing).toEqual([]);
  });

  it("known alternative spellings reach the same place", () => {
    const a = (q: string) => searchPlaces(idx(), q, 3)[0]?.id;
    expect(a("Antilias")).toBe(a("Antelias"));
    expect(a("Zahleh")).toBe(a("Zahle"));
    expect(a("Sidon")).toBe(a("Saida"));
    expect(a("Tyre")).toBe(a("Sour"));
    expect(a("Byblos")).toBeTruthy();
  });
});

describe("search matching and ranking (real index)", () => {
  it("prefix matches come first; accents and case do not matter; typos are tolerated", () => {
    expect(names("hamr")[0]).toMatch(/Hamra/i);
    expect(names("HAMRA")[0]).toMatch(/Hamra/i);
    expect(names("zahlé").join("|")).toMatch(/Zahle/);
    expect(names("achrafyeh").join("|")).toMatch(/Achrafi/);
    expect(names("jounyeh").join("|")).toMatch(/Jounieh/);
  });

  it("Arabic works, with or without diacritics", () => {
    expect(names("حمرا").length).toBeGreaterThan(0);
    expect(names("الحمرا").length).toBeGreaterThan(0);
    expect(names("زحلة").join("|")).toMatch(/Zahle/);
    expect(names("صَيدا").join("|")).toMatch(/Saida|Sidon/);
  });

  it("each hit knows its district and governorate (auto-fill data)", () => {
    const [hit] = searchPlaces(idx(), "Jal el Dib", 1);
    expect(hit.districtId).toBe(D.meten);
    expect(hit.governorateId).toBe("LB3");
    expect(hit.label).toMatch(/El Meten/);
  });

  it("nothing for junk, and a query is fast (under 50 ms)", () => {
    expect(searchPlaces(idx(), "qqqqzzzz", 8)).toEqual([]);
    expect(searchPlaces(idx(), "", 8)).toEqual([]);
    const index = idx();
    const t = performance.now();
    for (const q of ["ham", "jbei", "zah", "حم", "antilias", "sin el", "xyzxyz"]) searchPlaces(index, q, 8);
    expect((performance.now() - t) / 7).toBeLessThan(50);
  });
});

describe("the index route", () => {
  it("is versioned, immutable for the current version, and answers 304", async () => {
    const v = searchIndexVersion();
    const get = (q: string, extra: Record<string, string> = {}) => indexRoute(new Request(`http://x/api/locations/index${q}`, { headers: { "x-forwarded-for": reqHeaders["x-forwarded-for"], ...extra } }));
    const ok = await get(`?v=${v}`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toContain("immutable");
    const body = await ok.json();
    expect(body.v).toBe(v);
    expect(body.r.length).toBeGreaterThan(4000);
    expect((await get(`?v=old`)).headers.get("cache-control")).not.toContain("immutable");
    expect((await get(`?v=${v}`, { "if-none-match": `"${v}"` })).status).toBe(304);
  });

  it("an admin edit changes the version", async () => {
    const before = searchIndexVersion();
    sql().prepare("UPDATE locations SET version = version + 1, updated_at = ? WHERE id = ?").run(new Date().toISOString(), deliveryTo(D.beirut).regionId);
    expect(searchIndexVersion()).not.toBe(before);
  });
});

describe("my area is not listed", () => {
  const unlistedOrder = (text: string, over: Record<string, unknown> = {}) => {
    const base = deliveryTo(D.zahle, 0);
    return placeOrder(checkoutInput(S.red.id, { delivery: { ...base, regionId: "", unlistedText: text, ...over } }));
  };

  it("an order with a typed area is placed (never blocked) and queued; the same spelling is counted once with two orders", async () => {
    expect(await unlistedOrder("Hay el Test")).toMatchObject({ ok: true });
    reqHeaders["x-forwarded-for"] = "10.9.8.1";
    expect(await unlistedOrder("hay EL test")).toMatchObject({ ok: true });
    const rows = listUnlisted("pending");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ district_id: D.zahle, orders: 2 });
    expect(unlistedCount()).toBe(1);
    expect(sql().prepare("SELECT region_name, region_id, district_id FROM orders WHERE unlisted_area_id <> '' LIMIT 1").get()).toMatchObject({ region_name: "Hay el Test", region_id: "", district_id: D.zahle });
  });

  it("typing an existing area under another spelling links to that region instead of queueing", async () => {
    const r = sql().prepare("SELECT id, name_en FROM locations WHERE parent_id = ? AND type='region' LIMIT 1").get(D.zahle) as { id: string; name_en: string };
    expect(await unlistedOrder(r.name_en.toUpperCase())).toMatchObject({ ok: true });
    expect(unlistedCount()).toBe(0);
    expect(sql().prepare("SELECT region_id FROM orders ORDER BY created_at DESC LIMIT 1").get()).toEqual({ region_id: r.id });
  });

  it("server validation: bad district, wrong governorate, too short, hidden district are refused", async () => {
    expect(await unlistedOrder("Somewhere", { districtId: "nonsense" })).toMatchObject({ ok: false });
    expect(await unlistedOrder("Somewhere", { governorateId: "LB1" })).toMatchObject({ ok: false });
    expect(await unlistedOrder("ab")).toMatchObject({ ok: false });
    sql().prepare("UPDATE locations SET hidden = 1 WHERE id = ?").run(D.zahle);
    expect(await unlistedOrder("Somewhere")).toMatchObject({ ok: false });
    expect(unlistedCount()).toBe(0);
  });

  it("a region that does not belong to the district is still refused (the listed path is unchanged)", async () => {
    const meten = deliveryTo(D.meten);
    expect(await placeOrder(checkoutInput(S.red.id, { delivery: { ...deliveryTo(D.zahle), regionId: meten.regionId } }))).toMatchObject({ ok: false, field: "region" });
  });
});

describe("admin: approve, merge and dismiss", () => {
  const owner = () => (h.user = { id: ID.owner, email: "owner@t.test" });
  async function queue(text: string, district: string = D.zahle) {
    h.user = null;
    await placeOrder(checkoutInput(S.red.id, { delivery: { ...deliveryTo(district), regionId: "", unlistedText: text } }));
    reqHeaders["x-forwarded-for"] = `10.9.7.${ip++}`;
    return listUnlisted("pending").find((u) => u.text === text)!;
  }

  it("approve: becomes a region customers see at once, orders are linked, it is searchable", async () => {
    const u = await queue("Hay Approved");
    owner();
    expect(await approveUnlistedAction(null, form({ id: u.id, name_en: "Hay Approved", name_ar: "حي" }))).toMatchObject({ ok: expect.any(String) });
    expect(regionsOf(D.zahle).some((r) => r.en === "Hay Approved")).toBe(true);
    expect(names("hay approv")[0]).toBe("Hay Approved");
    const o = sql().prepare("SELECT region_id FROM orders WHERE unlisted_area_id = ?").get(u.id) as { region_id: string };
    expect(o.region_id).toMatch(/\S/);
    expect(unlistedCount()).toBe(0);
    expect(await approveUnlistedAction(null, form({ id: u.id, name_en: "Again" }))).toMatchObject({ error: expect.any(String) }); // already decided
  });

  it("merge: the typed spelling becomes an alias of an existing region (same district only)", async () => {
    const u = await queue("Zahlawi Quarter");
    const target = regionsOf(D.zahle)[3];
    const other = regionsOf(D.meten)[0];
    owner();
    expect(await mergeUnlistedAction(null, form({ id: u.id, region: other.id }))).toMatchObject({ error: expect.any(String) });
    expect(await mergeUnlistedAction(null, form({ id: u.id, region: target.id }))).toMatchObject({ ok: expect.any(String) });
    expect(searchPlaces(idx(), "Zahlawi Quarter", 3)[0]?.id).toBe(target.id);
    expect((sql().prepare("SELECT region_id FROM orders WHERE unlisted_area_id = ?").get(u.id) as { region_id: string }).region_id).toBe(target.id);
  });

  it("dismiss keeps the order text; staff cannot approve; nobody signed in cannot", async () => {
    const u = await queue("Nonsense Place");
    h.user = null;
    await expect(approveUnlistedAction(null, form({ id: u.id, name_en: "X" }))).rejects.toThrow();
    h.user = { id: ID.staff, email: "staff@t.test" };
    const res = await dismissUnlistedAction(null, form({ id: u.id })).catch((e) => ({ error: String(e) }));
    expect(JSON.stringify(res)).toMatch(/error|permission|forbidden|redirect/i);
    owner();
    expect(await dismissUnlistedAction(null, form({ id: u.id }))).toMatchObject({ ok: expect.any(String) });
    expect(sql().prepare("SELECT region_name FROM orders WHERE unlisted_area_id = ?").get(u.id)).toEqual({ region_name: "Nonsense Place" });
  });

  it("the Unlisted page lists what customers typed with its order count", async () => {
    await queue("Hay Visible");
    owner();
    const { default: Page } = await import("@/app/admin/(app)/settings/locations/unlisted/page");
    const html = renderToStaticMarkup(createElement("div", null, await Page()));
    expect(html).toContain("Hay Visible");
    expect(html).toMatch(/1 order/);
  });
});
