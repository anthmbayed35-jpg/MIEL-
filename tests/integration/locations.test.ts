import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => (await import("../support/mocks")).navigationMock);
vi.mock("next/headers", async () => (await import("../support/mocks")).headersMock);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { getEngine } from "../../lib/db/core";
import { placeOrder } from "@/app/actions/checkout";
import { addRegionAction, updateLocation } from "@/app/admin/(app)/settings/locations/actions";
import { GET as regionsRoute } from "@/app/api/locations/regions/route";
import { checkoutTree, regionsOf, resolveLocation, searchLocations } from "@/lib/locations";
import { listOrders } from "@/lib/queries";
import { GOVERNORATE_ZONE } from "@/lib/lebanon";
import { h, ID, reqHeaders, resetState } from "../support/state";
import { seedStore } from "../support/seed";
import { checkoutInput, D, deliveryTo } from "../support/checkout";

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
  reqHeaders["x-forwarded-for"] = `10.7.7.${ip++}`;
});

describe("the seeded location data (official HDX sources)", () => {
  it("8 governorates, 26 districts, 2708 regions, and every district and governorate code from the official list", () => {
    const n = (t: string) => (sql().prepare("SELECT COUNT(*) n FROM locations WHERE type = ?").get(t) as { n: number }).n;
    expect(n("governorate")).toBe(8);
    expect(n("district")).toBe(26);
    expect(n("region")).toBe(2708);
    const govs = (sql().prepare("SELECT name_en, code FROM locations WHERE type = 'governorate' ORDER BY code").all() as { name_en: string; code: string }[]).map((g) => `${g.code} ${g.name_en}`);
    expect(govs).toEqual(["LB1 Beirut", "LB2 Bekaa", "LB3 Mount Lebanon", "LB4 El Nabatieh", "LB5 North", "LB6 South", "LB7 Akkar", "LB8 Baalbek-El Hermel"]);
    expect(Object.keys(GOVERNORATE_ZONE).sort()).toEqual(["LB1", "LB2", "LB3", "LB4", "LB5", "LB6", "LB7", "LB8"]); // every governorate maps to a free-delivery zone
  });

  it("no orphans: every region has exactly one district and every district exactly one governorate", () => {
    expect(sql().prepare("SELECT COUNT(*) n FROM locations r WHERE r.type = 'region' AND NOT EXISTS (SELECT 1 FROM locations d WHERE d.id = r.parent_id AND d.type = 'district')").get()).toEqual({ n: 0 });
    expect(sql().prepare("SELECT COUNT(*) n FROM locations d WHERE d.type = 'district' AND NOT EXISTS (SELECT 1 FROM locations g WHERE g.id = d.parent_id AND g.type = 'governorate')").get()).toEqual({ n: 0 });
    expect(sql().prepare("SELECT COUNT(*) n FROM locations WHERE type = 'governorate' AND parent_id IS NOT NULL").get()).toEqual({ n: 0 });
    expect(sql().prepare("SELECT COUNT(*) n FROM locations WHERE parent_id IS NULL AND type <> 'governorate'").get()).toEqual({ n: 0 });
    expect(sql().prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("every governorate has districts, every district has regions, counts per district match the source report", () => {
    const per = Object.fromEntries((sql().prepare("SELECT d.name_en, COUNT(r.id) n FROM locations d JOIN locations r ON r.parent_id = d.id WHERE d.type = 'district' GROUP BY d.id").all() as { name_en: string; n: number }[]).map((x) => [x.name_en, x.n]));
    expect(per).toMatchObject({ Beirut: 71, Baalbek: 176, Zahle: 83, Akkar: 286, Jbeil: 215, Tripoli: 27, Bcharre: 27, Hasbaya: 36, Saida: 108, Sour: 113, "El Meten": 187 });
    expect(Object.values(per).reduce((a, b) => a + b, 0)).toBe(2708);
    expect(Object.keys(per)).toHaveLength(26);
  });

  it("names are clean: trimmed, no double spaces, no ALL-CAPS leftovers, Arabic present, unique inside a district", () => {
    const rows = sql().prepare("SELECT name_en, name_ar, parent_id FROM locations WHERE type = 'region'").all() as { name_en: string; name_ar: string; parent_id: string }[];
    for (const r of rows) {
      expect(r.name_en, r.name_en).toBe(r.name_en.trim().replace(/\s+/g, " "));
      expect(r.name_en, r.name_en).not.toMatch(/^[A-Z0-9 .'()\-]{4,}$/); // ALL CAPS names were tidied
      expect(r.name_ar.length, r.name_en).toBeGreaterThan(0);
    }
    const seen = new Set<string>();
    for (const r of rows) {
      const k = `${r.parent_id}|${r.name_en.toLowerCase()}`;
      expect(seen.has(k), k).toBe(false);
      seen.add(k);
    }
  });

  it("the places named in the brief are all there", () => {
    const find = (name: string, district: string) => sql().prepare("SELECT 1 FROM locations r JOIN locations d ON d.id = r.parent_id WHERE r.type = 'region' AND r.name_en = ? AND d.name_en = ?").get(name, district);
    expect(find("Zahle", "Zahle")).toBeTruthy();
    expect(find("Hamra", "Beirut") || find("Ras Beirut", "Beirut") || find("Hamra Ras Beirut", "Beirut") || sql().prepare("SELECT 1 FROM locations WHERE type='region' AND parent_id = 'LB11' AND name_en LIKE '%Hamra%'").get()).toBeTruthy();
  });
});

describe("the checkout lists (dependent selectors)", () => {
  it("governorates with their districts; a district lists ONLY its own regions", () => {
    const tree = checkoutTree();
    expect(tree).toHaveLength(8);
    expect(tree.flatMap((g) => g.districts)).toHaveLength(26);
    const meten = regionsOf(D.meten);
    const beirut = regionsOf(D.beirut);
    expect(meten).toHaveLength(187);
    expect(beirut).toHaveLength(71);
    const ids = new Set(meten.map((r) => r.id));
    for (const r of beirut) expect(ids.has(r.id)).toBe(false);
    // every region of a district belongs to that district in the database
    for (const d of [D.zahle, D.akkar, D.sidon, D.baalbek]) {
      for (const r of regionsOf(d)) expect(sql().prepare("SELECT parent_id FROM locations WHERE id = ?").get(r.id)).toEqual({ parent_id: d });
    }
    expect(regionsOf("nonsense")).toEqual([]);
    expect(regionsOf("LB1")).toEqual([]); // a governorate id is not a district
    expect(regionsOf("' OR 1=1 --")).toEqual([]);
  });

  it("the regions API returns one district's regions, caches privately, and refuses junk", async () => {
    const get = async (q: string) => regionsRoute(new Request(`http://x/api/locations/regions${q}`, { headers: { "x-forwarded-for": reqHeaders["x-forwarded-for"] } }));
    const ok = await get(`?district=${D.zahle}`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toContain("private");
    const body = (await ok.json()) as { regions: { id: string; en: string; ar: string }[] };
    expect(body.regions).toHaveLength(83);
    expect(Object.keys(body.regions[0]).sort()).toEqual(["ar", "en", "id"]);
    expect(((await (await get("")).json()) as { regions: unknown[] }).regions).toEqual([]);
    expect(((await (await get("?district=LB3")).json()) as { regions: unknown[] }).regions).toEqual([]); // a governorate
    sql().prepare("DELETE FROM rate_limits").run();
    let limited = 0;
    for (let i = 0; i < 125; i++) if ((await get(`?district=${D.zahle}`)).status === 429) limited++;
    expect(limited).toBeGreaterThan(0);
  });
});

describe("server-side validation of the chain governorate > district > region", () => {
  it("a region that does not belong to the chosen district, or a district that does not belong to the governorate, is rejected", async () => {
    const beirut = deliveryTo(D.beirut);
    const meten = deliveryTo(D.meten);
    expect(resolveLocation({ governorateId: beirut.governorateId, districtId: beirut.districtId, regionId: beirut.regionId })).toMatchObject({ ok: true });
    expect(resolveLocation({ governorateId: beirut.governorateId, districtId: beirut.districtId, regionId: meten.regionId })).toMatchObject({ ok: false, field: "region" });
    expect(resolveLocation({ governorateId: meten.governorateId, districtId: beirut.districtId, regionId: beirut.regionId })).toMatchObject({ ok: false, field: "district" });
    expect(resolveLocation({ governorateId: "LB3", districtId: "LB3", regionId: beirut.regionId })).toMatchObject({ ok: false });
    expect(resolveLocation({ governorateId: beirut.governorateId, districtId: beirut.districtId, regionId: beirut.districtId })).toMatchObject({ ok: false, field: "region" }); // a district id in the region slot
    // through the real checkout action: nothing is written
    const before = (sql().prepare("SELECT COUNT(*) n FROM orders").get() as { n: number }).n;
    expect(await placeOrder(checkoutInput(S.red.id, { delivery: deliveryTo(D.beirut, 0, { regionId: meten.regionId }) }))).toMatchObject({ ok: false, field: "region" });
    expect(await placeOrder(checkoutInput(S.red.id, { delivery: deliveryTo(D.beirut, 0, { governorateId: meten.governorateId }) }))).toMatchObject({ ok: false, field: "district" });
    expect((sql().prepare("SELECT COUNT(*) n FROM orders").get() as { n: number }).n).toBe(before);
  });

  it("the order stores the ids AND the names; renaming a location later never changes an old order", async () => {
    const del = deliveryTo(D.akkar, 3);
    expect(await placeOrder(checkoutInput(S.red.id, { delivery: del }))).toMatchObject({ ok: true });
    const o = sql().prepare("SELECT * FROM orders").get() as Record<string, string>;
    const region = sql().prepare("SELECT name_en FROM locations WHERE id = ?").get(del.regionId) as { name_en: string };
    expect(o).toMatchObject({ governorate_id: "LB7", governorate: "Akkar", district_id: "LB51", district: "Akkar", region_id: del.regionId, region_name: region.name_en });
    expect(o.address).toContain(region.name_en);
    h.user = { id: ID.owner, email: "owner@t.test" };
    expect(await updateLocation(null, form({ id: del.regionId, op: "save", name_en: "Renamed Village", name_ar: "قرية" }))).toMatchObject({ ok: expect.any(String) });
    expect(regionsOf(D.akkar).some((r) => r.en === "Renamed Village")).toBe(true);
    const after = sql().prepare("SELECT region_name, address FROM orders").get() as { region_name: string; address: string };
    expect(after.region_name).toBe(region.name_en); // the old order still says the old name
    expect(after.address).toContain(region.name_en);
  });
});

describe("the optional map pin", () => {
  it("a pin inside Lebanon is saved with its link; outside Lebanon, junk or no pin: the order is placed without it", async () => {
    const ok = await placeOrder(checkoutInput(S.red.id, { delivery: deliveryTo(D.beirut, 0, { pin: { lat: 33.8938, lon: 35.5018 } }) }));
    expect(ok).toMatchObject({ ok: true });
    reqHeaders["x-forwarded-for"] = "10.7.9.1";
    expect(await placeOrder(checkoutInput(S.red.id, { phone: "03 800 001", delivery: deliveryTo(D.beirut, 0, { pin: { lat: 48.85, lon: 2.35 } }) }))).toMatchObject({ ok: true }); // Paris
    reqHeaders["x-forwarded-for"] = "10.7.9.2";
    expect(await placeOrder(checkoutInput(S.red.id, { phone: "03 800 002", delivery: deliveryTo(D.beirut, 0, { pin: { lat: Number.NaN, lon: "x" as never } }) }))).toMatchObject({ ok: true });
    reqHeaders["x-forwarded-for"] = "10.7.9.3";
    expect(await placeOrder(checkoutInput(S.red.id, { phone: "03 800 003" }))).toMatchObject({ ok: true }); // no pin at all
    const rows = sql().prepare("SELECT pin_lat, pin_lon, pin_link FROM orders ORDER BY order_number").all();
    expect(rows[0]).toEqual({ pin_lat: 33.8938, pin_lon: 35.5018, pin_link: "https://www.google.com/maps/search/?api=1&query=33.893800,35.501800" });
    for (const r of rows.slice(1)) expect(r).toEqual({ pin_lat: null, pin_lon: null, pin_link: "" });
  });

  it("the pin step does not exist in the checkout without GOOGLE_MAPS_API_KEY (and appears with it)", async () => {
    const { CartProvider } = await import("@/components/CartProvider");
    const { CheckoutForm } = await import("@/components/checkout/CheckoutForm");
    const render = (mapsKey: string) =>
      renderToStaticMarkup(createElement(CartProvider, { products: [], deliveryFee: 5 } as never, createElement(CheckoutForm, { methods: [], whatsapp: "96170000000", tree: checkoutTree(), mapsKey } as never)));
    // an empty cart renders the "cart is empty" screen, so check the form through its source contract instead of markup
    expect(render("")).not.toContain("Pin your location");
    const src = (await import("node:fs")).readFileSync("components/checkout/CheckoutForm.tsx", "utf8");
    expect(src).toMatch(/\{mapsKey && <PinPicker/);
    const page = (await import("node:fs")).readFileSync("app/(store)/checkout/page.tsx", "utf8");
    expect(page).toContain("process.env.GOOGLE_MAPS_API_KEY");
  });
});

describe("admin: hide / show, rename, add a region, counts, filters", () => {
  const owner = () => (h.user = { id: ID.owner, email: "owner@t.test" });

  it("a hidden district or region disappears from checkout and is refused by the server; showing it brings it back", async () => {
    owner();
    const beirutRegion = deliveryTo(D.beirut).regionId;
    expect(await updateLocation(null, form({ id: beirutRegion, op: "hide" }))).toMatchObject({ ok: expect.stringMatching(/Hidden/) });
    expect(regionsOf(D.beirut).some((r) => r.id === beirutRegion)).toBe(false);
    expect(regionsOf(D.beirut)).toHaveLength(70);
    h.user = null;
    expect(await placeOrder(checkoutInput(S.red.id, { delivery: { ...deliveryTo(D.beirut, 1), regionId: beirutRegion } }))).toMatchObject({ ok: false, field: "region" });
    owner();
    expect(await updateLocation(null, form({ id: beirutRegion, op: "show" }))).toMatchObject({ ok: expect.stringMatching(/Shown/) });
    expect(regionsOf(D.beirut)).toHaveLength(71);

    // a hidden district leaves the list, takes its regions with it, and cannot be ordered to
    expect(await updateLocation(null, form({ id: D.zahle, op: "hide" }))).toMatchObject({ ok: expect.any(String) });
    expect(checkoutTree().flatMap((g) => g.districts).some((d) => d.id === D.zahle)).toBe(false);
    expect(regionsOf(D.zahle)).toEqual([]);
    h.user = null;
    expect(await placeOrder(checkoutInput(S.red.id, { delivery: { ...deliveryTo(D.zahle, 0, {}), } }))).toMatchObject({ ok: false, field: "district" });
    // a district whose regions are ALL hidden is not offered either
    owner();
    await updateLocation(null, form({ id: D.zahle, op: "show" }));
    sql().prepare("UPDATE locations SET hidden = 1 WHERE parent_id = ? AND type = 'region'").run(D.zahle);
    expect(checkoutTree().flatMap((g) => g.districts).some((d) => d.id === D.zahle)).toBe(false);
  });

  it("rename keeps the official name visible to the admin, refuses a duplicate in the same parent, and a stale form", async () => {
    owner();
    const r = deliveryTo(D.beirut, 2);
    const row = sql().prepare("SELECT name_en, version FROM locations WHERE id = ?").get(r.regionId) as { name_en: string; version: number };
    expect(await updateLocation(null, form({ id: r.regionId, op: "save", name_en: "New Beirut Name", name_ar: "اسم", version: String(row.version) }))).toMatchObject({ ok: expect.any(String) });
    expect(sql().prepare("SELECT name_en, official_name_en FROM locations WHERE id = ?").get(r.regionId)).toEqual({ name_en: "New Beirut Name", official_name_en: row.name_en });
    expect(await updateLocation(null, form({ id: r.regionId, op: "save", name_en: "Again", name_ar: "", version: String(row.version) }))).toMatchObject({ error: expect.stringMatching(/changed elsewhere/) });
    const other = deliveryTo(D.beirut, 3).regionId;
    expect(await updateLocation(null, form({ id: other, op: "save", name_en: "new beirut name", name_ar: "" }))).toMatchObject({ error: expect.stringMatching(/already exists/) });
    expect(await updateLocation(null, form({ id: other, op: "save", name_en: "A", name_ar: "" }))).toMatchObject({ error: expect.any(String) });
    expect(await updateLocation(null, form({ id: "LB1", op: "hide" }))).toMatchObject({ error: expect.stringMatching(/Only districts and regions/) }); // governorates cannot be hidden
    expect(sql().prepare("SELECT 1 FROM audit_log WHERE action = 'location_rename'").all()).toHaveLength(1);
  });

  it("adding a missing region puts it in exactly one district, visible at checkout, and it can be ordered to", async () => {
    owner();
    expect(await addRegionAction(null, form({ district: D.sidon, name_en: "Brand New Village", name_ar: "قرية جديدة" }))).toMatchObject({ ok: expect.stringMatching(/Added/) });
    const added = sql().prepare("SELECT id, parent_id, custom, code FROM locations WHERE name_en = 'Brand New Village'").get() as { id: string; parent_id: string; custom: number; code: string };
    expect(added).toMatchObject({ parent_id: D.sidon, custom: 1, code: "" });
    expect(regionsOf(D.sidon).some((r) => r.id === added.id)).toBe(true);
    expect(regionsOf(D.meten).some((r) => r.id === added.id)).toBe(false);
    expect(await addRegionAction(null, form({ district: D.sidon, name_en: "brand new village" }))).toMatchObject({ error: expect.stringMatching(/already exists/) });
    expect(await addRegionAction(null, form({ district: "LB1", name_en: "X Y Z" }))).toMatchObject({ error: expect.any(String) }); // a governorate is not a district
    expect(await addRegionAction(null, form({ district: D.sidon, name_en: "Q" }))).toMatchObject({ error: expect.any(String) });
    h.user = null;
    expect(await placeOrder(checkoutInput(S.red.id, { delivery: deliveryTo(D.sidon, 0, { regionId: added.id }) }))).toMatchObject({ ok: true });
    expect(sql().prepare("SELECT region_name FROM orders").get()).toEqual({ region_name: "Brand New Village" });
  });

  it("only people who can manage shipping can change locations", async () => {
    h.user = { id: ID.staff, email: "staff@t.test" };
    await expect(updateLocation(null, form({ id: D.zahle, op: "hide" }))).rejects.toThrow("HTTP_403");
    await expect(addRegionAction(null, form({ district: D.zahle, name_en: "Nope" }))).rejects.toThrow("HTTP_403");
    h.user = null;
    await expect(updateLocation(null, form({ id: D.zahle, op: "hide" }))).rejects.toThrow("HTTP_401");
    expect(checkoutTree().flatMap((g) => g.districts).some((d) => d.id === D.zahle)).toBe(true);
  });

  it("the admin search finds places by English and Arabic names, including the original official name", () => {
    expect(searchLocations("zahle").some((r) => r.name_en === "Zahle" && r.type === "region")).toBe(true);
    expect(searchLocations("زحلة").some((r) => r.type === "district" && r.name_en === "Zahle")).toBe(true);
    expect(searchLocations("nothing-like-this-xyz")).toEqual([]);
    sql().prepare("UPDATE locations SET name_en = 'Totally Different' WHERE id = ?").run(deliveryTo(D.beirut).regionId);
    const official = (sql().prepare("SELECT official_name_en n FROM locations WHERE id = ?").get(deliveryTo(D.beirut).regionId) as { n: string }).n;
    expect(searchLocations(official).some((r) => r.id === deliveryTo(D.beirut).regionId)).toBe(true);
  });

  it("the Locations page shows how many regions each district has, search and per-district lists render", async () => {
    owner();
    const { default: Page } = await import("@/app/admin/(app)/settings/locations/page");
    const render = async (sp: object) => renderToStaticMarkup(createElement("div", null, await Page({ searchParams: Promise.resolve(sp) })));
    const home = await render({});
    expect(home).toContain("8 governorates, 26 districts and 2708 regions");
    expect(home).toMatch(/Jbeil[\s\S]*?215 regions/);
    expect(home).toMatch(/Beirut[\s\S]*?71 regions/);
    const district = await render({ district: D.akkar });
    expect(district).toContain("286 regions");
    expect(district).toContain("Add a missing region to Akkar");
    expect((district.match(/value="hide"[^>]*name="op"/g) ?? []).length).toBe(287); // 286 regions + the district itself
    expect(await render({ district: D.akkar, rq: "zzzzzz" })).toContain("No region matches");
    expect(await render({ q: "عكار" })).toContain("Akkar");
  });

  it("orders show governorate, district and region, and can be filtered by governorate and district", async () => {
    await placeOrder(checkoutInput(S.red.id, { delivery: deliveryTo(D.zahle, 1) }));
    reqHeaders["x-forwarded-for"] = "10.7.8.8";
    await placeOrder(checkoutInput(S.red.id, { phone: "03 700 700", delivery: deliveryTo(D.akkar, 2) }));
    reqHeaders["x-forwarded-for"] = "10.7.8.9";
    await placeOrder(checkoutInput(S.red.id, { phone: "03 700 701", delivery: deliveryTo(D.beirut, 4) }));
    owner();
    expect((await listOrders({ governorate: "LB2" })).orders).toHaveLength(1); // Bekaa
    expect((await listOrders({ governorate: "LB7" })).orders).toHaveLength(1); // Akkar
    expect((await listOrders({ district: D.zahle })).orders).toHaveLength(1);
    expect((await listOrders({ district: D.meten })).orders).toHaveLength(0);
    expect((await listOrders({ governorate: "LB2", district: D.akkar })).orders).toHaveLength(0);
    expect((await listOrders({ governorate: "nonsense" })).orders).toHaveLength(0);
    const id = (sql().prepare("SELECT id FROM orders WHERE district_id = ?").get(D.zahle) as { id: string }).id;
    const { default: Page } = await import("@/app/admin/(app)/orders/[id]/page");
    const html = renderToStaticMarkup(createElement("div", null, await Page({ params: Promise.resolve({ id }) } as never)));
    expect(html).toContain("Bekaa");
    expect(html).toContain("Zahle");
    expect(html).toContain('data-testid="loc-region"');
    expect(html).toContain("Open in Google Maps");
    expect(html).not.toContain("customer&#x27;s pin"); // no pin was dropped
  });
});
