import "server-only";
import crypto from "node:crypto";
import { getEngine } from "./db";
import { placeMatches } from "./search-text";

/**
 * Lebanon locations (table `locations`, seeded by migration 0010 from the official open data): governorate -> district (caza) -> region
 * (city, town, village, Beirut neighbourhood). Hidden places are not offered at checkout. Everything the checkout accepts is checked
 * here, on the server: the region must belong to the district and the district to the governorate, and none of them may be hidden.
 */
const sqlite = () => getEngine().sqlite;

export type LocationRow = { id: string; parent_id: string | null; type: "governorate" | "district" | "region"; code: string; name_en: string; name_ar: string; official_name_en: string; hidden: number; custom: number; version: number };
export type Place = { id: string; en: string; ar: string };
export type CheckoutDistrict = Place;
export type CheckoutGovernorate = Place & { districts: CheckoutDistrict[] };

/** Governorates and districts offered at checkout: not hidden, and (for a district) with at least one region to choose. */
export function checkoutTree(): CheckoutGovernorate[] {
  const govs = sqlite().prepare("SELECT id, name_en, name_ar FROM locations WHERE type = 'governorate' AND hidden = 0 ORDER BY name_en").all() as { id: string; name_en: string; name_ar: string }[];
  const dists = sqlite()
    .prepare(
      `SELECT d.id, d.parent_id, d.name_en, d.name_ar FROM locations d
       WHERE d.type = 'district' AND d.hidden = 0 AND EXISTS (SELECT 1 FROM locations r WHERE r.parent_id = d.id AND r.type = 'region' AND r.hidden = 0)
       ORDER BY d.name_en`,
    )
    .all() as { id: string; parent_id: string; name_en: string; name_ar: string }[];
  return govs
    .map((g) => ({ id: g.id, en: g.name_en, ar: g.name_ar, districts: dists.filter((d) => d.parent_id === g.id).map((d) => ({ id: d.id, en: d.name_en, ar: d.name_ar })) }))
    .filter((g) => g.districts.length > 0);
}

/** Every visible region of ONE district (and only that district). */
export function regionsOf(districtId: string): Place[] {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(districtId)) return [];
  const ok = sqlite().prepare("SELECT 1 FROM locations WHERE id = ? AND type = 'district' AND hidden = 0").get(districtId);
  if (!ok) return [];
  return (sqlite().prepare("SELECT id, name_en, name_ar FROM locations WHERE parent_id = ? AND type = 'region' AND hidden = 0 ORDER BY name_en").all(districtId) as { id: string; name_en: string; name_ar: string }[]).map((r) => ({ id: r.id, en: r.name_en, ar: r.name_ar }));
}

export type ResolvedLocation = {
  governorate: { id: string; name: string };
  district: { id: string; name: string };
  region: { id: string; name: string };
};

/** The three ids from the browser, checked. Returns the names to store on the order, or an error message and the field it belongs to. */
export function resolveLocation(ids: { governorateId: string; districtId: string; regionId: string }): { ok: true; value: ResolvedLocation } | { ok: false; error: string; field: "governorate" | "district" | "region" } {
  const get = (id: string, type: string) =>
    /^[A-Za-z0-9_-]{1,40}$/.test(String(id ?? ""))
      ? (sqlite().prepare("SELECT id, parent_id, name_en, hidden FROM locations WHERE id = ? AND type = ?").get(id, type) as { id: string; parent_id: string | null; name_en: string; hidden: number } | undefined)
      : undefined;
  const g = get(ids.governorateId, "governorate");
  if (!g || g.hidden) return { ok: false, error: "Choose your governorate.", field: "governorate" };
  const d = get(ids.districtId, "district");
  if (!d || d.hidden || d.parent_id !== g.id) return { ok: false, error: "Choose your district from the list for that governorate.", field: "district" };
  const r = get(ids.regionId, "region");
  if (!r || r.hidden || r.parent_id !== d.id) return { ok: false, error: "Choose your town or village from the list for that district.", field: "region" };
  return { ok: true, value: { governorate: { id: g.id, name: g.name_en }, district: { id: d.id, name: d.name_en }, region: { id: r.id, name: r.name_en } } };
}

// ---------------------------------------------------------------- admin
export type DistrictSummary = { id: string; name_en: string; name_ar: string; hidden: number; version: number; regions: number; visible: number };
export function adminTree() {
  const govs = sqlite().prepare("SELECT id, name_en, name_ar, hidden, version FROM locations WHERE type = 'governorate' ORDER BY name_en").all() as { id: string; name_en: string; name_ar: string; hidden: number; version: number }[];
  const dists = sqlite()
    .prepare(
      `SELECT d.id, d.parent_id, d.name_en, d.name_ar, d.hidden, d.version,
              (SELECT COUNT(*) FROM locations r WHERE r.parent_id = d.id AND r.type = 'region') AS regions,
              (SELECT COUNT(*) FROM locations r WHERE r.parent_id = d.id AND r.type = 'region' AND r.hidden = 0) AS visible
       FROM locations d WHERE d.type = 'district' ORDER BY d.name_en`,
    )
    .all() as (DistrictSummary & { parent_id: string })[];
  return govs.map((g) => ({ ...g, districts: dists.filter((d) => d.parent_id === g.id), regions: dists.filter((d) => d.parent_id === g.id).reduce((n, d) => n + d.regions, 0) }));
}

export function adminRegions(districtId: string, q = "", limit = 400) {
  const all = sqlite().prepare("SELECT id, name_en, name_ar, official_name_en, hidden, custom, version FROM locations WHERE parent_id = ? AND type = 'region' ORDER BY name_en").all(districtId) as Pick<LocationRow, "id" | "name_en" | "name_ar" | "official_name_en" | "hidden" | "custom" | "version">[];
  return { total: all.length, rows: all.filter((r) => placeMatchesAdmin(r, q)).slice(0, limit) };
}

const placeMatchesAdmin = (r: { name_en: string; name_ar: string; official_name_en: string }, q: string) => placeMatches({ en: r.name_en, ar: r.name_ar }, q) || (!!q.trim() && placeMatches({ en: r.official_name_en }, q));

/** Search every place by name (English or Arabic, also the original official name) for the admin. */
export function searchLocations(q: string, limit = 60) {
  const rows = sqlite()
    .prepare(
      `SELECT l.id, l.type, l.name_en, l.name_ar, l.official_name_en, l.hidden, l.custom, l.version,
              d.name_en AS district, g.name_en AS governorate
       FROM locations l
       LEFT JOIN locations d ON d.id = CASE l.type WHEN 'region' THEN l.parent_id WHEN 'district' THEN l.id END
       LEFT JOIN locations g ON g.id = CASE l.type WHEN 'region' THEN d.parent_id WHEN 'district' THEN l.parent_id ELSE l.id END
       ORDER BY l.type, l.name_en`,
    )
    .all() as { id: string; type: string; name_en: string; name_ar: string; official_name_en: string; hidden: number; custom: number; version: number; district: string | null; governorate: string | null }[];
  return rows.filter((r) => placeMatchesAdmin(r, q)).slice(0, limit);
}

const clean = (s: string, max = 80) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export function renameLocation(id: string, nameEn: string, nameAr: string, version?: number) {
  const en = clean(nameEn);
  if (en.length < 2) throw new Error("Give the place a name (at least 2 letters).");
  const ar = clean(nameAr);
  const row = sqlite().prepare("SELECT id, type, parent_id, version FROM locations WHERE id = ?").get(id) as { id: string; type: string; parent_id: string | null; version: number } | undefined;
  if (!row) throw new Error("That place no longer exists.");
  if (version !== undefined && version !== row.version) throw new Error("This was changed elsewhere since you opened it. Reload the page and try again.");
  const dup = sqlite().prepare("SELECT 1 FROM locations WHERE type = ? AND parent_id IS ? AND lower(name_en) = lower(?) AND id <> ?").get(row.type, row.parent_id, en, id);
  if (dup) throw new Error("Another place with that name already exists here.");
  sqlite().prepare("UPDATE locations SET name_en = ?, name_ar = ?, version = version + 1, updated_at = ? WHERE id = ?").run(en, ar, new Date().toISOString(), id);
}

export function setLocationHidden(id: string, hidden: boolean) {
  const r = sqlite().prepare("UPDATE locations SET hidden = ?, version = version + 1, updated_at = ? WHERE id = ? AND type IN ('district','region')").run(hidden ? 1 : 0, new Date().toISOString(), id);
  if (!r.changes) throw new Error("Only districts and regions can be hidden or shown.");
}

/** Add a region the official list does not have. Belongs to exactly one district. */
export function addRegion(districtId: string, nameEn: string, nameAr: string): string {
  const en = clean(nameEn);
  if (en.length < 2) throw new Error("Give the region a name (at least 2 letters).");
  const d = sqlite().prepare("SELECT id FROM locations WHERE id = ? AND type = 'district'").get(districtId);
  if (!d) throw new Error("Choose a district.");
  if (sqlite().prepare("SELECT 1 FROM locations WHERE parent_id = ? AND type = 'region' AND lower(name_en) = lower(?)").get(districtId, en)) throw new Error("That region already exists in this district.");
  const id = `X${crypto.randomBytes(6).toString("hex")}`;
  sqlite().prepare("INSERT INTO locations (id, parent_id, type, code, name_en, name_ar, official_name_en, custom) VALUES (?, ?, 'region', '', ?, ?, '', 1)").run(id, districtId, en, clean(nameAr));
  return id;
}
